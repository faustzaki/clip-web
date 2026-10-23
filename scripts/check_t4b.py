"""scripts/check_t4b.py — cek T4b (Export modal + polling + pemicu di clip strip). Exit 0 kalau lulus.

Bagian yang dicek:
  1) statis  : kontrak file (ExportModal/api/ClipStrip/StudioView), angka & copy wajib, aturan keras
  2) backend : burn_caption on/off -> dua file berbeda (sha256), unduh 200 video/mp4
  3) browser : frontend/tools/verify-t4b.mjs (buka modal -> export -> link unduh -> Esc fokus balik)

Butuh server FastAPI hidup di 127.0.0.1:8000, ffmpeg di PATH, build frontend terbaru di frontend/dist.
Skrip bikin project uji sendiri (source testsrc 8s) lalu MENGHAPUS semua file uji.

Jalankan dari root repo: py -3.13 scripts/check_t4b.py
"""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import time

import requests

BASE = "http://127.0.0.1:8000"
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
EVIDENCE = ROOT / "docs" / "evidence" / "T4b"
WORDS = [
    {"word": "halo", "start": 1.0, "end": 1.4},
    {"word": "dunia", "start": 1.5, "end": 1.9},
    {"word": "klip", "start": 3.0, "end": 3.3},
]
SEGMENTS = [{"start": 0.5, "end": 4.5, "hook": "t4b cek ekspor", "overall": 9.0,
             "start_ms": 500, "end_ms": 4500}]

fails = []
sha_lines = []
created_pids = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


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


def export(clip_id, resolution, fps, burn_caption):
    r = requests.post(f"{BASE}/api/export", json={
        "clip_id": clip_id, "resolution": resolution, "fps": fps,
        "burn_caption": burn_caption, "name": f"T4b {resolution}"}, timeout=30)
    if r.status_code != 200 or not r.json().get("job_id"):
        return {}, r.text[:160]
    return wait_job(r.json()["job_id"]), ""


# ---------------------------------------------------------------- 1) statis
export_modal = SRC / "components" / "ExportModal.jsx"
clip_strip = SRC / "components" / "ClipStrip.jsx"
studio = SRC / "components" / "StudioView.jsx"
api = SRC / "api.js"
verifier = ROOT / "frontend" / "tools" / "verify-t4b.mjs"
css = SRC / "index.css"

missing = [str(p.relative_to(ROOT)) for p in (export_modal, clip_strip, studio, api, verifier) if not p.exists()]
ck("file T4b ada (ExportModal, ClipStrip, StudioView, api.js, verify-t4b.mjs)", not missing,
   ", ".join(missing) or "5/5")
if missing:
    print(f"\n{len(fails)} gagal")
    sys.exit(1)

em = export_modal.read_text(encoding="utf-8")
cs = clip_strip.read_text(encoding="utf-8")
sv = studio.read_text(encoding="utf-8")
ap = api.read_text(encoding="utf-8")
ic = css.read_text(encoding="utf-8")

ck("api.js: startExport + getExport",
   "export async function startExport" in ap and "export async function getExport" in ap
   and "/api/export" in ap and "clip_id" in ap)
ck("ExportModal props open/clip/onClose/onStart",
   re.search(r"function ExportModal\(\{\s*open,\s*clip,\s*onClose,\s*onStart\s*\}\)", em) is not None)
ck("ExportModal: 480px + radius 12 + shadow-vz-lg + role=dialog + overlay token",
   all(s in em for s in ('w-[480px]', 'rounded-vz-xl', 'shadow-vz-lg', 'role="dialog"', 'var(--vz-overlay)'))
   and "--vz-overlay: rgba(0, 0, 0, 0.48)" in ic)
ck("ExportModal: Esc + klik overlay menutup",
   "e.key === 'Escape'" in em and "e.target === e.currentTarget" in em)
ck("ExportModal: polling 2000ms + batas 5 menit + pesan timeout",
   "POLL_MS = 2000" in em and "POLL_LIMIT_MS = 5 * 60 * 1000" in em and "Terlalu lama, coba lagi" in em)
ck("ExportModal: field nama/resolusi/fps/bakar caption/format mp4/estimasi ukuran",
   all(s in em for s in ("Nama file", "'1080p', '720p'", "[30, 24]", "Bakar caption",
                         'defaultValue="mp4"', "Perkiraan ukuran")))
ck("ExportModal: state form/submitting/running/done/failed + copy Indonesia",
   all(s in em for s in ("'form'", "'submitting'", "'running'", "'done'", "'failed'",
                         "Menyiapkan klip…", "Coba lagi", "Klip siap. Unduh", "Memulai…")))
ck("ExportModal: footer Batal/Export via vz-btn 40px",
   all(s in em for s in ("Batal", "'Export'", "vz-btn vz-btn--primary", "vz-btn vz-btn--secondary")))
ck("ClipStrip: pemicu unduh buka modal + kirim elemen pemicu",
   'aria-label={`Unduh klip ${title}`}' in cs and "onDownload?.(clip, e.currentTarget)" in cs)
