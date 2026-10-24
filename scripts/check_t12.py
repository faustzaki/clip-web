"""scripts/check_t12.py — cek T12 (latar + susunan ulang / reframe). Exit 0 kalau lulus.

Jalankan dari root repo: `py -3.13 scripts/check_t12.py`
Menguji: prasyarat ffmpeg `boxblur`, validasi prefs (layout/bg_fill/bg_color/offset_y),
tiga susunan menghasilkan tiga berkas berbeda, source 16:9 -> 9:16 tanpa black bar,
isi latar Warna/Hitam benar-benar terlihat, susunan Kotak menyisakan latar di tepi,
offset_y menggeser subjek sesuai persen tinggi frame, nilai bertahan di state project,
dan aturan repo (tanpa TODO/console.log/dark theme) di berkas yang disentuh.
Fixture ditulis di work/_t12check; prefs project terpisah (PID sendiri).
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "chopify"))

import render_clips  # noqa: E402
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PID = "abcdef1201"
HERE = ROOT / "work" / "_t12check"
EVID = ROOT / "docs" / "evidence" / "T12"
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
        ["ffprobe", "-v", "error", "-show_entries", "stream=index,codec_type,width,height",
         "-show_entries", "format=duration,size", "-of", "default=nw=1", str(path)],
        capture_output=True, text=True).stdout

def dims(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
        capture_output=True, text=True).stdout.strip()
    w, h = out.split("x")[:2]
    return int(w), int(h)

def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def count_pixels(path, t, pred, scale=1):
    """Jumlah piksel yang lolos predikat pada frame detik t (opsional di-scale lebih kecil)."""
    vf = "" if scale == 1 else f"scale=iw/{scale}:ih/{scale},"
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
         "-vf", vf + "format=rgb24", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return sum(1 for i in range(0, len(raw) - 2, 3)
               if pred(raw[i], raw[i + 1], raw[i + 2]))

def patch_mean(path, t, x, y, n=8):
    """Rata-rata warna patch n x n (tahan beda QP encoder, tidak seperti satu piksel)."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
         "-vf", f"crop={n}:{n}:{x}:{y},scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True).stdout
    return tuple(raw[:3])

