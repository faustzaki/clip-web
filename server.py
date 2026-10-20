"""
AutoClip Studio - FastAPI Backend Server
Modular REST API powering AutoClip & Socl Visuals clone.
"""
import os
import re
import sys
import json
import shutil
import secrets
import time
import threading
import subprocess
import mimetypes
import urllib.request
import urllib.parse
from pathlib import Path
from typing import List, Optional
import logging

logger = logging.getLogger("autoclip")

# Fix Windows registry MIME type quirk for .js and .css
mimetypes.init()
mimetypes.types_map['.js'] = 'application/javascript'
mimetypes.types_map['.mjs'] = 'application/javascript'
mimetypes.types_map['.css'] = 'text/css'

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Setup path to chopify
ROOT_DIR = Path(__file__).resolve().parent
CHOPIFY_DIR = ROOT_DIR / "chopify"
if str(CHOPIFY_DIR) not in sys.path:
    sys.path.insert(0, str(CHOPIFY_DIR))

import core_engine
import render_clips
import subtitle_burn

DEFAULT_RENDER_PREFS = {
    "subtitles_enabled": True,
    "title_enabled": True,
    "watermark_enabled": False,
    "watermark": "",
    "aspect": "9:16",
    "subtitle_style": dict(subtitle_burn.DEFAULT_STYLE),
}
WORKDIR = ROOT_DIR / "work"
CLIPS_DIR = ROOT_DIR / "clips"
WORKDIR.mkdir(parents=True, exist_ok=True)
CLIPS_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_FILE = ROOT_DIR / "config.json"

def default_render_dir() -> str:
    return str(Path.home() / "Videos" / "Clips")

DEFAULT_CONFIG = {
    "llm_endpoint": "http://127.0.0.1:20128/v1",
    "llm_api_key": "",
    "llm_model": "ag/gemini-3.8-flash-high",
    "available_models": [
        "ag/gemini-3.8-flash-high",
        "ag/gemini-3.8-flash-low",
        "ag/claude-sonnet-4-6",
        "ag/claude-opus-4-6-thinking",
        "river/deepseek-ai/DeepSeek-V4.1-Flash"
    ],
    "render_dir": default_render_dir()
}

def load_global_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            stored = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                cfg.update(stored)
        except Exception:
            pass
    try:
        Path(cfg["render_dir"]).mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return cfg

def save_global_config(new_cfg: dict) -> dict:
    cfg = load_global_config()
    cfg.update(new_cfg)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    return cfg

def get_dir_disk_usage(p: Path) -> dict:
    if not p.exists():
        return {"size_bytes": 0, "size_mb": 0.0, "file_count": 0, "path": str(p)}
    total_bytes = 0
    file_count = 0
    for root, dirs, files in os.walk(p):
        for f in files:
            fp = Path(root) / f
            try:
                total_bytes += fp.stat().st_size
                file_count += 1
            except Exception:
                pass
    return {
        "size_bytes": total_bytes,
        "size_mb": round(total_bytes / (1024 * 1024), 2),
        "file_count": file_count,
        "path": str(p.resolve())
    }

def clear_temp_cache() -> dict:
    freed_bytes = 0
    cleaned_files = 0
    for root, dirs, files in os.walk(WORKDIR):
        rpath = Path(root)
        is_hq = "hq" in rpath.parts
        for f in files:
            fp = rpath / f
            should_delete = False
            if is_hq or fp.suffix.lower() in ('.tmp', '.part', '.ytdl') or f.startswith("temp_") or fp.suffix.lower() == '.wav':
                should_delete = True
            if should_delete:
                try:
                    sz = fp.stat().st_size
                    fp.unlink()
                    freed_bytes += sz
                    cleaned_files += 1
                except Exception:
                    pass
    for root, dirs, files in os.walk(CLIPS_DIR):
        rpath = Path(root)
        for f in files:
            fp = rpath / f
            if fp.suffix.lower() in ('.tmp', '.part', '.wav') or f.startswith("temp_"):
                try:
                    sz = fp.stat().st_size
                    fp.unlink()
                    freed_bytes += sz
                    cleaned_files += 1
                except Exception:
                    pass
    for pd in WORKDIR.iterdir():
        sdir = pd / '_section'
        if sdir.is_dir():
            for f in sdir.glob('*'):
                if not f.is_file():
                    continue
                try:
                    sz = f.stat().st_size
                    f.unlink()
                    freed_bytes += sz
                    cleaned_files += 1
                except Exception:
                    pass
    return {
        "freed_mb": round(freed_bytes / (1024 * 1024), 2),
        "cleaned_files": cleaned_files
    }
# Copy yunet.onnx into work/ so render_clips._make_detector finds it
if not (WORKDIR / 'yunet.onnx').exists() and (ROOT_DIR / 'yunet.onnx').exists():
    shutil.copy2(ROOT_DIR / 'yunet.onnx', WORKDIR / 'yunet.onnx')

PID_RE = re.compile(r'^[0-9a-f]{10}$')

INGEST_JOBS: dict[str, dict] = {}      # pid -> {'cancel': bool}
INGEST_LOCK = threading.Lock()

PREPARE_JOBS: dict[str, dict] = {}     # pid -> {'tier': str}
PREPARE_LOCK = threading.Lock()
PREPARE_DEFAULT = {"status": "idle", "tier": None, "percent": 0, "message": "", "error": None}

class _Cancelled(Exception):
    pass

def project_dir(pid: str) -> Path: return WORKDIR / pid
def project_clips_dir(pid: str) -> Path: return CLIPS_DIR / pid

def read_project_meta(pid: str) -> dict:
    p = project_dir(pid) / 'project.json'
    if not p.exists(): raise HTTPException(404, 'Project not found')
    return json.loads(p.read_text(encoding='utf-8'))

def write_project_meta(pid: str, meta: dict) -> None:
    meta['updated_at'] = time.time()
    (project_dir(pid) / 'project.json').write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')

def get_source_video_path(pid: str) -> Optional[Path]:
    pdir = project_dir(pid)
    vids = [p for p in sorted(pdir.glob('source.*'))
            if p.suffix.lower() in ('.mp4', '.mkv', '.webm', '.mov', '.m4v')
            and not re.match(r'^source\.f\d+\.', p.name)]
    return vids[0].resolve() if vids else None

def load_transcript_file(pid: str) -> Optional[dict]:
    p = project_dir(pid) / 'transcript.json'
    if p.exists():
        try: return json.loads(p.read_text(encoding='utf-8-sig'))
        except Exception: return None
    return None

def load_segments_file(pid: str) -> list:
    p = project_dir(pid) / 'segments.json'
    if p.exists():
        try: return json.loads(p.read_text(encoding='utf-8-sig'))
        except Exception: return []
    return []

