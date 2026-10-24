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

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Response
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
import tighten

DEFAULT_RENDER_PREFS = {
    "subtitles_enabled": False,
    "title_enabled": False,
    "watermark_enabled": False,
    "watermark": "",
    "aspect": "9:16",
    "safe_zone": False,
    "zoom_auto": False,
    "zoom_manual": 100,
    "subtitle_style": dict(subtitle_burn.DEFAULT_STYLE),
    "caption_preset": subtitle_burn.DEFAULT_CAPTION_PRESET,
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
        'render_prefs': dict(DEFAULT_RENDER_PREFS, **(meta.get('render_prefs') or {})),
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
    model_size: Optional[str] = None   # kosong → pakai setting whisper_model (T7)
    language: Optional[str] = None
    quality: Optional[str] = "proxy"


class ScoreRequest(BaseModel):
    model_name: Optional[str] = "ag/gemini-3.8-flash"
    min_score: Optional[float] = 6.0
    max_clips: Optional[int] = 8
    min_len: Optional[int] = 15
    max_len: Optional[int] = 60
    use_llm: Optional[bool] = True
    search_logic: Optional[str] = None


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
    model_size: Optional[str] = None
    regenerate: Optional[bool] = False

class WordEditRequest(BaseModel):
    idx: int
    text: str

class GlossaryRequest(BaseModel):
    text: str


class CutRequest(BaseModel):
    from_idx: int
    to_idx: int

class TightenRequest(BaseModel):
    silence_ms: int = 400
    filler: bool = True

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


class CreateProjectRequest(BaseModel):
    title: Optional[str] = None

class ExportRequest(BaseModel):
    clip_id: str
    resolution: Optional[str] = "1080p"
    fps: Optional[int] = 30
    burn_caption: Optional[bool] = True
    name: Optional[str] = None

class RenameProjectRequest(BaseModel):
    title: str

class ZoomKeyframesRequest(BaseModel):
    candidate_index: int
    zoom_manual: Optional[int] = None
    aspect: Optional[str] = None

class UpdateSettingsRequest(BaseModel):
    llm_endpoint: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    available_models: Optional[List[str]] = None
    render_dir: Optional[str] = None
    whisper_model: Optional[str] = None

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
        "aspect_ratios": ["9:16", "1:1", "4:5", "16:9"],
        "subtitle_fonts": [
            "Arial Black", "Arial", "Impact", "Verdana", "Tahoma",
            "Trebuchet MS", "Georgia", "Courier New", "Segoe UI", "Calibri"
        ],
        "subtitle_positions": [
            {"id": "top", "label": "Atas"},
            {"id": "middle", "label": "Tengah"},
            {"id": "bottom", "label": "Bawah"}
        ],
        "caption_presets": [
            {"id": name, "label": meta.get("label") or name, "style": subtitle_burn.preset_style(name)}
            for name, meta in subtitle_burn.CAPTION_PRESETS.items()
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
        "default_model": cfg.get("llm_model") or "ag/gemini-3.8-flash",
        "asr_models": [
            {"id": "medium", "label": "Medium — default, akurat & hemat waktu"},
            {"id": "large-v3", "label": "Large v3 — paling akurat, ~2-4x lebih lama di CPU"},
            {"id": "small", "label": "Small — cepat, akurasi lebih rendah"},
            {"id": "base", "label": "Base — paling cepat, untuk pratinjau"},
            {"id": "auto", "label": "Auto — large-v3 kalau disk ≥ 10 GB bebas, selain medium"},
        ],
        "asr_glossary_file": str(core_engine.GLOSSARY_FILE.relative_to(ROOT_DIR)),
        "asr_confidence_threshold": core_engine.CONFIDENCE_MIN_LOGPROB,
    }


@app.get("/api/settings")
def get_settings():
    cfg = load_global_config()
    render_p = Path(cfg.get("render_dir", default_render_dir()))
    return {
        **cfg,
        "whisper_model": cfg.get("whisper_model") or core_engine.DEFAULT_ASR_MODEL,
        "asr_disk_free_gb": round(core_engine.disk_free_gb(), 1),
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
    if payload.whisper_model is not None:
        updates["whisper_model"] = core_engine.resolve_model_size(payload.whisper_model.strip() or "auto")
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

# --------------------------------------------------------------------------
# Glosarium ASR (T7) — data/glossary.txt, 1 istilah per baris → initial_prompt Whisper
# --------------------------------------------------------------------------
GLOSSARY_FILE = core_engine.GLOSSARY_FILE

@app.get("/api/glossary")
def get_glossary():
    """Berkas dibuat kosong kalau belum ada, supaya UI editor tetap bisa dibuka."""
    GLOSSARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not GLOSSARY_FILE.exists():
        GLOSSARY_FILE.write_text("", encoding="utf-8")
    return {"ok": True, "path": "data/glossary.txt",
            "text": GLOSSARY_FILE.read_text(encoding="utf-8-sig"),
            "terms": core_engine.read_glossary()}

@app.put("/api/glossary")
def update_glossary(payload: GlossaryRequest):
    GLOSSARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    GLOSSARY_FILE.write_text(payload.text, encoding="utf-8")
    return {"ok": True, "path": "data/glossary.txt",
            "terms": core_engine.read_glossary()}

# --------------------------------------------------------------------------
# Akurasi transkrip (T7): WER kata terhadap data/wer_sample.json
# --------------------------------------------------------------------------
WER_SAMPLE_FILE = ROOT_DIR / "data" / "wer_sample.json"
NON_SPEECH_TAG_RE = re.compile(r"\[[^\]]*\]|\([^)]*\)", re.UNICODE)

def _wer_tokens(text: str) -> List[str]:
    """Token WER: buang tag non-ucapan, tanda baca, dan beda huruf besar/kecil."""
    clean = NON_SPEECH_TAG_RE.sub(" ", text or "")
    return re.sub(r"[^\w\s]", " ", clean, flags=re.UNICODE).lower().split()

def _levenshtein(ref: List[str], hyp: List[str]) -> int:
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1]

def _wer(reference: str, hypothesis: str) -> dict:
    ref, hyp = _wer_tokens(reference), _wer_tokens(hypothesis)
    errors = _levenshtein(ref, hyp)
    return {"words": len(ref), "errors": errors,
            "wer": round(errors / len(ref), 4) if ref else None}

@app.get("/api/accuracy")
def get_accuracy():
    """WER 60 detik (data/wer_sample.json) — sebelum vs sesudah T7."""
    if not WER_SAMPLE_FILE.is_file():
        return {"ok": False, "reason": "Sampel akurasi belum tersedia",
                "hint": "Siapkan data/wer_sample.json: 60 detik transkrip manual + teks pembanding"}
    try:
        sample = json.loads(WER_SAMPLE_FILE.read_text(encoding="utf-8-sig"))
    except Exception as e:
        return {"ok": False, "reason": "Sampel akurasi tidak terbaca",
                "hint": f"Periksa data/wer_sample.json ({e})"}

    reference = sample.get("reference") or ""
    rows = []
    for key, fallback in (("baseline", "Sebelum"), ("after", "Sesudah")):
        entry = sample.get(key)
        text = entry.get("text") if isinstance(entry, dict) else entry
        if not text:
            continue
        label = entry.get("label") if isinstance(entry, dict) else None
        rows.append({"id": key, "label": label or fallback, **_wer(reference, text)})

    if not reference or len(rows) < 2:
        return {"ok": False, "reason": "Sampel akurasi belum lengkap",
                "hint": "Butuh kunci reference, baseline, dan after"}
    return {"ok": True, "source": sample.get("source"), "window": sample.get("window"),
            "reference_note": sample.get("reference_note"), "measured_at": sample.get("measured_at"),
            "rows": rows,
            "improvement": round((rows[0]["wer"] or 0) - (rows[1]["wer"] or 0), 4)}



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
        "created_at": now, "updated_at": now,
        "render_prefs": dict(DEFAULT_RENDER_PREFS),
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
        if mp4.name.startswith("_") or EXPORT_SUFFIX_RE.search(mp4.stem):
            continue  # hasil export (mis. _720p) bukan klip sumber
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
        "transcript": transcript_info,
        "candidates": candidates,
        "ingest": ingest,
        "clips": _list_project_clips(project_id),
    }