ck("StudioView: pasang ExportModal + fokus balik ke pemicu",
   "import ExportModal from './ExportModal'" in sv and "<ExportModal" in sv
   and "exportTriggerRef.current = triggerEl" in sv and "exportTriggerRef.current?.focus()" in sv)

# aturan keras: tanpa tema gelap/neon, tanpa TODO/console.log
NEW_BAD = re.compile(r"dark:|bg-dark-|bg-black|gradient|neon|TODO|console\.log")
OLD_BAD = re.compile(r"dark:|bg-dark-|gradient|neon|TODO|console\.log")
bad = [
    f"{p.name}:{n}"
    for p, rx in ((export_modal, NEW_BAD), (clip_strip, OLD_BAD), (studio, OLD_BAD), (api, OLD_BAD))
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
    if rx.search(line)
]
ck("tanpa dark/neon/gradient/TODO/console.log", not bad, "; ".join(bad[:6]))

dist_css = sorted((ROOT / "frontend" / "dist" / "assets").glob("*.css"))
ck("build memuat token aksen", bool(dist_css) and "--vz-accent" in dist_css[-1].read_text(encoding="utf-8"),
   dist_css[-1].name if dist_css else "dist/assets/*.css tidak ada")

# ---------------------------------------------------------------- 2) backend
try:
    health = requests.get(f"{BASE}/api/health", timeout=10)
except Exception as e:
    print(f"FAIL server tidak jalan di {BASE}: {e}")
    fails.append("server hidup")
    print(f"\n{len(fails)} gagal")
    sys.exit(1)

ck("GET /api/health 200 + ffmpeg", health.status_code == 200 and health.json().get("ffmpeg") is True,
   health.text[:120])

try:
    # ---------- project uji + source buatan ----------
    r = requests.post(f"{BASE}/api/projects", json={"title": "T4b check"}, timeout=15)
    pid = r.json()["project"]["id"]
    created_pids.append(pid)
    pdir = ROOT / "work" / pid
    cdir = ROOT / "clips" / pid
    src = pdir / "source.mp4"
    proc = subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=8",
         "-f", "lavfi", "-i", "sine=440:duration=8",
         "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-shortest", str(src)],
        capture_output=True, text=True)
    ck("source uji dibuat", proc.returncode == 0 and src.exists(), src.name)

    (pdir / "transcript.json").write_text(json.dumps(
        {"language": "id", "duration": 8.0, "video": str(src), "words": WORDS}), encoding="utf-8")
    (pdir / "segments.json").write_text(json.dumps(SEGMENTS), encoding="utf-8")
    meta = json.loads((pdir / "project.json").read_text(encoding="utf-8"))
    meta["source_type"] = "local"
    (pdir / "project.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    r = requests.post(f"{BASE}/api/projects/{pid}/render",
                      json={"candidate_index": 0, "do_tighten": False}, timeout=300)
    slug = (r.json().get("clip") or {}).get("slug") if r.status_code == 200 else None
    ck("render klip untuk pemicu strip", bool(slug), str(slug))

    if slug:
        # ---------- 3) browser: verify-t4b.mjs (project uji = kartu pertama) ----------
        # Dijalankan sebelum export backend supaya strip hanya berisi klip raw (kartu pertama = klip segar).
        run = subprocess.run(["node", "tools/verify-t4b.mjs"], cwd=ROOT / "frontend",
                             capture_output=True, text=True, timeout=600)
        print(run.stdout.strip())
        if run.stderr.strip():
            print(run.stderr.strip()[-400:])
        ck("verify-t4b.mjs (buka modal -> export -> unduh -> Esc fokus balik)", run.returncode == 0,
           f"exit {run.returncode}")

        # ---------- burn_caption off vs on -> sha256 beda ----------
        off, err = export(slug, "720p", 30, False)
        ck("export burn_caption=False status done", off.get("status") == "done",
           off.get("status") or err)
        f720 = cdir / f"{slug}_720p.mp4"
        sha_off = sha256(f720) if f720.exists() else None

        on, err = export(slug, "720p", 30, True)
        ck("export burn_caption=True status done", on.get("status") == "done",
           on.get("status") or err)
        sha_on = sha256(f720) if f720.exists() else None
        ck("sha256 burn_caption off != on", bool(sha_off and sha_on) and sha_off != sha_on,
           f"{str(sha_off)[:12]} vs {str(sha_on)[:12]}")

        if on.get("path"):
            dl = requests.get(f"{BASE}{on['path']}", timeout=60)
            ck("unduh path web 200 video/mp4",
               dl.status_code == 200 and dl.headers.get("content-type", "").startswith("video/mp4"),
               f"{dl.status_code} {dl.headers.get('content-type')}")

    EVIDENCE.mkdir(parents=True, exist_ok=True)
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

    leftovers = [str(d) for pid in created_pids
                 for d in (ROOT / "work" / pid, ROOT / "clips" / pid) if d.exists()]
    ck("file uji dibersihkan dari work/ dan clips/", not leftovers, ", ".join(leftovers))

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
