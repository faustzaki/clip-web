"""scripts/check_t10.py — cek T10 (b-roll folder lokal). Exit 0 kalau semua lulus.

Jalankan dari root repo: `py -3.13 scripts/check_t10.py`
Menguji: endpoint index/saran, empty state, kecepatan index 50 file, overlay b-roll
benar-benar muncul di hasil render (3 frame berbeda), audio utuh, dan aturan tema.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import broll_index  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import server  # noqa: E402

PID = "abc1234567"
HERE = ROOT / "work" / "_t10check"
EVID = ROOT / "docs" / "evidence" / "T10"
FRAMES = EVID / "after"
fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def ff(*args):
    return subprocess.run(["ffmpeg", "-v", "error", *args], capture_output=True, check=True)


def pixel(path, t):
    """Warna rata-rata 1x1 pada detik t dari sebuah video."""
    p = HERE / "px.png"
    ff("-y", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", str(p))
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(p), "-vf", "scale=1:1",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True).stdout
    return tuple(out[:3])


def build_fixture(client):
    """Project kecil 6 detik + 3 b-roll warna berbeda, item b-roll dikirim lewat API timeline."""
    shutil.rmtree(HERE, ignore_errors=True)
    HERE.mkdir(parents=True, exist_ok=True)
    src = HERE / "source.mp4"
    ff("-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=6",
       "-f", "lavfi", "-i", "sine=frequency=220:duration=6",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac",
       "-shortest", str(src))

    pdir = ROOT / "work" / PID
    pdir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, pdir / "source.mp4")
    (pdir / "project.json").write_text(json.dumps({
        "id": PID, "title": "Uji T10", "source_type": "upload", "source_url": None,
        "created_at": time.time(), "updated_at": time.time(),
        "render_prefs": dict(server.DEFAULT_RENDER_PREFS),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    (pdir / "transcript.json").write_text(json.dumps({
        "language": "id", "duration": 6.0, "model": "medium",
        "words": [{"word": "pantai", "start": 0.5, "end": 1.0},
                  {"word": "senja", "start": 1.2, "end": 1.6},
                  {"word": "kopi", "start": 5.0, "end": 5.4}],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    (pdir / "segments.json").write_text(json.dumps([
        {"id": 0, "hook": "uji-broll", "start": 0.0, "end": 6.0,
         "overall": 9.0, "keywords": ["pantai", "senja"]},
    ], ensure_ascii=False, indent=2), encoding="utf-8")

    items, windows = [], [(0.5, 2.0), (2.5, 4.0), (4.5, 6.0)]
    names = ["pantai-sunset.mp4", "senja-kota.mp4", "kopi-latte.mp4"]
    for i, (name, (s, e)) in enumerate(zip(names, windows)):
        items.append({"id": f"broll-{i}", "kind": "broll", "track": 2,
                      "start_ms": int(s * 1000), "end_ms": int(e * 1000),
                      "payload": {"src": f"data/broll/{name}", "name": name,
                                  "tags": [], "opacity": 1.0}})
    payload = {"items": [{"id": "v1", "kind": "video", "track": 1, "start_ms": 0,
                          "end_ms": 6000, "payload": {}}] + items
                         + [{"id": "a1", "kind": "audio", "track": 3, "start_ms": 0,
                             "end_ms": 6000, "payload": {}}]}
    post = client.post(f"/api/projects/{PID}/timeline", json=payload)
    stored = client.get(f"/api/projects/{PID}/timeline").json()
    saved_broll = [it for tr in stored.get("tracks") or [] if tr.get("track") == 2
                   for it in tr.get("items") or [] if it.get("kind") == "broll"]
    return windows, (post.status_code == 200 and len(saved_broll) == 3)


def main():
    FRAMES.mkdir(parents=True, exist_ok=True)
    client = TestClient(server.app)
    windows, timeline_ok = build_fixture(client)
    media = [p for p in broll_index._media_files(broll_index.BROLL_DIR)]

    # 1. endpoint refresh + index
    r = client.post("/api/broll/refresh")
    data = r.json()
    ck("POST /api/broll/refresh 200 + jumlah item = jumlah berkas",
       r.status_code == 200 and data.get("ok") is True and data.get("count") == len(media),
       f"status={r.status_code} count={data.get('count')} berkas={len(media)}")

    # 2. saran untuk klip aktif
    r = client.get(f"/api/broll/index?project_id={PID}&candidate_index=0")
    body = r.json()
    sugg = body.get("suggestions") or []
    scores = [s.get("score", 0) for s in sugg]
    ck("GET /api/broll/index 200 + maksimal 5 saran berurutan skor menurun",
       r.status_code == 200 and 0 < len(sugg) <= 5 and scores == sorted(scores, reverse=True)
       and all("matched_tags" in s for s in sugg),
       f"n={len(sugg)} skor={scores}")

    # 3. folder kosong → empty state, bukan error
    with tempfile.TemporaryDirectory() as tmp:
        saved = (broll_index.BROLL_DIR, broll_index.INDEX_FILE,
                 broll_index.THUMB_DIR, broll_index.TAGS_FILE)
        empty = Path(tmp) / "broll"
        broll_index.BROLL_DIR, broll_index.THUMB_DIR = empty, empty / ".thumbs"
        broll_index.INDEX_FILE = empty / "index.json"
        broll_index.TAGS_FILE = empty / "tags.json"
        try:
            res = client.get("/api/broll/index").json()
        finally:
            (broll_index.BROLL_DIR, broll_index.INDEX_FILE,
             broll_index.THUMB_DIR, broll_index.TAGS_FILE) = saved
    _a, _b, _c = res.get('ok') is True, res.get('count') == 0, res.get('hint') == 'Folder b-roll masih kosong. Taruh video di data/broll/.'
    ck("folder kosong → 200 {ok:true,count:0,hint Indonesia}",
       res.get("ok") is True and res.get("count") == 0
       and res.get("hint") == broll_index.EMPTY_HINT,
       f"res={json.dumps(res, ensure_ascii=False)}")

    # 4. index 50 file < 10 detik
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "broll"
        root.mkdir(parents=True)
        sample = broll_index.BROLL_DIR / media[0].name
        for i in range(50):
            shutil.copy2(sample, root / f"uji-tema{i:02d}.mp4")
        saved = (broll_index.BROLL_DIR, broll_index.INDEX_FILE,
                 broll_index.THUMB_DIR, broll_index.TAGS_FILE)
        broll_index.BROLL_DIR, broll_index.THUMB_DIR = root, root / ".thumbs"
        broll_index.INDEX_FILE = root / "index.json"
        broll_index.TAGS_FILE = root / "tags.json"
        try:
            t0 = time.time()
            scanned = broll_index.scan()
            took = time.time() - t0
        finally:
            (broll_index.BROLL_DIR, broll_index.INDEX_FILE,
             broll_index.THUMB_DIR, broll_index.TAGS_FILE) = saved
    ck("index 50 file selesai < 10 detik",
       scanned["count"] == 50 and took < 10, f"{scanned['count']} file dalam {took:.2f} s")

    # 5-7. render nyata: 3 b-roll muncul, audio utuh
    r = client.post(f"/api/projects/{PID}/render",
                    json={"candidate_index": 0, "do_tighten": False, "crop_mode": "center",
                          "aspect": "9:16", "burn_caption": False})
    clip = (r.json() or {}).get("clip") or {}
    out = ROOT / "clips" / PID / "raw" / (clip.get("name") or "x.mp4")
    ok_render = r.status_code == 200 and out.is_file()

    base = pixel(out, 2.2) if ok_render else (0, 0, 0)
    seen, colors = [], []
    for i, (s, e) in enumerate(windows):
        mid = (s + e) / 2
        rgb = pixel(out, mid) if ok_render else (0, 0, 0)
        colors.append(rgb)
        seen.append(rgb != base and max(rgb) > 120)
        ff("-y", "-ss", f"{mid:.2f}", "-i", str(out), "-frames:v", "1",
           str(FRAMES / f"frame-broll-{i + 1}.png"))
    ck("3 b-roll tersisip via API timeline lalu muncul di hasil render",
       ok_render and timeline_ok and all(seen) and len(set(colors)) == 3,
       f"status={r.status_code} timeline_ok={timeline_ok} dasar={base} broll={colors}")

    # tepat di luar jendela b-roll harus kembali ke video asli (b-roll tidak bocor)
    gaps = [pixel(out, t) for t in (0.2, 2.2, 4.2)] if ok_render else [(0, 0, 0)]
    ck("di luar jendela b-roll frame kembali ke video asli (tanpa kebocoran)",
       ok_render and all(g not in colors for g in gaps) and all(max(g) > 0 for g in gaps),
       f"luar={gaps} broll={colors}")

    sil = subprocess.run(["ffmpeg", "-v", "info", "-i", str(out),
                          "-af", "silencedetect=n=-45dB:d=0.5", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout.strip()
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                            "stream=index,codec_type,codec_name,width,height,nb_frames",
                            "-show_entries", "format=duration,size",
                            "-of", "default=nw=1", str(out)],
                           capture_output=True, text=True).stdout
    (EVID / "ffprobe.txt").write_text(
        f"# T10 — hasil render dengan 3 b-roll (project {PID}, segmen 0–6 s)\n"
        f"# ffprobe {out.relative_to(ROOT).as_posix()}\n{probe}\n"
        f"# silencedetect n=-45dB d=0.5\n"
        + ("".join(l + "\n" for l in sil.splitlines() if "silence" in l)
           or "tidak ada jeda senyap terdeteksi\n"),
        encoding="utf-8")
    ck("audio asli utuh (aac ~6 s, tanpa jeda senyap)",
       ok_render and "silence_start" not in sil and abs(float(dur) - 6.0) < 0.2,
       f"durasi={dur} silence={'ada' if 'silence_start' in sil else 'tidak ada'}")

    # 8. aturan repo pada berkas yang disentuh
    touched = ["broll_index.py", "server.py", "chopify/render_clips.py",
               "frontend/src/components/ToolPanel.jsx", "frontend/src/components/Timeline.jsx",
               "frontend/src/hooks/useEditorState.js", "frontend/src/api.js"]
    bad = []
    for f in touched:
        text = (ROOT / f).read_text(encoding="utf-8")
        hits = re.findall(r"TODO|console\.log|bg-dark|bg-black|dark:", text)
        if hits:
            bad.append(f"{f}:{set(hits)}")
    ck("tanpa TODO/console.log/dark theme di berkas yang disentuh", not bad, "; ".join(bad))

    shutil.rmtree(ROOT / "work" / PID, ignore_errors=True)
    shutil.rmtree(ROOT / "clips" / PID, ignore_errors=True)
    shutil.rmtree(ROOT / "work" / "_t10", ignore_errors=True)
    shutil.rmtree(HERE, ignore_errors=True)

    print(f"\n{len(fails)} gagal")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())