# --------------------------------------------------------------------------
# Transcript kata (word-level) + cut
# --------------------------------------------------------------------------
def _word_ms(w: dict, key: str) -> int:
    """Milidetik integer dari kata; sumber boleh detik float atau *_ms."""
    v = w.get(f'{key}_ms')
    return int(round(v)) if v is not None else int(round((w.get(key) or 0) * 1000))

def _transcript_duration_ms(tr: dict) -> int:
    v = tr.get('duration_ms')
    if v is None:
        v = tr.get('duration')
        return int(round((v or 0) * 1000))
    return int(round(v))

def _transcript_unready() -> JSONResponse:
    return JSONResponse(status_code=404, content={
        "ok": False, "reason": "Transkrip belum siap", "hint": "Jalankan analisis dulu"})

def _needs_check(w: dict) -> bool:
    """Kata ragu: keyakinan ASR di bawah ambang dan belum diedit manual."""
    if w.get('edited'):
        return False
    lp = w.get('avg_logprob')
    return isinstance(lp, (int, float)) and lp < core_engine.CONFIDENCE_MIN_LOGPROB

@app.get("/api/projects/{project_id}/transcript")
def get_transcript(project_id: str, word: int = 1):
    _validate_pid(project_id)
    tr = load_transcript_file(project_id)
    if not tr or not tr.get('words'):
        return _transcript_unready()
    return {
        "words": [
            {
                "idx": i,
                "word": w.get("word", ""),
                "start_ms": _word_ms(w, "start"),
                "end_ms": _word_ms(w, "end"),
                "deleted": int(w.get("deleted") or 0),
                "avg_logprob": w.get("avg_logprob"),
                "edited": int(w.get("edited") or 0),
                "needs_check": _needs_check(w),
            }
            for i, w in enumerate(tr["words"])
        ],
        "language": tr.get("language"),
        "model": tr.get("model"),
        "duration_ms": _transcript_duration_ms(tr),
        "check_threshold": core_engine.CONFIDENCE_MIN_LOGPROB,
    }

