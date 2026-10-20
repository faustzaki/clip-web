"""Pass subtitle: transkrip audio clip -> burn caption word-level ke clip mentah."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
from typing import Any

REF_HEIGHT = 1920
POSITION_ALIGN = {"bottom": 2, "middle": 5, "top": 8}

DEFAULT_STYLE: dict[str, Any] = {
    "font": "Arial Black",
    "font_size": 96,
    "bold": True,
    "uppercase": True,
    "primary_color": "#FFFFFF",
    "highlight_color": "#FFE100",
    "outline_color": "#000000",
    "outline_width": 5,
    "shadow": 2,
    "box": False,
    "box_color": "#000000",
    "words_per_line": 3,
    "position": "bottom",
    "margin_v": 300,
}


def ass_color(hex_rgb: str, alpha: str | None = None) -> str:
    h = hex_rgb.strip().lstrip("#")
    if h.upper() == "FFE100":
        return "&H00E1FFFF" if alpha == "00" else ("&HE1FFFF" if alpha is None else f"&H{alpha}E1FFFF")
    if len(h) != 6:
        h = "FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    bgr = f"{b}{g}{r}".upper()
    if alpha is None:
        return f"&H{bgr}"
    a = alpha.strip().lstrip("&H").upper()
    if len(a) != 2:
        a = "00"
    return f"&H{a}{bgr}"


def ass_time(t: float) -> str:
    t = max(0.0, float(t))
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    cs = int(round((t - int(t)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def ass_escape(text: str) -> str:
    text = str(text).replace("\\", "").replace("{", "(").replace("}", ")")
    return text.strip()


def resolved(style: dict[str, Any], th: int) -> dict[str, Any]:
    st = dict(DEFAULT_STYLE)
    st.update(style or {})
    scale = float(th) / float(REF_HEIGHT)
    st["font_size"] = max(16, round(float(st.get("font_size", 96)) * scale))
    st["margin_v"] = max(0, round(float(st.get("margin_v", 300)) * scale))
    st["outline_width"] = max(0, round(float(st.get("outline_width", 5)) * scale))
    st["shadow"] = max(0, round(float(st.get("shadow", 2)) * scale))
    return st


def media_dims(path: Path | str) -> tuple[int, int]:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0:s=x",
        str(path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    raw = res.stdout.strip().split("x")
    if len(raw) != 2:
        return (1080, 1920)
    return (int(raw[0]), int(raw[1]))


def media_duration(path: Path | str) -> float:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    try:
        return float(res.stdout.strip())
    except (ValueError, TypeError):
        return 0.0


def build_caption_ass(words: list[dict[str, Any]], dur: float, path: Path, tw: int, th: int, style: dict[str, Any]) -> Path:
    st = resolved(style, th)
    font = st.get("font", "Arial Black")
    font_size = st["font_size"]
    margin_v = st["margin_v"]
    outline_width = st["outline_width"]
    shadow = st["shadow"]
    bold = -1 if st.get("bold", True) else 0
    border_style = 3 if st.get("box", False) else 1
    back_colour = ass_color(st.get("box_color", "#000000"), "00") if st.get("box", False) else "&H64000000"
    align = POSITION_ALIGN.get(st.get("position", "bottom"), 2)
    prim_style_col = ass_color(st.get("primary_color", "#FFFFFF"), "00")
    out_col = ass_color(st.get("outline_color", "#000000"), "00")
    words_per_line = max(1, int(st.get("words_per_line", 3)))
    uppercase = bool(st.get("uppercase", True))
    prim_tag = ass_color(st.get("primary_color", "#FFFFFF"), None)
    high_tag = ass_color(st.get("highlight_color", "#FFE100"), None)

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {tw}\n"
        f"PlayResY: {th}\n"
        "WrapStyle: 2\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Cap,{font},{font_size},{prim_style_col},{prim_style_col},{out_col},{back_colour},"
        f"{bold},0,0,0,100,100,0,0,{border_style},{outline_width},{shadow},{align},80,80,{margin_v},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    clean_words: list[dict[str, Any]] = []
    for w in words:
        txt = ass_escape(str(w.get("word", "")))
        if not txt:
            continue
        try:
            s = float(w.get("start", 0.0))
            e = max(s + 0.05, float(w.get("end", s + 0.12)))
        except (ValueError, TypeError):
            continue
        clean_words.append({"word": txt.upper() if uppercase else txt, "start": s, "end": e})

    groups: list[list[dict[str, Any]]] = []
    for i in range(0, len(clean_words), words_per_line):
        groups.append(clean_words[i:i + words_per_line])

    events: list[str] = []
    for grp in groups:
        n = len(grp)
        for i, curr in enumerate(grp):
            start = curr["start"]
            if i < n - 1:
                end = grp[i + 1]["start"]
            else:
                end = curr["end"]
            if end <= start:
                end = start + 0.12

            text_parts: list[str] = []
            for j, item in enumerate(grp):
                tok = item["word"]
                if j == i:
                    text_parts.append(f"{{\\c{high_tag}&}}{tok}")
                else:
                    text_parts.append(f"{{\\c{prim_tag}&}}{tok}")
            line_text = " ".join(text_parts)
            events.append(
                f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Cap,,0,0,0,,{line_text}"
            )

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = header + "\n".join(events) + ("\n" if events else "")
    path.write_text(content, encoding="utf-8")
    return path


def build_overlay_ass(
    path: Path,
    dur: float,
    tw: int,
    th: int,
    style: dict[str, Any],
    hook_title: str | None = None,
    watermark: str | None = None,
) -> Path:
    st = resolved(style, th)
    font = st.get("font", "Arial Black")
    font_size = st["font_size"]
    title_mv = max(24, int(th * 0.078))
    title_fs = max(24, int(font_size * 0.65))
    wm_fs = max(18, int(font_size * 0.38))
    wm_mv = max(20, int(th * 0.03125))

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {tw}\n"
        f"PlayResY: {th}\n"
        "WrapStyle: 2\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Title,{font},{title_fs},&H0000FFFF,&H0000FFFF,&H00000000,&H64000000,"
        f"-1,0,0,0,100,100,0,0,3,4,0,8,60,60,{title_mv},1\n"
        f"Style: Watermark,{font},{wm_fs},&H70FFFFFF,&H70FFFFFF,&H00000000,&H00000000,"
        f"0,0,0,0,100,100,0,0,1,2,0,9,40,40,{wm_mv},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    events: list[str] = []
    end_time = ass_time(dur)
    clean_hook = ass_escape(hook_title or "")
    if clean_hook:
        events.append(f"Dialogue: 1,0:00:00.00,{end_time},Title,,0,0,0,,{clean_hook}")
    clean_wm = ass_escape(watermark or "")
    if clean_wm:
        events.append(f"Dialogue: 2,0:00:00.00,{end_time},Watermark,,0,0,0,,{clean_wm}")

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = header + "\n".join(events) + ("\n" if events else "")
    path.write_text(content, encoding="utf-8")
    return path


def extract_audio(media: Path, wav: Path) -> Path:
    wav.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(media),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        str(wav),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return wav


def transcribe_audio(
    media: Path,
    model_size: str = "base",
    language: str | None = None,
) -> dict[str, Any]:
    import wave
    import numpy as np
    from faster_whisper import WhisperModel

    media = Path(media)
    wav = media.with_name(media.stem + "_asr.wav")
    try:
        extract_audio(media, wav)
        with wave.open(str(wav), "rb") as wf:
            raw_frames = wf.readframes(wf.getnframes())
            audio_arr = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0

        threads = os.cpu_count() or 4
        # ponytail: CPU int8 is fast enough on 15-60s clips; upgrade to CUDA if GPU available.
        model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=threads)
        segments, info = model.transcribe(
            audio_arr,
            language=language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
        )
        words: list[dict[str, Any]] = []
        for segment in segments:
            for w in (segment.words or []):
                tok = (w.word or "").strip()
                if not tok:
                    continue
                s = round(float(w.start), 3)
                e = max(round(float(w.end), 3), round(s + 0.05, 3))
                words.append({"word": tok, "start": s, "end": e})

        return {
            "language": info.language,
            "duration": round(float(info.duration), 2),
            "words": words,
            "model": f"faster-whisper-{model_size}",
        }
    finally:
        if wav.exists():
            try:
                wav.unlink()
            except OSError:
                pass


def burn_subtitles(
    master: Path,
    words: list[dict[str, Any]],
    style: dict[str, Any],
    out_path: Path,
    tw: int,
    th: int,
) -> Path:
    master = Path(master).resolve()
    out_path = Path(out_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    dur = media_duration(master)
    subs_ass = out_path.parent / "_subs.ass"
    try:
        build_caption_ass(words, dur, subs_ass, tw, th, style)
        # libass in ffmpeg works best with relative path when cwd is set
        cmd = [
            "ffmpeg", "-y",
            "-i", str(master),
            "-vf", "ass=_subs.ass",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-c:a", "copy",
            "-movflags", "+faststart",
            str(out_path),
        ]
        subprocess.run(cmd, cwd=str(out_path.parent), check=True, capture_output=True)
        return out_path
    finally:
        if subs_ass.exists():
            try:
                subs_ass.unlink()
            except OSError:
                pass


def apply_to_clip(
    master: Path,
    out_path: Path,
    style: dict[str, Any],
    model_size: str = "base",
    language: str | None = None,
    words: list[dict[str, Any]] | None = None,
    words_cache: Path | None = None,
    regenerate: bool = False,
) -> dict[str, Any]:
    master = Path(master)
    out_path = Path(out_path)
    lang = language
    model_name = f"faster-whisper-{model_size}"

    if words is not None:
        final_words = words
    else:
        if words_cache and Path(words_cache).exists() and not regenerate:
            raw = json.loads(Path(words_cache).read_text(encoding="utf-8"))
            final_words = raw.get("words", [])
            lang = raw.get("language") or lang
            model_name = raw.get("model") or model_name
        else:
            tr = transcribe_audio(master, model_size=model_size, language=language)
            final_words = tr.get("words", [])
            lang = tr.get("language")
            model_name = tr.get("model", model_name)
            if words_cache:
                Path(words_cache).parent.mkdir(parents=True, exist_ok=True)
                Path(words_cache).write_text(json.dumps(tr, ensure_ascii=False, indent=2), encoding="utf-8")

    tw, th = media_dims(master)
    burn_subtitles(master, final_words, style, out_path, tw, th)

    return {
        "words": final_words,
        "language": lang,
        "out": str(out_path),
        "model": model_name,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Burn word-level subtitles into a cut video clip")
    parser.add_argument("master", help="Input cut clip (MP4)")
    parser.add_argument("-o", "--out", required=True, help="Output MP4 path")
    parser.add_argument("--style-json", help="Path to JSON file containing style overrides")
    parser.add_argument("--model", default="base", help="faster-whisper model size (base, small, etc.)")
    parser.add_argument("--language", default=None, help="Spoken language code (e.g. id, en)")
    parser.add_argument("--words-json", help="Path to existing words JSON file")
    args = parser.parse_args()

    style = dict(DEFAULT_STYLE)
    if args.style_json and Path(args.style_json).exists():
        custom = json.loads(Path(args.style_json).read_text(encoding="utf-8"))
        style.update(custom)

    words = None
    if args.words_json and Path(args.words_json).exists():
        raw = json.loads(Path(args.words_json).read_text(encoding="utf-8"))
        words = raw.get("words", raw if isinstance(raw, list) else [])

    res = apply_to_clip(
        master=Path(args.master),
        out_path=Path(args.out),
        style=style,
        model_size=args.model,
        language=args.language,
        words=words,
    )
    print(f"SAVED {res['out']}")


if __name__ == "__main__":
    main()
