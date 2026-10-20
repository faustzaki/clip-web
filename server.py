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

# Fix Windows registry MIME type quirk for .js and .css
mimetypes.init()
mimetypes.types_map['.js'] = 'application/javascript'
mimetypes.types_map['.mjs'] = 'application/javascript'
mimetypes.types_map['.css'] = 'text/css'

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
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

WORKDIR = ROOT_DIR / "work"
CLIPS_DIR = ROOT_DIR / "clips"
WORKDIR.mkdir(parents=True, exist_ok=True)
CLIPS_DIR.mkdir(parents=True, exist_ok=True)

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
        'cover_url': cover_url
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


class ScoreRequest(BaseModel):
    model_name: Optional[str] = "ag/gemini-3.8-flash"
    min_score: Optional[float] = 6.0
    max_clips: Optional[int] = 8
    min_len: Optional[int] = 15
    max_len: Optional[int] = 60
    use_llm: Optional[bool] = True


class RenderRequest(BaseModel):
    candidate_index: int
    aspect: Optional[str] = "9:16"
    style: Optional[str] = "hormozi"
    crop_mode: Optional[str] = "speaker-tracked"
    do_tighten: Optional[bool] = True
    loudnorm: Optional[bool] = False
    custom_hook: Optional[str] = None
    watermark: Optional[str] = None
    quality: Optional[str] = "hd"


class CreateProjectRequest(BaseModel):
    title: Optional[str] = None

class RenameProjectRequest(BaseModel):
    title: str

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
    return {
        "aspect_ratios": ["9:16", "1:1", "16:9"],
        "caption_styles": [
            {"id": "hormozi", "label": "Hormozi (Yellow/Red Highlight)", "font": "Arial Black"},
            {"id": "mrbeast", "label": "MrBeast (Green Highlight)", "font": "Arial Black"},
            {"id": "default", "label": "Default Bold (Cyan Highlight)", "font": "Arial Black"},
            {"id": "podcast", "label": "Podcast Clean (Cyan Highlight)", "font": "Arial"}
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
        "ai_models": [
            {"id": "ag/gemini-3.8-flash", "label": "Gemini 3.8 Flash (9Router) - Rekomendasi"},
            {"id": "clean/gemini-3.7-flash", "label": "Gemini 3.7 Flash (9Router)"},
            {"id": "clean/claude-sonnet-5", "label": "Claude Sonnet 5 (9Router)"},
            {"id": "heuristic", "label": "Offline Heuristic (Tanpa LLM, Rp0)"}
        ]
    }


def _validate_pid(project_id: str):
    if not PID_RE.match(project_id):
        raise HTTPException(404, "Project not found")


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
        "ingest": ingest
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
        has_yt_transcript = False
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
                has_yt_transcript = True
            except Exception as e:
                print(f"YouTube Transcript API unavailable or failed ({e}), will fallback to Whisper later.", flush=True)

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 3: Download proxy (unless uploaded)
        if not uploaded:
            _ingest_write(pid, stage='download', percent=12, message='Mengunduh video proxy... 0%')
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
                    message=f'Mengunduh video proxy... {round(f * 100)}%'
                )

            core_engine.download_to(url, pdir / 'source', preset='proxy', on_progress=cb)

        if _ingest_cancelled(pid):
            raise _Cancelled()

        # Step 4: Whisper if transcript does not exist
        transcript_file = pdir / 'transcript.json'
        if not transcript_file.exists():
            _ingest_write(pid, stage='transcript', percent=92, message='Transkripsi audio (Whisper)...')
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


@app.post("/api/projects/{project_id}/score")
def score_moments(project_id: str, payload: ScoreRequest):
    _validate_pid(project_id)
    read_project_meta(project_id)
    pdir = project_dir(project_id)
    transcript = load_transcript_file(project_id)
    if not transcript or not transcript.get("words"):
        raise HTTPException(status_code=400, detail="No transcript found. Ingest video first.")

    try:
        if payload.use_llm:
            cands = core_engine.ninerouter_score(
                data=transcript,
                model_name=payload.model_name or "ag/gemini-3.8-flash",
                min_score=payload.min_score or 6.0,
                max_clips=payload.max_clips or 8,
                min_len=payload.min_len or 15,
                max_len=payload.max_len or 60)
        else:
            cands = core_engine.heuristic_score(
                data=transcript,
                min_score=payload.min_score or 6.0,
                max_clips=payload.max_clips or 8,
                min_len=payload.min_len or 15,
                max_len=payload.max_len or 60)

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
    if not meta.get('source_url') or tier == 'original':
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
                    raise HTTPException(status_code=500, detail=f"Render failed: {str(e)}")
            src = hq

    try:
        cdir.mkdir(parents=True, exist_ok=True)
        w, h = render_clips.ffprobe_dims(src)
        res_p = render_clips.render(
            seg=seg, words=transcript["words"], source=src,
            W=w, H=h, workdir=pdir,
            aspect=payload.aspect or "9:16",
            out_dir=cdir,
            style=payload.style or "hormozi",
            do_tighten=payload.do_tighten if payload.do_tighten is not None else True,
            loudnorm=payload.loudnorm or False,
            preview=False,
            crop_mode=payload.crop_mode or "auto",
            hook_title=payload.custom_hook,
            watermark=payload.watermark)

        res_path = Path(res_p)
        poster_p = res_path.with_suffix(".png")
        meta_p = res_path.with_suffix(".meta.json")
        meta_data = {}
        if meta_p.exists():
            try: meta_data = json.loads(meta_p.read_text(encoding="utf-8"))
            except Exception: pass

        return {
            "status": "ok",
            "clip": {
                "name": res_path.name,
                "url": f"/clips/{project_id}/{res_path.name}",
                "poster_url": f"/clips/{project_id}/{poster_p.name}" if poster_p.exists() else None,
                "meta": meta_data,
                "size_mb": round(res_path.stat().st_size / (1024 * 1024), 2)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Render failed: {str(e)}")

@app.get("/api/projects/{project_id}/clips")
def list_clips(project_id: str):
    _validate_pid(project_id)
    read_project_meta(project_id)
    cdir = project_clips_dir(project_id)
    items = []
    if cdir.exists():
        for mp4 in sorted(cdir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True):
            poster = mp4.with_suffix(".png")
            meta_file = mp4.with_suffix(".meta.json")
            meta = {}
            if meta_file.exists():
                try: meta = json.loads(meta_file.read_text(encoding="utf-8"))
                except Exception: pass
            items.append({
                "name": mp4.name,
                "url": f"/clips/{project_id}/{mp4.name}",
                "poster_url": f"/clips/{project_id}/{poster.name}" if poster.exists() else None,
                "meta": meta,
                "size_mb": round(mp4.stat().st_size / (1024 * 1024), 2),
                "created_at": mp4.stat().st_mtime
            })
    return {"clips": items}


@app.delete("/api/projects/{project_id}/reset")
def reset_workspace(project_id: str):
    _validate_pid(project_id)
    with INGEST_LOCK:
        if project_id in INGEST_JOBS:
            INGEST_JOBS[project_id]['cancel'] = True
    meta = read_project_meta(project_id)
    pdir = project_dir(project_id)
    shutil.rmtree(pdir / 'hq', ignore_errors=True)
    # Remove source, transcript, segments — keep project.json + cover.jpg
    for pattern in ['source.*', 'transcript.json', 'segments.json']:
        for f in pdir.glob(pattern):
            try: f.unlink()
            except Exception: pass
    if 'ingest' in meta:
        del meta['ingest']
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