def _save_transcript(pid: str, tr: dict):
    """Simpan transcript.json dengan backup sekali (pola sama seperti cut/tighten/edit kata)."""
    path = project_dir(pid) / 'transcript.json'
    bak = path.with_name('transcript.json.bak')
    if not bak.exists():
        shutil.copy2(path, bak)
    tmp = path.with_name('transcript.json.tmp')
    tmp.write_text(json.dumps(tr, ensure_ascii=False), encoding='utf-8')
    os.replace(tmp, path)

@app.post("/api/projects/{project_id}/cut")
def cut_transcript(project_id: str, payload: CutRequest):
    _validate_pid(project_id)
    tr = load_transcript_file(project_id)
    if not tr or not tr.get('words'):
        return _transcript_unready()
    words = tr["words"]
    if not (0 <= payload.from_idx <= payload.to_idx < len(words)):
        return JSONResponse(status_code=400,
                            content={"ok": False, "reason": "Rentang tidak valid"})
    removed = 0
    for w in words[payload.from_idx:payload.to_idx + 1]:
        removed += max(0, _word_ms(w, 'end') - _word_ms(w, 'start'))
        w['deleted'] = 1
    duration = _transcript_duration_ms(tr)
    _save_transcript(project_id, tr)
    return {
        "ok": True,
        "removed_ms": removed,
        "new_duration_ms": duration - removed,
        "deleted": payload.to_idx - payload.from_idx + 1,
    }

@app.post("/api/projects/{project_id}/transcript/word")
def edit_transcript_word(project_id: str, payload: WordEditRequest):
    """Ganti teks satu kata; timing dibagi proporsional per karakter di rentang kata itu."""
    _validate_pid(project_id)
    tr = load_transcript_file(project_id)
    if not tr or not tr.get('words'):
        return _transcript_unready()
    words = tr["words"]
    if not (0 <= payload.idx < len(words)):
        return JSONResponse(status_code=400, content={"ok": False, "reason": "Indeks kata tidak valid"})
    text = (payload.text or '').strip()
    if not text:
        return JSONResponse(status_code=400, content={"ok": False, "reason": "Teks kata tidak boleh kosong"})

    old = words[payload.idx]
    start_ms, end_ms = _word_ms(old, 'start'), _word_ms(old, 'end')
    tokens = text.split()
    span = max(0, end_ms - start_ms)
    total_chars = sum(len(t) for t in tokens) or 1

    replacements, cursor, done_chars = [], start_ms, 0
    for i, token in enumerate(tokens):
        done_chars += len(token)
        w_end = end_ms if i == len(tokens) - 1 else start_ms + round(span * done_chars / total_chars)
        replacements.append({
            "word": token,
            "start": round(cursor / 1000, 3),
            "end": round(max(w_end, cursor + 1) / 1000, 3),
            "deleted": int(old.get('deleted') or 0),
            "avg_logprob": 0.0,     # teks sudah dikonfirmasi manusia
            "edited": 1,
        })
        cursor = max(w_end, cursor + 1)

    words[payload.idx:payload.idx + 1] = replacements
    _save_transcript(project_id, tr)
    return {"ok": True, "from_idx": payload.idx, "count": len(replacements),
            "words": [{"idx": payload.idx + i, "word": w["word"],
                       "start_ms": _word_ms(w, 'start'), "end_ms": _word_ms(w, 'end')}
                      for i, w in enumerate(replacements)]}

# --------------------------------------------------------------------------
# Tighten: buang jeda sunyi + kata pengisi (T5) — pakai perencana chopify/tighten.py
# --------------------------------------------------------------------------
@app.post("/api/projects/{project_id}/tighten")
def tighten_transcript(project_id: str, payload: TightenRequest):
    _validate_pid(project_id)
    tr = load_transcript_file(project_id)
    if not tr or not tr.get('words'):
        return JSONResponse(status_code=200, content={
            "ok": False, "reason": "Transkrip belum siap",
            "hint": "Jalankan analisis dulu supaya jeda dan kata pengisi bisa dipotong"})

    duration_ms = _transcript_duration_ms(tr)
    silence_ms = int(payload.silence_ms)
    if silence_ms < 200 or silence_ms > 1200:
        silence_ms = min(1200, max(200, silence_ms))

    live = [w for w in tr["words"] if not w.get('deleted')]
    if not live or duration_ms <= 0:
        return {"ok": True, "saved_ms": 0, "deleted": 0,
                "new_duration_ms": duration_ms, "silence_ms": silence_ms, "filler": bool(payload.filler)}

    keeps = tighten.plan_cuts(live, 0.0, duration_ms / 1000.0,
                              gap=silence_ms / 1000.0,
                              fillers=bool(payload.filler), silence=True)
    keep_ranges = [(round(a * 1000), round(b * 1000)) for a, b in keeps]
    new_duration_ms = max(0, min(duration_ms, sum(b - a for a, b in keep_ranges)))

    deleted = 0
    for w in live:
        s, e = _word_ms(w, 'start'), _word_ms(w, 'end')
        if any(a <= s and e <= b for a, b in keep_ranges):
            continue
        w['deleted'] = 1
        deleted += 1

    if deleted or new_duration_ms != duration_ms:
        tr['duration'] = round(new_duration_ms / 1000.0, 3)
        tr['duration_ms'] = new_duration_ms
        _save_transcript(project_id, tr)

    return {"ok": True, "saved_ms": duration_ms - new_duration_ms, "deleted": deleted,
            "new_duration_ms": new_duration_ms, "silence_ms": silence_ms,
            "filler": bool(payload.filler)}

