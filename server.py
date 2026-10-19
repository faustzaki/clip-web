"""
AutoClip Studio - FastAPI Backend Server
Modular REST API powering AutoClip & Socl Visuals clone.
"""
import os
import sys
import json
import shutil
import mimetypes
import urllib.request
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


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def get_source_video_path() -> Optional[Path]:
    vids = [p for p in sorted(WORKDIR.glob("source.*"))
            if p.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov", ".m4v")]
    return vids[0].resolve() if vids else None


def load_transcript_file() -> Optional[dict]:
    p = WORKDIR / "transcript.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception:
            return None
    return None


def load_segments_file() -> list:
    p = WORKDIR / "segments.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception:
            return []
    return []


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
    """System health check: ffmpeg, yunet, 9router, and workspace."""
    ffmpeg_ok = shutil.which("ffmpeg") is not None
    yunet_ok = (ROOT_DIR / "yunet.onnx").exists()
    
    ninerouter_ok = False
    try:
        req = urllib.request.Request("http://127.0.0.1:20128/")
        with urllib.request.urlopen(req, timeout=3) as res:
            if res.status in (200, 307):
                ninerouter_ok = True
    except Exception:
        ninerouter_ok = False

    src = get_source_video_path()
    return {
        "status": "ok",
        "ffmpeg": ffmpeg_ok,
        "yunet": yunet_ok,
        "ninerouter": ninerouter_ok,
        "workspace": {
            "has_source": src is not None,
            "source_file": src.name if src else None,
            "has_transcript": (WORKDIR / "transcript.json").exists(),
            "has_segments": (WORKDIR / "segments.json").exists(),
        }
    }


@app.get("/api/state")
def get_state():
    """Get current project state: source video, transcript overview, and candidates."""
    src = get_source_video_path()
    transcript = load_transcript_file()
    candidates = load_segments_file()

    video_info = None
    if src:
        try:
            w, h = render_clips.ffprobe_dims(src)
            video_info = {
                "name": src.name,
                "url": f"/work/{src.name}",
                "width": w,
                "height": h,
                "size_mb": round(src.stat().st_size / (1024 * 1024), 2)
            }
        except Exception:
            video_info = {"name": src.name, "url": f"/work/{src.name}"}

    transcript_info = None
    if transcript:
        transcript_info = {
            "language": transcript.get("language"),
            "duration": transcript.get("duration"),
            "words_count": len(transcript.get("words", [])),
            "model": transcript.get("model")
        }

    return {
        "video": video_info,
        "transcript": transcript_info,
        "candidates": candidates
    }


@app.get("/api/options")
def get_options():
    """Return available styles, crop modes, languages, and AI models."""
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


@app.post("/api/ingest")
def ingest_url(payload: IngestUrlRequest):
    """Download video from YouTube/URL and transcribe."""
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    try:
        video_path = core_engine.download_source(url, WORKDIR)
        transcript = core_engine.get_transcript(
            video_path=video_path,
            workdir=WORKDIR,
            yt_url=url,
            model_size=payload.model_size or "base",
            language=payload.language
        )
        w, h = render_clips.ffprobe_dims(video_path)
        return {
            "status": "ok",
            "video": {
                "name": video_path.name,
                "url": f"/work/{video_path.name}",
                "width": w,
                "height": h,
                "duration": transcript.get("duration", 0),
            },
            "transcript": {
                "language": transcript.get("language"),
                "duration": transcript.get("duration"),
                "words_count": len(transcript.get("words", [])),
                "model": transcript.get("model")
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...), model_size: str = Form("base"), language: Optional[str] = Form(None)):
    """Upload a local video file (.mp4, .mov, .mkv) and transcribe."""
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".mp4", ".mov", ".mkv", ".webm", ".avi"):
        raise HTTPException(status_code=400, detail="Invalid video format")

    dest = WORKDIR / f"source{suffix}"
    try:
        with dest.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        transcript = core_engine.get_transcript(
            video_path=dest,
            workdir=WORKDIR,
            yt_url=None,
            model_size=model_size,
            language=language
        )
        w, h = render_clips.ffprobe_dims(dest)
        return {
            "status": "ok",
            "video": {
                "name": dest.name,
                "url": f"/work/{dest.name}",
                "width": w,
                "height": h,
                "duration": transcript.get("duration", 0),
            },
            "transcript": {
                "language": transcript.get("language"),
                "duration": transcript.get("duration"),
                "words_count": len(transcript.get("words", [])),
                "model": transcript.get("model")
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.post("/api/score")
def score_moments(payload: ScoreRequest):
    """Detect & score viral moments using 9Router LLM or Heuristic cues."""
    transcript = load_transcript_file()
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

        # Attach text snippet to each candidate
        words = transcript.get("words", [])
        for i, c in enumerate(cands):
            c["id"] = i
            c_start = c["start"]
            c_end = c["end"]
            clip_words = [w["word"] for w in words if c_start <= w["start"] <= c_end]
            c["text_preview"] = " ".join(clip_words[:35]) + ("..." if len(clip_words) > 35 else "")
            c["duration"] = round(c_end - c_start, 2)

        # Persist segments
        (WORKDIR / "segments.json").write_text(
            json.dumps(cands, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return {"status": "ok", "count": len(cands), "candidates": cands}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")


@app.post("/api/render")
def render_clip(payload: RenderRequest):
    """Render a candidate clip into 9:16 vertical video with burned ASS subtitles."""
    src = get_source_video_path()
    if not src:
        raise HTTPException(status_code=400, detail="No source video found")

    transcript = load_transcript_file()
    if not transcript or not transcript.get("words"):
        raise HTTPException(status_code=400, detail="No transcript words found")

    candidates = load_segments_file()
    if not candidates or payload.candidate_index >= len(candidates):
        raise HTTPException(status_code=400, detail="Invalid candidate index")

    seg = candidates[payload.candidate_index]
    if payload.custom_hook:
        seg["hook"] = payload.custom_hook

    try:
        w, h = render_clips.ffprobe_dims(src)
        res_p = render_clips.render(
            seg=seg,
            words=transcript["words"],
            source=src,
            W=w,
            H=h,
            workdir=WORKDIR,
            aspect=payload.aspect or "9:16",
            out_dir=CLIPS_DIR,
            style=payload.style or "hormozi",
            do_tighten=payload.do_tighten if payload.do_tighten is not None else True,
            loudnorm=payload.loudnorm or False,
            preview=False,
            crop_mode=payload.crop_mode or "auto",
            hook_title=payload.custom_hook,
            watermark=payload.watermark
        )

        res_path = Path(res_p)
        poster_p = res_path.with_suffix(".png")
        meta_p = res_path.with_suffix(".meta.json")

        meta = {}
        if meta_p.exists():
            try:
                meta = json.loads(meta_p.read_text(encoding="utf-8"))
            except Exception:
                pass

        return {
            "status": "ok",
            "clip": {
                "name": res_path.name,
                "url": f"/clips/{res_path.name}",
                "poster_url": f"/clips/{poster_p.name}" if poster_p.exists() else None,
                "meta": meta,
                "size_mb": round(res_path.stat().st_size / (1024 * 1024), 2)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Render failed: {str(e)}")


@app.get("/api/clips")
def list_clips():
    """List all previously rendered clips in the clips folder."""
    items = []
    for mp4 in sorted(CLIPS_DIR.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True):
        poster = mp4.with_suffix(".png")
        meta_file = mp4.with_suffix(".meta.json")
        meta = {}
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        items.append({
            "name": mp4.name,
            "url": f"/clips/{mp4.name}",
            "poster_url": f"/clips/{poster.name}" if poster.exists() else None,
            "meta": meta,
            "size_mb": round(mp4.stat().st_size / (1024 * 1024), 2),
            "created_at": mp4.stat().st_mtime
        })
    return {"clips": items}


@app.delete("/api/reset")
def reset_workspace():
    """Clear workspace cache (source, transcript, segments)."""
    for item in WORKDIR.glob("*"):
        if item.is_file():
            try:
                item.unlink()
            except Exception:
                pass
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
