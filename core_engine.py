"""
Core Engine for AutoClip: Combines YouTube ingestion, fast transcription,
9Router LLM hook scoring, and Chopify's 9:16 YuNet face-tracking render engine.
"""
import os
import sys
import json
import collections
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
from render_clips import render, ffprobe_dims, ASPECTS

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


YT_PRESETS = {
    # proxy: 134+251 = 63 MB (vs 1.18 GB sekarang)
    'proxy': {'format': 'bv*[height<=360]+ba/b[height<=360]/b', 'sort': 'res:360,vcodec:h264'},
    # hd: 299+251 = 509 MB, H.264 1080p (decode render paling cepat)
    'hd':    {'format': 'bv*[height<=1080]+ba/b[height<=1080]/b', 'sort': 'res:1080,vcodec:h264'},
    # best: 401+251 = 1.18 GB, 4K AV1; tanpa preferensi vcodec karena 4K H.264 tidak ada
    'best':  {'format': 'bv*+ba/b', 'sort': 'res'},
}


def yt_dlp_cmd(url: str, out_tmpl: Path, preset: str = 'proxy', progress: bool = False) -> list:
    """Rakit argumen yt-dlp. Flag tetap: --no-playlist --merge-output-format mp4
    --js-runtimes node --retries 10 --fragment-retries 10 --concurrent-fragments 8."""
    if preset not in YT_PRESETS:
        raise ValueError(f"Preset tidak dikenal: {preset}")
    cfg = YT_PRESETS[preset]
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist",
        "--merge-output-format", "mp4",
        "--js-runtimes", "node",
        "--retries", "10",
        "--fragment-retries", "10",
        "--concurrent-fragments", "8",
        "-f", cfg["format"],
        "-S", cfg["sort"],
        "--newline",
    ]
    if progress:
        cmd.extend([
            "--progress-template",
            "download:PROGRESS:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s",
        ])
    cmd.extend(["-o", str(out_tmpl), url])
    return cmd


def download_to(url: str, dest_base: Path, preset: str = 'proxy', on_progress=None) -> Path:
    """Unduh ke f'{dest_base}.%(ext)s', panggil on_progress(frac|None) tiap update."""
    dest_base = Path(dest_base)
    dest_base.parent.mkdir(parents=True, exist_ok=True)
    out_tmpl = dest_base.parent / f"{dest_base.name}.%(ext)s"
    cmd = yt_dlp_cmd(url, out_tmpl, preset=preset, progress=True)

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding='utf-8',
        errors='replace'
    )

    tail = collections.deque(maxlen=40)
    for line in proc.stdout:
        stripped = line.rstrip('\r\n')
        if "PROGRESS:" in stripped:
            idx = stripped.find("PROGRESS:")
            payload = stripped[idx + len("PROGRESS:"):].strip()
            parts = payload.split("|")
            d_val = parts[0] if len(parts) > 0 else 'NA'
            t_val = parts[1] if len(parts) > 1 else 'NA'
            te_val = parts[2] if len(parts) > 2 else 'NA'
            total_val = t_val if t_val != 'NA' else te_val
            try:
                d = float(d_val)
                total = float(total_val)
                if total > 0 and on_progress:
                    try:
                        on_progress(min(0.99, d / total))
                    except Exception:
                        proc.kill()
                        proc.wait()
                        raise
                elif on_progress:
                    try:
                        on_progress(None)
                    except Exception:
                        proc.kill()
                        proc.wait()
                        raise
            except (ValueError, TypeError):
                if on_progress:
                    try:
                        on_progress(None)
                    except Exception:
                        proc.kill()
                        proc.wait()
                        raise
        else:
            tail.append(stripped)

    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"yt-dlp gagal (kode {rc}): " + "\n".join(tail))

    video_exts = ('.mp4', '.mkv', '.webm', '.mov', '.m4v')
    vids = [
        p for p in sorted(dest_base.parent.glob(dest_base.name + ".*"))
        if p.suffix.lower() in video_exts and not p.name.endswith(".part") and not re.search(r'\.f\d+\.', p.name)
    ]
    if not vids:
        raise RuntimeError('Tidak ada file video hasil unduhan.')
    return vids[0].resolve()