# --------------------------------------------------------------------------
# Timeline project (T3a) — turunan read-only kalau timeline.json belum ada
# --------------------------------------------------------------------------
TIMELINE_TRACKS = (1, 2, 3)
TIMELINE_KINDS = {1: 'video', 2: 'caption', 3: 'audio'}
CAPTION_MAX_WORDS = 12

def _video_duration_ms(pid: str) -> int:
    src = get_source_video_path(pid)
    if not src:
        return 0
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(src)],
            capture_output=True, text=True, timeout=30, check=True).stdout.strip()
        return max(0, int(round(float(out.splitlines()[0]) * 1000)))
    except Exception:
        return 0

def _project_duration_ms(pid: str) -> int:
    tr = load_transcript_file(pid)
    if tr:
        ms = _transcript_duration_ms(tr)
        if ms > 0:
            return ms
    return _video_duration_ms(pid)

def _caption_items(words: List[dict], duration_ms: int) -> List[dict]:
    """Satu item per kalimat dari kata: pecah di . ? ! atau tiap 12 kata."""
    items, buf, start = [], [], None

    def flush(end_ms: int):
        nonlocal buf, start
        if buf:
            end = min(end_ms, duration_ms) if duration_ms else end_ms
            items.append({
                "id": f"d2-{len(items)}",
                "kind": "caption",
                "start_ms": start or 0,
                "end_ms": max(end, (start or 0) + 1),
                "payload": {"text": " ".join(buf)},
            })
        buf, start = [], None

    for w in words:
        if w.get('deleted'):
            continue
        text = (w.get('word') or '').strip()
        if not text:
            continue
        if start is None:
            start = _word_ms(w, 'start')
        buf.append(text)
        if len(buf) >= CAPTION_MAX_WORDS or text[-1] in '.?!':
            flush(_word_ms(w, 'end'))
    if buf:
        flush(_word_ms(words[-1], 'end'))
    return items

def _derive_timeline(pid: str) -> dict:
    duration_ms = _project_duration_ms(pid)
    words = (load_transcript_file(pid) or {}).get('words') or []

    def full(track: int) -> dict:
        return {"id": f"d{track}-0", "kind": TIMELINE_KINDS[track],
                "start_ms": 0, "end_ms": duration_ms, "payload": {}}

    return {
        "duration_ms": duration_ms,
        "tracks": [
            {"track": 1, "items": [full(1)]},
            {"track": 2, "items": _caption_items(words, duration_ms)},
            {"track": 3, "items": [full(3)]},
        ],
    }

def _read_timeline_file(pid: str) -> Optional[dict]:
    p = project_dir(pid) / 'timeline.json'
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding='utf-8-sig'))
        return data if isinstance(data, dict) else None
    except Exception:
        return None

def _timeline_bad(reason: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"ok": False, "reason": reason})

@app.get("/api/projects/{project_id}/timeline")
def get_timeline(project_id: str):
    _validate_pid(project_id)
    read_project_meta(project_id)
    return _read_timeline_file(project_id) or _derive_timeline(project_id)

@app.post("/api/projects/{project_id}/timeline")
def post_timeline(project_id: str, payload: dict):
    _validate_pid(project_id)
    read_project_meta(project_id)
    items = payload.get('items') if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return _timeline_bad("Field 'items' harus list")

    saved = _read_timeline_file(project_id)
    duration_ms = int(saved.get('duration_ms') or 0) if saved else 0
    if not duration_ms:
        duration_ms = _project_duration_ms(project_id)
    limit = duration_ms + 1000

    tracks: dict[int, list] = {}
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            return _timeline_bad(f"Item {i} bukan objek")
        track = it.get('track')
        if track not in TIMELINE_KINDS:
            return _timeline_bad(f"Item {i}: track {track!r} tidak valid (1|2|3)")
        try:
            start, end = int(it.get('start_ms')), int(it.get('end_ms'))
        except (TypeError, ValueError):
            return _timeline_bad(f"Item {i}: start_ms/end_ms harus angka")
        if not 0 <= start < end:
            return _timeline_bad(f"Item {i}: rentang tidak valid ({start}..{end})")
        if end > limit:
            return _timeline_bad(
                f"Item {i}: end_ms {end} melebihi durasi {duration_ms} ms")
        item_payload = it.get('payload')
        if item_payload is not None and not isinstance(item_payload, dict):
            return _timeline_bad(f"Item {i}: payload harus objek")
        bucket = tracks.setdefault(track, [])
        bucket.append({
            "id": str(it.get('id') or f"t{track}-{len(bucket)}"),
            "kind": str(it.get('kind') or TIMELINE_KINDS[track]),
            "start_ms": start,
            "end_ms": end,
            "payload": item_payload or {},
        })

    path = project_dir(project_id) / 'timeline.json'
    bak = path.with_name('timeline.json.bak')
    if path.exists() and not bak.exists():
        shutil.copy2(path, bak)
    data = {
        "duration_ms": duration_ms,
        "tracks": [{"track": t, "items": tracks.get(t, [])} for t in TIMELINE_TRACKS],
    }
    tmp = path.with_name('timeline.json.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)
    return {"ok": True, "items": sum(len(tracks.get(t, [])) for t in TIMELINE_TRACKS)}

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


DOWNLOAD_QUALITY_LABELS = {'proxy': '360p', 'hd': '1080p', 'best': 'terbaik'}

def _asr_model_size(requested: Optional[str] = None) -> str:
    """Model ASR: eksplisit dari request → setting `whisper_model` → default medium."""
    req = (requested or '').strip()
    if not req:
        req = str(load_global_config().get('whisper_model') or core_engine.DEFAULT_ASR_MODEL)
    return core_engine.resolve_model_size(req)

def _start_ingest(pid: str, url: Optional[str] = None, uploaded: bool = False, model_size: Optional[str] = None, language: Optional[str] = None, quality: str = 'proxy'):
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
        args=(pid, url, uploaded, model_size, language, quality),
        daemon=True
    ).start()


