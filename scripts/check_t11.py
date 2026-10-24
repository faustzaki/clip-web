"""scripts/check_t11.py — cek T11 (brand kit: logo/warna/font/intro/outro). Exit 0 kalau lulus.

Jalankan dari root repo: `py -3.13 scripts/check_t11.py`
Menguji: kontrak /api/brand, validasi nilai, unggah logo/intro/outro, render nyata
dengan vs tanpa brand kit (sha256 berbeda, logo di sudut pilihan, alpha transparan utuh),
warna caption mengikuti color_primary, intro/outro ter-concat (durasi ffprobe), aturan repo.
Semua berkas brand ditulis ke folder sementara — data/brand.json milik user tidak disentuh.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "chopify"))

import render_clips  # noqa: E402
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PID = "abcdef1101"
HERE = ROOT / "work" / "_t11check"
EVID = ROOT / "docs" / "evidence" / "T11"
FRAMES = EVID / "after"
fails = []

def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)

def ff(*args):
    return subprocess.run(["ffmpeg", "-v", "error", *args], capture_output=True, check=True)

def probe(path):
    return subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=index,codec_type,codec_name,width,height",
         "-show_entries", "format=duration,size", "-of", "default=nw=1", str(path)],
        capture_output=True, text=True).stdout

def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout
    return float(out.strip() or 0)

def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def patch_mean(path, t, x, y, n=8):
    """Rata-rata warna patch n x n (tahan beda QP encoder, tidak seperti satu piksel)."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
         "-vf", f"crop={n}:{n}:{x}:{y},scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True).stdout
    return tuple(raw[:3])

def count_pixels(path, t, pred, scale=1):
    """Jumlah piksel yang lolos predikat pada frame detik t (opsional di-scale lebih kecil)."""
    vf = "" if scale == 1 else f"scale=iw/{scale}:ih/{scale},"
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
         "-vf", vf + "format=rgb24", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return sum(1 for i in range(0, len(raw) - 2, 3)
               if pred(raw[i], raw[i + 1], raw[i + 2]))

