"""
Stage 1 of the viral-clip pipeline.

Downloads a YouTube video at highest quality with yt-dlp, then transcribes it
locally with faster-whisper (word-level timestamps). Writes work/transcript.json.

No external/paid APIs. CPU-friendly (int8). Usage:
    python download_and_transcribe.py <youtube_url> --model small
"""
import sys
import json
import math
import argparse
import shutil
import subprocess
from pathlib import Path

# Parameter ASR sama dengan core_engine (T7): model default medium, beam 5, VAD 400 ms, bahasa dikunci.
ROOT = Path(__file__).resolve().parent.parent
GLOSSARY_FILE = ROOT / "data" / "glossary.txt"
LANGUAGE = "id"
BEAM_SIZE = 5
VAD_MIN_SILENCE_MS = 400
DEFAULT_MODEL = "medium"
LARGE_MODEL_MIN_FREE_GB = 10.0
GLOSSARY_PROMPT_MAX = 720


def resolve_model_size(requested):
    """'auto'/kosong → large-v3 kalau disk ≥ 10 GB bebas, selain itu medium."""
    req = (requested or "").strip()
    if req and req.lower() != "auto":
        return req
    free = shutil.disk_usage(ROOT.anchor or str(ROOT)).free / (1024 ** 3)
    return "large-v3" if free >= LARGE_MODEL_MIN_FREE_GB else DEFAULT_MODEL


def glossary_prompt():
    """`initial_prompt` dari data/glossary.txt (1 istilah per baris), None kalau kosong."""
    if not GLOSSARY_FILE.is_file():
        return None
    terms = [t.strip() for t in GLOSSARY_FILE.read_text(encoding="utf-8-sig").splitlines()
             if t.strip() and not t.strip().startswith("#")]
    if not terms:
        return None
    return ("Istilah yang sering muncul: " + ", ".join(terms))[:GLOSSARY_PROMPT_MAX]


def run(cmd):
    print(">", " ".join(str(c) for c in cmd), flush=True)
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        err = res.stderr.strip() or res.stdout.strip()
        raise RuntimeError(f"Command failed ({res.returncode}): {err}")


def download(url, workdir):
    out_tmpl = workdir / "source.%(ext)s"
    # Highest quality: best video + best audio, merged to mp4 (needs ffmpeg on PATH).
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f", "bestvideo*+bestaudio/best",
        "--merge-output-format", "mp4",
        "--no-playlist",
        "-o", str(out_tmpl),
        url,
    ]
    run(cmd)
    vids = [p for p in sorted(workdir.glob("source.*"))
            if p.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov", ".m4v")]
    if not vids:
        raise SystemExit("Download failed: no video file produced.")
    return vids[0].resolve()


def transcribe(video, workdir, model_size, device, compute_type):
    from faster_whisper import WhisperModel
    model_size = resolve_model_size(model_size)
    print(f"Loading faster-whisper model={model_size} device={device} "
          f"compute={compute_type} (first run downloads the model)...", flush=True)
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        str(video),
        language=LANGUAGE,                      # dikunci, jangan auto: audio target Indonesia
        beam_size=BEAM_SIZE,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=VAD_MIN_SILENCE_MS),
        condition_on_previous_text=False,       # cegah halusinasi berulang
        initial_prompt=glossary_prompt(),
    )
    print(f"Language: {info.language} "
          f"(p={info.language_probability:.2f}), audio {info.duration:.1f}s", flush=True)

    seg_list, words = [], []
    for seg in segments:
        seg_list.append({"start": seg.start, "end": seg.end, "text": seg.text,
                         "avg_logprob": round(float(seg.avg_logprob), 3)})
        for w in (seg.words or []):
            words.append({"word": w.word, "start": w.start, "end": w.end,
                          "avg_logprob": round(math.log(max(float(w.probability), 1e-6)), 3)})
        print(f"[{seg.start:7.2f} -> {seg.end:7.2f}] {seg.text}", flush=True)

    transcript = {
        "video": str(video),
        "language": info.language,
        "duration": info.duration,
        "model": model_size,
        "params": {"beam_size": BEAM_SIZE, "compute_type": compute_type,
                   "vad_min_silence_ms": VAD_MIN_SILENCE_MS,
                   "condition_on_previous_text": False},
        "segments": seg_list,
        "words": words,
    }
    out = workdir / "transcript.json"
    out.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}  ({len(words)} words, {len(seg_list)} segments)", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--workdir", default="work")
    ap.add_argument("--model", default="medium",
                    help="faster-whisper model: tiny/base/small/medium/large-v3")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute-type", default="int8")
    args = ap.parse_args()

    workdir = Path(args.workdir)
    workdir.mkdir(parents=True, exist_ok=True)

    video = download(args.url, workdir)
    print("Downloaded:", video, flush=True)
    transcribe(video, workdir, args.model, args.device, args.compute_type)
    print("STAGE 1 COMPLETE", flush=True)


if __name__ == "__main__":
    main()