def _format_error_message(err: Exception) -> str:
    msg = str(err)
    if "Sign in to confirm you're not a bot" in msg or "RequestBlocked" in msg:
        return (
            "YouTube memblokir download otomatis (Bot Detection). "
            "Solusi tercepat: Pakai tab 'Upload File Video' untuk upload file video .mp4 langsung, "
            "atau letakkan file 'cookies.txt' akun YouTube Anda di folder project."
        )
    return msg


def _ingest_worker(pid: str, url: Optional[str], uploaded: bool, model_size: Optional[str], language: Optional[str] = None, quality: str = 'proxy'):
    model_size = _asr_model_size(model_size)
    pdir = project_dir(pid)
    try:
        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 1: metadata
        _ingest_write(pid, status='running', stage='metadata', percent=1, message='Menyiapkan project...')
        has_yt_transcript = False
        if url:
            try:
                meta = read_project_meta(pid)
                meta['source_type'] = 'youtube'
                meta['source_url'] = url
                meta['download_quality'] = quality
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
                has_yt_transcript = True
            except Exception as e:
                print(f"YouTube Transcript API unavailable or failed ({e}), will fallback to Whisper later.", flush=True)

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 3: Download source at the chosen quality (unless uploaded)
        if not uploaded:
            label = DOWNLOAD_QUALITY_LABELS.get(quality, quality)
            _ingest_write(pid, stage='download', percent=12, message=f'Mengunduh video {label}... 0%')
            span = 80 if has_yt_transcript else 73
            max_pct = 92 if has_yt_transcript else 85

            def cb(frac):
                if _ingest_cancelled(pid):
                    raise _Cancelled()
                f = frac if frac is not None else 0.0
                calc = 12 + round(f * span)
                _ingest_write(
                    pid,
                    percent=min(max_pct, calc),
                    message=f'Mengunduh video {label}... {round(f * 100)}%'
                )

            core_engine.download_to(url, pdir / 'source', preset=quality, on_progress=cb)

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 4: Whisper if transcript does not exist
        transcript_file = pdir / 'transcript.json'
        if not transcript_file.exists():
            _ingest_write(pid, stage='transcript', percent=92, message=f'Transkripsi audio (Whisper {model_size})...')
            video_path = get_source_video_path(pid)
            if not video_path:
                raise RuntimeError("Video source tidak ditemukan untuk transkripsi.")
            core_engine.get_transcript(video_path=video_path, workdir=pdir, yt_url=None, model_size=model_size, language=language)

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 5: Finalize
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
        _ingest_write(pid, status='error', error=_format_error_message(e), message='Gagal memproses project', finished_at=time.time())
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

    tier = (payload.quality or 'proxy').lower()
    if tier not in ('proxy', 'hd', 'best'):
        raise HTTPException(400, "Kualitas tidak dikenal: pakai proxy|hd|best")

    _start_ingest(project_id, url=url, model_size=payload.model_size, language=payload.language, quality=tier)
    return {"status": "started"}


@app.post("/api/projects/{project_id}/upload")
async def upload_video(project_id: str, file: UploadFile = File(...),
                       model_size: Optional[str] = Form(None), language: Optional[str] = Form(None)):
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
                    api_key=cfg.get("llm_api_key"),
                    search_logic=payload.search_logic
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


def _stored_zoom_keyframes(pid: str, idx: int):
    """Kotak zoom yang tersimpan di payload timeline (track 1) untuk kandidat ini."""
    tl = _read_timeline_file(pid)
    if not tl:
        return None
    for track in tl.get("tracks") or []:
        if track.get("track") != 1:
            continue
        for it in track.get("items") or []:
            by_idx = ((it.get("payload") or {}).get("zoom_keyframes") or {})
            kfs = by_idx.get(str(idx))
            if isinstance(kfs, list) and kfs:
                return kfs
    return None

