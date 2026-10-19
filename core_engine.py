"""
Core Engine for AutoClip: Combines YouTube ingestion, fast transcription,
9Router LLM hook scoring, and Chopify's 9:16 YuNet face-tracking render engine.
"""
import os
import sys
import json
import re
import urllib.request
import subprocess
from pathlib import Path

# Add chopify to path
HERE = Path(__file__).resolve().parent
CHOPIFY_DIR = HERE / "chopify"
if str(CHOPIFY_DIR) not in sys.path:
    sys.path.insert(0, str(CHOPIFY_DIR))

import score_clips
import render_clips
from score_clips import sentenceize, is_arc_complete, _nearest, make_hook, build_candidates, LLM_SYSTEM
from render_clips import render, ffprobe_dims, ASPECTS, CAPTION_STYLES

NINEROUTER_API = "http://127.0.0.1:20128/v1/chat/completions"


def get_9router_key() -> str:
    key = os.environ.get("NINEROUTER_API_KEY", "")
    if key:
        return key
    omp_models = Path.home() / ".omp" / "agent" / "models.yml"
    if omp_models.exists():
        try:
            import yaml
            with open(omp_models, encoding="utf-8") as f:
                d = yaml.safe_load(f)
            return d.get("providers", {}).get("ninerouter", {}).get("apiKey", "")
        except Exception:
            pass
    return ""


def heuristic_score(data: dict, min_score: float = 6.0, max_clips: int = 8,
                    min_len: int = 15, max_len: int = 60) -> list:
    """Offline heuristic scoring using Chopify's lexical cues & arc completion."""
    sentences = sentenceize(data["words"])
    cands = build_candidates(sentences, min_len, max_len, max_clips)
    filtered = [s for s in cands if s.get("overall", 0) >= min_score]
    return filtered or (cands[:1] if cands else [])


def download_source(url_or_path: str, workdir: Path) -> Path:
    """Download video from YouTube or prepare local file."""
    workdir.mkdir(parents=True, exist_ok=True)
    out_tmpl = workdir / "source.%(ext)s"

    if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
        cmd = [
            sys.executable, "-m", "yt_dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "--no-playlist",
            "-o", str(out_tmpl),
            url_or_path,
        ]
        subprocess.run(cmd, check=True)
    else:
        # Local file copy
        src = Path(url_or_path)
        dest = workdir / f"source{src.suffix}"
        if src.resolve() != dest.resolve():
            import shutil
            shutil.copy2(src, dest)

    vids = [p for p in sorted(workdir.glob("source.*"))
            if p.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov", ".m4v")]
    if not vids:
        raise RuntimeError("No video file produced in work directory.")
    return vids[0].resolve()


def get_transcript(video_path: Path, workdir: Path, yt_url: str = None,
                   model_size: str = "base", language: str = None) -> dict:
    """
    Get transcript with word timestamps.
    Tries youtube-transcript-api first if yt_url provided (instant, 0-cost).
    Falls back to faster-whisper locally.
    """
    out_file = workdir / "transcript.json"
    if out_file.exists():
        try:
            return json.loads(out_file.read_text(encoding="utf-8-sig"))
        except Exception:
            pass

    lang_code = language if (language and language.lower() not in ("auto", "none")) else None

    # Method 1: Try youtube-transcript-api if URL provided
    if yt_url:
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            # Extract video id
            m = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", yt_url)
            if m:
                video_id = m.group(1)
                api = YouTubeTranscriptApi()
                transcripts_list = api.list(video_id)
                pref_langs = [lang_code] if lang_code else ['id', 'en']
                t_obj = None
                try:
                    t_obj = transcripts_list.find_manually_created_transcript(pref_langs)
                except Exception:
                    t_obj = transcripts_list.find_transcript(pref_langs)
                
                if t_obj:
                    fetched = t_obj.fetch()
                    seg_list = []
                    words = []
                    for item in fetched:
                        start = float(item.start)
                        duration = float(item.duration)
                        end = start + duration
                        text = item.text.strip()
                        seg_list.append({"start": start, "end": end, "text": text})
                        
                        tokens = text.split()
                        if tokens:
                            per_token = duration / max(1, len(tokens))
                            for idx, tok in enumerate(tokens):
                                w_start = start + (idx * per_token)
                                w_end = w_start + per_token
                                words.append({"word": tok, "start": w_start, "end": w_end})
                    
                    W, H = ffprobe_dims(video_path)
                    total_dur = words[-1]["end"] if words else 0.0
                    transcript = {
                        "video": str(video_path),
                        "language": t_obj.language_code,
                        "duration": total_dur,
                        "model": "youtube-api",
                        "segments": seg_list,
                        "words": words,
                    }
                    out_file.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
                    return transcript
        except Exception as e:
            print(f"YouTube Transcript API unavailable or failed ({e}), falling back to faster-whisper...", flush=True)

    # Method 2: Local faster-whisper
    from faster_whisper import WhisperModel
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(video_path), language=lang_code, word_timestamps=True, vad_filter=True)
    
    seg_list, words = [], []
    for seg in segments:
        seg_list.append({"start": seg.start, "end": seg.end, "text": seg.text})
        for w in (seg.words or []):
            words.append({"word": w.word, "start": w.start, "end": w.end})

    transcript = {
        "video": str(video_path),
        "language": info.language,
        "duration": info.duration,
        "model": model_size,
        "segments": seg_list,
        "words": words,
    }
    out_file.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
    return transcript


