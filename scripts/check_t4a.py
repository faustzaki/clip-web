"""scripts/check_t4a.py — cek T4a (export job: POST /api/export + GET /api/export/{id}).
Exit 0 kalau lulus.

Butuh server FastAPI hidup di 127.0.0.1:8000 dan ffmpeg di PATH. Skrip bikin project uji
sendiri (source testsrc 8s), mengekspor 720p & 1080p, lalu MENGHAPUS semua file uji
(work/<pid>/ + clips/<pid>/).

Jalankan dari root repo: py -3.13 scripts/check_t4a.py
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import time

import requests

BASE = "http://127.0.0.1:8000"
ROOT = pathlib.Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "docs" / "evidence" / "T4a"
WORDS = [
    {"word": "halo", "start": 1.0, "end": 1.4},
    {"word": "dunia", "start": 1.5, "end": 1.9},
    {"word": "klip", "start": 3.0, "end": 3.3},
]
SEGMENTS = [{"start": 0.5, "end": 4.5, "hook": "t4a cek ekspor", "overall": 9.0,
             "start_ms": 500, "end_ms": 4500}]
fails = []
ffprobe_lines = []
sha_lines = []
created_pids = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def ffprobe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,codec_name",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True).stdout.strip()
    ffprobe_lines.append(f"{pathlib.Path(path).name}\t{out}")
    return out


def sha256(path):
    h = hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    sha_lines.append(f"{h}  {pathlib.Path(path).name}")
    return h


def wait_job(job_id, timeout=120):
    deadline = time.time() + timeout
    job = {}
    while time.time() < deadline:
        job = requests.get(f"{BASE}/api/export/{job_id}", timeout=15).json()
        if job.get("status") in ("done", "failed"):
            return job
        time.sleep(2)
    return job


def make_project(title):
    r = requests.post(f"{BASE}/api/projects", json={"title": title}, timeout=15)
    pid = r.json()["project"]["id"]
    created_pids.append(pid)
    return pid


try:
    try:
        health = requests.get(f"{BASE}/api/health", timeout=10)
    except Exception as e:
        print(f"FAIL server tidak jalan di {BASE}: {e}")
        sys.exit(1)

    ck("GET /api/health 200 + ffmpeg", health.status_code == 200 and health.json().get("ffmpeg") is True,
       health.text[:120])

    # ---------- project uji + source buatan ----------
    pid = make_project("T4a check")
    pdir = ROOT / "work" / pid
    cdir = ROOT / "clips" / pid
    src = pdir / "source.mp4"
    proc = subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=8",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
         "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-shortest", str(src)],
        capture_output=True, text=True)
    ck("source uji dibuat", proc.returncode == 0 and src.exists(), src.name)

    (pdir / "transcript.json").write_text(json.dumps(
        {"language": "id", "duration": 8.0, "video": str(src), "words": WORDS}),
        encoding="utf-8")
    (pdir / "segments.json").write_text(json.dumps(SEGMENTS), encoding="utf-8")
    meta = json.loads((pdir / "project.json").read_text(encoding="utf-8"))
    meta["source_type"] = "local"
    (pdir / "project.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---------- regresi: route render lama tetap jalan ----------
    r = requests.post(f"{BASE}/api/projects/{pid}/render",
                      json={"candidate_index": 0, "do_tighten": False}, timeout=300)
    ck("POST /api/projects/{pid}/render 200 (tanpa regresi)", r.status_code == 200, r.text[:160])
    slug = (r.json().get("clip") or {}).get("slug") if r.status_code == 200 else None
    ck("klip hasil render punya slug", bool(slug), str(slug))
    if not slug:
        raise SystemExit(1)

    # ---------- export 720p (burn caption) ----------
    t0 = time.time()
    r = requests.post(f"{BASE}/api/export", json={
        "clip_id": slug, "resolution": "720p", "fps": 24,
        "burn_caption": True, "name": "T4a 720p"}, timeout=30)
    ck("POST /api/export 200 + job_id", r.status_code == 200 and r.json().get("job_id"), r.text[:160])
    job_id = r.json().get("job_id")
    job = wait_job(job_id) if job_id else {}
    print(f"  job 720p: {json.dumps(job)}  ({time.time() - t0:.1f}s)")
    ck("job 720p status done", job.get("status") == "done", str(job.get("status")))
    ck("job 720p error kosong", not job.get("error"), str(job.get("error")))
    ck("job 720p progress 100", job.get("progress") == 100, str(job.get("progress")))
    web_path = f"/clips/{pid}/{slug}_720p.mp4"
    ck("job 720p path web benar", job.get("path") == web_path, str(job.get("path")))

    f720 = cdir / f"{slug}_720p.mp4"
    ck("file 720p ada di clips/", f720.exists(), str(f720))
    dims720 = ffprobe(f720) if f720.exists() else ""
    ck("ffprobe 720p = 720x1280", dims720.split(",")[1:3] == ["720", "1280"], dims720)
    ck("ffprobe 720p fps 24", dims720.split(",")[3:4] == ["24/1"], dims720)

    dl = requests.get(f"{BASE}{web_path}", timeout=60)
    ck("unduh lewat path web 200 video/mp4",
       dl.status_code == 200 and dl.headers.get("content-type", "").startswith("video/mp4"),
       f"{dl.status_code} {dl.headers.get('content-type')}")

    # ---------- export 1080p (tanpa caption) ----------
    r = requests.post(f"{BASE}/api/export", json={
        "clip_id": slug, "resolution": "1080p", "fps": 30,
        "burn_caption": False, "name": "T4a 1080p"}, timeout=30)
    ck("POST /api/export 1080p 200", r.status_code == 200, r.text[:160])
    job2 = wait_job(r.json().get("job_id", "")) if r.status_code == 200 else {}
    ck("job 1080p status done", job2.get("status") == "done", str(job2.get("status")))
    f1080 = cdir / f"{slug}_1080p.mp4"
    dims1080 = ffprobe(f1080) if f1080.exists() else ""
    ck("ffprobe 1080p = 1080x1920", dims1080.split(",")[1:3] == ["1080", "1920"], dims1080)
    ck("ffprobe 1080p fps 30", dims1080.split(",")[3:4] == ["30/1"], dims1080)
    if f720.exists() and f1080.exists():
        ck("sha256 720p != 1080p", sha256(f720) != sha256(f1080))

    # ---------- klip tidak ada -> 404 ----------
    r = requests.post(f"{BASE}/api/export", json={"clip_id": "tidak-ada-klip",
                                                  "resolution": "720p", "fps": 30}, timeout=15)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ck("clip_id salah -> 404 {ok:false,reason}",
       r.status_code == 404 and body.get("ok") is False and bool(body.get("reason")),
       f"{r.status_code} {r.text[:160]}")

    # ---------- job gagal punya error ----------
    pid_bad = make_project("T4a check gagal")
    cdir_bad = ROOT / "clips" / pid_bad
    cdir_bad.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, cdir_bad / "orphan_clip.mp4")
    (cdir_bad / "orphan_clip.meta.json").write_text(
        json.dumps({"candidate_index": 0}), encoding="utf-8")
    r = requests.post(f"{BASE}/api/export", json={"clip_id": "orphan_clip",
                                                  "resolution": "720p", "fps": 30}, timeout=30)
    ck("export klip tanpa sumber tetap bikin job (bukan 500)", r.status_code == 200, r.text[:160])
    bad_job = wait_job(r.json().get("job_id", ""), timeout=60) if r.status_code == 200 else {}
    print(f"  job gagal: {json.dumps(bad_job)}")
    ck("job gagal status failed + error terisi",
       bad_job.get("status") == "failed" and bool(bad_job.get("error")), json.dumps(bad_job)[:200])

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "ffprobe.txt").write_text("\n".join(ffprobe_lines) + "\n", encoding="utf-8")
    (EVIDENCE / "sha256.txt").write_text("\n".join(sha_lines) + "\n", encoding="utf-8")
finally:
    for pid in created_pids:
        try:
            requests.delete(f"{BASE}/api/projects/{pid}", timeout=15)
        except Exception:
            pass
        for leftover in (ROOT / "work" / pid, ROOT / "clips" / pid):
            if leftover.exists():
                shutil.rmtree(leftover, ignore_errors=True)

    leftovers = []
    for pid in created_pids:
        for d in (ROOT / "work" / pid, ROOT / "clips" / pid):
            if d.exists():
                leftovers.append(str(d))
    ck("file uji dibersihkan dari work/ dan clips/", not leftovers, ", ".join(leftovers))

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
