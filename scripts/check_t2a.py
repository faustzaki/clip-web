"""scripts/check_t2a.py — cek T2a (endpoint transcript kata + cut). Exit 0 kalau lulus.

Butuh server FastAPI hidup di 127.0.0.1:8000 dan minimal satu project ber-transkrip.
File `transcript.json` project uji dipulihkan dari `.bak` setelah uji.

Jalankan dari root repo: py -3.13 scripts/check_t2a.py
"""
import hashlib
import json
import pathlib
import shutil
import sys

import requests

BASE = "http://127.0.0.1:8000"
ROOT = pathlib.Path(__file__).resolve().parent.parent
FIELDS = {"idx", "word", "start_ms", "end_ms", "deleted"}
fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


try:
    r = requests.get(f"{BASE}/api/projects", timeout=10)
except Exception as e:
    print(f"FAIL server tidak jalan di {BASE}: {e}")
    sys.exit(1)

projects = r.json().get("projects", []) if r.status_code == 200 else []
with_tr = [p for p in projects if p.get("has_transcript")]
if not with_tr:
    print("FAIL tidak ada project dengan transcript — jalankan analisis dulu")
    sys.exit(1)
pid = with_tr[0]["id"]
path = ROOT / "work" / pid / "transcript.json"
bak = path.with_name("transcript.json.bak")
before = hashlib.sha256(path.read_bytes()).hexdigest()

try:
    # 1. route lain tidak regresi
    ck("GET /api/projects 200", r.status_code == 200, f"{len(projects)} project")

    # 2. bentuk respons transcript
    t = requests.get(f"{BASE}/api/projects/{pid}/transcript", params={"word": 1}, timeout=30)
    body = t.json() if t.status_code == 200 else {}
    words = body.get("words") or []
    ck("GET transcript 200 + words>0", t.status_code == 200 and len(words) > 0,
       f"{t.status_code} · {len(words)} kata")
    ck("field kata lengkap + ms integer",
       all(FIELDS <= set(w) and isinstance(w["start_ms"], int) and isinstance(w["end_ms"], int)
           for w in words[:50]) and isinstance(body.get("duration_ms"), int),
       f"keys={sorted(words[0]) if words else []} duration_ms={type(body.get('duration_ms')).__name__}")

    # 3. rentang invalid → 400, bukan 500
    bad = requests.post(f"{BASE}/api/projects/{pid}/cut",
                        json={"from_idx": 0, "to_idx": len(words) + 5}, timeout=30)
    ck("cut invalid 400 ok:false",
       bad.status_code == 400 and bad.json().get("ok") is False,
       f"{bad.status_code} {bad.text[:60]}")

    # 4. cut valid 3 kata pertama
    cut = requests.post(f"{BASE}/api/projects/{pid}/cut",
                        json={"from_idx": 0, "to_idx": 2}, timeout=30)
    res = cut.json() if cut.status_code == 200 else {}
    ck("cut valid ok + removed_ms>0 + deleted=3",
       cut.status_code == 200 and res.get("ok") is True and res.get("removed_ms", 0) > 0
       and res.get("deleted") == 3,
       json.dumps(res))
    ck("new_duration_ms = duration_ms - removed_ms",
       res.get("new_duration_ms") == body.get("duration_ms", 0) - res.get("removed_ms", 0),
       f"{res.get('new_duration_ms')} vs {body.get('duration_ms')}-{res.get('removed_ms')}")

    # 5. file tetap JSON valid + bendera deleted tersimpan, backup ada
    after = json.loads(path.read_text(encoding="utf-8-sig"))
    ck("file JSON valid + deleted=1 pada rentang",
       [w.get("deleted") for w in after["words"][:3]] == [1, 1, 1]
       and all(w.get("deleted") in (0, 1, None) for w in after["words"]))
    ck("backup transcript.json.bak dibuat", bak.exists(), str(bak.relative_to(ROOT)))
finally:
    if bak.exists():
        shutil.copy2(bak, path)
        bak.unlink()
restored = hashlib.sha256(path.read_bytes()).hexdigest() == before
ck("transcript.json dipulihkan ke isi asli", restored)

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