def project_summary(pid: str) -> dict:
    meta = read_project_meta(pid)
    cdir = project_clips_dir(pid)
    src = get_source_video_path(pid)
    tr = load_transcript_file(pid)
    segs = load_segments_file(pid)
    clip_count = len(list(cdir.glob('*.mp4'))) if cdir.exists() else 0
    cover_url = None
    cover_path = project_dir(pid) / 'cover.jpg'
    if cover_path.exists():
        cover_url = f'/work/{pid}/cover.jpg'
    elif cdir.exists():
        posters = sorted([p for p in cdir.glob('*.png') if p.with_suffix('.mp4').exists()],
                         key=lambda p: p.stat().st_mtime, reverse=True)
        if posters: cover_url = f'/clips/{pid}/{posters[0].name}'
    return {
        'id': pid, 'title': meta.get('title') or f'Project {pid}',
        'source_type': meta.get('source_type'), 'source_url': meta.get('source_url'),
        'created_at': meta.get('created_at'), 'updated_at': meta.get('updated_at'),
        'has_source': src is not None, 'has_transcript': tr is not None,
        'duration': tr.get('duration') if tr else None,
        'candidate_count': len(segs), 'clip_count': clip_count,
        'cover_url': cover_url,
        'render_prefs': meta.get('render_prefs') or dict(DEFAULT_RENDER_PREFS),
        'crops': meta.get('crops') or {},
    }
def yt_oembed(url: str) -> dict:
    encoded = urllib.parse.quote(url, safe='')
    req = urllib.request.Request(
        f'https://www.youtube.com/oembed?url={encoded}&format=json',
        headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read().decode())

def grab_cover(pid: str, source: Path) -> None:
    cover = project_dir(pid) / 'cover.jpg'
    try:
        subprocess.run(['ffmpeg', '-y', '-ss', '0.5', '-i', str(source),
                         '-frames:v', '1', '-q:v', '2', str(cover)],
                       capture_output=True, check=True)
    except subprocess.CalledProcessError:
        try:
            subprocess.run(['ffmpeg', '-y', '-ss', '0', '-i', str(source),
                             '-frames:v', '1', '-q:v', '2', str(cover)],
                           capture_output=True, check=True)
        except Exception as e:
            print(f'grab_cover failed: {e}')

app = FastAPI(
    title="AutoClip API Engine",
    description="Backend API for AutoClip / Socl Visuals clone",
    version="1.0.0"
)

# CORS Middleware (allow Vite React dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware to force correct MIME types for JS/CSS on Windows
@app.middleware("http")
async def override_static_mime(request, call_next):
    response = await call_next(request)
    p = request.url.path.lower()
    if p.endswith(".js") or p.endswith(".mjs"):
        response.headers["content-type"] = "application/javascript; charset=utf-8"
    elif p.endswith(".css"):
        response.headers["content-type"] = "text/css; charset=utf-8"
    return response

# Mount static folders for video/audio streaming and thumbnails
app.mount("/clips", StaticFiles(directory=str(CLIPS_DIR)), name="clips")
app.mount("/work", StaticFiles(directory=str(WORKDIR)), name="work")


# --------------------------------------------------------------------------
# Request / Response Models
# --------------------------------------------------------------------------
class IngestUrlRequest(BaseModel):
    url: str
    model_size: Optional[str] = "base"
    language: Optional[str] = None


class PrepareRequest(BaseModel):
    tier: Optional[str] = "preview"

class ScoreRequest(BaseModel):
    model_name: Optional[str] = "ag/gemini-3.8-flash"
    min_score: Optional[float] = 6.0
    max_clips: Optional[int] = 8
    min_len: Optional[int] = 15
    max_len: Optional[int] = 60
    use_llm: Optional[bool] = True


class CropRect(BaseModel):
    x: float
    y: float
    w: float
    h: float


class PrefsRequest(BaseModel):
    render_prefs: dict


class CropsRequest(BaseModel):
    index: int
    rect: Optional[CropRect] = None


class SubtitlesRequest(BaseModel):
    words: Optional[List[dict]] = None
    model_size: Optional[str] = "base"
    regenerate: Optional[bool] = False


class RenderRequest(BaseModel):
    candidate_index: int
    aspect: Optional[str] = "9:16"
    crop_mode: Optional[str] = "speaker-tracked"
    do_tighten: Optional[bool] = True
    loudnorm: Optional[bool] = False
    custom_hook: Optional[str] = None
    watermark: Optional[str] = None
    quality: Optional[str] = "hd"
    crop_rect: Optional[CropRect] = None
    full_download: Optional[bool] = False


class CreateProjectRequest(BaseModel):
    title: Optional[str] = None

class RenameProjectRequest(BaseModel):
    title: str

class UpdateSettingsRequest(BaseModel):
    llm_endpoint: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    available_models: Optional[List[str]] = None
    render_dir: Optional[str] = None

class TestConnectionRequest(BaseModel):
    endpoint: str
    api_key: Optional[str] = ""
    model: Optional[str] = "ag/gemini-3.8-flash"

# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    ffmpeg_ok = shutil.which("ffmpeg") is not None
    yunet_ok = (ROOT_DIR / "yunet.onnx").exists()
    ninerouter_ok = False
    try:
        req = urllib.request.Request("http://127.0.0.1:20128/")
        with urllib.request.urlopen(req, timeout=3) as res:
            if res.status in (200, 307):
                ninerouter_ok = True
    except Exception:
        pass
    return {"status": "ok", "ffmpeg": ffmpeg_ok, "yunet": yunet_ok, "ninerouter": ninerouter_ok}


@app.get("/api/options")
def get_options():
    cfg = load_global_config()
    models = [{"id": m, "label": m} for m in cfg.get("available_models", [])]
    if not any(m["id"] == "heuristic" for m in models):
        models.append({"id": "heuristic", "label": "Offline Heuristic (Tanpa LLM, Rp0)"})
    return {
        "aspect_ratios": ["9:16", "1:1", "16:9"],
        "subtitle_fonts": [
            "Arial Black", "Arial", "Impact", "Verdana", "Tahoma",
            "Trebuchet MS", "Georgia", "Courier New", "Segoe UI", "Calibri"
        ],
        "subtitle_positions": [
            {"id": "top", "label": "Atas"},
            {"id": "middle", "label": "Tengah"},
            {"id": "bottom", "label": "Bawah"}
        ],
        "crop_modes": [
            {"id": "speaker-tracked", "label": "Auto Face Tracking (YuNet)", "desc": "Follow speaker motion dynamically"},
            {"id": "center", "label": "Center Crop", "desc": "Static 9:16 center framing"},
            {"id": "blur", "label": "Blurred Background", "desc": "Keep 16:9 video with vertical blur padding"},
            {"id": "split", "label": "Split Gaming", "desc": "Top facecam (45%) + bottom gameplay (55%)"}
        ],
        "languages": [
            {"code": "auto", "label": "Auto-detect (Disarankan)"},
            {"code": "id", "label": "Indonesia"},
            {"code": "en", "label": "English"},
            {"code": "ms", "label": "Melayu / Malaysia"},
            {"code": "ja", "label": "Japanese / 日本語"},
            {"code": "ko", "label": "Korean / 한국어"},
            {"code": "zh", "label": "Mandarin / 中文"},
            {"code": "ar", "label": "Arabic / العربية"},
            {"code": "es", "label": "Spanish / Español"}
        ],
        "ai_models": models,
        "default_model": cfg.get("llm_model") or "ag/gemini-3.8-flash"
    }


