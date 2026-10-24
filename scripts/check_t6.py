"""scripts/check_t6.py — cek T6 (safe zone + ratio berlabel + auto zoom). Exit 0 kalau lulus.

Butuh: server di :8000, ffmpeg zoompan, work/yunet.onnx, dan satu video uji berisi wajah
(dipakai dari project yang sudah ada; kalau tidak ada, jatuh ke testsrc tanpa wajah).
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

import cv2
import requests

BASE = os.environ.get("CLIPWEB_BASE", "http://127.0.0.1:8000")
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
EVIDENCE = ROOT / "docs" / "evidence" / "T6"
SEG = {"start": 100.0, "end": 112.0, "hook": "t6-9x16", "overall": 8.0}

fails = []
sha_lines = []
created_pids = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def sha256(path, label=None):
    h = hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    sha_lines.append(f"{h}  {label or pathlib.Path(path).name}")
    return h


def dims(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
        capture_output=True, text=True, check=True).stdout.strip()
    w, h = out.split("x")[:2]
    return int(w), int(h)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True).stdout.strip()
    return float(out.splitlines()[0])


def frame(path, at, out_png):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{at:.2f}", "-i", str(path),
                    "-frames:v", "1", str(out_png)], check=True)


def face_centers(path, fracs=(0.10, 0.50, 0.90), tag=""):
    """[(label, cx or None)] pusat wajah ternormalisasi pada frame output."""
    det = cv2.FaceDetectorYN.create(str((ROOT / "yunet.onnx").resolve()), "",
                                   (640, 360), 0.5, 0.3, 5000)
    dur = duration(path)
    found = []
    for frac in fracs:
        label = f"{tag}{int(frac * 100)}pct"
        png = EVIDENCE / "after" / f"{label}.png"
        frame(path, dur * frac, png)
        img = cv2.imread(str(png))
        if img is None:
            found.append((label, None))
            continue
        det.setInputSize((img.shape[1], img.shape[0]))
        _, faces = det.detect(img)
        if faces is None or not len(faces):
            found.append((label, None))
            continue
        best = max(faces, key=lambda f: f[2] * f[3] * float(f[14]))
        found.append((label, round(float((best[0] + best[2] / 2.0) / img.shape[1]), 3)))
    return found


# ---------------------------------------------------------------- 1) statis
render_py = ROOT / "chopify" / "render_clips.py"
server_py = ROOT / "server.py"
preview = SRC / "components" / "PreviewStage.jsx"
timeline = SRC / "components" / "Timeline.jsx"
editor = SRC / "hooks" / "useEditorState.js"
studio = SRC / "components" / "StudioView.jsx"
api = SRC / "api.js"

missing = [str(p.relative_to(ROOT)) for p in
           (render_py, server_py, preview, timeline, editor, studio, api) if not p.exists()]
ck("file T6 ada (render_clips, server, PreviewStage, Timeline, useEditorState, StudioView, api)",
   not missing, ", ".join(missing) or "7/7")
if missing:
    print(f"\n{len(fails)} gagal")
    sys.exit(1)

rp = render_py.read_text(encoding="utf-8")
sp = server_py.read_text(encoding="utf-8")
pv = preview.read_text(encoding="utf-8")
tl = timeline.read_text(encoding="utf-8")
ap = api.read_text(encoding="utf-8")

ck("render_clips: rasio 4:5 + helper zoompan",
   '"4:5"' in rp and "def compute_zoom_keyframes" in rp
   and "def zoompan_filter" in rp and "def build_crop_cmd" in rp)
ck("server: endpoint zoom-keyframes + prefs safe_zone/zoom",
   "/zoom-keyframes" in sp and '"safe_zone"' in sp and '"zoom_auto"' in sp and '"zoom_manual"' in sp
   and "_stored_zoom_keyframes" in sp)
ck("PreviewStage: pill toolbar berlabel + safe zone + panel Layout",
   all(s in pv for s in ("Ratio (", ">Background<", ">Layout<", "Layar penuh",
                         "Area aman", "Auto zoom", 'min="100"', 'max="160"', "w-[88%]", "h-[80%]")))
ck("Timeline: badge zoom di track video", "timeline-zoom-badge" in tl and "zoom_keyframes" in tl)
ck("useEditorState + api.js: simpan zoom_keyframes ke timeline, endpoint zoom-keyframes",
   "saveZoomKeyframes" in editor.read_text(encoding="utf-8") and "saveTimeline" in
   editor.read_text(encoding="utf-8") and "computeZoomKeyframes" in ap and "/zoom-keyframes" in ap)

theme_bad = re.compile(r"dark:|bg-dark-|gradient|neon|TODO|console\.log")
black_bad = re.compile(r"bg-black(?![/])")  # bg-black/xx = chip overlay video, bukan dark theme


def offenders(path):
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.replace("object-contain bg-black", "").replace("bg-black rounded-[24px]", "")
        if theme_bad.search(stripped) or black_bad.search(stripped):
            yield f"{path.name}:{n}"


bad_hits = [hit for p in (preview, timeline, api, render_py) for hit in offenders(p)]
ck("file yang disentuh tanpa dark/neon/gradient/TODO/console.log", not bad_hits, "; ".join(bad_hits[:5]))

dist_css = sorted((ROOT / "frontend" / "dist" / "assets").glob("*.css"))
ck("build memuat token aksen", bool(dist_css) and "--vz-accent" in dist_css[-1].read_text(encoding="utf-8"),
   dist_css[-1].name if dist_css else "dist/assets/*.css tidak ada")

# ---------------------------------------------------------------- 2) prasyarat
filters = subprocess.run(["ffmpeg", "-filters"], capture_output=True, text=True).stdout
ck("ffmpeg punya filter zoompan", " zoompan " in filters)
ck("model wajah yunet.onnx ada", (ROOT / "yunet.onnx").exists() or (ROOT / "work" / "yunet.onnx").exists())

fixture = next((p for p in sorted((ROOT / "work").glob("*/hq/*.mp4"))), None) \
    or next((p for p in sorted((ROOT / "work").glob("*/source.mp4"))), None)
ck("video uji berisi wajah tersedia (project lama)", fixture is not None,
   str(fixture.relative_to(ROOT)) if fixture else "tidak ada — bagian wajah dilewati")

# ---------------------------------------------------------------- 3) server
try:
    health = requests.get(f"{BASE}/api/health", timeout=10)
except Exception as e:
    print(f"FAIL server tidak jalan di {BASE}: {e}")
    print("\n1 gagal")
    sys.exit(1)
ck("GET /api/health 200", health.status_code == 200, health.text[:80])
ck("health melaporkan yunet siap", bool(health.json().get("yunet")), str(health.json().get("yunet")))

options = requests.get(f"{BASE}/api/options", timeout=10).json()
ck("GET /api/options memuat 4 rasio termasuk 4:5",
   options.get("aspect_ratios") == ["9:16", "1:1", "4:5", "16:9"],
   str(options.get("aspect_ratios")))

EVIDENCE.mkdir(parents=True, exist_ok=True)
(EVIDENCE / "after").mkdir(parents=True, exist_ok=True)
report = []

try:
    pid = requests.post(f"{BASE}/api/projects", json={"title": "T6 check"},
                        timeout=15).json()["project"]["id"]
    created_pids.append(pid)
    pdir = ROOT / "work" / pid
    cdir = ROOT / "clips" / pid
    src = pdir / "source.mp4"
    if fixture:
        try:
            os.link(fixture, src)
        except OSError:
            shutil.copy2(fixture, src)
    else:
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=200",
                        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(src)],
                       check=True, capture_output=True)
    words = [{"word": f"kata{i}", "start": round(SEG["start"] + 0.2 * i, 2),
              "end": round(SEG["start"] + 0.2 * i + 0.35, 2)}
             for i in range(int((SEG["end"] - SEG["start"]) * 5))]
    (pdir / "transcript.json").write_text(
        json.dumps({"video": str(src), "words": words}), encoding="utf-8")
    (pdir / "segments.json").write_text(json.dumps([SEG]), encoding="utf-8")
    ck("source uji siap", src.exists(), f"{src.name} {dims(src)}")

    W, H = dims(src)

    # ---------- keyframes per detik ----------
    r = requests.post(f"{BASE}/api/projects/{pid}/zoom-keyframes",
                      json={"candidate_index": 0}, timeout=600)
    zk = r.json()
    ck("POST /zoom-keyframes ok:true + keyframes", r.status_code == 200 and zk.get("ok") is True,
       str(zk)[:120])
    kfs = zk.get("keyframes") or []
    ck("keyframes cukup padat (>= 1 per detik)", len(kfs) >= SEG["end"] - SEG["start"],
       f"{len(kfs)} kotak untuk 12 s")
    if kfs:
        ratio_ok = all(abs((k["w"] * W) / (k["h"] * H) - 9 / 16) < 0.02 for k in kfs)
        inside = all(0 <= k["x"] and k["x"] + k["w"] <= 1.001 and 0 <= k["y"] and k["y"] + k["h"] <= 1.001
                     for k in kfs)
        ck("kotak keyframe berasio 9:16 dan di dalam frame", ratio_ok and inside,
           f"{len(kfs)} kotak, w {min(k['w'] for k in kfs):.3f}-{max(k['w'] for k in kfs):.3f}")
        ck("keyframes mengikuti subjek (x bervariasi)", len({round(k["x"], 3) for k in kfs}) >= 3,
           f"{len({round(k['x'], 3) for k in kfs})} posisi x unik")
        if fixture:
            detect = cv2.FaceDetectorYN.create(str((ROOT / "yunet.onnx").resolve()), "", (640, 360), 0.5, 0.3, 5000)
            probe = EVIDENCE / "after" / "_probe.png"
            dxs, dys = [], []
            min_w = min(k["w"] for k in kfs)
            min_h = min(k["h"] for k in kfs)
            dur_src = duration(src)
            for k in kfs[::5]:
                t = SEG["start"] + k["t"]
                if t >= dur_src:
                    continue
                frame(src, t, probe)
                img = cv2.imread(str(probe))
                if img is None:
                    continue
                detect.setInputSize((img.shape[1], img.shape[0]))
                _, faces = detect.detect(img)
                if faces is None or not len(faces):
                    continue
                best = max(faces, key=lambda f: f[2] * f[3] * float(f[14]))
                fx = (best[0] + best[2] / 2.0) / img.shape[1]
                fy = (best[1] + best[3] / 2.0) / img.shape[0]
                dxs.append(abs(fx - (k["x"] + k["w"] / 2)))
                dys.append(abs(fy - (k["y"] + k["h"] / 2)))
            if dxs:
                dx = sum(dxs) / len(dxs)
                dy = sum(dys) / len(dys)
                # sumbu vertikal hanya bisa dikejar kalau kotak tidak setinggi frame (mis. 9:16 dari 16:9)
                room_y = 1 - min_h
                dy_ok = dy <= room_y / 2 + 0.05 if room_y > 0.05 else True
                ck("kotak keyframe mengikuti wajah (dx ≤ 0.12 dari pusat kotak)",
                   dx <= 0.12 and dy_ok,
                   f"{len(dxs)} sampel, dx={dx:.3f}, dy={dy:.3f}"
                   + (f" (ruang gerak vertikal {room_y:.3f}, tidak diuji)" if room_y <= 0.05 else ""))
                probe.unlink(missing_ok=True)
            else:
                print("SKIP  wajah tidak terdeteksi di frame sumber — ukuran wajah kecil/blur")

    # ---------- payload timeline item ----------
    dur_ms = int(duration(src) * 1000)
    items = [{"id": "t6-video", "track": 1, "kind": "video", "start_ms": 0,
              "end_ms": min(dur_ms, int(SEG["end"] * 1000)),
              "payload": {"zoom_keyframes": {"0": kfs}}}]
    r = requests.post(f"{BASE}/api/projects/{pid}/timeline", json={"items": items}, timeout=30)
    ck("POST /timeline simpan zoom_keyframes di payload", r.status_code == 200 and r.json().get("ok"),
       str(r.json())[:80])
    tl_data = requests.get(f"{BASE}/api/projects/{pid}/timeline", timeout=15).json()
    stored = (((tl_data.get("tracks") or [{}])[0].get("items") or [{}])[0].get("payload") or {}).get("zoom_keyframes", {})
    ck("GET /timeline mengembalikan payload.zoom_keyframes", len(stored.get("0") or []) == len(kfs),
       f"{len(stored.get('0') or [])} kotak tersimpan")

    # ---------- prefs rasio + zoom ----------
    r = requests.put(f"{BASE}/api/projects/{pid}/prefs",
                     json={"render_prefs": {"aspect": "9:16", "safe_zone": True,
                                            "zoom_auto": True, "zoom_manual": 130}}, timeout=15)
    pr = (r.json() or {}).get("render_prefs") or {}
    ck("PUT /prefs simpan safe_zone + zoom_auto + zoom_manual",
       r.status_code == 200 and pr.get("safe_zone") is True and pr.get("zoom_auto") is True
       and pr.get("zoom_manual") == 130, str(pr.get("zoom_manual")))
    r = requests.put(f"{BASE}/api/projects/{pid}/prefs", json={"render_prefs": {"zoom_manual": 250}}, timeout=15)
    ck("PUT /prefs tolak zoom_manual di luar 100–160", r.status_code == 400, r.text[:80])

    # ---------- render rasio + zoom ----------
    r = requests.post(f"{BASE}/api/projects/{pid}/render",
                      json={"candidate_index": 0, "aspect": "9:16", "do_tighten": False,
                            "crop_mode": "auto", "custom_hook": "t6-9x16", "quality": "original"},
                      timeout=900)
    ck("POST /render 9:16 + auto zoom ok", r.status_code == 200, r.text[:120])
    zoomed = cdir / "raw" / "t6-9x16.mp4"
    if zoomed.exists():
        ck("hasil 9:16 = 1080x1920", dims(zoomed) == (1080, 1920), str(dims(zoomed)))
        ck("durasi hasil tetap 12 s", abs(duration(zoomed) - 12.0) < 0.5, f"{duration(zoomed):.2f}s")
        h_zoom = sha256(zoomed, "t6-9x16.mp4")
    else:
        h_zoom = ""

    r = requests.post(f"{BASE}/api/projects/{pid}/render",
                      json={"candidate_index": 0, "aspect": "4:5", "do_tighten": False,
                            "crop_mode": "auto", "custom_hook": "t6-4x5", "quality": "original"},
                      timeout=900)
    ck("POST /render 4:5 ok", r.status_code == 200, r.text[:120])
    p45 = cdir / "raw" / "t6-4x5.mp4"
    if p45.exists():
        ck("hasil 4:5 = 1080x1350 (beda dari 9:16)", dims(p45) == (1080, 1350), str(dims(p45)))

    # bukti jalur payload: prefs zoom mati, payload timeline masih menyimpan keyframes -> hasil identik
    requests.put(f"{BASE}/api/projects/{pid}/prefs",
                 json={"render_prefs": {"zoom_auto": False, "zoom_manual": 100}}, timeout=15)
    r = requests.post(f"{BASE}/api/projects/{pid}/render",
                      json={"candidate_index": 0, "aspect": "9:16", "do_tighten": False,
                            "crop_mode": "auto", "custom_hook": "t6-stored", "quality": "original"},
                      timeout=900)
    stored_out = cdir / "raw" / "t6-stored.mp4"
    same = stored_out.exists() and bool(h_zoom) and sha256(stored_out, "t6-stored.mp4") == h_zoom
    ck("POST /render pakai zoom_keyframes dari payload timeline", r.status_code == 200 and same,
       "sha256 identik dengan render auto zoom" if same else "hash beda / render gagal")

    # baseline jujur: payload zoom dikosongkan, framing statis center crop
    empty_items = [{"id": "t6-video", "track": 1, "kind": "video", "start_ms": 0,
                    "end_ms": min(dur_ms, int(SEG["end"] * 1000)), "payload": {}}]
    requests.post(f"{BASE}/api/projects/{pid}/timeline", json={"items": empty_items}, timeout=30)
    r = requests.post(f"{BASE}/api/projects/{pid}/render",
                      json={"candidate_index": 0, "aspect": "9:16", "do_tighten": False,
                            "crop_mode": "center", "custom_hook": "t6-baseline", "quality": "original"},
                      timeout=900)
    base = cdir / "raw" / "t6-baseline.mp4"
    ck("POST /render baseline (zoom mati) ok", r.status_code == 200 and base.exists(), r.text[:80])

    # ---------- subjek tetap di tengah ----------
    lines = []
    if zoomed.exists():
        zc = face_centers(zoomed, tag="zoom-")
        bc = face_centers(base, tag="baseline-") if base.exists() else []
        zdet = [c for _, c in zc if c is not None]
        bdet = [c for _, c in bc if c is not None]
        zdev = sum(abs(c - 0.5) for c in zdet) / len(zdet) if zdet else None
        bdev = sum(abs(c - 0.5) for c in bdet) / len(bdet) if bdet else None
        ck("auto zoom: subjek dekat tengah pada frame 10/50/90%",
           bool(zdet) and zdev <= 0.25,
           f"cx={zdet or 'tidak terdeteksi'}, simpangan rata-rata={zdev if zdev is not None else '-'}")
        if zdev is not None and bdev is not None:
            ck("auto zoom lebih terpusat daripada center crop", zdev <= bdev + 0.02,
               f"zoom {zdev:.3f} vs baseline {bdev:.3f}")
        lines = [
            f"9:16 + auto zoom  -> {dims(zoomed)}  {duration(zoomed):.2f}s  sha256 {h_zoom[:16]}…",
            f"pusat wajah ternormalisasi (0.5 = tengah): {zc}",
        ]
        if base.exists():
            lines.append(f"baseline center   -> {dims(base)}  {duration(base):.2f}s  sha256 {sha256(base, 't6-baseline.mp4')[:16]}…")
            lines.append(f"pusat wajah baseline: {bc}")
        if p45.exists():
            lines.append(f"4:5               -> {dims(p45)}  {duration(p45):.2f}s  sha256 {sha256(p45, 't6-4x5.mp4')[:16]}…")
    (EVIDENCE / "ffprobe.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (EVIDENCE / "sha256.txt").write_text("\n".join(sha_lines) + "\n", encoding="utf-8")
finally:
    for pid in created_pids:
        shutil.rmtree(ROOT / "work" / pid, ignore_errors=True)
        shutil.rmtree(ROOT / "clips" / pid, ignore_errors=True)
    leftovers = [p.name for pid in created_pids
                 for p in ((ROOT / "work" / pid), (ROOT / "clips" / pid)) if p.exists()]
    ck("file uji dibersihkan dari work/ dan clips/", not leftovers, ", ".join(leftovers))

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
