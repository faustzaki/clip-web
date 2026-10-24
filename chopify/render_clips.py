"""
Stage 3 of the viral-clip pipeline.

Renders scored segments to clips in a chosen aspect ratio:
  - 16:9 (default) -> landscape, full frame kept
  - 9:16           -> vertical, dynamic speaker-tracking crop (YuNet + snap-on-cut)
  - 1:1            -> square
  - 4:5            -> portrait feed (Instagram)
Captions are word-by-word CapCut style, burnt in via the ffmpeg ASS engine,
with selectable style presets. Optional --tighten removes filler words and
long silences (captions are re-timed automatically). Every clip gets a PNG
poster and a .meta.json with a ready-to-post title, description and hashtags.

No external/paid APIs. ffmpeg + OpenCV only. Usage:
    python render_clips.py [workdir] [--aspect 16:9|9:16|1:1]
                           [--out DIR] [--style default|hormozi|mrbeast|podcast]
                           [--tighten] [--loudnorm] [--preview]
Output directory (default ./clips) can also be set with $CHOPIFY_OUT.
"""
import sys
import os
import re
import json
import argparse
import subprocess
from pathlib import Path

import tighten  # local module: filler/silence removal
import subtitle_burn
# aspect -> (target_w, target_h, caption_font_size, caption_margin_v)
ASPECTS = {
    "16:9": (1920, 1080, 72, 95),
    "9:16": (1080, 1920, 96, 300),
    "1:1":  (1080, 1080, 82, 120),
    "4:5":  (1080, 1350, 88, 210),
}
DEFAULT_ASPECT = "16:9"

# --preview drafts: small, fast, no poster/meta. Caption font/margins scale down
# proportionally from the full-size ASPECTS values (height is the anchor).
PREVIEW = {
    "16:9": (854, 480),
    "9:16": (480, 854),
    "1:1":  (480, 480),
    "4:5":  (480, 600),
}

def default_out():
    """Output dir: --out wins, then $CHOPIFY_OUT, then ./clips (no more hardcoded C:\\clips)."""
    return Path(os.environ.get("CHOPIFY_OUT") or "clips")
WORDS_PER_LINE = 3
DET_FPS = 5
DET_W = 640
EMA_ALPHA = 0.20
JUMP_FRAC = 0.22
MARGIN_FRAC = 0.18
ZOOM_MIN = 1.0
ZOOM_MAX = 1.6          # batas punch-in: sama dengan slider "Zoom manual" (100–160%)
ZOOM_FACE_FRAC = 0.42   # tinggi wajah target sebagai pecahan tinggi crop (auto zoom)
ZOOM_EMA = 0.25         # peredam goyang kotak zoom antar detik
YUNET_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/"
             "face_detection_yunet/face_detection_yunet_2023mar.onnx")


def sanitize(text, maxlen=70):
    text = (text or "").strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:maxlen].strip("-") or "clip"


def ffprobe_dims(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
        capture_output=True, text=True, check=True).stdout.strip()
    w, h = out.split("x")[:2]
    return int(w), int(h)