@app.get("/api/settings")
def get_settings():
    cfg = load_global_config()
    render_p = Path(cfg.get("render_dir", default_render_dir()))
    return {
        **cfg,
        "storage": {
            "work": get_dir_disk_usage(WORKDIR),
            "clips": get_dir_disk_usage(CLIPS_DIR),
            "render_dir": get_dir_disk_usage(render_p),
        }
    }


@app.put("/api/settings")
def update_settings(payload: UpdateSettingsRequest):
    updates = {}
    if payload.llm_endpoint is not None:
        updates["llm_endpoint"] = payload.llm_endpoint.strip()
    if payload.llm_api_key is not None:
        updates["llm_api_key"] = payload.llm_api_key.strip()
    if payload.llm_model is not None:
        updates["llm_model"] = payload.llm_model.strip()
    if payload.available_models is not None:
        updates["available_models"] = [m.strip() for m in payload.available_models if m.strip()]
    if payload.render_dir is not None:
        p_str = payload.render_dir.strip()
        try:
            Path(p_str).mkdir(parents=True, exist_ok=True)
            updates["render_dir"] = p_str
        except Exception as e:
            raise HTTPException(400, f"Folder render tidak valid: {e}")
    save_global_config(updates)
    return get_settings()


@app.post("/api/settings/test-connection")
def test_connection_endpoint(payload: TestConnectionRequest):
    endpoint = payload.endpoint.strip().rstrip("/")
    if not endpoint:
        raise HTTPException(400, "Endpoint URL cannot be empty")

    headers = {"Content-Type": "application/json"}
    token = (payload.api_key or "").strip()
    if not token and "127.0.0.1:20128" in endpoint:
        token = core_engine.get_9router_key()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if endpoint.endswith("/chat/completions"):
        chat_url = endpoint
    else:
        chat_url = f"{endpoint}/chat/completions"

    t0 = time.time()
    try:
        body = {
            "model": payload.model or "ag/gemini-3.8-flash",
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 5,
            "stream": False
        }
        req = urllib.request.Request(chat_url, data=json.dumps(body).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=12) as res:
            json.loads(res.read().decode("utf-8"))
            latency_ms = round((time.time() - t0) * 1000)
            return {
                "ok": True,
                "latency_ms": latency_ms,
                "message": f"Terhubung ({latency_ms}ms)",
                "model": payload.model
            }
    except urllib.error.HTTPError as he:
        latency_ms = round((time.time() - t0) * 1000)
        err_msg = f"HTTP {he.code}: {he.reason}"
        try:
            err_body = he.read().decode("utf-8")
            err_json = json.loads(err_body)
            if "error" in err_json:
                err_msg = f"HTTP {he.code}: {err_json['error'].get('message', str(err_json['error']))}"
        except Exception:
            pass
        return {"ok": False, "latency_ms": latency_ms, "error": err_msg}
    except Exception as e:
        latency_ms = round((time.time() - t0) * 1000)
        return {"ok": False, "latency_ms": latency_ms, "error": str(e)}


@app.post("/api/settings/fetch-models")
def fetch_models_endpoint(payload: TestConnectionRequest):
    endpoint = payload.endpoint.strip().rstrip("/")
    if endpoint.endswith("/chat/completions"):
        endpoint = endpoint[:-len("/chat/completions")].rstrip("/")
    models_url = f"{endpoint}/models"
    headers = {"Content-Type": "application/json"}
    token = (payload.api_key or "").strip()
    if not token and "127.0.0.1:20128" in endpoint:
        token = core_engine.get_9router_key()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        req = urllib.request.Request(models_url, headers=headers)
        with urllib.request.urlopen(req, timeout=6) as res:
            data = json.loads(res.read().decode("utf-8"))
            models = [m.get("id") for m in data.get("data", []) if m.get("id")]
            return {"status": "ok", "models": models}
    except Exception as e:
        raise HTTPException(400, f"Gagal mengambil daftar model: {e}")


@app.post("/api/settings/clear-cache")
def clear_cache_endpoint():
    res = clear_temp_cache()
    cfg = load_global_config()
    render_p = Path(cfg.get("render_dir", default_render_dir()))
    return {
        **res,
        "storage": {
            "work": get_dir_disk_usage(WORKDIR),
            "clips": get_dir_disk_usage(CLIPS_DIR),
            "render_dir": get_dir_disk_usage(render_p),
        }
    }


@app.post("/api/settings/open-render-dir")
def open_render_dir_endpoint():
    cfg = load_global_config()
    p = Path(cfg.get("render_dir", default_render_dir()))
    p.mkdir(parents=True, exist_ok=True)
    try:
        if sys.platform == "win32":
            os.startfile(str(p))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p)])
        return {"status": "ok", "path": str(p)}
    except Exception as e:
        raise HTTPException(500, f"Cannot open folder: {e}")


def _validate_pid(project_id: str):
    if not PID_RE.match(project_id):
        raise HTTPException(404, "Project not found")

YT_ID_RE = re.compile(r"(?:v=|youtu\.be/|/shorts/|/embed/)([0-9A-Za-z_-]{11})")

def _youtube_id(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    m = YT_ID_RE.search(url)
    return m.group(1) if m else None

def _prepare_write(pid: str, **fields):
    try:
        meta = read_project_meta(pid)
        state = dict(PREPARE_DEFAULT)
        state.update(meta.get('prepare') or {})
        state.update(fields)
        meta['prepare'] = state
        write_project_meta(pid, meta)
    except Exception:
        pass

def _prepare_worker(pid: str, url: str, tier: str):
    label = '720p' if tier == 'preview' else ('1080p' if tier == 'hd' else 'terbaik')
    try:
        _prepare_write(pid, status='running', tier=tier, percent=1, error=None,
                       message=f'Mengunduh video {label}... 0%')

        def cb(frac):
            f = frac if frac is not None else 0.0
            _prepare_write(pid, percent=min(99, 1 + round(f * 98)),
                           message=f'Mengunduh video {label}... {round(f * 100)}%')

        path = core_engine.download_to(url, project_dir(pid) / 'source', preset=tier, on_progress=cb)
        meta = read_project_meta(pid)
        meta['local_tier'] = tier
        write_project_meta(pid, meta)
        if not (project_dir(pid) / 'cover.jpg').exists():
            grab_cover(pid, path)
        _prepare_write(pid, status='done', percent=100, message='Video lokal siap')
    except Exception as e:
        import traceback
        traceback.print_exc()
        _prepare_write(pid, status='error', error=str(e), message='Gagal mengunduh video')
    finally:
        with PREPARE_LOCK:
            PREPARE_JOBS.pop(pid, None)


# --------------------------------------------------------------------------
# Project CRUD
# --------------------------------------------------------------------------
@app.get("/api/projects")
def list_projects():
    projects = []
    if WORKDIR.exists():
        for d in WORKDIR.iterdir():
            if d.is_dir() and (d / 'project.json').exists():
                try: projects.append(project_summary(d.name))
                except Exception: pass
    projects.sort(key=lambda p: p.get('created_at', 0), reverse=True)
    return {"projects": projects}


@app.post("/api/projects")
def create_project(payload: CreateProjectRequest = None):
    pid = secrets.token_hex(5)
    title = payload.title.strip() if payload and payload.title else None
    now = time.time()
    meta = {
        "id": pid, "title": title, "title_auto": title is None,
        "source_type": None, "source_url": None,
        "created_at": now, "updated_at": now
    }
    project_dir(pid).mkdir(parents=True, exist_ok=True)
    (project_dir(pid) / 'project.json').write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    return {"status": "ok", "project": project_summary(pid)}


@app.patch("/api/projects/{project_id}")
def rename_project(project_id: str, payload: RenameProjectRequest):
    _validate_pid(project_id)
    if not payload.title or not payload.title.strip():
        raise HTTPException(400, "Title cannot be empty")
    meta = read_project_meta(project_id)
    meta['title'] = payload.title.strip()
    meta['title_auto'] = False
    write_project_meta(project_id, meta)
    return {"status": "ok", "project": project_summary(project_id)}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    _validate_pid(project_id)
    with INGEST_LOCK:
        if project_id in INGEST_JOBS:
            INGEST_JOBS[project_id]['cancel'] = True
    if not (project_dir(project_id) / 'project.json').exists():
        raise HTTPException(404, "Project not found")
    shutil.rmtree(project_dir(project_id), ignore_errors=True)
    shutil.rmtree(project_clips_dir(project_id), ignore_errors=True)
    return {"status": "ok"}


# --------------------------------------------------------------------------
# Helpers for project clips and slugs
# --------------------------------------------------------------------------
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,90}$")

