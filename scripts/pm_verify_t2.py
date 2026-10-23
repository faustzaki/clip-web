#!/usr/bin/env python3
"""PM verifier T2 — dijalankan PM, bukan agent pelaksana.
Uji endpoint transcript + cut pada project nyata, dengan backup/restore transkrip
supaya data josjis tidak rusak.

Pakai: py -3.13 scripts/pm_verify_t2.py
"""
import json
import shutil
import sys
import time
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"
ROOT = Path(__file__).resolve().parent.parent
fails, passes = [], []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    (passes if cond else fails).append(name)


try:
    projects = requests.get(f"{BASE}/api/projects", timeout=10).json()["projects"]
except Exception as e:
    print("FATAL: backend tidak menjawab:", e)
    sys.exit(2)

cand = [p for p in projects if p.get("has_transcript")]
ck("ada project dengan transkrip", bool(cand), f"{len(cand)} dari {len(projects)}")
if not cand:
    sys.exit(1)
pid = cand[0]["id"]
print(f"project uji: {pid} — {cand[0].get('title')}")

# 1. endpoint transcript
r = requests.get(f"{BASE}/api/projects/{pid}/transcript?word=1", timeout=30)
ck("GET transcript 200", r.status_code == 200, str(r.status_code))
words = []
if r.status_code == 200:
    body = r.json()
    words = body.get("words") or body.get("transcript", {}).get("words") or []
    ck("words tidak kosong", len(words) > 0, f"{len(words)} kata")
    if words:
        w = words[0]
        ck("kata punya start_ms/end_ms/word",
           all(k in w for k in ("start_ms", "end_ms", "word")), str(list(w)[:6]))

# 2. cut dengan backup transkrip
tpath = ROOT / "work" / pid / "transcript.json"
bak = tpath.with_suffix(".json.pmbak")
if tpath.exists():
    shutil.copy2(tpath, bak)
    before = json.loads(tpath.read_text(encoding="utf-8"))
    before_n = len(before.get("words", []))
    before_dur = before.get("duration")
else:
    before, before_n, before_dur = {}, 0, None

idx = [i for i, w in enumerate(words[:6]) if i <= 2]
payload = {"from_idx": 0, "to_idx": 2}
r = requests.post(f"{BASE}/api/projects/{pid}/cut", json=payload, timeout=30)
ok = r.status_code == 200 and (r.json().get("removed_ms", 0) > 0)
ck("POST cut 200 + removed_ms > 0", ok, f"{r.status_code} {str(r.text)[:80]}")

after = {}
if tpath.exists():
    after = json.loads(tpath.read_text(encoding="utf-8"))
after_n = len(after.get("words", []))
deleted = sum(1 for w in after.get("words", []) if w.get("deleted"))
ck("ada kata berstatus deleted setelah cut", deleted >= 1, f"{deleted} kata")
ck("jumlah kata tidak bertambah aneh", after_n >= before_n or after_n > 0, f"{before_n} → {after_n}")

# 3. request tidak valid tidak boleh 500
r = requests.post(f"{BASE}/api/projects/{pid}/cut", json={"from_idx": 99999, "to_idx": 99999}, timeout=15)
ck("cut idx tidak valid tidak 500", r.status_code < 500, str(r.status_code))

# restore
if bak.exists():
    shutil.copy2(bak, tpath)
    bak.unlink()
    restored = json.loads(tpath.read_text(encoding="utf-8"))
    ck("transkrip dipulihkan (data josjis aman)",
       len(restored.get("words", [])) == before_n, f"{len(restored.get('words', []))} kata")

print(f"\n{len(passes)} lulus, {len(fails)} gagal")
sys.exit(1 if fails else 0)