def ninerouter_score(data: dict, model_name: str = "ag/gemini-3.8-flash",
                     min_score: float = 6.0, max_clips: int = 8,
                     min_len: int = 15, max_len: int = 60, timeout: int = 60) -> list:
    """Score viral moments using local 9Router gateway (OpenAI compatible)."""
    sentences = sentenceize(data["words"])
    if not sentences:
        return []

    lines = "\n".join(f"{s['start']:.1f}-{s['end']:.1f}: {s['text']}" for s in sentences[:300])
    sys_msg = LLM_SYSTEM.format(
        min_len=min_len, max_len=max_len, max_clips=max_clips, min_score=min_score
    )

    payload = {
        "model": model_name,
        "temperature": 0.2,
        "stream": False,
        "messages": [
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": f"Video duration: {data['duration']:.0f}s\n\nTranscript:\n{lines}"}
        ]
    }

    headers = {"Content-Type": "application/json"}
    token = get_9router_key()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(
        NINEROUTER_API,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            res_data = json.loads(r.read().decode("utf-8"))
        content = res_data["choices"][0]["message"]["content"]
        m = re.search(r"\[.*\]", content, re.DOTALL)
        raw = json.loads(m.group(0)) if m else []
    except Exception as e:
        print(f"9Router LLM call failed ({e}) -> falling back to heuristic", flush=True)
        return heuristic_score(data, min_score, max_clips, min_len, max_len)

    valid = []
    for it in raw:
        try:
            start, end = float(it["start"]), float(it["end"])
            overall = float(it.get("overall", 0))
            hook = str(it.get("hook") or "clip")
        except (KeyError, TypeError, ValueError):
            continue
        start = max(0.0, min(start, data["duration"] - min_len))
        end = max(start + min_len, min(end, data["duration"]))
        if end - start > max_len + 15:
            end = start + max_len
        valid.append({
            "start": round(start, 2),
            "end": round(end, 2),
            "hook": make_hook(hook, 8),
            "overall": round(overall, 1)
        })

    # Snap to sentence boundaries so words aren't cut mid-sentence
    starts = [s["start"] for s in sentences]
    ends = [s["end"] for s in sentences]
    for seg in valid:
        si = _nearest(starts, seg["start"])
        ei = _nearest(ends, seg["end"])
        if 2.0 < ends[ei] - starts[si] < max_len + 15:
            seg["start"], seg["end"] = round(starts[si], 2), round(ends[ei], 2)

    return valid or heuristic_score(data, min_score, max_clips, min_len, max_len)