def _raw_clip_path(pid: str, slug: str) -> Path:
    if not SLUG_RE.match(slug):
        raise HTTPException(400, "Nama klip tidak valid")
    p = project_clips_dir(pid) / "raw" / f"{slug}.mp4"
    if not p.exists():
        raise HTTPException(404, "Klip mentah tidak ditemukan")
    return p

def _list_project_clips(pid: str) -> list[dict]:
    cdir = project_clips_dir(pid)
    items = []
    if not cdir.exists():
        return items

    raw_dir = cdir / "raw"
    if raw_dir.exists():
        for mp4 in raw_dir.glob("*.mp4"):
            if mp4.name.startswith("_"):
                continue
            poster = mp4.with_suffix(".png")
            meta_file = mp4.with_suffix(".meta.json")
            meta = {}
            if meta_file.exists():
                try: meta = json.loads(meta_file.read_text(encoding="utf-8"))
                except Exception: pass
            items.append({
                "name": mp4.name,
                "slug": mp4.stem,
                "url": f"/clips/{pid}/raw/{mp4.name}",
                "raw_url": f"/clips/{pid}/raw/{mp4.name}",
                "poster_url": f"/clips/{pid}/raw/{poster.name}" if poster.exists() else None,
                "subtitled": bool(meta.get("subtitled", False)),
                "candidate_index": meta.get("candidate_index"),
                "size_mb": round(mp4.stat().st_size / (1024 * 1024), 2),
                "created_at": mp4.stat().st_mtime,
                "meta": meta,
            })

    for mp4 in cdir.glob("*.mp4"):
        if mp4.name.startswith("_"):
            continue
        poster = mp4.with_suffix(".png")
        meta_file = mp4.with_suffix(".meta.json")
        meta = {}
        if meta_file.exists():
            try: meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception: pass
        items.append({
            "name": mp4.name,
            "slug": mp4.stem,
            "url": f"/clips/{pid}/{mp4.name}",
            "raw_url": f"/clips/{pid}/raw/{mp4.name}" if (raw_dir / mp4.name).exists() else f"/clips/{pid}/{mp4.name}",
            "poster_url": f"/clips/{pid}/{poster.name}" if poster.exists() else None,
            "subtitled": bool(meta.get("subtitled", True)),
            "candidate_index": meta.get("candidate_index"),
            "size_mb": round(mp4.stat().st_size / (1024 * 1024), 2),
            "created_at": mp4.stat().st_mtime,
            "meta": meta,
        })

    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items

# --------------------------------------------------------------------------
# Project-scoped endpoints
# --------------------------------------------------------------------------
@app.get("/api/projects/{project_id}/state")
def get_state(project_id: str):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    pdir = project_dir(project_id)
    src = get_source_video_path(project_id)
    transcript = load_transcript_file(project_id)
    candidates = load_segments_file(project_id)
    yt_id = _youtube_id(meta.get('source_url'))

    ingest = meta.get('ingest') or {"status": "idle"}
    if ingest.get('status') == 'running':
        with INGEST_LOCK:
            active = project_id in INGEST_JOBS
        if not active:
            ingest = {
                "status": "error",
                "error": "Server restart di tengah proses",
                "message": "Gagal memproses project",
                "percent": 0
            }
            meta['ingest'] = ingest
            try:
                write_project_meta(project_id, meta)
            except Exception:
                pass

    video_info = None
    if src:
        try:
            w, h = render_clips.ffprobe_dims(src)
            video_info = {
                "name": src.name,
                "url": f"/work/{project_id}/{src.name}",
                "width": w, "height": h,
                "size_mb": round(src.stat().st_size / (1024 * 1024), 2)
            }
        except Exception:
            video_info = {"name": src.name, "url": f"/work/{project_id}/{src.name}"}

    transcript_info = None
    if transcript:
        transcript_info = {
            "language": transcript.get("language"),
            "duration": transcript.get("duration"),
            "words_count": len(transcript.get("words", [])),
            "model": transcript.get("model")
        }

    return {
        "project": project_summary(project_id),
        "video": video_info,
        "youtube": {"id": yt_id} if yt_id else None,
        "transcript": transcript_info,
        "candidates": candidates,
        "ingest": ingest,
        "prepare": meta.get('prepare') or dict(PREPARE_DEFAULT),
        "clips": _list_project_clips(project_id),
    }


def _ingest_cancelled(pid: str) -> bool:
    with INGEST_LOCK:
        return INGEST_JOBS.get(pid, {}).get('cancel', False)


def _ingest_write(pid: str, **fields):
    try:
        meta = read_project_meta(pid)
        ingest_state = meta.get('ingest') or {
            "status": "idle",
            "stage": "metadata",
            "percent": 0,
            "message": "",
            "error": None,
            "started_at": 0.0,
            "finished_at": None,
        }
        ingest_state.update(fields)
        meta['ingest'] = ingest_state
        write_project_meta(pid, meta)
    except Exception:
        pass


def _start_ingest(pid: str, url: Optional[str] = None, uploaded: bool = False, model_size: str = 'base', language: Optional[str] = None):
    with INGEST_LOCK:
        if pid in INGEST_JOBS:
            raise HTTPException(409, "Proses lain masih berjalan")
        INGEST_JOBS[pid] = {'cancel': False}
    _ingest_write(
        pid,
        status='running',
        stage='metadata',
        percent=1,
        message='Menyiapkan project...',
        error=None,
        started_at=time.time(),
        finished_at=None
    )
    threading.Thread(
        target=_ingest_worker,
        args=(pid, url, uploaded, model_size, language),
        daemon=True
    ).start()


