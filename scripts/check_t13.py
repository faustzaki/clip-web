"""scripts/check_t13.py — cek T13 (antrian posting + caption + placeholder analitik). Exit 0 kalau lulus.

Prasyarat OAuth platform TIDAK ada di mesin ini, jadi jalur yang diuji: queue lokal penuh
(simpan/tampil/batal) + caption < 2200 karakter berhashtag + analitik balas {ok:false,reason,hint}
status 200 tanpa permintaan jaringan ke platform.
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PID = "abcdef1301"
HERE = ROOT / "work" / PID
CLIPS_DIR = ROOT / "clips" / PID
QUEUE_FILE = ROOT / "data" / "post_queue.json"
fails = []

def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)

def build_fixture():
    shutil.rmtree(HERE, ignore_errors=True)
    shutil.rmtree(CLIPS_DIR, ignore_errors=True)
    HERE.mkdir(parents=True, exist_ok=True)
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    (HERE / "project.json").write_text(json.dumps({
        "id": PID, "title": "Uji T13", "source_type": "upload", "source_url": None,
        "render_prefs": dict(server.DEFAULT_RENDER_PREFS),
    }, ensure_ascii=False), encoding="utf-8")
    (HERE / "transcript.json").write_text(json.dumps({
        "language": "id", "duration": 6.0, "model": "medium",
        "words": [{"word": "koperasi", "start": 0.4, "end": 0.9},
                  {"word": "merah", "start": 1.0, "end": 1.4},
                  {"word": "putih", "start": 1.5, "end": 1.9}],
    }, ensure_ascii=False), encoding="utf-8")
    (HERE / "segments.json").write_text(json.dumps([
        {"id": 0, "hook": "uji-posting", "title": "Kenapa Hook 3 Detik Menentukan",
         "start": 0.0, "end": 6.0, "overall": 9.0, "keywords": ["koperasi", "merah", "putih"]},
    ], ensure_ascii=False), encoding="utf-8")
    clip = CLIPS_DIR / "clip_01.mp4"
    clip.write_bytes(b"\x00" * 16)  # hanya perlu ada; T13 tidak merender
    (CLIPS_DIR / "clip_01.meta.json").write_text(
        json.dumps({"candidate_index": 0, "subtitled": True}), encoding="utf-8")

def main():
    build_fixture()
    saved_queue = QUEUE_FILE.read_bytes() if QUEUE_FILE.exists() else None
    client = TestClient(server.app)
    future = server.time.time() * 1000 + 3_600_000
    item_id = None

    try:
        # 1. status platform: tanpa env OAuth → semua "Belum terhubung"
        r = client.get("/api/post/status")
        status_body = r.json()
        ck("GET /api/post/status 200 + 3 platform belum terhubung",
           r.status_code == 200 and status_body.get("ok") is True
           and len(status_body.get("platforms") or []) == 3
           and all(p["connected"] is False and p["reason"] == "Belum terhubung"
                   and p["hint"] for p in status_body["platforms"]),
           f"status={r.status_code} platforms={[p['id'] for p in status_body.get('platforms') or []]}")

        # 2. caption: judul dari segments.json + 5 hashtag dari keywords, < 2200 karakter
        cap = client.get(f"/api/post/caption?project_id={PID}&clip_id=clip_01&platform=tiktok").json()
        ck("caption = judul + hashtag keywords, < 2200 karakter",
           cap.get("ok") is True and cap["title"] == "Kenapa Hook 3 Detik Menentukan"
           and 0 < len(cap["hashtags"]) <= 5 and all(t.startswith("#") for t in cap["hashtags"])
           and cap["length"] == len(cap["caption"]) < server.POST_CAPTION_MAX,
           f"len={cap.get('length')} hashtags={cap.get('hashtags')}")

        # 3. jadwalkan → tersimpan dengan status queued
        posted = client.post("/api/post/queue", json={
            "project_id": PID, "clip_id": "clip_01", "platform": "shorts",
            "scheduled_at": int(future), "caption": cap["caption"],
        })
        added = posted.json().get("item") or {}
        item_id = added.get("id")
        ck("POST /api/post/queue → tersimpan status queued",
           posted.status_code == 200 and isinstance(item_id, int)
           and added.get("status") == "queued" and added.get("platform") == "shorts"
           and json.loads(QUEUE_FILE.read_text(encoding="utf-8"))["items"][-1]["id"] == item_id,
           f"status={posted.status_code} item={added}")

        # 4. queue tampil untuk project itu (dasar kalender 7 hari)
        listed = client.get(f"/api/post/queue?project_id={PID}").json()
        ck("GET /api/post/queue?project_id menampilkan jadwal + server_time_ms",
           listed.get("ok") is True and isinstance(listed.get("server_time_ms"), int)
           and [i["id"] for i in listed["items"]] == [item_id],
           f"items={[i['id'] for i in listed.get('items') or []]}")

        # 5. waktu lampau + platform ngawur ditolak (bukan diam-diam tersimpan)
        past = client.post("/api/post/queue", json={
            "project_id": PID, "clip_id": "clip_01", "platform": "tiktok",
            "scheduled_at": int(server.time.time() * 1000) - 1000,
        })
        bad_platform = client.post("/api/post/queue", json={
            "project_id": PID, "clip_id": "clip_01", "platform": "facebook",
            "scheduled_at": int(future),
        })
        ck("jadwal lampau & platform tak dikenal → 400",
           past.status_code == 400 and bad_platform.status_code == 400,
           f"lampau={past.status_code} platform={bad_platform.status_code}")

        # 6. batal = hapus dari berkas
        cancelled = client.delete(f"/api/post/queue/{item_id}")
        after = client.get(f"/api/post/queue?project_id={PID}").json()
        ck("DELETE /api/post/queue/{id} menghapus jadwal dari berkas",
           cancelled.status_code == 200 and cancelled.json().get("removed") == item_id
           and after["items"] == [],
           f"status={cancelled.status_code} sisa={len(after['items'])}")

        # 7. analitik tanpa OAuth: 200 {ok:false,reason,hint}, tanpa request ke platform
        an = client.get("/api/analytics/clip_01")
        ab = an.json()
        ck("GET /api/analytics/{clip_id} → 200 {ok:false,reason Belum tersedia,hint}",
           an.status_code == 200 and ab.get("ok") is False and ab.get("reason") == "Belum tersedia"
           and ab.get("hint") and ab.get("metrics") is None,
           f"status={an.status_code} body={ab}")

        # 8. komponen UI + aturan keras (tanpa TODO/console.log/dark theme)
        ui = ROOT / "frontend" / "src" / "components" / "PostQueue.jsx"
        text = ui.read_text(encoding="utf-8") if ui.exists() else ""
        dirty = [p for p in ("TODO", "console.log", "dark:", "bg-black", "gradient") if p in text]
        ck("frontend/src/components/PostQueue.jsx ada + bersih dari TODO/console.log/dark/gradien",
           ui.exists() and not dirty, f"pelanggaran={dirty}")
    finally:
        shutil.rmtree(HERE, ignore_errors=True)
        shutil.rmtree(CLIPS_DIR, ignore_errors=True)
        if saved_queue is None:
            QUEUE_FILE.unlink(missing_ok=True)
        else:
            QUEUE_FILE.write_bytes(saved_queue)

    print(f"\n{len(fails)} gagal")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
