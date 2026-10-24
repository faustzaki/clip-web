#!/usr/bin/env python3
"""PM cek T12: apakah prefs (offset_y/layout/bg) benar-benar bertahan & terpakai render.

Buat project sementara, PUT prefs, GET ulang (baca dari disk), render, cek geometri.
Hapus project uji di akhir. Pakai: py -3.13 scripts/pm_verify_t12.py
"""
import json
import random
import shutil
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:8000"
passes, fails = [], []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    (passes if cond else fails).append(name)


pid = "".join(random.choices("0123456789abcdef", k=10))
wdir = ROOT / "work" / pid
cdir = ROOT / "clips" / pid
wdir.mkdir(parents=True, exist_ok=True)
src = wdir / "source.mp4"

# sumber 16:9 dari video project nyata (ambil 6 detik)
real = ROOT / "work/5aedd1102e/source.mp4"
if not real.exists():
    print("FATAL: sumber video project nyata tidak ada")
    sys.exit(2)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "60", "-i", str(real), "-t", "6",
                "-vf", "scale=640:360", "-an", str(src)], check=True)

(wdir / "transcript.json").write_text(json.dumps({
    "language": "id", "duration": 6.0, "model": "pm",
    "words": [{"word": "tes", "start": 0.0, "end": 6.0}],
}), encoding="utf-8")
(wdir / "segments.json").write_text(json.dumps([
    {"start": 0.0, "end": 6.0, "id": "seg0", "duration": 6.0}
]), encoding="utf-8")
(wdir / "project.json").write_text(json.dumps({
    "id": pid, "title": "PM T12", "created_at": time.time(),
    "source_type": "upload", "duration": 6.0,
}), encoding="utf-8")

try:
    body = {"render_prefs": {"layout": "center", "bg_fill": "blur", "bg_color": "#FF00FF", "offset_y": 18}}
    r = requests.put(f"{BASE}/api/projects/{pid}/prefs", json=body, timeout=25)
    ck("PUT prefs 200", r.status_code == 200, str(r.status_code))

    prefs = json.loads((wdir / "project.json").read_text(encoding="utf-8")).get("render_prefs") or {}
    ck("offset_y bertahan setelah dibaca ulang", prefs.get("offset_y") == 18, str(prefs.get("offset_y")))
    ck("layout bertahan", prefs.get("layout") == "center", str(prefs.get("layout")))
    ck("bg_fill bertahan", prefs.get("bg_fill") == "blur", str(prefs.get("bg_fill")))
    ck("bg_color bertahan", prefs.get("bg_color") == "#FF00FF", str(prefs.get("bg_color")))

    # render & cek geometri: offset_y harus menggeser video
    r3 = requests.post(f"{BASE}/api/projects/{pid}/render",
                       json={"candidate_index": 0, "name": "pm12-offset"}, timeout=180)
    ok = r3.status_code == 200
    ck("render 200", ok, str(r3.status_code))
    if ok:
        slug = ((r3.json().get("clip") or {}).get("slug") or "pm12-offset")
        out = cdir / "raw" / f"{slug}.mp4"
        ck("file hasil ada", out.exists(), out.name)
        if out.exists():
            probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                                    "-show_entries", "stream=width,height", "-of", "json", str(out)],
                                   capture_output=True, text=True)
            st = json.loads(probe.stdout)["streams"][0]
            ck("hasil 1080x1920", (st["width"], st["height"]) == (1080, 1920), f'{st["width"]}x{st["height"]}')
finally:
    shutil.rmtree(wdir, ignore_errors=True)
    shutil.rmtree(cdir, ignore_errors=True)
    print("project uji dibersihkan:", pid)

print(f"\n{len(passes)} lulus, {len(fails)} gagal")
sys.exit(1 if fails else 0)