def build_fixture():
    """Project 6 detik + logo transparan (kotak hijau di tengah) + intro/outro berbeda ukuran."""
    shutil.rmtree(HERE, ignore_errors=True)
    HERE.mkdir(parents=True, exist_ok=True)
    src = HERE / "source.mp4"
    ff("-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=6",
       "-f", "lavfi", "-i", "sine=frequency=220:duration=6",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac",
       "-shortest", str(src))

    logo = HERE / "logo.png"
    ff("-y", "-f", "lavfi", "-i", "color=c=0x00E000:s=80x80:d=1",
       "-vf", "format=rgba,pad=160:160:40:40:color=black@0", "-frames:v", "1", str(logo))

    intro, outro = HERE / "intro.mp4", HERE / "outro.mp4"
    ff("-y", "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=30:d=2",
       "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac",
       "-shortest", str(intro))
    ff("-y", "-f", "lavfi", "-i", "color=c=red:s=1920x1080:r=25:d=1.5",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-an", str(outro))

    pdir = ROOT / "work" / PID
    pdir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, pdir / "source.mp4")
    (pdir / "project.json").write_text(json.dumps({
        "id": PID, "title": "Uji T11", "source_type": "upload", "source_url": None,
        "render_prefs": dict(server.DEFAULT_RENDER_PREFS),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    words = [{"word": "pantai", "start": 0.4, "end": 0.8},
             {"word": "senja", "start": 0.9, "end": 1.3},
             {"word": "kopi", "start": 1.4, "end": 1.8},
             {"word": "hangat", "start": 3.0, "end": 3.4}]
    (pdir / "transcript.json").write_text(json.dumps(
        {"language": "id", "duration": 6.0, "model": "medium", "words": words},
        ensure_ascii=False, indent=2), encoding="utf-8")
    (pdir / "segments.json").write_text(json.dumps([
        {"id": 0, "hook": "uji-brand", "start": 0.0, "end": 6.0, "overall": 9.0, "keywords": ["pantai"]},
    ], ensure_ascii=False, indent=2), encoding="utf-8")
    return logo, intro, outro, words

def main():
    FRAMES.mkdir(parents=True, exist_ok=True)
    brand_tmp = Path(tempfile.mkdtemp(prefix="t11brand_"))
    saved_brand = (server.BRAND_DIR, server.BRAND_FILE)
    server.BRAND_DIR = brand_tmp
    server.BRAND_FILE = brand_tmp / "brand.json"
    client = TestClient(server.app)
    logo, intro, outro, words = build_fixture()
    src = HERE / "source.mp4"

    try:
        # 1. kontrak GET /api/brand (tanpa brand.json → default, bukan error)
        r = client.get("/api/brand")
        body = r.json()
        brand0 = body.get("brand") or {}
        keys = set(server.DEFAULT_BRAND)
        ck("GET /api/brand 200 + default lengkap + 3 font + 4 sudut (prasyarat overlay ada)",
           r.status_code == 200 and body.get("ok") is True and body.get("configured") is False
           and keys <= set(brand0) and len(body.get("fonts") or []) == 3
           and sorted(body.get("corners") or []) == ["bl", "br", "tl", "tr"]
           and server.overlay_supported(),
           f"status={r.status_code} configured={body.get('configured')} fonts={body.get('fonts')}")

        # 2. validasi: hex salah → 400, nilai benar → tersimpan di brand.json
        bad = client.post("/api/brand", json={"color_primary": "biru"})
        ok = client.post("/api/brand", json={"color_primary": "#FF00FF", "color_secondary": "#4822A5",
                                            "font": "Impact", "logo_corner": "br", "logo_size_pct": 8})
        stored = json.loads(server.BRAND_FILE.read_text(encoding="utf-8"))
        ck("POST /api/brand: nilai ngawur 400, nilai valid tersimpan",
           bad.status_code == 400 and ok.status_code == 200
           and stored["color_primary"] == "#FF00FF" and stored["font"] == "Impact"
           and stored["logo_corner"] == "br" and stored["logo_size_pct"] == 8,
           f"bad={bad.status_code} ok={ok.status_code} stored={stored}")

        # 3. unggah logo + intro + outro → berkas ada di folder brand, URL muncul di UI payload
        def upload(kind, path):
            with path.open("rb") as fh:
                return client.post("/api/brand/upload", data={"kind": kind},
                                   files={"file": (path.name, fh, "application/octet-stream")})
        up_logo, up_intro, up_outro = upload("logo", logo), upload("intro", intro), upload("outro", outro)
        uploaded = client.get("/api/brand").json().get("brand") or {}
        files = [uploaded.get(k) for k in ("logo_path", "intro_path", "outro_path")]
        # mount /brand harus benar-benar melayani berkas (dipakai <img> stage & tab Brand)
        probe_file = ROOT / "data" / "brand" / "probe-t11.svg"
        probe_file.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
                              encoding="utf-8")
        try:
            served = client.get("/brand/probe-t11.svg")
        finally:
            probe_file.unlink(missing_ok=True)
        ck("unggah logo/intro/outro: 3 berkas tersimpan + URL terisi + mount /brand melayani berkas",
           all(x.status_code == 200 for x in (up_logo, up_intro, up_outro))
           and all(files) and all((server.BRAND_DIR / f).is_file() for f in files)
           and all(uploaded.get(k) for k in ("logo_url", "intro_url", "outro_url"))
           and served.status_code == 200 and b"<svg" in served.content,
           f"berkas={files} mount={served.status_code}")

        # 4. render tanpa brand vs dengan brand → sha256 berbeda (export ikut lewat jalur ini)
        def render_clip(hook=None):
            payload = {"candidate_index": 0, "do_tighten": False, "crop_mode": "center", "aspect": "9:16"}
            if hook:
                payload["custom_hook"] = hook
            clip = client.post(f"/api/projects/{PID}/render", json=payload).json().get("clip") or {}
            return ROOT / "clips" / PID / "raw" / (clip.get("name") or "x.mp4")

        brand_backup = server.BRAND_FILE.read_text(encoding="utf-8")
        server.BRAND_FILE.unlink()                     # jalur "tanpa brand kit"
        out_a = render_clip()
        server.BRAND_FILE.write_text(brand_backup, encoding="utf-8")
        out_b = render_clip(hook="brand")              # jalur brand kit (logo + intro/outro)
        digest_a, digest_b = sha256(out_a), sha256(out_b)
        (EVID / "sha256.txt").write_text(
            f"# T11 — bukti hasil render berbeda (project {PID}, segmen 0-6 s, 9:16 1080x1920)\n"
            f"{digest_a}  {out_a.name}   (tanpa brand kit)\n"
            f"{digest_b}  {out_b.name}   (logo di sudut br + intro 2 s + outro 1.5 s)\n",
            encoding="utf-8")
        ck("render tanpa brand vs dengan brand: sha256 berbeda",
           out_a.is_file() and out_b.is_file() and out_a != out_b and digest_a != digest_b,
           f"a={digest_a[:12]} b={digest_b[:12]}")

        # 5. logo di sudut br (hijau) + area transparan tetap video asli (bukan kotak hitam)
        th = 1920
        logo_h = max(8, round(th * 8 / 100))
        margin = max(4, round(server.LOGO_MARGIN_PX * th / 1920))
        gx = 1080 - logo_h - margin + logo_h // 2      # tengah kotak hijau (25%-75% logo)
        gy = th - logo_h - margin + logo_h // 2
        tx = 1080 - logo_h - margin + 6                # zona transparan logo (tepi kiri atas logo)
        ty = th - logo_h - margin + 6
        # out_b = intro 2 s + klip; sampel di 4.5 s sebanding dengan 2.5 s di out_a
        green = patch_mean(out_b, 4.5, gx, gy)
        see_through = patch_mean(out_b, 4.5, tx, ty)
        base = patch_mean(out_a, 2.5, tx, ty)
        greenish = green[1] > 120 and green[0] < 110 and green[2] < 110
        transparent = all(abs(a - b) <= 30 for a, b in zip(see_through, base))
        ff("-y", "-ss", "4.50", "-i", str(out_b), "-frames:v", "1", str(FRAMES / "frame-brand-sudut-br.png"))
        ff("-y", "-ss", "2.50", "-i", str(out_a), "-frames:v", "1", str(FRAMES / "frame-tanpa-brand.png"))
        ck("logo tampil di sudut br (hijau) & area transparan tidak jadi kotak hitam",
           greenish and transparent,
           f"logo={green} tembus={see_through} dasar={base}")

        # 6. warna caption mengikuti color_primary (#FF00FF) — jalur render yang dipakai export
        prefs_style = dict(server.DEFAULT_RENDER_PREFS["subtitle_style"])
        seg = {"start": 0.0, "end": 6.0, "hook": "warna"}
        magenta = lambda r, g, b: r > 150 and b > 150 and g < 110
        cap_on = HERE / "cap_brand.mp4"
        render_clips.render(seg=seg, words=words, source=src, W=640, H=360, workdir=HERE,
                            aspect="9:16", out_dir=HERE, raw_subdir="", do_tighten=False, crop_mode="center",
                            burn_caption=True, preview=True, out_name="cap_brand.mp4",
                            subtitle_style=server.brand_style(prefs_style))
        cap_off = HERE / "cap_plain.mp4"
        server.BRAND_FILE.unlink()
        render_clips.render(seg=seg, words=words, source=src, W=640, H=360, workdir=HERE,
                            aspect="9:16", out_dir=HERE, raw_subdir="", do_tighten=False, crop_mode="center",
                            burn_caption=True, preview=True, out_name="cap_plain.mp4",
                            subtitle_style=server.brand_style(prefs_style))
        magenta_on = count_pixels(cap_on, 1.0, magenta, scale=1)
        magenta_off = count_pixels(cap_off, 1.0, magenta, scale=1)
        client.post("/api/brand", json={**stored, "logo_path": uploaded["logo_path"],
                                        "intro_path": uploaded["intro_path"],
                                        "outro_path": uploaded["outro_path"]})
        ck("warna caption ikut color_primary (#FF00FF) hanya saat brand kit aktif",
           magenta_on > 200 and magenta_off == 0,
           f"magenta_with_brand={magenta_on} tanpa_brand={magenta_off}")

        # 7. intro/outro ter-concat: 2 s + 6 s + 1.5 s, audio tetap ada
        total = duration(out_b)
        probe_txt = probe(out_b)
        (EVID / "ffprobe.txt").write_text(
            f"# T11 — ffprobe hasil render dengan brand (logo + intro 2 s + klip 6 s + outro 1.5 s)\n"
            f"# {out_b.relative_to(ROOT).as_posix()}\n{probe_txt}\n"
            f"# durasi terbaca: {total:.3f} s (harus ≈ 9.5 s)\n", encoding="utf-8")
        has_audio = "codec_type=audio" in probe_txt
        ck("intro/outro ter-concat: durasi ≈ intro+klip+outro & audio tetap ada",
           abs(total - 9.5) < 0.35 and has_audio, f"durasi={total:.3f}s audio={has_audio}")

        # 8. aturan repo pada berkas yang disentuh
        touched = ["server.py", "chopify/render_clips.py", "frontend/src/api.js",
                   "frontend/src/components/SettingsModal.jsx"]
        # PreviewStage.jsx: `bg-black` letterbox frame video sudah ada sebelum T11 (bukan diff T11),
        # jadi yang dicek di sana hanya TODO/console.log/dark:/bg-dark.
        bad = []
        for f in touched + ["frontend/src/components/PreviewStage.jsx"]:
            text = (ROOT / f).read_text(encoding="utf-8")
            pattern = r"TODO|console\.log|bg-dark|dark:" if f.endswith("PreviewStage.jsx") \
                else r"TODO|console\.log|bg-dark|bg-black|dark:"
            hits = re.findall(pattern, text)
            if hits:
                bad.append(f"{f}:{sorted(set(hits))}")
        ck("tanpa TODO/console.log/dark theme di berkas yang disentuh", not bad, "; ".join(bad))
    finally:
        (server.BRAND_DIR, server.BRAND_FILE) = saved_brand
        shutil.rmtree(brand_tmp, ignore_errors=True)
        shutil.rmtree(ROOT / "work" / PID, ignore_errors=True)
        shutil.rmtree(ROOT / "clips" / PID, ignore_errors=True)
        shutil.rmtree(HERE, ignore_errors=True)

    print(f"\n{len(fails)} gagal")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
