#!/usr/bin/env python3
"""PM verifier T8 — uji UI speaker pada DATA NYATA (bukan fixture agent).

Cara kerja: buat project sementara dari evidence/T8/audio/two_speakers.wav +
transcript.json yang sudah punya speaker, jalankan server :8000, uji lewat HTTP,
lalu HAPUS project sementara (work/<pid> + clips/<pid>).

Pakai: py -3.13 scripts/pm_verify_t8.py
"""
import json
import os
import random
import shutil
import string
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:8000"
EV = ROOT / "docs/evidence/T8/audio"
SRC = EV / "two_speakers.wav"
FIX = EV / "fixture.json"

if not SRC.exists() or not FIX.exists():
    print("FATAL: fixture audio T8 tidak ada")
    sys.exit(2)

pid = "".join(random.choices("0123456789abcdef", k=10))  # PID_RE: 10 hex
wdir = ROOT / "work" / pid
clips = ROOT / "clips" / pid
wdir.mkdir(parents=True, exist_ok=True)

fix = json.loads(FIX.read_text(encoding="utf-8"))
words = fix["words"]
spk_ids = fix["speaker_ids"]

# susun transcript.json format repo (durasi detik + kata milidetik di endpoint)
tr = {
    "language": "id",
    "duration": fix.get("duration_s", 35.56),
    "model": "pm-fixture",
    "words": [
        {"word": w.get("word"), "start": w.get("start"), "end": w.get("end"), "speaker": spk}
        for w, spk in zip(words, spk_ids)
    ],
}
if tr["words"][0]["start"] is None:
    print("FATAL: fixture tidak punya timing per kata")
    sys.exit(2)

shutil.copy2(SRC, wdir / "source.mp4")
(wdir / "transcript.json").write_text(json.dumps(tr), encoding="utf-8")
(wdir / "project.json").write_text(json.dumps({
    "id": pid, "title": "PM T8 fixture", "created_at": time.time(),
    "speakers": [
        {"id": 0, "label": "Speaker 1", "color_idx": 0, "confidence": "estimate"},
        {"id": 1, "label": "Speaker 2", "color_idx": 1, "confidence": "estimate"},
    ],
}), encoding="utf-8")

fails, passes = [], []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    (passes if cond else fails).append(name)


try:
    r = requests.get(f"{BASE}/api/projects/{pid}/transcript?word=1", timeout=20)
    ck("GET transcript 200", r.status_code == 200, str(r.status_code))
    body = r.json() if r.status_code == 200 else {}
    ws = body.get("words", [])
    ck("semua kata punya speaker", bool(ws) and all(w.get("speaker") is not None for w in ws),
       f"{sum(1 for w in ws if w.get('speaker') is not None)}/{len(ws)}")
    ck("dua speaker terdaftar", len({w.get("speaker") for w in ws}) == 2,
       str(sorted({w.get("speaker") for w in ws})))

    # timing tidak bergeser: fixture dalam DETIK, respons dalam MILIDETIK
    before = [(w["start"], w["end"]) for w in tr["words"]]
    after = [(w["start_ms"], w["end_ms"]) for w in ws]
    same_len = len(before) == len(after)
    shifted = [abs(round(b[0] * 1000) - a[0]) for a, b in zip(after, before)]
    ck("timing kata tidak bergeser (detik -> ms)", same_len and max(shifted) <= 1,
       f"{len(after)} kata, geser maks {max(shifted) if shifted else '-'} ms")

    dur_ms = body.get("duration_ms") or int(tr["duration"] * 1000)
    ck("durasi audio tidak berubah", abs(dur_ms - int(tr["duration"] * 1000)) <= 500,
       f"{dur_ms} ms")
finally:
    shutil.rmtree(wdir, ignore_errors=True)
    shutil.rmtree(clips, ignore_errors=True)
    print("project uji dibersihkan:", pid)

print(f"\n{len(passes)} lulus, {len(fails)} gagal")
sys.exit(1 if fails else 0)
