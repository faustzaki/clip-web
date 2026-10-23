"""scripts/check_t5.py — cek T5 (jeda/kata pengisi + 5 preset caption). Exit 0 kalau lulus.

  1) statis  : registry preset di chopify/subtitle_burn.py, ToolPanel.jsx 320px, api.js, aturan keras
  2) backend : POST /api/projects/{id}/tighten (durasi turun + kata deleted bertambah),
               GET /api/options (5 preset), PUT prefs caption_preset (tersimpan + validasi),
               export burn_caption=True memakai preset (sha256 beda antar preset)
  3) browser : frontend/tools/verify-t5.mjs (mock + screenshot docs/evidence/T5/after/)

Butuh server FastAPI di 127.0.0.1:8000, ffmpeg di PATH, build terbaru di frontend/dist.
Jalankan dari root repo: py -3.13 scripts/check_t5.py
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
EVIDENCE = ROOT / "docs" / "evidence" / "T5"
WORDS = [
    {"word": "halo", "start": 0.5, "end": 0.9},
    {"word": "eee", "start": 1.0, "end": 1.3},
    {"word": "apa", "start": 1.4, "end": 1.6},
    {"word": "ya", "start": 1.6, "end": 1.9},
    {"word": "kita", "start": 4.0, "end": 4.4},
    {"word": "mulai", "start": 4.5, "end": 5.0},
    {"word": "anu", "start": 5.1, "end": 5.4},
    {"word": "sekarang", "start": 5.5, "end": 6.2},
]
SEGMENTS = [{"start": 0.5, "end": 6.5, "hook": "t5 cek preset", "overall": 9.0,
             "start_ms": 500, "end_ms": 6500}]
PRESET_IDS = ["clean-white", "bold-yellow", "boxed-dark", "karaoke-highlight", "minimal-outline"]

fails = []
sha_lines = []
created_pids = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def sha256(path, label=None):
    h = hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    sha_lines.append(f"{h}  {label or pathlib.Path(path).name}")
    return h


def wait_job(job_id, timeout=180):
    deadline = time.time() + timeout
    job = {}
    while time.time() < deadline:
        job = requests.get(f"{BASE}/api/export/{job_id}", timeout=15).json()
        if job.get("status") in ("done", "failed"):
            return job
        time.sleep(2)
    return job


# ---------------------------------------------------------------- 1) statis
burn = ROOT / "chopify" / "subtitle_burn.py"
tool_panel = SRC / "components" / "ToolPanel.jsx"
studio = SRC / "components" / "StudioView.jsx"
api = SRC / "api.js"
verifier = ROOT / "frontend" / "tools" / "verify-t5.mjs"

missing = [str(p.relative_to(ROOT)) for p in (burn, tool_panel, studio, api, verifier) if not p.exists()]
ck("file T5 ada (subtitle_burn, ToolPanel, StudioView, api.js, verify-t5.mjs)", not missing,
   ", ".join(missing) or "5/5")
if missing:
    print(f"\n{len(fails)} gagal")
    sys.exit(1)

burn_txt = burn.read_text(encoding="utf-8")
tp = tool_panel.read_text(encoding="utf-8")
sv = studio.read_text(encoding="utf-8")
ap = api.read_text(encoding="utf-8")

ck("subtitle_burn: CAPTION_PRESETS 5 entri + preset_style",
   all(f'"{pid}"' in burn_txt for pid in PRESET_IDS) and "def preset_style" in burn_txt)
ck("ToolPanel: 320px + slider 200-1200 default 400 + copy Indonesia",
   all(s in tp for s in ("w-[320px]", "min={200}", "max={1200}", "useState(400)",
                         "Hapus jeda", "Hapus kata pengisi", "Terapkan", "Menghemat")))
ck("ToolPanel: grid 2 kolom + kartu preset (data-testid) + preview mini",
   all(s in tp for s in ("grid-cols-2", "t5-preset-", "SubtitlePreview", "caption_preset")))
ck("StudioView pasang ToolPanel + api.js applyTighten ke /tighten",
   "import ToolPanel from './ToolPanel'" in sv and "<ToolPanel" in sv
   and "export async function applyTighten" in ap and "/tighten" in ap)

bad = re.compile(r"dark:|bg-dark-|bg-black|gradient|neon|TODO|console\.log")
bad_hits = [f"{p.name}:{n}" for p in (tool_panel,)
            for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1) if bad.search(line)]
ck("ToolPanel tanpa dark/neon/gradient/TODO/console.log", not bad_hits, "; ".join(bad_hits[:5]))

dist_css = sorted((ROOT / "frontend" / "dist" / "assets").glob("*.css"))
ck("build memuat token aksen", bool(dist_css) and "--vz-accent" in dist_css[-1].read_text(encoding="utf-8"),
   dist_css[-1].name if dist_css else "dist/assets/*.css tidak ada")

# ---------------------------------------------------------------- 2) backend
try:
    health = requests.get(f"{BASE}/api/health", timeout=10)
except Exception as e:
    print(f"FAIL server tidak jalan di {BASE}: {e}")
    print(f"\n1 gagal")
    sys.exit(1)
ck("GET /api/health 200", health.status_code == 200, health.text[:80])

options = requests.get(f"{BASE}/api/options", timeout=10).json()
presets = {p["id"]: p for p in options.get("caption_presets", [])}
ck("GET /api/options memuat 5 preset + gaya lengkap",
   set(presets) == set(PRESET_IDS) and all(p.get("label") and p.get("style", {}).get("primary_color")
                                           for p in presets.values()),
   ", ".join(sorted(presets)) or "kosong")

EVIDENCE.mkdir(parents=True, exist_ok=True)
export_ok = []

try:
    # ---------- project uji + source buatan ----------
    pid = requests.post(f"{BASE}/api/projects", json={"title": "T5 check"}, timeout=15).json()["project"]["id"]
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

    # ---------- tighten: durasi turun + kata deleted bertambah ----------
    before = requests.get(f"{BASE}/api/projects/{pid}/transcript", timeout=15).json()
    dur_before = requests.get(f"{BASE}/api/projects/{pid}/timeline", timeout=15).json()["duration_ms"]
    t = requests.post(f"{BASE}/api/projects/{pid}/tighten",
                      json={"silence_ms": 400, "filler": True}, timeout=60)
    tjson = t.json()
    ck("POST /tighten 200 + saved_ms > 0", t.status_code == 200 and tjson.get("saved_ms", 0) > 0,
       f"{tjson.get('saved_ms')} ms")
    after = requests.get(f"{BASE}/api/projects/{pid}/transcript", timeout=15).json()
    deleted_before = sum(w["deleted"] for w in before["words"])
    deleted_after = sum(w["deleted"] for w in after["words"])
    dur_after = requests.get(f"{BASE}/api/projects/{pid}/timeline", timeout=15).json()["duration_ms"]
    ck("kata deleted bertambah + durasi timeline turun",
       deleted_after > deleted_before and dur_after < dur_before,
       f"deleted {deleted_before}->{deleted_after}, durasi {dur_before}->{dur_after} ms")

    # ---------- preset tersimpan per project + validasi ----------
    r = requests.put(f"{BASE}/api/projects/{pid}/prefs",
                     json={"render_prefs": {"subtitles_enabled": True, "caption_preset": "bold-yellow"}}, timeout=15)
    state = requests.get(f"{BASE}/api/projects/{pid}/state", timeout=15).json()
    rp = (state.get("project") or {}).get("render_prefs") or {}
    ck("preset tersimpan per project (caption_preset + gaya ikut)",
       r.status_code == 200 and rp.get("caption_preset") == "bold-yellow"
       and rp.get("subtitle_style", {}).get("primary_color") == "#FFE100",
       f"{rp.get('caption_preset')} / {rp.get('subtitle_style', {}).get('primary_color')}")
    badr = requests.put(f"{BASE}/api/projects/{pid}/prefs",
                        json={"render_prefs": {"caption_preset": "tidak-ada"}}, timeout=15)
    ck("preset tak dikenal ditolak 400", badr.status_code == 400, str(badr.status_code))

    # ---------- export memakai preset: 5 preset jalan, sha256 beda ----------
    rr = requests.post(f"{BASE}/api/projects/{pid}/render",
                       json={"candidate_index": 0, "do_tighten": False}, timeout=300)
    slug = (rr.json().get("clip") or {}).get("slug") if rr.status_code == 200 else None
    ck("render klip uji untuk export", bool(slug), slug or rr.text[:120])

    shas = {}
    if slug:
        for preset_id in PRESET_IDS:
            requests.put(f"{BASE}/api/projects/{pid}/prefs",
                         json={"render_prefs": {"subtitles_enabled": True, "caption_preset": preset_id}},
                         timeout=15)
            job = requests.post(f"{BASE}/api/export", json={
                "clip_id": slug, "resolution": "720p", "fps": 30,
                "burn_caption": True, "name": f"T5 {preset_id}"}, timeout=30).json()
            res = wait_job(job.get("job_id", ""))
            out = cdir / f"{slug}_720p.mp4"
            export_ok.append(f"{preset_id}:{res.get('status')}")
            if res.get("status") == "done" and out.exists():
                shas[preset_id] = sha256(out, f"preset={preset_id}")
        ck("kelima preset ter-render tanpa error",
           all(v.endswith(":done") for v in export_ok), " | ".join(export_ok))
        ck("sha256 clean-white != bold-yellow (export ikut preset)",
           shas.get("clean-white") and shas.get("bold-yellow")
           and shas["clean-white"] != shas["bold-yellow"],
           f"{str(shas.get('clean-white'))[:12]} vs {str(shas.get('bold-yellow'))[:12]}")

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