def column_ys(path, t, x, pred):
    """Baris (y) pada kolom x yang lolos predikat — dipakai mengukur posisi/ukuran subjek."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
         "-vf", f"crop=1:ih:{x}:0,format=rgb24", "-f", "rawvideo", "-"],
        capture_output=True, check=True).stdout
    return [i // 3 for i in range(0, len(raw) - 2, 3)
            if pred(raw[i], raw[i + 1], raw[i + 2])]

def build_fixture():
    """Source 16:9 640x360 berwarna rata hijau: video utama mudah dibedakan dari latar."""
    shutil.rmtree(HERE, ignore_errors=True)
    HERE.mkdir(parents=True, exist_ok=True)
    src = HERE / "source.mp4"
    ff("-y", "-f", "lavfi", "-i", "color=c=0x00E000:s=640x360:d=4:r=30",
       "-f", "lavfi", "-i", "sine=frequency=220:duration=4",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-shortest", str(src))
    pdir = ROOT / "work" / PID
    pdir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, pdir / "source.mp4")
    (pdir / "project.json").write_text(json.dumps({
        "id": PID, "title": "Uji T12", "source_type": "upload", "source_url": None,
        "created_at": 1750000000.0,
        "render_prefs": dict(server.DEFAULT_RENDER_PREFS),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    words = [{"word": "latar", "start": 0.4, "end": 0.8}, {"word": "susunan", "start": 1.0, "end": 1.5}]
    (pdir / "transcript.json").write_text(json.dumps(
        {"language": "id", "duration": 4.0, "model": "medium", "words": words},
        ensure_ascii=False, indent=2), encoding="utf-8")
    (pdir / "segments.json").write_text(json.dumps([
        {"id": 0, "hook": "uji-susunan", "start": 0.0, "end": 4.0, "overall": 9.0, "keywords": ["latar"]},
    ], ensure_ascii=False, indent=2), encoding="utf-8")

def main():
    FRAMES.mkdir(parents=True, exist_ok=True)
    client = TestClient(server.app)
    build_fixture()
    green = lambda r, g, b: g > 140 and r < 110 and b < 110
    dark = lambda r, g, b: r < 24 and g < 24 and b < 24
    magenta = lambda r, g, b: r > 180 and b > 180 and g < 110
    total_px = 1080 * 1920

    # 1. prasyarat: filter boxblur ada -> opsi "Blur" tersedia (bukan placeholder)
    opts = client.get("/api/options").json()
    ck("prasyarat ffmpeg boxblur terdeteksi server (capabilities.blur)",
       server.blur_supported() and opts.get("capabilities", {}).get("blur") is True,
       f"blur_supported={server.blur_supported()} capabilities={opts.get('capabilities')}")

    # 2. validasi prefs: nilai ngawur 400, nilai sah tersimpan
    bad = [client.put(f"/api/projects/{PID}/prefs", json={"render_prefs": p}).status_code
           for p in ({"layout": "miring"}, {"bg_fill": "pelangi"}, {"bg_color": "biru"},
                     {"offset_y": 99})]
    ok = client.put(f"/api/projects/{PID}/prefs", json={"render_prefs": {
        "layout": "center", "bg_fill": "blur", "bg_color": "#00FF00", "offset_y": 0}})
    saved = server.read_project_meta(PID)["render_prefs"]
    ck("PUT /prefs: layout/bg_fill/bg_color/offset_y ngawur ditolak, nilai sah tersimpan",
       bad == [400, 400, 400, 400] and ok.status_code == 200
       and saved["layout"] == "center" and saved["bg_fill"] == "blur"
       and saved["bg_color"] == "#00FF00" and saved["offset_y"] == 0,
       f"bad={bad} ok={ok.status_code} "
       f"tersimpan={ {k: saved[k] for k in ('layout', 'bg_fill', 'bg_color', 'offset_y')} }")

    def render(tag, **prefs):
        client.put(f"/api/projects/{PID}/prefs", json={"render_prefs": prefs})
        r = client.post(f"/api/projects/{PID}/render",
                        json={"candidate_index": 0, "do_tighten": False, "aspect": "9:16",
                              "crop_mode": "center", "custom_hook": tag, "quality": "original"})
        ck(f"POST /render ({tag}) 200", r.status_code == 200, f"status={r.status_code}")
        return ROOT / "clips" / PID / "raw" / f"{tag}.mp4"

    # Fixture berwarna rata: latar blur ikut rata, jadi uji beda-posisi pakai isi latar Hitam
    # supaya batas video utama terukur (kriteria "tiga susunan = tiga berkas" tetap utuh).
    out_center = render("t12-tengah", layout="center", bg_fill="black")
    out_stack = render("t12-atas-bawah", layout="stack", bg_fill="black")
    out_box = render("t12-kotak", layout="box", bg_fill="black")
    digests = {p.name: sha256(p) for p in (out_center, out_stack, out_box)}
    sizes = {p.name: dims(p) for p in (out_center, out_stack, out_box)}
    (EVID / "sha256.txt").write_text(
        "# T12 — tiga susunan, source 16:9 640x360 -> 9:16 1080x1920 (isi latar Hitam)\n"
        + "".join(f"{d}  {n}\n" for n, d in digests.items()), encoding="utf-8")
    ck("tiga susunan menghasilkan tiga berkas berbeda & semuanya 1080x1920",
       len(set(digests.values())) == 3 and all(s == (1080, 1920) for s in sizes.values()),
       f"sha={[d[:10] for d in digests.values()]} dims={list(sizes.values())}")

    # 3. source 16:9 -> 9:16 tanpa black bar: latar blur mengisi seluruh frame
    out_blur = render("t12-tengah-blur", layout="center", bg_fill="blur")
    dark_center = count_pixels(out_blur, 1.5, dark, scale=4)
    corners = [patch_mean(out_blur, 1.5, x, y) for x, y in
               ((4, 4), (1068, 4), (4, 1908), (1068, 1908))]
    ck("susunan Tengah + latar blur: tanpa black bar (piksel gelap 0 & sudut terisi latar)",
       dark_center == 0 and all(sum(c) > 200 for c in corners),
       f"gelap={dark_center * 16}/{total_px} sudut={corners}")

    # 4. Tengah: video utama penuh lebar (1080) & tegak tengah di atas latar
    out_center_black = out_center
    rows_c = column_ys(out_center_black, 1.5, 540, green)
    fg_h = round(1080 * 360 / 640)                       # 1080 lebar, aspect source 16:9
    exp_top = (1920 - fg_h) / 2
    ck("susunan Tengah: video penuh lebar, tegak tengah (latar terlihat atas & bawah)",
       rows_c and abs(rows_c[0] - exp_top) <= 40 and abs(rows_c[-1] - (exp_top + fg_h)) <= 40,
       f"video y {rows_c[:1]}..{rows_c[-1:] if rows_c else []} (harap {exp_top:.0f}..{exp_top + fg_h:.0f})")

    # 5. isi latar Warna & Hitam benar-benar terpakai
    out_color = render("t12-warna", layout="center", bg_fill="color", bg_color="#FF00FF")
    out_black = render("t12-hitam", layout="center", bg_fill="black")
    col_corner = patch_mean(out_color, 1.5, 4, 4)
    blk_corner = patch_mean(out_black, 1.5, 4, 4)
    rows_col = column_ys(out_color, 1.5, 540, green)
    ck("isi latar Warna (#FF00FF) & Hitam terpakai: sudut = warna latar, video utama utuh di atasnya",
       magenta(*col_corner) and sum(blk_corner) < 30 and rows_col
       and abs((rows_col[-1] - rows_col[0]) - fg_h) <= 40,
       f"warna={col_corner} hitam={blk_corner} video y {rows_col[:1]}..{rows_col[-1:] if rows_col else []}")

    # 6. susunan Kotak: video 90% + sudut membulat -> tepi frame = latar
    out_box_col = render("t12-kotak-warna", layout="box", bg_fill="color", bg_color="#FF00FF")
    edge = [patch_mean(out_box_col, 1.5, x, y) for x, y in
            ((4, 4), (1068, 4), (4, 1908), (1068, 1908))]
    rows_b = column_ys(out_box_col, 1.5, 540, green)
    box_w = int(1080 * 0.9 * 360 / 640)                  # tinggi video di dalam kotak
    exp_top_b = (1920 - round(1080 * 0.9 * 360 / 640)) / 2
    ck("susunan Kotak: tepi frame = latar (sudut membulat) & video kecil dari frame",
       all(magenta(*e) for e in edge) and rows_b
       and abs(rows_b[0] - exp_top_b) <= 60 and rows_b[-1] - rows_b[0] < 1920 * 0.55,
       f"tepi={edge} video y {rows_b[:1]}..{rows_b[-1:] if rows_b else []} lebar+kotak={box_w}")

    # 7. offset_y menggeser subjek sesuai persen tinggi frame (20% dari 1920 = 384 px)
    base = render("t12-offset-0", layout="stack", bg_fill="black", offset_y=0)
    shifted = render("t12-offset-20", layout="stack", bg_fill="black", offset_y=20)
    y0 = column_ys(base, 1.5, 540, green)
    y20 = column_ys(shifted, 1.5, 540, green)
    dy = (y20[0] - y0[0]) if (y0 and y20) else -9999
    (EVID / "ffprobe.txt").write_text(
        "# T12 — geometri render susunan (source 16:9 640x360 -> 9:16 1080x1920)\n"
        + probe(out_center) + "\n"
        + f"# {out_center_black.name} (Tengah): video utama y {rows_c[:1]}..{rows_c[-1:] if rows_c else []}\n"
        + f"# {out_box_col.name} (Kotak): video utama y {rows_b[:1]}..{rows_b[-1:] if rows_b else []}\n"
        + f"# {base.name} (Atas-bawah, offset_y=0): video utama mulai y {y0[:1]}\n"
        + f"# {shifted.name} (Atas-bawah, offset_y=20%): video utama mulai y {y20[:1]}\n"
        + f"# geser terukur: {dy} px (20% x 1920 = 384 px)\n", encoding="utf-8")
    ck("offset_y 20% menggeser subjek ~384 px (toleransi 5% tinggi frame = 96 px)",
       abs(dy - 384) <= 96, f"y0={y0[:1]} y20={y20[:1]} selisih={dy}px")
    ck("offset_y bertahan di state project (dibaca ulang, bukan cuma di memori)",
       client.get(f"/api/projects/{PID}/state").json()["project"]["render_prefs"]["offset_y"] == 20,
       "state render_prefs.offset_y=%s"
       % client.get(f"/api/projects/{PID}/state").json()["project"]["render_prefs"]["offset_y"])

    # 7b. placeholder: tanpa filter boxblur, isi latar Blur ditolak jujur, sisanya tetap jalan
    real_blur = server.blur_supported
    server.blur_supported = lambda: False
    try:
        opts_nb = client.get("/api/options").json()
        put_blur = client.put(f"/api/projects/{PID}/prefs", json={"render_prefs": {"bg_fill": "blur"}})
        put_black = client.put(f"/api/projects/{PID}/prefs", json={"render_prefs": {"bg_fill": "black"}})
        detail = str(put_blur.json().get("detail") or "")
    finally:
        server.blur_supported = real_blur
    ck("placeholder tanpa boxblur: capabilities.blur=false, bg_fill=blur 400 (alasan Indonesia), Hitam tetap 200",
       opts_nb.get("capabilities", {}).get("blur") is False and put_blur.status_code == 400
       and "boxblur" in detail and put_black.status_code == 200,
       f"capabilities={opts_nb.get('capabilities')} blur={put_blur.status_code} {detail!r} hitam={put_black.status_code}")

    # 8. tulis meta tahan tumpang tindih: banyak PUT bersamaan tidak boleh merusak project.json
    errs = []
    def _put(v):
        r = client.put(f"/api/projects/{PID}/prefs", json={"render_prefs": {"offset_y": v}})
        if r.status_code != 200:
            errs.append(r.status_code)
    ts = [threading.Thread(target=_put, args=(v,)) for v in (1, -2, 3, -4, 5, -6, 7, -8, 9, -10, 11, -12, 0, 0, 0, 0)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    disk = json.loads((ROOT / "work" / PID / "project.json").read_text(encoding="utf-8"))
    leftovers = [p.name for p in (ROOT / "work" / PID).glob("*.tmp")]
    ck("16 PUT prefs bersamaan: project.json tetap utuh, tanpa berkas temp tertinggal",
       not errs and isinstance(disk.get("render_prefs"), dict)
       and not leftovers, f"gagal={errs} sisa={leftovers} offset_y={disk.get('render_prefs', {}).get('offset_y')}")

    # 9. default project tetap seperti sebelum T12 (tidak ada perubahan senyap)
    ck("default layout='off' -> jalur crop lama tetap dipakai kalau user belum memilih susunan",
       server.DEFAULT_RENDER_PREFS["layout"] == "off"
       and "layout=prefs.get" in (ROOT / "server.py").read_text(encoding="utf-8"),
       f"default={server.DEFAULT_RENDER_PREFS['layout']}")

    # 9. aturan repo di berkas yang disentuh (PreviewStage sudah punya bg-black letterbox
    #    sebelum T12, jadi di sana hanya dicek TODO/console.log/dark:/bg-dark)
    bad_files = []
    for f in ("server.py", "chopify/render_clips.py", "frontend/src/components/PreviewStage.jsx",
              "frontend/src/components/StudioView.jsx"):
        text = (ROOT / f).read_text(encoding="utf-8")
        pattern = r"TODO|console\.log|bg-dark|dark:" if f.endswith("PreviewStage.jsx") \
            else r"TODO|console\.log|bg-dark|bg-black|dark:"
        hits = sorted(set(re.findall(pattern, text)))
        if hits:
            bad_files.append(f"{f}:{hits}")
    ck("tanpa TODO/console.log/dark theme di berkas yang disentuh", not bad_files, "; ".join(bad_files))

    # 10. bukti frame (untuk screenshot referensi hasil render)
    for name, p in (("frame-tengah.png", out_center), ("frame-atas-bawah.png", out_stack),
                    ("frame-kotak.png", out_box), ("frame-warna.png", out_color)):
        ff("-y", "-ss", "1.50", "-i", str(p), "-frames:v", "1", str(FRAMES / name))

    (EVID / "check.txt").write_text(
        f"# check_t12.py — {len(fails)} gagal (detail: stdout)\n"
        + "".join(f"FAIL {n}\n" for n in fails), encoding="utf-8")
    print(f"\n{len(fails)} gagal" if fails else "\nsemua cek lulus")
    shutil.rmtree(HERE, ignore_errors=True)
    # Bersihkan fixture supaya /api/projects tidak ikut memuat project uji ini.
    shutil.rmtree(ROOT / "work" / PID, ignore_errors=True)
    shutil.rmtree(ROOT / "clips" / PID, ignore_errors=True)
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