@app.post("/api/projects/{project_id}/zoom-keyframes")
def compute_zoom_keyframes(project_id: str, payload: ZoomKeyframesRequest):
    """Deteksi wajah sekali per detik -> kotak crop untuk `ffmpeg zoompan` (T6)."""
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    if not ((ROOT_DIR / "yunet.onnx").exists() or (WORKDIR / "yunet.onnx").exists()):
        return {"ok": False, "reason": "Model deteksi wajah belum ada",
                "hint": "Letakkan yunet.onnx di folder work/ lalu ulangi."}

    prefs = meta.get("render_prefs") or dict(DEFAULT_RENDER_PREFS)
    aspect = payload.aspect or prefs.get("aspect") or "9:16"
    if aspect not in render_clips.ASPECTS:
        return JSONResponse(status_code=400, content={
            "ok": False, "reason": "Rasio tidak valid: aspect"})
    zoom_manual = payload.zoom_manual
    if zoom_manual is None:
        zoom_manual = int(prefs.get("zoom_manual") or 100)
    if not (100 <= int(zoom_manual) <= 160):
        return JSONResponse(status_code=400, content={
            "ok": False, "reason": "Zoom manual tidak valid: pakai 100–160"})

    segments = load_segments_file(project_id)
    idx = payload.candidate_index
    if not segments or not (0 <= idx < len(segments)):
        return JSONResponse(status_code=400, content={
            "ok": False, "reason": "Segmen klip tidak ditemukan — cari momen viral dulu"})
    src = get_source_video_path(project_id)
    if not src:
        return JSONResponse(status_code=400, content={
            "ok": False, "reason": "Video sumber tidak ditemukan"})

    seg = segments[idx]
    start = float(seg["start"])
    dur = max(0.5, float(seg["end"]) - start)
    try:
        W, H = render_clips.ffprobe_dims(src)
        kfs = render_clips.compute_zoom_keyframes(
            src, start, dur, W, H, project_dir(project_id), aspect,
            float(zoom_manual) / 100.0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deteksi wajah gagal: {e}")
    return {"ok": True, "candidate_index": idx, "aspect": aspect,
            "zoom_manual": int(zoom_manual), "keyframes": kfs}

@app.post("/api/projects/{project_id}/render")
def render_clip(project_id: str, payload: RenderRequest):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    pdir = project_dir(project_id)
    cdir = project_clips_dir(project_id)

    src = get_source_video_path(project_id)
    if not src:
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
    if not meta.get('source_url') or tier == 'original' or tier == (meta.get('download_quality') or 'proxy'):
        pass
    else:
        if tier not in ('proxy', 'hd', 'best'):
            raise HTTPException(400, "Kualitas tidak dikenal: pakai proxy|hd|best|original")
        if tier != 'proxy':
            hq = pdir / 'hq' / f'{tier}.mp4'
            if not hq.exists():
                try:
                    core_engine.download_to(meta['source_url'], pdir / 'hq' / tier, preset=tier)
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Render failed: {_format_error_message(e)}")
            src = hq

    prefs = meta.get("render_prefs") or dict(DEFAULT_RENDER_PREFS)
    crops = meta.get("crops") or {}
    crop_rect = payload.crop_rect.model_dump() if payload.crop_rect else crops.get(str(payload.candidate_index))
    hook_title = (payload.custom_hook or seg.get("hook")) if prefs.get("title_enabled", False) else None
    wm = (prefs.get("watermark") or "").strip() or None
    watermark = wm if prefs.get("watermark_enabled") else None

    # Zoom punch-in: keyframes timeline hanya cocok kalau tidak ada tighten (waktu tidak bergeser).
    do_tighten = payload.do_tighten if payload.do_tighten is not None else True
    zoom_kfs = _stored_zoom_keyframes(project_id, payload.candidate_index) if not do_tighten else None

    try:
        cdir.mkdir(parents=True, exist_ok=True)
        w, h = render_clips.ffprobe_dims(src)
        res_p = render_clips.render(
            seg=seg, words=transcript["words"], source=src,
            W=w, H=h, workdir=pdir,
            aspect=payload.aspect or "9:16",
            out_dir=cdir,
            do_tighten=do_tighten,
            loudnorm=payload.loudnorm or False,
            preview=False,
            crop_mode=payload.crop_mode or "auto",
            hook_title=hook_title,
            watermark=watermark,
            crop_rect=crop_rect,
            zoom_auto=bool(prefs.get("zoom_auto")),
            zoom_manual=int(prefs.get("zoom_manual") or 100),
            zoom_keyframes=zoom_kfs,
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

    # Safe-zone preview + zoom punch-in (T6): aman disimpan bareng prefs lain.
    if "safe_zone" in new_prefs:
        merged["safe_zone"] = bool(new_prefs["safe_zone"])
    if "zoom_auto" in new_prefs:
        merged["zoom_auto"] = bool(new_prefs["zoom_auto"])
    if "zoom_manual" in new_prefs:
        try:
            zm = int(new_prefs["zoom_manual"])
        except (TypeError, ValueError):
            raise HTTPException(400, "Zoom manual tidak valid: zoom_manual")
        if not (100 <= zm <= 160):
            raise HTTPException(400, "Zoom manual tidak valid: pakai 100–160")
        merged["zoom_manual"] = zm

    if "caption_preset" in new_prefs:
        preset_name = str(new_prefs["caption_preset"] or "")
        if preset_name and preset_name not in subtitle_burn.CAPTION_PRESETS:
            raise HTTPException(400, f"Preset caption tidak dikenal: {preset_name}")
        merged["caption_preset"] = preset_name or subtitle_burn.DEFAULT_CAPTION_PRESET
        # Preset menang atas gaya lama; patch subtitle_style (kalau ada) diterapkan setelah ini.
        merged["subtitle_style"] = subtitle_burn.preset_style(merged["caption_preset"])

    if "subtitle_style" in new_prefs:
        style_in = new_prefs["subtitle_style"]
        if not isinstance(style_in, dict):
            raise HTTPException(400, "Setelan subtitle tidak valid: subtitle_style")
        merged_style = dict(merged.get("subtitle_style") or current.get("subtitle_style")
                            or DEFAULT_RENDER_PREFS["subtitle_style"])
        merged_style.update(style_in)

        font = str(merged_style.get("font", "")).strip()
        if not font:
            raise HTTPException(400, "Setelan subtitle tidak valid: font")
        try:
            fs = int(merged_style.get("font_size", 43))
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
        tr = subtitle_burn.transcribe_audio(master, model_size=_asr_model_size(), language=lang)
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
    if not prefs.get("subtitles_enabled"):
        prefs["subtitles_enabled"] = True
        meta["render_prefs"] = prefs
        write_project_meta(project_id, meta)

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
            model_size=_asr_model_size(payload.model_size),
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
def list_clips(project_id: str, response: Response):
    _validate_pid(project_id)
    read_project_meta(project_id)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return {"clips": _list_project_clips(project_id)}

# --------------------------------------------------------------------------
# Export jobs (T4a) — re-render klip yang sudah ada ke resolusi/fps pilihan
# --------------------------------------------------------------------------
EXPORT_SUFFIX_RE = re.compile(r"_\d{3,4}p$")
EXPORT_RES = {"1080p": 1.0, "720p": 720 / 1080}
EXPORT_FPS = (30, 24)
EXPORT_LOCK = threading.Lock()

def _exports_path(pid: str) -> Path:
    return project_dir(pid) / 'exports.json'

def _load_exports(pid: str) -> dict:
    p = _exports_path(pid)
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
            if isinstance(data, dict): return data
        except Exception:
            pass
    return {}

def _save_exports(pid: str, jobs: dict) -> None:
    project_dir(pid).mkdir(parents=True, exist_ok=True)
    _exports_path(pid).write_text(json.dumps(jobs, ensure_ascii=False, indent=2), encoding='utf-8')

def _find_clip_owner(clip_id: str) -> Optional[tuple[str, Path]]:
    """Cari project yang punya klip bernama <clip_id>.mp4 (raw atau final)."""
    if not SLUG_RE.match(clip_id):
        return None
    for cdir in sorted(CLIPS_DIR.iterdir()):
        if not (cdir.is_dir() and PID_RE.match(cdir.name)):
            continue
        for cand in (cdir / f'{clip_id}.mp4', cdir / 'raw' / f'{clip_id}.mp4'):
            if cand.exists():
                return cdir.name, cand
    return None

def _run_export(pid: str, job_id: str) -> None:
    def upd(**kw) -> None:
        with EXPORT_LOCK:
            jobs = _load_exports(pid)
            if job_id in jobs:
                jobs[job_id].update(kw)
                _save_exports(pid, jobs)

    try:
        job = _load_exports(pid).get(job_id) or {}
        upd(status="running", progress=5)
        meta = read_project_meta(pid)
        prefs = dict(DEFAULT_RENDER_PREFS, **(meta.get("render_prefs") or {}))
        idx = job.get("candidate_index")
        segments = load_segments_file(pid)
        transcript = load_transcript_file(pid) or {}
        src = get_source_video_path(pid)
        if not src:
            raise RuntimeError("Video sumber tidak ditemukan")
        if idx is None or not (0 <= int(idx) < len(segments)):
            raise RuntimeError("Klip ini tidak punya data segmen — render ulang klipnya dulu")
        if not transcript.get("words"):
            raise RuntimeError("Transcript kata tidak ditemukan")

        seg = segments[int(idx)]
        cdir = project_clips_dir(pid)
        cdir.mkdir(parents=True, exist_ok=True)
        W, H = render_clips.ffprobe_dims(src)
        upd(progress=15)
        render_clips.render(
            seg=seg, words=transcript["words"], source=src, W=W, H=H,
            workdir=project_dir(pid), aspect=prefs.get("aspect") or "9:16",
            out_dir=cdir, raw_subdir="", do_tighten=False, crop_mode="auto",
            hook_title=seg.get("hook") if prefs.get("title_enabled") else None,
            watermark=((prefs.get("watermark") or "").strip() or None)
            if prefs.get("watermark_enabled") else None,
            crop_rect=(meta.get("crops") or {}).get(str(idx)),
            zoom_auto=bool(prefs.get("zoom_auto")),
            zoom_manual=int(prefs.get("zoom_manual") or 100),
            zoom_keyframes=_stored_zoom_keyframes(pid, int(idx)),
            subtitle_style=prefs.get("subtitle_style"),
            candidate_index=int(idx),
            res_scale=EXPORT_RES[job["resolution"]], fps=int(job["fps"]),
            burn_caption=bool(job.get("burn_caption")),
            out_name=Path(job["path"]).name,
        )
        upd(status="done", progress=100, finished_at=time.time())
    except Exception as e:
        upd(status="failed", error=_format_error_message(e), finished_at=time.time())

@app.post("/api/export")
def start_export(payload: ExportRequest):
    if payload.resolution not in EXPORT_RES:
        return JSONResponse(status_code=400, content={
            "ok": False, "reason": "Resolusi tidak dikenal: pakai 1080p|720p"})
    if payload.fps is None or int(payload.fps) not in EXPORT_FPS:
        return JSONResponse(status_code=400, content={
            "ok": False, "reason": "fps tidak dikenal: pakai 30|24"})
    found = _find_clip_owner(payload.clip_id)
    if not found:
        return JSONResponse(status_code=404, content={
            "ok": False, "reason": f"Klip '{payload.clip_id}' tidak ditemukan"})
    pid, clip_path = found

    clip_meta = {}
    meta_file = clip_path.with_suffix('.meta.json')
    if meta_file.exists():
        try: clip_meta = json.loads(meta_file.read_text(encoding='utf-8'))
        except Exception: clip_meta = {}

    job_id = secrets.token_hex(8)
    job = {
        "id": job_id, "project_id": pid, "clip_id": payload.clip_id,
        "status": "queued", "resolution": payload.resolution, "fps": int(payload.fps),
        "burn_caption": bool(payload.burn_caption),
        "name": (payload.name or "").strip() or payload.clip_id,
        "path": f"/clips/{pid}/{payload.clip_id}_{payload.resolution}.mp4",
        "error": None, "progress": 0,
        "candidate_index": clip_meta.get("candidate_index"),
        "created_at": time.time(), "finished_at": None,
    }
    with EXPORT_LOCK:
        jobs = _load_exports(pid)
        jobs[job_id] = job
        _save_exports(pid, jobs)
    threading.Thread(target=_run_export, args=(pid, job_id), daemon=True).start()
    return {"ok": True, "job_id": job_id}

@app.get("/api/export/{job_id}")
def get_export(job_id: str):
    for p in sorted(WORKDIR.glob('*/exports.json')):
        job = _load_exports(p.parent.name).get(job_id)
        if job:
            return {
                "ok": True, "job_id": job_id, "status": job.get("status"),
                "path": job.get("path"), "error": job.get("error"),
                "progress": job.get("progress", 0),
            }
    raise HTTPException(404, f"Job export {job_id} tidak ditemukan")


@app.delete("/api/projects/{project_id}/reset")
def reset_workspace(project_id: str):
    _validate_pid(project_id)
    with INGEST_LOCK:
        if project_id in INGEST_JOBS:
            INGEST_JOBS[project_id]['cancel'] = True
    meta = read_project_meta(project_id)
    pdir = project_dir(project_id)
    shutil.rmtree(pdir / 'hq', ignore_errors=True)
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
    write_project_meta(project_id, meta)
    return {"status": "ok", "message": "Workspace reset"}

# Serve compiled assets with explicit MIME types and anti-cache headers
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/index.html", methods=["GET", "HEAD"])
def serve_frontend_index():
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found")
    return FileResponse(
        index_file,
        media_type="text/html",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

@app.api_route("/assets/{file_path:path}", methods=["GET", "HEAD"])
def serve_frontend_assets(file_path: str):
    full_path = FRONTEND_DIST / "assets" / file_path
    if not full_path.exists():
        # Fallback if old hash requested by cached browser: find current main asset
        if file_path.endswith(".js"):
            js_files = sorted(list((FRONTEND_DIST / "assets").glob("*.js")), key=lambda p: p.stat().st_mtime, reverse=True)
            if js_files:
                return FileResponse(
                    js_files[0],
                    media_type="application/javascript",
                    headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"},
                )
        elif file_path.endswith(".css"):
            css_files = sorted(list((FRONTEND_DIST / "assets").glob("*.css")), key=lambda p: p.stat().st_mtime, reverse=True)
            if css_files:
                return FileResponse(
                    css_files[0],
                    media_type="text/css",
                    headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"},
                )
        raise HTTPException(status_code=404, detail="Asset not found")
    media_type = "text/plain"
    if file_path.endswith(".js") or file_path.endswith(".mjs"):
        media_type = "application/javascript"
    elif file_path.endswith(".css"):
        media_type = "text/css"
    return FileResponse(
        full_path,
        media_type=media_type,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"},
    )

# Serve compiled frontend fallback when available
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    print("Starting AutoClip FastAPI Server on http://127.0.0.1:8005 ...")
    uvicorn.run("server:app", host="127.0.0.1", port=8005, reload=True)