def ffprobe_fps(path):
    """Frame rate sumber; 30 fps kalau ffprobe tidak memberi angka berguna."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, check=True).stdout.strip()
        num, den = out.split("/")[:2]
        fps = float(num) / float(den)
        return fps if 1.0 <= fps <= 240.0 else 30.0
    except Exception:
        return 30.0

def crop_for(W, H, tw, th):
    """Largest centred crop of the WxH source matching the target aspect."""
    tar = tw / float(th)
    src = W / float(H)
    if abs(src - tar) < 1e-3:
        cw, ch = W, H
    elif src > tar:                      # source wider -> crop width
        ch = H
        cw = int(round(H * tar))
    else:                                # source taller -> crop height
        cw = W
        ch = int(round(W / tar))
    cw -= cw % 2
    ch -= ch % 2
    x0 = max(0, (W - cw) // 2)
    y0 = max(0, (H - ch) // 2)
    return cw, ch, x0, y0


def _make_detector(workdir):
    import cv2
    model = Path(workdir).parent / "yunet.onnx"
    if not model.exists():
        try:
            import urllib.request
            urllib.request.urlretrieve(YUNET_URL, str(model))
        except Exception as e:
            print("  YuNet download failed -> Haar:", e, flush=True)
    if model.exists():
        try:
            return "yunet", cv2.FaceDetectorYN.create(str(model), "", (DET_W, 360), 0.6, 0.3, 5000)
        except Exception as e:
            print("  YuNet init failed -> Haar:", e, flush=True)
    return "haar", cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def _detect_boxes(source, start, dur, workdir):
    """Low-res detection pass -> [(t_rel, cx, cy, face_h) or (t, None, None, None)].

    cx/cy = pusat wajah ternormalisasi 0..1 pada frame sumber; face_h = tinggi wajah
    sebagai pecahan tinggi frame. Tiap sampel berjarak 1/DET_FPS detik.
    """
    import cv2
    det_path = Path(workdir) / "_det.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-ss", f"{start:.3f}", "-i", str(source),
         "-t", f"{dur:.3f}", "-vf", f"fps={DET_FPS},scale={DET_W}:-2",
         "-an", str(det_path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    kind, det = _make_detector(workdir)
    cap = cv2.VideoCapture(str(det_path))
    dw = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or DET_W
    dh = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360
    if kind == "yunet":
        det.setInputSize((int(dw), int(dh)))
    boxes = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = i / float(DET_FPS)
        box = None
        if kind == "yunet":
            _, faces = det.detect(frame)
            if faces is not None and len(faces):
                best = max(faces, key=lambda f: f[2] * f[3] * float(f[14]))
                box = (best[0], best[1], best[2], best[3])
        else:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = det.detectMultiScale(gray, 1.1, 5, minSize=(36, 36))
            if len(faces):
                box = max(faces, key=lambda f: f[2] * f[3])
        if box is None:
            boxes.append((t, None, None, None))
        else:
            x, y, w, h = box
            boxes.append((t, (x + w / 2.0) / float(dw),
                          (y + h / 2.0) / float(dh), float(h) / float(dh)))
        i += 1
    cap.release()
    try:
        det_path.unlink()
    except OSError:
        pass
    return boxes

def detect_track(source, start, dur, W, workdir):
    """Low-res detection pass -> [(t_rel, center_x_source_px or None)]."""
    return [(t, None if cx is None else cx * W)
            for t, cx, _cy, _fh in _detect_boxes(source, start, dur, workdir)]


def smooth_track(track, W, crop_w):
    half = crop_w / 2.0
    max_off = half - crop_w * MARGIN_FRAC
    jump = W * JUMP_FRAC
    known = [c for _, c in track if c is not None]
    base = sorted(known)[len(known) // 2] if known else W / 2.0
    filled = []
    last = base
    for t, c in track:
        if c is None:
            c = last
        last = c
        filled.append((t, c))
    if not filled:
        return [(0.0, min(max(base, half), W - half))]
    out = []
    c = filled[0][1]
    prev_face = filled[0][1]
    for t, face in filled:
        if abs(face - prev_face) > jump:
            c = face
        else:
            c += EMA_ALPHA * (face - c)
        if face - c > max_off:
            c = face - max_off
        elif c - face > max_off:
            c = face + max_off
        prev_face = face
        out.append((t, min(max(c, half), W - half)))
    return out


def build_sendcmd(track, crop_w, path):
    lines = []
    last = None
    for t, cx in track:
        x = int(round(cx - crop_w / 2.0))
        if last is None or abs(x - last) >= 2:
            lines.append(f"{t:.2f} crop x {x};")
            last = x
    if not lines:
        lines = ["0.0 crop x 0;"]
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def compute_zoom_keyframes(source, start, dur, W, H, workdir, aspect="9:16", zoom_manual=None):
    """Kotak crop per detik yang mengikuti wajah -> [{t, x, y, w, h}] (0..1, koordinat sumber).

    zoom_manual (1.0..ZOOM_MAX) memaksa tingkat zoom; None = zoom diturunkan dari
    ukuran wajah (target ZOOM_FACE_FRAC tinggi crop). Tanpa wajah: kotak tengah.
    """
    tw, th = ASPECTS[aspect][0], ASPECTS[aspect][1]
    cw, ch, _x0, _y0 = crop_for(W, H, tw, th)
    samples = _detect_boxes(source, start, dur, workdir) or [(0.0, None, None, None)]
    fixed = min(ZOOM_MAX, max(ZOOM_MIN, float(zoom_manual))) if zoom_manual else None
    out = []
    cx_s = cy_s = zoom_s = None
    for t, cx, cy, fh in samples:
        cx, cy, fh = float(cx) if cx is not None else None, float(cy) if cy is not None else None, float(fh) if fh is not None else None
        if cx is None:
            cx = cx_s if cx_s is not None else 0.5
            cy = cy_s if cy_s is not None else 0.5
            z = zoom_s if zoom_s is not None else (fixed or ZOOM_MIN)
        else:
            z = fixed if fixed else (ZOOM_FACE_FRAC * ch) / (fh * H) if fh else ZOOM_MIN
            z = min(ZOOM_MAX, max(ZOOM_MIN, z))
        if zoom_s is None:
            cx_s, cy_s, zoom_s = cx, cy, z
        else:
            cx_s += ZOOM_EMA * (cx - cx_s)
            cy_s += ZOOM_EMA * (cy - cy_s)
            zoom_s += ZOOM_EMA * (z - zoom_s)
        bw = cw / zoom_s / float(W)
        bh = ch / zoom_s / float(H)
        out.append({
            "t": float(round(float(t), 2)),
            "x": float(round(min(max(cx_s - bw / 2.0, 0.0), 1.0 - bw), 5)),
            "y": float(round(min(max(cy_s - bh / 2.0, 0.0), 1.0 - bh), 5)),
            "w": float(round(bw, 5)),
            "h": float(round(bh, 5)),
        })
    return out

def _kf_ramp(values, frames):
    """Ekspresi piecewise-linear pada `on` (nomor frame output) untuk satu properti."""
    if len(values) == 1:
        return f"{values[0]:.6f}"
    expr = f"{values[-1]:.6f}"
    for i in range(len(values) - 2, -1, -1):
        span = max(1, frames[i + 1] - frames[i])
        seg = (f"{values[i]:.6f}+({values[i + 1] - values[i]:.6f})"
               f"*min(max(on-{frames[i]},0),{span})/{span}")
        expr = f"if(lt(on,{frames[i + 1]}),{seg},{expr})"
    return expr

def build_crop_cmd(keyframes, cw, ch, W, H, path):
    """sendcmd: geser crop dasar (cw:ch) supaya pusat kotak zoom ikut wajah."""
    lines = []
    last = None
    for kf in keyframes:
        bw = min(1.0, max(1e-4, float(kf.get("w") or 0)))
        bh = min(1.0, max(1e-4, float(kf.get("h") or 0)))
        x = int(round((float(kf.get("x") or 0) + bw / 2.0) * W - cw / 2.0))
        y = int(round((float(kf.get("y") or 0) + bh / 2.0) * H - ch / 2.0))
        x = max(0, min(W - cw, x))
        y = max(0, min(H - ch, y))
        if last is None or abs(x - last[0]) >= 2 or abs(y - last[1]) >= 2:
            lines.append(f"{float(kf.get('t') or 0):.2f} crop x {x}, crop y {y};")
            last = (x, y)
    if not lines:
        lines = ["0.00 crop x 0, crop y 0;"]
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")

def zoompan_filter(keyframes, cw, W, tw, th, fps):
    """Filter `zoompan` di atas crop dasar yang sudah berasio benar.

    z = cw / (w * W) = tingkat punch-in kotak zoom (1.0–1.6); x/y tetap di tengah
    karena crop dasar sudah mengikuti wajah (lihat build_crop_cmd).
    """
    frames, zs = [], []
    for kf in keyframes:
        bw = min(1.0, max(1e-4, float(kf.get("w") or 0)))
        frames.append(int(round(float(kf.get("t") or 0) * fps)))
        zs.append(min(ZOOM_MAX, max(ZOOM_MIN, cw / (bw * W))))
    for i in range(1, len(frames)):
        if frames[i] <= frames[i - 1]:
            frames[i] = frames[i - 1] + 1
    return (f"zoompan=z='{_kf_ramp(zs, frames)}'"
            f":x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
            f":d=1:s={tw}x{th}:fps={fps:.6f}")


def ass_time(t):
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def ass_escape(s):
    return s.replace("\\", "").replace("{", "(").replace("}", ")")


def write_meta(seg, out_path, candidate_index=None, subtitled=False):
    """Deterministic ready-to-post metadata saved as <clip>.meta.json."""
    hook = str(seg.get("hook", "clip")).replace("-", " ").strip()
    title = hook.capitalize()
    meta = {
        "title": f"{title} #shorts",
        "description": (f"{hook.capitalize()} - full video on the channel.\n"
                        "#shorts #reels #fyp #viral #podcast"),
        "hashtags": ["#shorts", "#reels", "#fyp", "#viral"],
        "score": seg.get("overall"),
        "start": seg.get("start"),
        "end": seg.get("end"),
        "candidate_index": candidate_index,
        "subtitled": subtitled,
    }
    Path(out_path).with_suffix(".meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return Path(out_path).with_suffix(".meta.json")


def render(seg, words, source, W, H, workdir, aspect, out_dir=None,
           do_tighten=False, loudnorm=False, preview=False, crop_mode="auto",
           hook_title=None, watermark=None, crop_rect=None,
           subtitle_style=None, candidate_index=None, raw_subdir="raw",
           res_scale=1.0, fps=None, burn_caption=False, out_name=None,
           zoom_auto=False, zoom_manual=None, zoom_keyframes=None):
    """Render one clip. res_scale/fps size and pace the output, burn_caption adds
    the word-level captions from `words`, out_name overrides the file name.
    zoom_auto/zoom_manual (100–160) mengaktifkan punch-in `zoompan`; `zoom_keyframes`
    (kotak crop per detik dari compute_zoom_keyframes()) dipakai kalau sudah dihitung pemanggil."""
    base_out = Path(out_dir) if out_dir else default_out()
    out_dir = base_out / raw_subdir
    out_dir.mkdir(parents=True, exist_ok=True)

    full_w, full_h, font_size, margin_v = ASPECTS[aspect]
    if preview:
        # fast 480p-class draft: smaller frame, smaller captions, no poster/meta
        tw, th = PREVIEW[aspect]
        scale = th / float(full_h)
        font_size = max(12, round(font_size * scale))
        margin_v = max(10, round(margin_v * scale))
    else:
        tw = int(round(full_w * res_scale)) & ~1
        th = int(round(full_h * res_scale)) & ~1
    start = float(seg["start"])
    end = float(seg["end"])
    dur = end - start
    cw, ch, x0, y0 = crop_for(W, H, tw, th)

    cap_words = words
    render_src = source
    if do_tighten:
        keeps = tighten.plan_cuts(words, start, end)
        render_src = out_dir / "_tight_source.mp4"
        tighten.apply_cuts(source, keeps, start, render_src)
        cap_words, dur = tighten.remap_words(words, start, keeps)
        print(f"  tightened: {len(keeps)} keep-ranges, "
              f"{(end - start) - dur:.1f}s removed", flush=True)
        start = 0.0

    actual_hook = hook_title
    subtitle_burn.build_overlay_ass(
        out_dir / "_overlay.ass", dur, tw, th,
        subtitle_style or subtitle_burn.DEFAULT_STYLE,
        hook_title=actual_hook, watermark=watermark,
    )

    cap = ""
    if burn_caption:
        # `words` carry absolute source times; shift them onto the clip timeline
        burn_words = []
        for w in cap_words or []:
            try:
                s = float(w["start"]) - start
                e = float(w["end"]) - start
            except (KeyError, TypeError, ValueError):
                continue
            s, e = max(0.0, s), min(dur, e)
            if e - s < 0.05:
                continue
            burn_words.append({"word": w.get("word", ""), "start": s, "end": e})
        subtitle_burn.build_caption_ass(
            burn_words, dur, out_dir / "_captions.ass", tw, th,
            subtitle_style or subtitle_burn.DEFAULT_STYLE,
        )
        cap = ",ass=_captions.ass"

    is_complex = False
    filter_expr = ""

    if crop_rect:
        cw = max(2, int(round(float(crop_rect["w"]) * W))); cw -= cw % 2
        ch = max(2, int(round(float(crop_rect["h"]) * H))); ch -= ch % 2
        cx = max(0, min(int(round(float(crop_rect["x"]) * W)), W - cw))
        cy = max(0, min(int(round(float(crop_rect["y"]) * H)), H - ch))
        filter_expr = (f"crop={cw}:{ch}:{cx}:{cy},"
                       f"scale={tw}:{th}:force_original_aspect_ratio=increase,"
                       f"crop={tw}:{th},ass=_overlay.ass{cap}")
        mode = "manual-crop"
    elif zoom_keyframes or zoom_auto or (zoom_manual and int(zoom_manual) > 100):
        kfs = zoom_keyframes
        if not kfs:
            kfs = compute_zoom_keyframes(render_src, start, dur, W, H, workdir, aspect,
                                         zoom_manual=None if zoom_auto
                                         else (int(zoom_manual) / 100.0 if zoom_manual else None))
            if not zoom_auto:
                # zoom manual tanpa deteksi wajah: satu kotak tengah
                z = min(ZOOM_MAX, max(ZOOM_MIN, int(zoom_manual) / 100.0 if zoom_manual else ZOOM_MIN))
                bw, bh = cw / z / float(W), ch / z / float(H)
                kfs = [{"t": 0.0, "x": (1.0 - bw) / 2.0, "y": (1.0 - bh) / 2.0,
                        "w": bw, "h": bh}]
        first = kfs[0]
        init_x = max(0, min(W - cw, int(round((float(first.get("x") or 0)
                                              + float(first.get("w") or 0) / 2.0) * W - cw / 2.0))))
        init_y = max(0, min(H - ch, int(round((float(first.get("y") or 0)
                                              + float(first.get("h") or 0) / 2.0) * H - ch / 2.0))))
        build_crop_cmd(kfs, cw, ch, W, H, out_dir / "_zoom.cmd")
        filter_expr = (f"sendcmd=f=_zoom.cmd,crop={cw}:{ch}:{init_x}:{init_y},"
                       + zoompan_filter(kfs, cw, W, tw, th, ffprobe_fps(render_src))
                       + f",ass=_overlay.ass{cap}")
        mode = "auto-zoom"
    elif crop_mode == "blur" and aspect == "9:16":
        # Blurred background padding
        is_complex = True
        filter_expr = (
            f"[0:v]split[bg][fg];"
            f"[bg]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=10:10,scale={tw}:{th}[bgb];"
            f"[fg]scale={tw}:-1[fgv];"
            f"[bgb][fgv]overlay=(W-w)/2:(H-h)/2,ass=_overlay.ass{cap}[v]"
        )
        mode = "blur-background"
    elif crop_mode == "split" and aspect == "9:16":
        # Split-gaming (stacked facecam + gameplay)
        is_complex = True
        top_h = int(th * 0.45)
        bot_h = th - top_h
        filter_expr = (
            f"[0:v]crop={int(W*0.6)}:{int(H*0.6)}:{int(W*0.2)}:0,scale={tw}:{top_h}[top];"
            f"[0:v]crop={W}:{int(H*0.7)}:0:{int(H*0.3)},scale={tw}:{bot_h}[bot];"
            f"[top][bot]vstack,ass=_overlay.ass{cap}[v]"
        )
        mode = "split-gaming"
    elif crop_mode == "speaker-tracked" or (crop_mode == "auto" and cw < W * 0.95):
        track = smooth_track(detect_track(render_src, start, dur, W, workdir), W, cw)
        build_sendcmd(track, cw, out_dir / "_crop.cmd")
        init_x = max(0, min(int(round(track[0][1] - cw / 2.0)), W - cw))
        filter_expr = (f"sendcmd=f=_crop.cmd,crop={cw}:{ch}:{init_x}:{y0},"
                       f"scale={tw}:{th},ass=_overlay.ass{cap}")
        mode = "speaker-tracked"
    else:
        filter_expr = f"crop={cw}:{ch}:{x0}:{y0},scale={tw}:{th},ass=_overlay.ass{cap}"
        mode = "center-crop"

    suffix = ".preview" if preview else ""
    out = out_dir / (out_name or sanitize(seg.get("hook", "clip")) + suffix + ".mp4")

    cmd = ["ffmpeg", "-y", "-ss", f"{start:.3f}", "-i", str(render_src), "-t", f"{dur:.3f}"]
    if is_complex:
        cmd += ["-filter_complex", filter_expr, "-map", "[v]", "-map", "0:a?"]
    else:
        cmd += ["-vf", filter_expr]
    if fps:
        cmd += ["-r", str(int(fps))]

    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]

    if loudnorm:
        cmd[cmd.index("-c:v"):cmd.index("-c:v")] = [
            "-af", "loudnorm=I=-14:TP=-1.5:LRA=11"]
    print(">", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, cwd=str(out_dir))

    for tmpf in (out_dir / "_overlay.ass", out_dir / "_captions.ass",
                 out_dir / "_crop.cmd", out_dir / "_zoom.cmd"):
        try:
            tmpf.unlink()
        except OSError:
            pass

    if do_tighten:
        try:
            render_src.unlink()
        except OSError:
            pass

    if preview or out_name:
        # drafts and exports skip the poster and metadata
        print(f"SAVED {out}  ({aspect} {tw}x{th} preview, {mode})", flush=True)
        return out

    # poster: a representative still saved next to the clip (<clip>.png)
    poster = out.with_suffix(".png")
    subprocess.run(["ffmpeg", "-y", "-ss", f"{dur * 0.4:.2f}", "-i", str(out),
                    "-frames:v", "1", "-q:v", "2", str(poster)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    meta_path = write_meta(seg, out, candidate_index=candidate_index, subtitled=False)

    print(f"SAVED {out}  ({aspect} {tw}x{th}, {mode})  "
          f"+ poster {poster.name} + {meta_path.name}", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workdir", nargs="?", default="work")
    ap.add_argument("--aspect", default=DEFAULT_ASPECT, choices=list(ASPECTS),
                    help="output aspect ratio (default 16:9)")
    ap.add_argument("--out", default=None,
                    help="output directory (default ./clips, or $CHOPIFY_OUT)")

    ap.add_argument("--tighten", action="store_true",
                    help="remove filler words (um, uh...) and long silences")
    ap.add_argument("--loudnorm", action="store_true",
                    help="normalize audio to -14 LUFS (platform standard)")
    ap.add_argument("--preview", action="store_true",
                    help="render fast 480p drafts (no poster/meta) to review "
                         "clip selection before the full render")
    args = ap.parse_args()

    workdir = Path(args.workdir).resolve()
    out_dir = Path(args.out) if args.out else default_out()
    out_dir.mkdir(parents=True, exist_ok=True)

    transcript = json.loads((workdir / "transcript.json").read_text(encoding="utf-8-sig"))
    segments = json.loads((workdir / "segments.json").read_text(encoding="utf-8-sig"))
    words = transcript["words"]

    source = Path(transcript["video"])
    if not source.exists():
        cands = sorted(workdir.glob("source.*"))
        source = cands[0] if cands else source
    source = source.resolve()

    W, H = ffprobe_dims(source)
    print(f"Source {source} {W}x{H}; {len(segments)} clips -> {args.aspect} "
          f"(tighten={args.tighten}) -> {out_dir}", flush=True)

    saved = []
    for i, seg in enumerate(segments, 1):
        print(f"--- Clip {i}/{len(segments)}: "
              f"{seg.get('hook', '')[:60]!r} (overall {seg.get('overall')}) ---",
              flush=True)
        try:
            saved.append(str(render(seg, words, source, W, H, workdir, args.aspect,
                                    out_dir=out_dir,
                                    do_tighten=args.tighten, loudnorm=args.loudnorm,
                                    preview=args.preview, candidate_index=i - 1)))
        except subprocess.CalledProcessError as e:
            print(f"ERROR rendering clip {i}: {e}", flush=True)

    print("RENDERED", len(saved), "clips:", flush=True)
    for s in saved:
        print("  ", s, flush=True)


if __name__ == "__main__":
    main()
