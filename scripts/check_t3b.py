"""scripts/check_t3b.py — cek T3b (komponen Timeline 3 track). Exit 0 kalau semua lulus.

Butuh: build frontend sudah jalan (frontend/dist) + server backend hidup di 127.0.0.1:8000
(untuk verifikasi fungsional `frontend/tools/verify-t3b.mjs`).

Jalankan dari root repo: py -3.13 scripts/check_t3b.py
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


timeline = SRC / "components" / "Timeline.jsx"
studio = SRC / "components" / "StudioView.jsx"
api = SRC / "api.js"
verifier = ROOT / "frontend" / "tools" / "verify-t3b.mjs"

# 1) file wajib ada
ck("file T3b ada (Timeline.jsx, verifier, api.js)",
   timeline.exists() and verifier.exists() and api.exists(),
   ", ".join(str(p.relative_to(ROOT)) for p in (timeline, verifier, api) if not p.exists()) or "3/3")

tl = timeline.read_text(encoding="utf-8")
sv = studio.read_text(encoding="utf-8")
ap = api.read_text(encoding="utf-8")

# 2) kontrak visual/ukuran yang diminta prompt
ck("Timeline: data-region + tinggi 240/320 + ruler 24 + track 40",
   all(s in tl for s in ('data-region="timeline"', "? 240 : 320", "RULER_H = 24", "TRACK_H = 40")))
ck("Timeline: 3 track Video/Teks/Audio, 4 zoom, playhead 2px accent, hint track kosong",
   all(s in tl for s in ("label: 'Video'", "label: 'Teks'", "label: 'Audio'",
                         "ZOOMS = [25, 50, 100, 200]", "w-[2px] bg-vz-accent",
                         "Belum ada item di track ini.")))
ck("StudioView: fetchTimeline + zoom/collapse persisten di localStorage",
   "fetchTimeline(projectId)" in sv and "vz.timeline.zoom" in sv and "vz.timeline.collapsed" in sv)
ck("api.js: fetchTimeline + saveTimeline",
   "export async function fetchTimeline" in ap and "export async function saveTimeline" in ap)

# 3) aturan keras: tanpa tema gelap/neon, tanpa TODO/console.log
# `bg-black` di StudioView adalah letterbox video/overlay lama (bukan tambahan T3b) -> hanya dicek di file baru.
NEW_BAD = re.compile(r"dark:|bg-dark-|bg-black|gradient|neon|TODO|console\.log")
OLD_BAD = re.compile(r"dark:|bg-dark-|gradient|neon|TODO|console\.log")
bad = [
    f"{p.name}:{n}"
    for p, rx in ((timeline, NEW_BAD), (studio, OLD_BAD), (api, OLD_BAD))
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
    if rx.search(line)
]
ck("tanpa dark/neon/gradient/TODO/console.log", not bad, "; ".join(bad[:6]))

# 4) build memuat token
dist = sorted((ROOT / "frontend" / "dist" / "assets").glob("*.css"))
ck("build CSS memuat token aksen", bool(dist) and "--vz-accent" in dist[-1].read_text(encoding="utf-8"),
   dist[-1].name if dist else "dist/assets/*.css tidak ada")

# 5) screenshot bukti
shots = sorted((ROOT / "docs" / "evidence" / "T3b" / "after").glob("*.png"))
ck("screenshot 1440 & 1280 ada", len(shots) >= 2, ", ".join(p.name for p in shots))

# 6) verifikasi fungsional (klik ruler -> seek, zoom, collapse + persistensi)
run = subprocess.run(["node", "tools/verify-t3b.mjs"], cwd=ROOT / "frontend",
                     capture_output=True, text=True, timeout=300)
print(run.stdout.strip())
if run.stderr.strip():
    print(run.stderr.strip()[-400:])
ck("verify-t3b.mjs (backend :8000) exit 0", run.returncode == 0, f"exit {run.returncode}")

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