def _ingest_worker(pid: str, url: Optional[str], uploaded: bool, model_size: str, language: Optional[str] = None):
    pdir = project_dir(pid)
    try:
        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 1: metadata
        _ingest_write(pid, status='running', stage='metadata', percent=1, message='Menyiapkan project...')
        if url:
            try:
                meta = read_project_meta(pid)
                meta['source_type'] = 'youtube'
                meta['source_url'] = url
                try:
                    oembed = yt_oembed(url)
                    if meta.get('title_auto') and oembed.get('title'):
                        meta['title'] = oembed['title'].strip()
                    thumb = oembed.get('thumbnail_url')
                    if thumb:
                        try:
                            urllib.request.urlretrieve(thumb, str(pdir / 'cover.jpg'))
                        except Exception:
                            pass
                except Exception:
                    pass
                write_project_meta(pid, meta)
            except Exception:
                pass

            if _ingest_cancelled(pid):
                raise _Cancelled()

            # Step 2: YouTube transcript
            _ingest_write(pid, stage='transcript', percent=4, message='Menyalin subtitle YouTube...')
            try:
                tr = core_engine.youtube_transcript(url, language)
                core_engine.write_transcript(pdir, tr)
            except Exception as e:
                print(f"YouTube Transcript API unavailable or failed ({e}), will fallback to Whisper later.", flush=True)

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 3: Whisper if transcript does not exist
        transcript_file = pdir / 'transcript.json'
        if not transcript_file.exists():
            if url:
                _ingest_write(pid, stage='download', percent=40, message='Mengunduh video 720p untuk transkripsi... 0%')

                def cb(frac):
                    if _ingest_cancelled(pid):
                        raise _Cancelled()
                    f = frac if frac is not None else 0.0
                    _ingest_write(
                        pid,
                        percent=min(85, 40 + round(f * 45)),
                        message=f'Mengunduh video 720p untuk transkripsi... {round(f * 100)}%'
                    )

                core_engine.download_to(url, pdir / 'source', preset='preview', on_progress=cb)
                meta_local = read_project_meta(pid)
                meta_local['local_tier'] = 'preview'
                write_project_meta(pid, meta_local)

            _ingest_write(pid, stage='transcript', percent=85, message='Transkripsi audio (Whisper)...')
            video_path = get_source_video_path(pid)
            if not video_path:
                raise RuntimeError("Video source tidak ditemukan untuk transkripsi.")
            core_engine.get_transcript(video_path=video_path, workdir=pdir, yt_url=None, model_size=model_size, language=language)

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 4: Finalize
        _ingest_write(pid, stage='finalize', percent=98, message='Menyelesaikan...')
        video_path = get_source_video_path(pid)
        if video_path:
            if not (pdir / 'cover.jpg').exists():
                grab_cover(pid, video_path)
            tr_file = pdir / 'transcript.json'
            if tr_file.exists():
                try:
                    tr_data = json.loads(tr_file.read_text(encoding='utf-8'))
                    if not tr_data.get('video'):
                        tr_data['video'] = str(video_path)
                        tr_file.write_text(json.dumps(tr_data, ensure_ascii=False, indent=2), encoding='utf-8')
                except Exception:
                    pass

        try:
            meta = read_project_meta(pid)
            write_project_meta(pid, meta)
        except Exception:
            pass

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 6: Done
        _ingest_write(pid, status='done', stage='finalize', percent=100, message='Siap', finished_at=time.time())

    except _Cancelled:
        _ingest_write(pid, status='error', error='Proses dibatalkan', message='Proses dibatalkan', finished_at=time.time())
    except Exception as e:
        import traceback
        traceback.print_exc()
        _ingest_write(pid, status='error', error=str(e), message='Gagal memproses project', finished_at=time.time())
    finally:
        with INGEST_LOCK:
            INGEST_JOBS.pop(pid, None)


@app.post("/api/projects/{project_id}/ingest")
def ingest_url(project_id: str, payload: IngestUrlRequest):
    _validate_pid(project_id)
    read_project_meta(project_id)  # ensure exists

    if get_source_video_path(project_id):
        raise HTTPException(400, "Project ini sudah punya video source")

    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    _start_ingest(project_id, url=url, model_size=payload.model_size or 'base', language=payload.language)
    return {"status": "started"}