def download_source(url_or_path, workdir, preset: str = 'proxy', on_progress=None) -> Path:
    """Wrapper kompatibel 2-arg lama (dipakai app.py); cabang copy file lokal dipertahankan."""
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    if isinstance(url_or_path, str) and (url_or_path.startswith("http://") or url_or_path.startswith("https://")):
        return download_to(url_or_path, workdir / "source", preset=preset, on_progress=on_progress)

    # Local file copy
    src = Path(url_or_path)
    dest = workdir / f"source{src.suffix}"
    if src.resolve() != dest.resolve():
        import shutil
        shutil.copy2(src, dest)

    video_exts = ('.mp4', '.mkv', '.webm', '.mov', '.m4v')
    vids = [
        p for p in sorted(workdir.glob("source.*"))
        if p.suffix.lower() in video_exts and not p.name.endswith(".part") and not re.search(r'\.f\d+\.', p.name)
    ]
    if not vids:
        raise RuntimeError("No video file produced in work directory.")
    return vids[0].resolve()


def write_transcript(workdir: Path, tr: dict) -> Path:
    """Tulis transcript.json ke workdir."""
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    out_file = workdir / "transcript.json"
    out_file.write_text(json.dumps(tr, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_file


def youtube_transcript(url: str, language: str = None) -> dict:
    """Ambil transkrip dari YouTube Transcript API."""
    from youtube_transcript_api import YouTubeTranscriptApi
    m = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", url)
    if not m:
        raise ValueError(f"Tidak dapat mengekstrak video ID dari URL: {url}")
    video_id = m.group(1)
    lang_code = language if (language and language.lower() not in ("auto", "none")) else None
    api = YouTubeTranscriptApi()
    transcripts_list = api.list(video_id)
    pref_langs = [lang_code] if lang_code else ['id', 'en']
    try:
        t_obj = transcripts_list.find_manually_created_transcript(pref_langs)
    except Exception:
        t_obj = transcripts_list.find_transcript(pref_langs)

    if not t_obj:
        raise RuntimeError("Transcript not found for preferred languages.")

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

    total_dur = words[-1]["end"] if words else 0.0
    return {
        "video": "",
        "language": t_obj.language_code,
        "duration": total_dur,
        "model": "youtube-api",
        "segments": seg_list,
        "words": words,
    }


def get_transcript(video_path: Path, workdir: Path, yt_url: str = None,
                   model_size: str = "base", language: str = None) -> dict:
    """
    Get transcript with word timestamps.
    Tries youtube-transcript-api first if yt_url provided (instant, 0-cost).
    Falls back to faster-whisper locally.
    """
    workdir = Path(workdir)
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
            tr = youtube_transcript(yt_url, language=lang_code)
            if video_path:
                tr["video"] = str(video_path)
            write_transcript(workdir, tr)
            return tr
        except Exception as e:
            print(f"YouTube Transcript API unavailable or failed ({e}), falling back to faster-whisper...", flush=True)

    # Method 2: Local faster-whisper
    from faster_whisper import WhisperModel
    model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    segments, info = model.transcribe(str(video_path), language=lang_code, word_timestamps=True,
                                      vad_filter=True, beam_size=1, condition_on_previous_text=False)

    seg_list, words = [], []
    for seg in segments:
        seg_list.append({"start": seg.start, "end": seg.end, "text": seg.text})
        for w in (seg.words or []):
            words.append({"word": w.word, "start": w.start, "end": w.end})

    transcript = {
        "video": str(video_path) if video_path else "",
        "language": info.language,
        "duration": info.duration,
        "model": model_size,
        "segments": seg_list,
        "words": words,
    }
    write_transcript(workdir, transcript)
    return transcript


def ninerouter_score(data: dict, model_name: str = "ag/gemini-3.8-flash",
                     min_score: float = 6.0, max_clips: int = 8,
                     min_len: int = 15, max_len: int = 60, timeout: int = 60,
                     api_endpoint: str = None, api_key: str = None) -> list:
    """Score viral moments using any OpenAI-compatible LLM gateway (9Router, Ollama, Groq, OpenAI)."""
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
    token = (api_key or "").strip()
    endpoint = (api_endpoint or NINEROUTER_API).strip()
    if not token and "127.0.0.1:20128" in endpoint:
        token = get_9router_key()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if endpoint.endswith("/chat/completions"):
        target_url = endpoint
    else:
        target_url = f"{endpoint.rstrip('/')}/chat/completions"

    req = urllib.request.Request(
        target_url,
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
