"""scripts/check_t3a.py — cek T3a (endpoint timeline turunan + simpan). Exit 0 kalau lulus.

Butuh server FastAPI hidup di 127.0.0.1:8000 dan minimal satu project ber-transkrip.
File `work/<pid>/timeline.json` buatan uji DIHAPUS di akhir (termasuk `.bak`).

Jalankan dari root repo: py -3.13 scripts/check_t3a.py
"""
import json
import pathlib
import sys

import requests

BASE = "http://127.0.0.1:8000"
ROOT = pathlib.Path(__file__).resolve().parent.parent
ITEM_FIELDS = {"id", "kind", "start_ms", "end_ms", "payload"}
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
tl_path = ROOT / "work" / pid / "timeline.json"
bak_path = tl_path.with_name("timeline.json.bak")
original = tl_path.read_bytes() if tl_path.exists() else None

try:
    # 1. route lain tidak regresi
    ck("GET /api/projects 200", r.status_code == 200, f"{len(projects)} project")
    tr = requests.get(f"{BASE}/api/projects/{pid}/transcript", params={"word": 1}, timeout=30)
    ck("GET transcript 200", tr.status_code == 200, str(tr.status_code))

    # 2. GET timeline turunan
    g = requests.get(f"{BASE}/api/projects/{pid}/timeline", timeout=60)
    body = g.json() if g.status_code == 200 else {}
    tracks = body.get("tracks") or []
    duration = body.get("duration_ms") or 0
    ck("GET timeline 200 + duration_ms>0",
       g.status_code == 200 and isinstance(duration, int) and duration > 0,
       f"{g.status_code} duration_ms={duration}")
    ck("3 track (1,2,3)",
       [t.get("track") for t in tracks] == [1, 2, 3],
       str([t.get("track") for t in tracks]))
    caps = next((t["items"] for t in tracks if t.get("track") == 2), [])
    all_items = [it for t in tracks for it in t.get("items", [])]
    ck("item punya field lengkap + rentang valid",
       all(ITEM_FIELDS <= set(it) and 0 <= it["start_ms"] < it["end_ms"] for it in all_items),
       f"{len(all_items)} item")
    ck("caption turunan ada + <=12 kata/item",
       caps and all(len(it["payload"].get("text", "").split()) <= 12 for it in caps),
       f"{len(caps)} caption, max={max((len(it['payload']['text'].split()) for it in caps), default=0)}")
    ck("GET turunan tidak menulis timeline.json", not tl_path.exists(), str(tl_path))

    # 3. POST invalid → 400, bukan 500
    bad1 = requests.post(f"{BASE}/api/projects/{pid}/timeline",
                         json={"items": [{"track": 1, "kind": "video", "start_ms": 5000, "end_ms": 1000}]},
                         timeout=30)
    ck("POST end_ms<start_ms → 400 ok:false",
       bad1.status_code == 400 and bad1.json().get("ok") is False,
       f"{bad1.status_code} {bad1.text[:70]}")
    bad2 = requests.post(f"{BASE}/api/projects/{pid}/timeline",
                         json={"items": [{"track": 9, "kind": "video", "start_ms": 0, "end_ms": 1000}]},
                         timeout=30)
    ck("POST track 9 → 400 ok:false",
       bad2.status_code == 400 and bad2.json().get("ok") is False,
       f"{bad2.status_code} {bad2.text[:70]}")
    bad3 = requests.post(f"{BASE}/api/projects/{pid}/timeline",
                         json={"items": [{"track": 1, "kind": "video", "start_ms": 0,
                                          "end_ms": duration + 60000}]}, timeout=30)
    ck("POST end_ms > durasi+1000 → 400",
       bad3.status_code == 400, f"{bad3.status_code} {bad3.text[:70]}")
    ck("POST invalid tidak menulis file", not tl_path.exists())

    # 4. POST valid
    sent = [
        {"track": 1, "kind": "video", "start_ms": 0, "end_ms": duration,
         "payload": {"label": "utama"}},
        {"track": 2, "kind": "caption", "start_ms": 0, "end_ms": 1500,
         "payload": {"text": "tes timeline"}},
        {"track": 3, "kind": "audio", "start_ms": 0, "end_ms": duration, "payload": {}},
    ]
    p = requests.post(f"{BASE}/api/projects/{pid}/timeline", json={"items": sent}, timeout=30)
    res = p.json() if p.status_code == 200 else {}
    ck("POST valid ok:true items=3",
       p.status_code == 200 and res.get("ok") is True and res.get("items") == 3,
       f"{p.status_code} {json.dumps(res)}")
    ck("timeline.json tertulis + JSON valid",
       tl_path.exists() and isinstance(json.loads(tl_path.read_text(encoding="utf-8")), dict))

    # 5. GET ulang = item yang sama
    g2 = requests.get(f"{BASE}/api/projects/{pid}/timeline", timeout=30)
    b2 = g2.json() if g2.status_code == 200 else {}
    after_items = {t.get("track"): t.get("items", []) for t in b2.get("tracks", [])}
    keys = ("kind", "start_ms", "end_ms", "payload")
    same = (b2.get("duration_ms") == duration
            and [t.get("track") for t in b2.get("tracks", [])] == [1, 2, 3]
            and all(any({k: got.get(k) for k in keys} == {k: it[k] for k in keys}
                        for got in after_items.get(it["track"], [])) for it in sent))
    ck("GET ulang mengembalikan item sama", same,
       json.dumps(b2)[:200])
finally:
    if original is not None:
        tl_path.write_bytes(original)
        print("CATATAN: timeline.json lama dipulihkan")
    else:
        tl_path.unlink(missing_ok=True)
    bak_path.unlink(missing_ok=True)

ck("timeline.json uji dibersihkan",
   (tl_path.read_bytes() == original if original is not None else not tl_path.exists())
   and not bak_path.exists(), str(tl_path))

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