@app.post("/api/projects/{project_id}/upload")
async def upload_video(project_id: str, file: UploadFile = File(...),
                       model_size: str = Form("base"), language: Optional[str] = Form(None)):
    _validate_pid(project_id)
    read_project_meta(project_id)
    pdir = project_dir(project_id)

    if get_source_video_path(project_id):
        raise HTTPException(400, "Project ini sudah punya video source")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".mp4", ".mov", ".mkv", ".webm", ".avi"):
        raise HTTPException(status_code=400, detail="Invalid video format")

    dest = pdir / f"source{suffix}"
    try:
        with dest.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        meta = read_project_meta(project_id)
        meta['source_type'] = 'upload'
        meta['source_url'] = None
        if meta.get('title_auto'):
            meta['title'] = Path(file.filename).stem
        write_project_meta(project_id, meta)

        _start_ingest(project_id, uploaded=True, model_size=model_size, language=language)
        return {"status": "started"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.post("/api/projects/{project_id}/prepare")
def prepare_video(project_id: str, payload: PrepareRequest):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    tier = (payload.tier or 'preview').lower()
    if tier not in ('preview', 'hd', 'best'):
        raise HTTPException(400, "Kualitas tidak dikenal: pakai preview|hd|best")
    if not meta.get('source_url'):
        raise HTTPException(400, "Project ini tidak punya sumber YouTube")
    if get_source_video_path(project_id):
        raise HTTPException(400, "Video lokal sudah ada")
    with PREPARE_LOCK:
        if project_id in PREPARE_JOBS:
            raise HTTPException(409, "Unduhan lain sedang berjalan")
        with INGEST_LOCK:
            if project_id in INGEST_JOBS:
                raise HTTPException(409, "Unduhan lain sedang berjalan")
        PREPARE_JOBS[project_id] = {'tier': tier}
    threading.Thread(target=_prepare_worker, args=(project_id, meta['source_url'], tier),
                     daemon=True, name=f'prepare-{project_id}').start()
    return {"status": "started"}

@app.post("/api/projects/{project_id}/score")
def score_moments(project_id: str, payload: ScoreRequest):
    _validate_pid(project_id)
    read_project_meta(project_id)
    pdir = project_dir(project_id)
    transcript = load_transcript_file(project_id)
    if not transcript or not transcript.get("words"):
        raise HTTPException(status_code=400, detail="No transcript found. Ingest video first.")

    cfg = load_global_config()
    try:
        if payload.use_llm and payload.model_name != 'heuristic':
            try:
                cands = core_engine.ninerouter_score(
                    data=transcript,
                    model_name=payload.model_name or cfg.get("llm_model") or "ag/gemini-3.8-flash",
                    min_score=payload.min_score or 6.0,
                    max_clips=payload.max_clips or 8,
                    min_len=payload.min_len or 15,
                    max_len=payload.max_len or 60,
                    api_endpoint=cfg.get("llm_endpoint"),
                    api_key=cfg.get("llm_api_key")
                )
            except Exception as e:
                logger.warning(f"LLM scoring failed ({e}), falling back to heuristic")
                cands = core_engine.heuristic_score(
                    data=transcript,
                    min_score=payload.min_score or 6.0,
                    max_clips=payload.max_clips or 8,
                    min_len=payload.min_len or 15,
                    max_len=payload.max_len or 60
                )
        else:
            cands = core_engine.heuristic_score(
                data=transcript,
                min_score=payload.min_score or 6.0,
                max_clips=payload.max_clips or 8,
                min_len=payload.min_len or 15,
                max_len=payload.max_len or 60
            )

        if not cands and transcript.get("words"):
            # ponytail: single window fallback; split to multiple if user requests more chunks
            words_ref = transcript["words"]
            start = round(float(words_ref[0].get("start", 0.0)), 2)
            end = round(float(words_ref[-1].get("end", start + (payload.min_len or 15))), 2)
            if end - start > (payload.max_len or 60):
                end = round(start + (payload.max_len or 60), 2)
            cands = [{
                "start": start,
                "end": max(round(start + 1.0, 2), end),
                "hook": "clip",
                "overall": 5.0
            }]
        words = transcript.get("words", [])
        for i, c in enumerate(cands):
            c["id"] = i
            c_start, c_end = c["start"], c["end"]
            clip_words = [w["word"] for w in words if c_start <= w["start"] <= c_end]
            c["text_preview"] = " ".join(clip_words[:35]) + ("..." if len(clip_words) > 35 else "")
            c["duration"] = round(c_end - c_start, 2)

        (pdir / "segments.json").write_text(
            json.dumps(cands, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"status": "ok", "count": len(cands), "candidates": cands}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")


@app.post("/api/projects/{project_id}/render")
def render_clip(project_id: str, payload: RenderRequest):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    pdir = project_dir(project_id)
    cdir = project_clips_dir(project_id)

    src = get_source_video_path(project_id)
    if not src and not meta.get('source_url'):
        raise HTTPException(status_code=400, detail="No source video found")

    transcript = load_transcript_file(project_id)
    if not transcript or not transcript.get("words"):
        raise HTTPException(status_code=400, detail="No transcript words found")

    candidates = load_segments_file(project_id)
    if not candidates or payload.candidate_index >= len(candidates):
        raise HTTPException(status_code=400, detail="Invalid candidate index")

    seg = candidates[payload.candidate_index]
    if payload.custom_hook:
        seg["hook"] = payload.custom_hook

    tier = (payload.quality or 'hd').lower()
    if tier == 'original':
        if not src:
            tier = 'hd'          # tidak ada file lokal: pakai 1080p (upload selalu punya file lokal)
    elif tier not in ('proxy', 'preview', 'hd', 'best'):
        raise HTTPException(400, "Kualitas tidak dikenal: pakai proxy|preview|hd|best|original")

    section_dir = pdir / '_section'
    section_path = None
    offset = 0.0
    if tier != 'original' and meta.get('source_url'):
        if payload.full_download:
            hq = pdir / 'hq' / f'{tier}.mp4'
            if not hq.exists():
                try:
                    core_engine.download_to(meta['source_url'], pdir / 'hq' / tier, preset=tier)
                except Exception as e:
                    return JSONResponse(status_code=409, content={
                        "detail": f"Unduhan penuh gagal: {e}",
                        "code": "full_download_failed",
                    })
            src = hq
        else:
            MARGIN = 3.0
            total = float(transcript.get('duration') or 0) or (float(seg['end']) + MARGIN)
            S = max(0.0, float(seg['start']) - MARGIN)
            E = min(total, float(seg['end']) + MARGIN)
            section_dir.mkdir(parents=True, exist_ok=True)
            sec = section_dir / f"{tier}_{int(S * 1000)}.mp4"
            try:
                core_engine.download_section(meta['source_url'], sec, S, E, preset=tier)
            except Exception as e:
                for f in section_dir.glob('*.mp4'):
                    f.unlink(missing_ok=True)
                return JSONResponse(status_code=409, content={
                    "detail": f"Gagal mengunduh potongan klip: {e}",
                    "code": "section_download_failed",
                })
            fs = core_engine.probe_start_time(sec)
            if abs(fs) > 0.05:
                norm = sec.with_name(sec.stem + '_norm.mp4')
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", f"{fs:.3f}", "-i", str(sec),
                     "-c", "copy", "-avoid_negative_ts", "make_zero", str(norm)],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                sec.unlink(missing_ok=True)
                norm.rename(sec)
            src = sec
            section_path = sec
            offset = S

    prefs = meta.get("render_prefs") or dict(DEFAULT_RENDER_PREFS)
    crops = meta.get("crops") or {}
    crop_rect = payload.crop_rect.model_dump() if payload.crop_rect else crops.get(str(payload.candidate_index))
    hook_title = (payload.custom_hook or seg.get("hook")) if prefs.get("title_enabled", True) else None
    wm = (prefs.get("watermark") or "").strip() or None
    watermark = wm if prefs.get("watermark_enabled") else None

    try:
        cdir.mkdir(parents=True, exist_ok=True)
        seg_render, words_render = seg, transcript["words"]
        if section_path:
            seg_render = {**seg, "start": float(seg["start"]) - offset, "end": float(seg["end"]) - offset}
            words_render = [
                {"word": w["word"], "start": float(w["start"]) - offset, "end": float(w["end"]) - offset}
                for w in transcript["words"]
            ]
        w, h = render_clips.ffprobe_dims(src)
        res_p = render_clips.render(
            seg=seg_render, words=words_render, source=src,
            W=w, H=h, workdir=pdir,
            aspect=payload.aspect or "9:16",
            out_dir=cdir,
            do_tighten=payload.do_tighten if payload.do_tighten is not None else True,
            loudnorm=payload.loudnorm or False,
            preview=False,
            crop_mode=payload.crop_mode or "auto",
            hook_title=hook_title,
            watermark=watermark,
            crop_rect=crop_rect,
            subtitle_style=prefs.get("subtitle_style"),
            candidate_index=payload.candidate_index,
            raw_subdir="raw",
        )

        res_path = Path(res_p)
        poster_p = res_path.with_suffix(".png")
        meta_p = res_path.with_suffix(".meta.json")
        meta_data = {}
        if meta_p.exists():
            try: meta_data = json.loads(meta_p.read_text(encoding="utf-8"))
            except Exception: pass
        # Auto-copy to global render_dir
        cfg = load_global_config()
        rdir_str = cfg.get("render_dir")
        if rdir_str:
            try:
                rdir = Path(rdir_str)
                rdir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(res_path, rdir / res_path.name)
            except Exception as e:
                print(f"Warning: Failed to copy clip to render_dir: {e}", flush=True)

        return {
            "status": "ok",
            "clip": {
                "name": res_path.name,
                "slug": res_path.stem,
                "url": f"/clips/{project_id}/raw/{res_path.name}",
                "raw_url": f"/clips/{project_id}/raw/{res_path.name}",
                "poster_url": f"/clips/{project_id}/raw/{poster_p.name}" if poster_p.exists() else None,
                "meta": meta_data,
                "size_mb": round(res_path.stat().st_size / (1024 * 1024), 2),
                "subtitled": False,
                "candidate_index": payload.candidate_index,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Render failed: {str(e)}")
    finally:
        if section_path and section_dir.exists():
            for f in section_dir.glob('*.mp4'):
                f.unlink(missing_ok=True)


HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

@app.put("/api/projects/{project_id}/prefs")
def update_prefs(project_id: str, payload: PrefsRequest):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    current = meta.get("render_prefs") or dict(DEFAULT_RENDER_PREFS)
    merged = dict(current)
    new_prefs = payload.render_prefs or {}

    for k in ("subtitles_enabled", "title_enabled", "watermark_enabled"):
        if k in new_prefs:
            merged[k] = bool(new_prefs[k])
    if "watermark" in new_prefs:
        merged["watermark"] = str(new_prefs["watermark"])

    if "aspect" in new_prefs:
        aspect_in = str(new_prefs["aspect"])
        if aspect_in not in render_clips.ASPECTS:
            raise HTTPException(400, "Rasio tidak valid: aspect")
        merged["aspect"] = aspect_in

    if "subtitle_style" in new_prefs:
        style_in = new_prefs["subtitle_style"]
        if not isinstance(style_in, dict):
            raise HTTPException(400, "Setelan subtitle tidak valid: subtitle_style")
        merged_style = dict(current.get("subtitle_style") or DEFAULT_RENDER_PREFS["subtitle_style"])
        merged_style.update(style_in)

        font = str(merged_style.get("font", "")).strip()
        if not font:
            raise HTTPException(400, "Setelan subtitle tidak valid: font")
        try:
            fs = int(merged_style.get("font_size", 96))
            if not (24 <= fs <= 200): raise ValueError()
            merged_style["font_size"] = fs
        except Exception:
            raise HTTPException(400, "Setelan subtitle tidak valid: font_size")

        try:
            mv = int(merged_style.get("margin_v", 300))
            if not (0 <= mv <= 900): raise ValueError()
            merged_style["margin_v"] = mv
        except Exception:
            raise HTTPException(400, "Setelan subtitle tidak valid: margin_v")

        try:
            ow = int(merged_style.get("outline_width", 5))
            if not (0 <= ow <= 20): raise ValueError()
            merged_style["outline_width"] = ow
        except Exception:
            raise HTTPException(400, "Setelan subtitle tidak valid: outline_width")

        try:
            sh = int(merged_style.get("shadow", 2))
            if not (0 <= sh <= 20): raise ValueError()
            merged_style["shadow"] = sh
        except Exception:
            raise HTTPException(400, "Setelan subtitle tidak valid: shadow")

        try:
            wpl = int(merged_style.get("words_per_line", 3))
            if not (1 <= wpl <= 8): raise ValueError()
            merged_style["words_per_line"] = wpl
        except Exception:
            raise HTTPException(400, "Setelan subtitle tidak valid: words_per_line")

        try:
            ang = int(round(float(merged_style.get("angle", 0))))
            if not (-180 <= ang <= 180): raise ValueError()
            merged_style["angle"] = ang
        except Exception:
            raise HTTPException(400, "Setelan subtitle tidak valid: angle")

        pos = merged_style.get("position")
        if pos not in subtitle_burn.POSITION_ALIGN:
            raise HTTPException(400, "Setelan subtitle tidak valid: position")

        for c_field in ("primary_color", "highlight_color", "outline_color", "box_color"):
            c_val = str(merged_style.get(c_field, ""))
            if not HEX_COLOR_RE.match(c_val):
                raise HTTPException(400, f"Setelan subtitle tidak valid: {c_field}")

        merged_style["bold"] = bool(merged_style.get("bold", True))
        merged_style["uppercase"] = bool(merged_style.get("uppercase", True))
        merged_style["box"] = bool(merged_style.get("box", False))
        merged["subtitle_style"] = merged_style

    meta["render_prefs"] = merged
    write_project_meta(project_id, meta)
    return {"status": "ok", "render_prefs": merged}


@app.put("/api/projects/{project_id}/crops")
def update_crops(project_id: str, payload: CropsRequest):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    crops = meta.setdefault("crops", {})
    idx_key = str(payload.index)
    if payload.rect is None:
        crops.pop(idx_key, None)
    else:
        w = max(0.05, min(1.0, float(payload.rect.w)))
        h = max(0.05, min(1.0, float(payload.rect.h)))
        x = max(0.0, min(1.0 - w, float(payload.rect.x)))
        y = max(0.0, min(1.0 - h, float(payload.rect.y)))
        crops[idx_key] = {
            "x": round(x, 4),
            "y": round(y, 4),
            "w": round(w, 4),
            "h": round(h, 4),
        }
    write_project_meta(project_id, meta)
    return {"status": "ok", "crops": crops}


@app.get("/api/projects/{project_id}/thumb/{index}")
def get_thumbnail(project_id: str, index: int):
    _validate_pid(project_id)
    read_project_meta(project_id)
    cands = load_segments_file(project_id)
    if index < 0 or index >= len(cands):
        raise HTTPException(404, "Kandidat tidak ditemukan")

    cdir = project_clips_dir(project_id)
    raw_dir = cdir / "raw"
    if raw_dir.exists():
        for meta_file in raw_dir.glob("*.meta.json"):
            try:
                m = json.loads(meta_file.read_text(encoding="utf-8"))
                if m.get("candidate_index") == index:
                    poster = meta_file.with_suffix(".png")
                    if poster.exists():
                        return FileResponse(poster, media_type="image/png")
            except Exception:
                pass

    cand = cands[index]
    start = float(cand.get("start", 0.0))
    end = float(cand.get("end", start + 30.0))
    cache = project_dir(project_id) / "thumbs" / f"{index}-{int(start)}.jpg"
    if not cache.exists():
        src = get_source_video_path(project_id)
        if not src:
            raise HTTPException(404, "Source video not found")
        mid = (start + end) / 2.0
        cache.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run([
                "ffmpeg", "-y",
                "-ss", f"{max(0.0, mid - 0.5):.2f}",
                "-i", str(src),
                "-frames:v", "1",
                "-vf", "scale=640:-2",
                "-q:v", "4",
                str(cache)
            ], check=True, capture_output=True)
        except Exception:
            raise HTTPException(500, "Gagal membuat thumbnail")

    return FileResponse(cache, media_type="image/jpeg")


@app.post("/api/projects/{project_id}/clips/{slug}/transcribe")
def transcribe_clip(project_id: str, slug: str, force: bool = False):
    _validate_pid(project_id)
    master = _raw_clip_path(project_id, slug)
    cdir = project_clips_dir(project_id)
    cache = cdir / f"{slug}.words.json"
    if cache.exists() and not force:
        try:
            return {"status": "ok", **json.loads(cache.read_text(encoding="utf-8"))}
        except Exception:
            pass

    tr_proj = load_transcript_file(project_id) or {}
    lang = tr_proj.get("language")
    try:
        tr = subtitle_burn.transcribe_audio(master, model_size="base", language=lang)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(tr, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"status": "ok", **tr}
    except Exception as e:
        raise HTTPException(500, f"Transkripsi gagal: {e}")


@app.post("/api/projects/{project_id}/clips/{slug}/subtitles")
def apply_subtitles(project_id: str, slug: str, payload: SubtitlesRequest):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    prefs = meta.get("render_prefs") or dict(DEFAULT_RENDER_PREFS)
    if not prefs.get("subtitles_enabled", True):
        raise HTTPException(400, "Subtitle dimatikan di Pengaturan")

    master = _raw_clip_path(project_id, slug)
    cdir = project_clips_dir(project_id)
    cache = cdir / f"{slug}.words.json"
    final = cdir / f"{slug}.mp4"
    style = prefs.get("subtitle_style") or DEFAULT_RENDER_PREFS["subtitle_style"]
    tr_proj = load_transcript_file(project_id) or {}
    lang = tr_proj.get("language")

    try:
        subtitle_burn.apply_to_clip(
            master=master,
            out_path=final,
            style=style,
            model_size=payload.model_size or "base",
            language=lang,
            words=payload.words,
            words_cache=cache,
            regenerate=bool(payload.regenerate),
        )
    except Exception as e:
        raise HTTPException(500, f"Gagal membakar subtitle: {e}")

    raw_meta_file = master.with_suffix(".meta.json")
    final_meta = {}
    if raw_meta_file.exists():
        try:
            final_meta = json.loads(raw_meta_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    final_meta["subtitled"] = True
    final.with_suffix(".meta.json").write_text(
        json.dumps(final_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    dur = subtitle_burn.media_duration(final)
    final_poster = final.with_suffix(".png")
    try:
        subprocess.run([
            "ffmpeg", "-y",
            "-ss", f"{max(0.0, dur * 0.4):.2f}",
            "-i", str(final),
            "-frames:v", "1",
            "-q:v", "2",
            str(final_poster)
        ], check=True, capture_output=True)
    except Exception:
        pass
    # Auto-copy final subtitled clip to global render_dir
    cfg = load_global_config()
    rdir_str = cfg.get("render_dir")
    if rdir_str:
        try:
            rdir = Path(rdir_str)
            rdir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(final, rdir / final.name)
        except Exception as e:
            print(f"Warning: Failed to copy subtitled clip to render_dir: {e}", flush=True)

    for item in _list_project_clips(project_id):
        if item.get("slug") == slug and item.get("subtitled") and not item["url"].startswith(f"/clips/{project_id}/raw/"):
            return {"status": "ok", "clip": item}

    return {
        "status": "ok",
        "clip": {
            "name": final.name,
            "slug": slug,
            "url": f"/clips/{project_id}/{final.name}",
            "poster_url": f"/clips/{project_id}/{final_poster.name}" if final_poster.exists() else None,
            "subtitled": True,
            "candidate_index": final_meta.get("candidate_index"),
            "size_mb": round(final.stat().st_size / (1024 * 1024), 2),
            "created_at": final.stat().st_mtime,
            "meta": final_meta,
        }
    }


@app.post("/api/projects/{project_id}/clips/{slug}/publish")
def publish_clip(project_id: str, slug: str):
    _validate_pid(project_id)
    master = _raw_clip_path(project_id, slug)
    cdir = project_clips_dir(project_id)
    final = cdir / f"{slug}.mp4"
    shutil.copy2(master, final)

    raw_poster = master.with_suffix(".png")
    final_poster = final.with_suffix(".png")
    if raw_poster.exists():
        shutil.copy2(raw_poster, final_poster)

    raw_meta_file = master.with_suffix(".meta.json")
    final_meta = {}
    if raw_meta_file.exists():
        try:
            final_meta = json.loads(raw_meta_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    final_meta["subtitled"] = False
    final.with_suffix(".meta.json").write_text(
        json.dumps(final_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Auto-copy published clip to global render_dir
    cfg = load_global_config()
    rdir_str = cfg.get("render_dir")
    if rdir_str:
        try:
            rdir = Path(rdir_str)
            rdir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(final, rdir / final.name)
        except Exception as e:
            print(f"Warning: Failed to copy published clip to render_dir: {e}", flush=True)

    for item in _list_project_clips(project_id):
        if item.get("slug") == slug and not item["url"].startswith(f"/clips/{project_id}/raw/"):
            return {"status": "ok", "clip": item}

    return {
        "status": "ok",
        "clip": {
            "name": final.name,
            "slug": slug,
            "url": f"/clips/{project_id}/{final.name}",
            "poster_url": f"/clips/{project_id}/{final_poster.name}" if final_poster.exists() else None,
            "subtitled": False,
            "candidate_index": final_meta.get("candidate_index"),
            "size_mb": round(final.stat().st_size / (1024 * 1024), 2),
            "created_at": final.stat().st_mtime,
            "meta": final_meta,
        }
    }


@app.get("/api/projects/{project_id}/clips")
def list_clips(project_id: str):
    _validate_pid(project_id)
    read_project_meta(project_id)
    return {"clips": _list_project_clips(project_id)}


@app.delete("/api/projects/{project_id}/reset")
def reset_workspace(project_id: str):
    _validate_pid(project_id)
    with INGEST_LOCK:
        if project_id in INGEST_JOBS:
            INGEST_JOBS[project_id]['cancel'] = True
    meta = read_project_meta(project_id)
    pdir = project_dir(project_id)
    shutil.rmtree(pdir / 'hq', ignore_errors=True)
    shutil.rmtree(pdir / '_section', ignore_errors=True)
    shutil.rmtree(project_clips_dir(project_id), ignore_errors=True)
    # Remove source, transcript, segments — keep project.json + cover.jpg
    for pattern in ['source.*', 'transcript.json', 'segments.json']:
        for f in pdir.glob(pattern):
            try: f.unlink()
            except Exception: pass
    if 'ingest' in meta:
        del meta['ingest']
    if 'crops' in meta:
        del meta['crops']
    meta.pop('prepare', None)
    meta.pop('local_tier', None)
    write_project_meta(project_id, meta)
    return {"status": "ok", "message": "Workspace reset"}

# Serve compiled assets with explicit MIME types to bypass Windows registry quirks
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

@app.get("/assets/{file_path:path}")
def serve_frontend_assets(file_path: str):
    full_path = FRONTEND_DIST / "assets" / file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    media_type = "text/plain"
    if file_path.endswith(".js") or file_path.endswith(".mjs"):
        media_type = "application/javascript"
    elif file_path.endswith(".css"):
        media_type = "text/css"
    return FileResponse(full_path, media_type=media_type)


# Serve compiled frontend when available
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    print("Starting AutoClip FastAPI Server on http://127.0.0.1:8005 ...")
    uvicorn.run("server:app", host="127.0.0.1", port=8005, reload=True)
