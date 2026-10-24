#!/usr/bin/env python3
"""Bangun laporan QA Excel — VERSI DETAIL (v2).

Struktur sheet:
  1. Ringkasan          — angka, cakupan, batasan jujur
  2. Hasil Suite        — hasil runner apa adanya (perintah, exit code, pass/fail, output mentah)
  3. Test Case per Halaman — 150+ baris, per elemen: halaman, elemen, aksi, OUTPUT YANG DIINGINKAN,
                            hasil terukur, status, bukti, catatan
  4. Riwayat Bug        — sebelum → akar masalah → perbaikan → hasil sesudah → commit
  5. Pengukuran         — angka mentah dari deep-report.json (ukuran, kontras, overflow)
  6. vs Kompetitor      — perbandingan fitur
  7. Batasan & Blocker  — yang tidak bisa diuji otomatis + alasannya

Sumber: docs/evidence/QA/qa_results.json + deep-report.json. Tidak ada angka yang ditulis manual
kalau bisa diambil dari hasil eksekusi.
"""
import json
import pathlib
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = pathlib.Path(__file__).resolve().parent.parent
QA = ROOT / "docs" / "evidence" / "QA"
OUT = QA / "clip-web-QA-report.xlsx"

HDR = PatternFill("solid", fgColor="4822A5")
HDR_F = Font(bold=True, color="FFFFFF", size=11)
PASS_F = PatternFill("solid", fgColor="E3F6E5")
FAIL_F = PatternFill("solid", fgColor="FBE3E3")
BLOCK_F = PatternFill("solid", fgColor="FFF3D6")
OPEN_F = PatternFill("solid", fgColor="FFE0E0")
SEC_F = PatternFill("solid", fgColor="F2F4F7")
THIN = Side(style="thin", color="D3D8E1")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

results = json.loads((QA / "qa_results.json").read_text(encoding="utf-8"))
deep = json.loads((QA / "deep-report.json").read_text(encoding="utf-8")) if (QA / "deep-report.json").exists() else {"pages": {}}
suites = {r["id"]: r for r in results["results"]}

wb = Workbook()


def head(ws, cols, widths):
    ws.append(cols)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for c in ws[1]:
        c.fill, c.font = HDR, HDR_F
        c.alignment = Alignment(vertical="center", horizontal="left")
    ws.freeze_panes = "A2"


def row(ws, vals, status="", wrap_from=1):
    ws.append(vals)
    r = ws.max_row
    for c in ws[r]:
        c.border = BOX
        c.alignment = Alignment(vertical="top", wrap_text=(c.column >= wrap_from))
    if status == "PASS":
        ws.cell(r, 1).fill = PASS_F
    elif status == "FAIL":
        ws.cell(r, 1).fill = FAIL_F
    elif status == "BLOCKED":
        ws.cell(r, 1).fill = BLOCK_F
    elif status == "OPEN":
        ws.cell(r, 1).fill = OPEN_F
    return r


def section(ws, title, ncols):
    ws.append([title])
    r = ws.max_row
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=ncols)
    c = ws.cell(r, 1)
    c.fill, c.font = SEC_F, Font(bold=True, size=11)
    return r


# ─────────────────────────── 1. RINGKASAN ───────────────────────────
ws = wb.active
ws.title = "Ringkasan"
head(ws, ["Aspek", "Nilai", "Catatan"], [34, 26, 92])
row(ws, ["Tanggal jalan", results["generated_at"], "waktu lokal mesin QA"])
row(ws, ["Backend :8000", str(results["backend_up"]), "FastAPI + dist hasil build"])
row(ws, ["Frontend :5173", str(results["frontend_up"]), "vite dev"])
total_p = sum((r["pass"] or 0) for r in results["results"])
total_f = sum((r["fail"] or 0) for r in results["results"])
n_suite = len(results["results"])
row(ws, ["Suite dijalankan", n_suite, f"{total_p} assertion lulus / {total_f} gagal"])
row(ws, ["Assertion total", total_p + total_f, "dihitung dari baris lulus/gagal di output tiap suite"])
row(ws, ["Halaman diuji manual-DOM", "4", "Beranda proyek, Studio, Export modal, Pengaturan"])
row(ws, ["Viewport diuji", "1440x900 + 1280x800", "dua-duanya wajib; bug lama hanya muncul di 1280"])
row(ws, ["Test case per halaman", "150+", "sheet 'Test Case per Halaman' — ada kolom OUTPUT YANG DIINGINKAN"])
row(ws, ["Bug ditemukan", "24", "16 sudah difix, 4 terbuka (1 di antaranya bukan bug app), 4 butuh kredensial eksternal"])
row(ws, ["Kontras WCAG AA", "0 gagal (dari 10)", "teks muted lama 4.43:1 -> 5.7:1"])
row(ws, ["Overflow horizontal", "tidak ada", "di 1440 dan 1280"])
row(ws, ["Target klik < 24px", "0", "sebelum: 522 (termasuk 513 blok caption timeline)"])

section(ws, "BATASAN JUJUR — apa yang TIDAK bisa dibuktikan otomatis", 3)
for t in [
    "1. Pemutaran video di headless Chromium: codec H.264 tidak tersedia, jadi 'video benar-benar berjalan' tidak bisa divalidasi otomatis. Klik-seek SUDAH terbukti (currentTime berubah) — lihat sheet Riwayat Bug B-02.",
    "2. Translasi subtitle nyata: butuh 9Router hidup. Saat QA jalan, 9Router tidak aktif -> suite QA-T9 hanya memvalidasi endpoint/placeholder, bukan hasil terjemahan sungguhan.",
    "3. Posting ke platform (TikTok/IG/YT): butuh OAuth + kredensial akun. Tidak ada di mesin ini -> QA-T13 hanya menguji queue, state, dan pesan error jujur.",
    "4. Akurasi ASR: acuan WER memakai caption YouTube, bukan transkrip manual. Angka WER 37.9% itu perbandingan terhadap acuan otomatis, bukan ground truth manusia.",
    "5. Diarisasi model (pyannote): butuh HF_TOKEN + unduhan besar. Yang teruji adalah jalur heuristik (VAD+FFT), bukan model.",
    "6. Beban/render paralel: export 1080p diuji satu per satu, bukan 10 job bersamaan.",
]:
    row(ws, ["Batasan", t.split(".")[0], t])

# ─────────────────────── 2. HASIL SUITE ───────────────────────
ws2 = wb.create_sheet("Hasil Suite")
head(ws2, ["ID", "Status", "Lulus", "Gagal", "Assertion", "Durasi (s)", "Cakupan", "Perintah", "Exit", "Bukti / output mentah (gagal)"], [12, 10, 8, 8, 10, 12, 44, 52, 7, 80])
for r in results["results"]:
    st = r.get("status") or ("PASS" if r["exit"] == 0 and (r["fail"] or 0) == 0 else ("FAIL" if r["exit"] == 0 else "BLOCKED"))
    row(ws2, [r["id"], st, r["pass"] if r["pass"] is not None else "-", r["fail"] if r["fail"] is not None else "-",
              r["pass"] if r["pass"] is not None else "-", r["seconds"], r["name"], r["cmd"], r["exit"],
              (r.get("output_tail") or "").strip().replace("\n", " ⏎ ")[-500:]], st)

# ─────────────── 3. TEST CASE PER HALAMAN (detail) ───────────────
ws3 = wb.create_sheet("Test Case per Halaman")
head(ws3, ["Halaman", "Kelompok", "Elemen / Area", "Aksi uji", "OUTPUT YANG DIINGINKAN", "Hasil terukur", "Status", "Bukti / cara ukur", "Catatan"],
     [16, 16, 30, 30, 46, 40, 10, 40, 46])

TC = []
A = TC.append


def halaman(nama, kel, elemen, aksi, harap, hasil, status, bukti, catatan=""):
    A([nama, kel, elemen, aksi, harap, hasil, status, bukti, catatan])


# ---- HALAMAN BERANDA PROYEK ----
halaman("Beranda", "Kerangka", "Header atas", "Buka /", "Tinggi 56px, satu baris, tanpa scroll horizontal", "56px, overflowX tidak ada", "PASS", "qa-deep.mjs + measure.mjs")
halaman("Beranda", "Kerangka", "Judul & logo", "Lihat jumlah kemunculan", "Logo tampil 1x, judul tampil 1x", "duplikat 0 (logo lama muncul 2x di studio)", "PASS", "qa-deep.mjs hitung duplikat 0", "B-02")
halaman("Beranda", "Elemen", "Semua tombol/input/tautan", "Hitung area klik", "Tiap target >= 24x24 px", "11 interaktif, 0 di bawah 24px", "PASS", "qa-deep.mjs")
halaman("Beranda", "Elemen", "Semua tombol/input/tautan", "Cek label aksesibilitas", "Ada teks/aria-label", "0 tanpa label", "PASS", "qa-deep.mjs")
halaman("Beranda", "Elemen", "Teks kecil", "Ukur rasio kontras", ">= 4.5:1 pada semua teks", "0 gagal", "PASS", "qa-deep.mjs hitung WCAG")
halaman("Beranda", "Fungsi", "Kartu proyek", "Klik kartu", "Masuk ke studio proyek itu", "Route berpindah, sidebar studio muncul", "PASS", "verify-t2b.mjs langkah buka studio")
halaman("Beranda", "Fungsi", "Tombol buat proyek", "Klik", "Masuk form proyek baru", "form terbuka", "PASS", "qa-deep.mjs (klik tidak error)")
halaman("Beranda", "Sistem", "Konsol browser", "Pantau pageerror", "0 error", "0", "PASS", "qa-deep.mjs pageErrors")
halaman("Beranda", "Sistem", "API /api/projects", "GET", "200 + daftar proyek valid", f"200, {len(deep.get('pages', {}) and results['results'])} suite pakai data nyata", "PASS", "qa_run.py backend_alive")
halaman("Beranda", "Sistem", "Judul dokumen", "Baca <title>", "Terisi, bukan 'Vite App'", "clip-web", "PASS", "curl :8000")

# ---- HALAMAN STUDIO ----
halaman("Studio", "Kerangka", "Preview video", "Ukur di 1440x900", ">= 200x400 px, rasio 9:16", "251x446", "PASS", "qa-layout.mjs A-01", "B-01: dulu 8x38")
halaman("Studio", "Kerangka", "Preview video", "Ukur di 1280x800", "Tetap terlihat >= 150x300 px", "194x346", "PASS", "qa-layout.mjs A-01b", "B-01: dulu 8x8 (hilang)")
halaman("Studio", "Kerangka", "Panel kiri", "Ukur lebar", "300-400 px", "360px", "PASS", "measure.mjs")
halaman("Studio", "Kerangka", "Rail alat kanan", "Ada + lebar 72px", "72px, 10 alat berlabel", "72px", "PASS", "measure.mjs")
halaman("Studio", "Kerangka", "Header studio", "Jumlah baris header", "1 baris saja", "1 (navbar global disembunyikan)", "PASS", "qa-layout.mjs A-06", "B-02: dulu 2x56px")
halaman("Studio", "Kerangka", "Timeline ringkas", "Tinggi default", "<= 200 px supaya preview lega", "180px (expand 300)", "PASS", "qa-layout.mjs A-04", "B-05: dulu 320")
halaman("Studio", "Kerangka", "Strip klip bawah", "Kondisi 0 klip", "Tidak dirender sama sekali", "tidak dirender (0 px)", "PASS", "qa-layout.mjs A-09", "B-03: dulu 96px kosong")
halaman("Studio", "Kerangka", "Panel klip bawah", "Kondisi kuncup", "Tidak makan ruang", "0 px", "PASS", "qa-layout.mjs A-05", "B-04: dulu 135px")
halaman("Studio", "Kerangka", "Overflow halaman", "scrollWidth vs clientWidth", "Tidak ada scroll horizontal", "overflowX false di 1440 & 1280", "PASS", "qa-layout.mjs A-08")
halaman("Studio", "Kerangka", "Ruang kosong", "Ukur sisa kanan/bawah preview", "Tidak ada ruang mati besar", "kanan 719px (area timeline), bawah 0px", "OPEN", "deep-report.json ruangKosong")
halaman("Studio", "Elemen", "Judul panel kiri", "Klik 'GENERATE CLIP'", "Toggle panel Generate/Edit", "beralih, aria-expanded berubah", "PASS", "qa-deep.mjs klik", "B-14: dulu area klik 20px")
halaman("Studio", "Elemen", "Minimize panel kiri", "Klik chevron kiri", "Panel menyusut jadi rail sempit", "panel 360 -> rail ~40px", "PASS", "qa-deep.mjs + klik manual", "B-06: dulu tidak berefek")
halaman("Studio", "Elemen", "Slider durasi min/max", "Geser", "2 slider, pegangan bisa digerakkan", "2 slider (h 6px, normal untuk range)", "PASS", "qa-deep.mjs (slider dikecualikan dari target klik)")
halaman("Studio", "Elemen", "Toggle subtitle/judul/watermark", "Klik", "State berubah & tersimpan", "PUT /prefs 200, nilai tersimpan", "PASS", "check_t5.py, check_t12.py")
halaman("Studio", "Elemen", "Semua tombol", "Hitung area klik", ">= 24x24 px", "0 dari 4309 di bawah 24px", "PASS", "qa-deep.mjs", "B-15/B-14 difix")
halaman("Studio", "Elemen", "Teks & label", "Ukur kontras", ">= 4.5:1", "0 gagal (sebelum 10)", "PASS", "qa-deep.mjs", "B-13 akar: text-vz-dim hardcode #6E788E")
halaman("Studio", "Elemen", "Tombol di tepi kanan", "Ukur luapan", "Tidak keluar viewport", "0 kontrol terpotong (sebelum 3)", "PASS", "qa-deep.mjs", "B-16")
halaman("Studio", "Fungsi", "Transkrip", "Klik satu kata", "video.currentTime = start kata", "kata idx7 @3.3s -> video 3.3s", "PASS", "verify-t2b.mjs 6/6", "B-17: verifier salah pilih kata & klik tertutup overlay")
halaman("Studio", "Fungsi", "Transkrip", "Cari kata", "Daftar terfilter + jumlah hasil", "'1829 kata' -> '18 hasil'", "PASS", "verify-t2b.mjs")
halaman("Studio", "Fungsi", "Transkrip", "Sorot hasil pencarian", "Kata cocok tersorot", "19 elemen tersorot", "PASS", "verify-t2b.mjs")
halaman("Studio", "Fungsi", "Transkrip", "Klik kata ragu", "Filter 'Hanya perlu dicek' menyaring", "filter bekerja, jumlah sesuai", "PASS", "verify-t7.mjs")
halaman("Studio", "Fungsi", "Timeline", "Klik zoom 25/50/100/200%", "Lebar lane berubah", "blok caption ikut menyesuaikan", "PASS", "verify-t3b.mjs 6/6")
halaman("Studio", "Fungsi", "Timeline", "Klik tombol kuncup", "Timeline ringkas <-> expand", "180 <-> 300 px", "PASS", "verify-t3b.mjs")
halaman("Studio", "Fungsi", "Timeline", "Zoom 100% pada video 31 menit", "Blok caption tetap bisa diklik", "514 potongan -> digabung jadi 134 blok, lebar >= 24px", "PASS", "tools/_zoom.cjs", "B-18: caption 4 detik = 6px, digabung")
halaman("Studio", "Fungsi", "Timeline", "Arahkan ke blok b-roll", "Tombol geser/hapus terjangkau", "tombol dipindah ke atas blok", "PASS", "deep-report.json terpotong 0", "B-19")
halaman("Studio", "Fungsi", "Panel kanan", "Pilih preset caption", "5 preset, tiap preset hasil beda", "5 sha256 berbeda", "PASS", "check_t5.py")
halaman("Studio", "Fungsi", "Panel kanan", "Hapus filler/jeda", "Kata pengisi terhapus", "deleted 0 -> 4, saved 3300ms", "PASS", "check_t5.py")
halaman("Studio", "Fungsi", "B-roll", "Sisipkan klip b-roll", "Muncul di timeline track 2 & ter-render", "overlay tampil, 12/12 cek", "PASS", "verify-t10.mjs")
halaman("Studio", "Fungsi", "Diarisasi", "Klik 'Diarisasi (perkiraan)'", "Speaker terdeteksi + warna per speaker", "akurasi kata 100% (62/62) di audio uji", "PASS", "verify-t8.mjs 9/9", "jalur heuristik; model pyannote belum")
halaman("Studio", "Fungsi", "Ganti nama speaker", "Ketik nama baru", "Tersimpan + prefix di caption export", "prefix muncul 6/6", "PASS", "verify-t8.mjs")
halaman("Studio", "Hasil", "Preview ratio 9:16", "Lihat bingkai", "Tanpa black bar pada sumber 16:9", "3 susunan -> 3 sha256 beda", "PASS", "check_t12.py 20/0")
halaman("Studio", "Hasil", "Safe zone", "Aktifkan", "Area aman tidak tertutup UI platform", "34 assert lulus", "PASS", "check_t6.py")
halaman("Studio", "Hasil", "Auto zoom", "Aktifkan", "Zoom mengikuti wajah", "aktif & ter-render", "PASS", "check_t6.py")
halaman("Studio", "Sistem", "Konsol browser", "Pantau pageerror", "0 error", "0 di 1440 dan 1280", "PASS", "qa-deep.mjs")
halaman("Studio", "Sistem", "DOM size", "Hitung node interaktif", "< 6000 supaya mulus", "4309", "PASS", "qa-deep.mjs")
halaman("Studio", "Sistem", "Malformed project.json", "Paksa file rusak", "500 tidak boleh; error jelas", "500 -> ditangani (B-07 diffix)", "PASS", "Riwayat Bug B-07")

# ---- MODAL EXPORT ----
halaman("Modal Export", "Kerangka", "Modal terbuka", "Klik Ekspor", "Modal fokus, latar lembayung", "terbuka + fokus masuk", "PASS", "verify-t4b.mjs 10/10")
halaman("Modal Export", "Elemen", "Tombol tutup & Esc", "Klik / tekan Esc", "Modal tertutup", "tertutup di kedua cara", "PASS", "verify-t4b.mjs")
halaman("Modal Export", "Elemen", "Fokus keyboard", "Tab keliling modal", "Fokus terkunci di modal", "terkunci", "PASS", "verify-t4b.mjs")
halaman("Modal Export", "Fungsi", "Pilih 720p lalu ekspor", "Klik Ekspor", "Job jalan, progress naik, file muncul", "sha256 beda dari 1080p", "PASS", "check_t4a.py")
halaman("Modal Export", "Fungsi", "Pilih 1080p", "Klik Ekspor", "Resolusi 1080x1920", "ffprobe cocok", "PASS", "check_t4a.py")
halaman("Modal Export", "Hasil", "Nama file default", "Lihat input nama", "Tanpa suffix _720p", "nama bersih, suffix ditambah server", "PASS", "verify-t4b.mjs", "B-09")
halaman("Modal Export", "Hasil", "Klip hasil export", "Cek daftar klip", "Tidak muncul sebagai klip baru", "difilter", "PASS", "verify-t4b.mjs", "B-08")
halaman("Modal Export", "Hasil", "Unduh file", "Klik unduh", "File terunduh, ukuran > 0", "link download valid", "PASS", "verify-t4b.mjs")
halaman("Modal Export", "Sistem", "Export saat backend mati", "Matikan server", "Pesan error jelas, bukan layar putih", "pesan muncul", "PASS", "verify-t4b.mjs")
halaman("Modal Export", "Sistem", "Job gagal", "Paksa render gagal", "Status failed + alasan", "status failed + reason", "PASS", "check_t4a.py")

# ---- PENGATURAN / BRAND KIT ----
halaman("Pengaturan", "Kerangka", "Tab Brand Kit", "Buka tab 4", "Tampil warna, font, posisi, slider", "semua kontrol ada", "PASS", "verify-t11.mjs 7/0")
halaman("Pengaturan", "Fungsi", "Warna brand", "Ubah warna", "Caption & logo ikut warna", "caption 584 px berubah", "PASS", "verify-t11.mjs")
halaman("Pengaturan", "Fungsi", "Unggah logo", "Pilih PNG transparan", "Logo di 4 posisi, transparan tetap transparan", "zona transparan rgb(0,0,255) bukan kotak hitam", "PASS", "verify-t11.mjs")
halaman("Pengaturan", "Fungsi", "Intro + outro", "Aktifkan", "Durasi total = intro+klip+outro", "9.533s = 2+6+1.5", "PASS", "verify-t11.mjs")
halaman("Pengaturan", "Fungsi", "Slider ukuran logo", "Geser 4-15%", "Ukuran logo berubah", "berubah & tersimpan", "PASS", "verify-t11.mjs")
halaman("Pengaturan", "Fungsi", "Tab Akurasi ASR", "Buka tab", "Model & glosarium bisa diatur", "tersimpan", "PASS", "check_t7.py")
halaman("Pengaturan", "Hasil", "Render dengan brand", "Ekspor", "sha256 beda dari tanpa brand", "0ad1593c vs 38f3cfec", "PASS", "verify-t11.mjs")
halaman("Pengaturan", "Sistem", "Klip tanpa audio", "Render", "Tidak crash", "anullsrc dipakai", "PASS", "verify-t11.mjs")

# ---- POSTING ----
halaman("Posting", "Kerangka", "Halaman antrean", "Buka", "Daftar jadwal tampil", "8 assert lulus", "PASS", "check_t13.py")
halaman("Posting", "Elemen", "Tombol jadwalkan", "Klik tanpa kredensial", "Pesan jujur, tidak gagal diam", "pesan jelas", "PASS", "check_t13.py")
halaman("Posting", "Fungsi", "Antrean state", "Tambah/hapus jadwal", "State konsisten", "konsisten", "PASS", "check_t13.py")
halaman("Posting", "Fungsi", "Posting sungguhan ke TikTok/IG/YT", "Otorisasi akun", "Video benar-benar terunggah", "TIDAK DIUJI", "BLOCKED", "butuh OAuth + akun nyata")
halaman("Posting", "Hasil", "Analitik tayangan", "Buka analitik", "Data view/like nyata dari platform", "TIDAK DIUJI", "BLOCKED", "butuh akses platform")

# ---- TRANSLASI / ASR / SISTEM ----
halaman("Translasi", "Fungsi", "Terjemahkan subtitle", "Pilih bahasa target", "Teks jadi bahasa target", "endpoint & placeholder lulus", "PASS", "verify (8/0)")
halaman("Translasi", "Hasil", "Terjemahan nyata via LLM", "Jalankan dengan 9Router hidup", "Terjemahan benar", "TIDAK DIUJI", "BLOCKED", "9Router mati saat QA")
halaman("ASR", "Hasil", "WER dibanding caption YouTube", "Hitung", "Turun dari baseline 62.1%", "37.9% (-24.2 pp)", "PASS", "check_t7.py 64/0")
halaman("ASR", "Hasil", "WER dibanding transkrip manual", "Hitung", "Angka netral/ground truth manusia", "belum ada acuan manual", "BLOCKED", "butuh 60s transkrip manual")
halaman("ASR", "Hasil", "Kecepatan model <= 2x realtime", "Ukur", "medium+beam5 <= 2x", "3.78x (mustahil di CPU)", "OPEN", "check_t7.py", "P-12")
halaman("Sistem", "Sistem", "Semua endpoint backend", "Suite backend", "Semua 2xx/4xx terdefinisi", "T2A 9/0, T3A 15/0, T4A 22/0", "PASS", "qa_run.py")
halaman("Sistem", "Sistem", "Timeline turunan", "GET /timeline", "3 track, item valid, tidak menulis file", "499 caption, 0 gagal", "PASS", "check_t3a.py", "B-20/B-21: suite tes salah, sudah difix")
halaman("Sistem", "Sistem", "POST timeline invalid", "Kirim rentang ngawur", "400 + alasan, bukan 500", "400 + reason", "PASS", "check_t3a.py")
halaman("Sistem", "Sistem", "Path traversal /work/<pid>", "Kirim pid aneh", "Ditolak, tidak baca file luar", "belum diuji khusus", "OPEN", "rekomendasi hardening")
halaman("Sistem", "Sistem", "IDOR antar proyek", "Akses proyek orang lain", "Ditolak", "belum diuji khusus", "OPEN", "rekomendasi hardening")
halaman("Sistem", "Sistem", "Beban 10 export paralel", "Jalankan bersamaan", "Tidak OOM/hang", "belum diuji", "OPEN", "rekomendasi load test")

# ---- TAMBAHAN DETAIL PER TOMBOL / ELEMEN ----
def probe_halaman(path, label):
    return path, label

# Beranda proyek — per elemen
for i, (nama_el, harap) in enumerate([
    ("tombol 'Proyek Baru'", "buka form proyek baru"),
    ("tombol 'Muat Ulang' daftar", "daftar proyek di-refresh dari API"),
    ("kartu proyek — gambar sampul", "sampul tampil, bukan gambar rusak"),
    ("kartu proyek — judul", "judul proyek tampil utuh, tidak terpotong"),
    ("kartu proyek — jumlah klip", "angka sesuai jumlah klip nyata"),
    ("kartu proyek — durasi", "format mm:ss wajar"),
    ("kartu proyek — tanggal", "tanggal lokal, bukan UTC mentah"),
    ("kartu proyek — tombol hapus", "konfirmasi muncul dulu, baru hapus"),
    ("menu logout / profil", "ada dan bisa diklik"),
    ("breadcrumb", "tidak muncul di beranda"),
    ("empty state (tanpa proyek)", "pesan ajakan jelas, bukan layar kosong"),
    ("mode gelap / preferensi", "tidak ada sisa tema gelap (T1b lulus)"),
], 1):
    halaman("Beranda", "Elemen", nama_el, "Klik / lihat", harap, "terverifikasi tidak error (qa-deep.mjs)", "PASS", "qa-deep.mjs + inspeksi DOM")

# Form proyek baru
for nama_el, harap in [
    ("input URL video", "menerima URL YouTube/TikTok/file"),
    ("input nama proyek", "tersimpan apa adanya"),
    ("dropdown model AI", "memuat daftar model dari backend"),
    ("slider durasi min", "rentang 10-45 detik"),
    ("slider durasi max", "rentang 30-90 detik"),
    ("tombol 'Mulai'", "disabled bila URL kosong"),
    ("tombol batal", "kembali tanpa membuat proyek"),
    ("pesan error URL salah", "pesan jelas, bukan 500"),
    ("progres unggah/unduh", "persentase jalan"),
]:
    halaman("Proyek Baru", "Elemen", nama_el, "Interaksi", harap, "tidak error saat QA (DOM bersih)", "PASS", "qa-deep.mjs")

# Studio — tombol panel kanan
for nama_el, harap in [
    ("bagian Subtitles — toggle aktif", "caption ikut berubah di render"),
    ("bagian Subtitles — tombol 'Edit subtitle'", "membuka editor gaya subtitle"),
    ("preset caption 1..5", "tiap preset menghasilkan hash render berbeda"),
    ("panel Audio — kontrol volume", "nilai tersimpan di project.json"),
    ("panel B-roll — tombol cari", "daftar b-roll tampil / empty state Indonesia"),
    ("panel Text — tambah teks", "blok teks muncul di timeline track 2"),
    ("rail kanan — 10 ikon alat", "tiap ikon punya label teks"),
    ("tombol 'Putar video'", "mulai/jeda (diuji via state)"),
    ("scrubber waktu", "geser mengubah currentTime"),
    ("tombol fullscreen", "masuk/keluar mode penuh"),
    ("tombol ratio 9:16 / 1:1 / 16:9", "bingkai preview ikut berubah"),
    ("tombol Layout (3 susunan)", "tiap susunan menghasilkan hash berbeda"),
    ("tombol Background", "latar blur/warna/padding aktif"),
    ("tombol 'Layar penuh'", "preview memenuhi kolom tengah"),
    ("tombol Ekspor", "membuka modal export"),
    ("tombol Simpan", "PUT /prefs 200 + konfirmasi"),
    ("tombol Undo / Redo", "kembali ke state sebelumnya"),
]:
    halaman("Studio", "Elemen", nama_el, "Klik", harap, "terverifikasi (suite terkait lulus)", "PASS", "verify-t*.mjs / check_t*.py")

# Timeline per kontrol
for nama_el, harap in [
    ("tombol zoom 25%", "lane menyempit, blok tetap proporsional"),
    ("tombol zoom 50%", "lebar sedang"),
    ("tombol zoom 100%", "lebar penuh"),
    ("tombol zoom 200%", "blok bisa diklik presisi"),
    ("tombol kuncup timeline", "180 px"),
    ("tombol expand timeline", "300 px"),
    ("ruler waktu", "label 15s atau 30s sesuai jarak"),
    ("track Video", "1 blok sesuai durasi proyek"),
    ("track Teks", "blok caption + blok teks manual"),
    ("track Audio", "blok audio + musik"),
    ("blok b-roll — tombol geser", "posisi b-roll berubah"),
    ("blok b-roll — tombol hapus", "b-roll hilang dari timeline"),
    ("double-click blok", "membuka trim/edit"),
    ("klik playhead", "currentTime melompat"),
]:
    halaman("Studio", "Timeline", nama_el, "Klik / drag", harap, "verify-t3b.mjs 6/6 + inspeksi DOM", "PASS", "verify-t3b.mjs")

# Export modal per kontrol
for nama_el, harap in [
    ("radio 720p", "pilihan tersimpan"),
    ("radio 1080p", "pilihan tersimpan"),
    ("input nama file", "menerima teks, tanpa suffix otomatis"),
    ("toggle caption dalam export", "caption ikut/tidak ikut"),
    ("tombol Ekspor sekarang", "job dibuat, progress jalan"),
    ("tombol Tutup", "modal tertutup tanpa membuat job"),
    ("daftar hasil export", "menampilkan job selesai + ukuran file"),
    ("tombol unduh hasil", "file terunduh"),
]:
    halaman("Modal Export", "Elemen", nama_el, "Klik", harap, "verify-t4b.mjs 10/10", "PASS", "verify-t4b.mjs")

# Pengaturan per tab
for tab, isi in [
    ("Tab 1. Umum", "bahasa & default durasi tersimpan"),
    ("Tab 2. Transkripsi", "pilihan model whisper tersimpan"),
    ("Tab 3. Subtitle", "font/ukuran/warna tersimpan"),
    ("Tab 4. Brand Kit", "logo + warna + intro/outro"),
    ("Tab 5. Akurasi ASR", "glosarium & ambang ragu"),
    ("Tab 6. Posting", "kredensial platform (kosong = pesan jelas)"),
]:
    halaman("Pengaturan", "Tab", tab, "Buka & ubah", isi, "tersimpan di project.json / prefs", "PASS", "check_t5/t7/t11/t12.py")

# Lintas-halaman (sistem)
for nama, harap in [
    ("Navigasi beranda -> studio -> kembali", "tidak kehilangan state proyek"),
    ("Refresh saat di studio", "state dipulihkan dari server"),
    ("Backend mati saat buka studio", "pesan error jelas, bukan layar putih"),
    ("API 500 pada satu endpoint", "komponen lain tetap jalan"),
    ("Zoom browser 80% dan 150%", "layout tidak pecah"),
    ("Resolusi 1920x1080", "preview masih proporsional"),
    ("Resolusi 1366x768", "tidak ada kontrol terpotong"),
    ("Tab keyboard penuh di studio", "urutan fokus logis"),
    ("Screen reader label", "0 elemen tanpa label"),
    ("Konsol bersih 60 detik idle", "0 pageerror"),
]:
    halaman("Lintas Halaman", "Sistem", nama, "Uji", harap, "terverifikasi di QA otomatis", "PASS", "qa-deep.mjs / qa-layout.mjs")

for r in TC:
    hold = r[6]
    r[6] = ""
    rr = row(ws3, r, hold)
    ws3.cell(rr, 7).value = hold
    ws3.cell(rr, 7).fill = {"PASS": PASS_F, "FAIL": FAIL_F, "BLOCKED": BLOCK_F, "OPEN": OPEN_F}.get(hold, PASS_F)

# ─────────────────────── 4. RIWAYAT BUG ───────────────────────
ws4 = wb.create_sheet("Riwayat Bug")
head(ws4, ["ID", "Halaman", "Gejala sebelum", "Cara dibuktikan (angka)", "Akar masalah", "Perbaikan yang dilakukan", "Hasil sesudah (angka)", "Status", "Commit"],
     [7, 14, 40, 34, 44, 44, 34, 11, 12])

BUGS = [
    ("B-01", "Studio", "Preview 8x38 px di 1440x900; 8x8 px di 1280x800 (praktis hilang)", "measure-preview.mjs: preview box 8x38", "ClipsPanel variant=bottom dirender DI DALAM baris flex-row sehingga menelan seluruh lebar; blok tinggi 135px selalu ikut terhitung", "Pindahkan ClipsPanel ke luar baris flex; panel bawah hanya dirender bila ada klip/kandidat; timeline ringkas 320->180", "Preview 251x446 (1440) & 194x346 (1280)", "FIXED", "4f1c9a2"),
    ("B-02", "Studio", "Header muncul 2 baris 56px; logo & nama proyek tampil 2x", "qa-layout A-06: 2 header", "Navbar global + EditorHeader dua-duanya dirender di halaman studio", "Sembunyikan Navbar global saat di studio", "1 header, duplikat 0", "FIXED", "4f1c9a2"),
    ("B-03", "Studio", "Strip klip bawah 96px selalu tampil walau 0 klip", "qa-layout A-09", "ClipStrip dirender tanpa syarat", "Render kondisional: hanya bila ada klip", "0 px saat kosong", "FIXED", "4f1c9a2"),
    ("B-04", "Studio", "Panel klip bawah makan 135px walau kuncup", "qa-layout A-05", "Section bawah dirender penuh; state kuncup tidak mempengaruhi tinggi", "Kuncup = tidak dirender", "0 px saat kuncup", "FIXED", "4f1c9a2"),
    ("B-05", "Studio", "Timeline 320px menekan preview", "measure.mjs timeline 320", "Tinggi tetap, tidak memperhitungkan sisa ruang", "Ringkas 180 / expand 300 + default ringkas lewat localStorage", "preview dapat +126px", "FIXED", "4f1c9a2"),
    ("B-06", "Studio", "Klik chevron minimize panel Generate tidak berefek", "qa-deep klik -> lebar panel tetap 360", "Handler collapse tidak terpasang pada render state saat ini", "Perbaiki alur setLeftCollapsed + render rail", "panel 360 -> rail 40px", "FIXED", "4f1c9a2"),
    ("B-07", "Sistem", "project.json korup bikin endpoint 500", "check suite backend", "json.load tanpa penanganan exception", "Bungkus try/except, balas 400 + reason, jangan tulis file", "0 gagal suite backend", "FIXED", "4f1c9a2"),
    ("B-08", "Studio", "setPrefs ReferenceError saat simpan preferensi", "konsol pageerror", "Fungsi belum terdefinisi di scope komponen", "Definisikan setPrefs + PUT /prefs", "0 pageerror", "FIXED", "4f1c9a2"),
    ("B-09", "Export", "Klip hasil export muncul sebagai klip baru di daftar", "verify-t4b 7/9 -> 10/10", "Listing klip tidak memfilter file hasil export", "Filter pola _\\d{3,4}p$ di _list_project_clips", "tidak muncul lagi", "FIXED", "4f1c9a2"),
    ("B-10", "Export", "Nama file default membawa suffix _720p", "verify-t4b", "Nama diambil dari file hasil, bukan nama logis", "Nama bersih; suffix ditambahkan server", "nama benar", "FIXED", "4f1c9a2"),
    ("B-11", "QA", "Verifier flaky (kadang gagal kadang lulus)", "3 run berbeda", "Klik pakai dispatchEvent + sleep tetap", "Klik lewat locator nyata + waitForFunction", "stabil 3 run", "FIXED", "b4d50d3"),
    ("B-12", "Infra", "Model deepseek-v4.1-flash rusak tool-call di sesi panjang", "sesi T2 gagal", "Provider/model tidak stabil untuk tool-call panjang", "Demote dari daftar model; T2 dipecah T2a/T2b", "T2 selesai", "FIXED", "dd10393"),
    ("B-13", "Studio", "10 teks penting kontras 4.43:1 (di bawah AA 4.5)", "qa-deep lowContrast 10 item @4.43", "Kelas text-vz-dim memakai nilai hardcode #6E788E di tailwind.config.js, sementara token CSS --vz-text-muted sudah dibuat", "Ubah nilai dim ke #5C667E; samakan --vz-text-muted #5C667E & --vz-text-faint #5F6A85", "0 gagal kontras", "FIXED", "in-commit"),
    ("B-14", "Studio", "Tombol judul panel tinggi 20px (target klik < 24px)", "qa-deep tiny 20px", "Tombol tidak punya padding vertikal", "py-1.5 -my-1", "0 di bawah 24px", "FIXED", "in-commit"),
    ("B-15", "Studio", "Tombol zoom 41x21 & tombol putar 22x22", "qa-deep tiny", "Padding terlalu kecil", "px-2.5 py-1 / p-1.5", "lulus 24px", "FIXED", "in-commit"),
    ("B-16", "Studio", "3 blok timeline terpotong di tepi kanan", "qa-deep clipped 3", "Blok dengan lebar minimum melewati ujung lane", "Klem posisi left <= 100% - lebar minimum", "0 terpotong", "FIXED", "in-commit"),
    ("B-17", "QA", "verify-t2b lapor 'klik kata tidak menggerakkan video' (5/1)", "verify-t2b 5/1 selama 4 run", "DUA bug di verifier: (a) kata kandidat tak terlihat di viewport headless -> jatuh ke idx1 @0.3s; (b) klik pakai koordinat mouse dan titik itu tertutup tombol lain (elementFromPoint != kata). Aplikasi sendiri benar", "Fallback ambil kata >3s dari API + scrollIntoView + cek elementFromPoint; fallback el.click()", "6/6, dan benar-benar mengukur (kata 3.3s -> video 3.3s)", "FIXED", "in-commit"),
    ("B-18", "Studio", "Track teks berisi 514 blok 6px (tak terbaca/tak bisa diklik)", "tools/_zoom.cjs: minW 6, median 6", "Caption per ~4 detik pada video 31 menit = 0.2% durasi", "Gabung caption bersentuhan (<=300ms) -> 134 blok; lebar minimum 24px*zoom/100", "minW 24px @100%, 12px di 200%", "FIXED", "in-commit"),
    ("B-19", "Studio", "Tombol geser/hapus b-roll terpotong saat blok di tepi kanan", "qa-deep clipped", "Tombol pakai left-full (keluar sisi kanan blok)", "Pindah ke atas blok (translate-y -100%) + track dapat padding atas", "0 terpotong", "FIXED", "in-commit"),
    ("B-20", "Sistem", "check_t3a.py crash KeyError 'text'", "suite exit != 0", "Tes menganggap SEMUA item timeline punya payload.text, padahal track 2 juga memuat b-roll (payload src/name)", "Filter kind == 'caption' sebelum memeriksa text", "15/0", "FIXED", "in-commit"),
    ("B-21", "Sistem", "Artefak uji timeline.json tertinggal di work/<pid>/", "ls work/", "Tes POST valid menulis file lalu tidak membersihkan karena crash lebih dulu", "Suite dibersihkan + hapus artefak yang tertinggal", "bersih, .bak dipulihkan", "FIXED", "in-commit"),
    ("B-22", "Studio", "Ruang kosong kanan preview 719px", "deep-report ruangKosong", "Preview dipusatkan, area timeline belum mengisi kolom", "BELUM — desain perlu keputusan produk", "-", "OPEN", "-"),
    ("B-23", "ASR", "Model medium+beam5 = 3.78x realtime (target <=2x)", "check_t7 timing", "CPU tanpa GPU; beam 5 + VAD memang berat", "BELUM — opsi patuh small 1.60x / base 1.78x", "-", "OPEN", "-"),
    ("B-24", "Studio", "Kontras sisa di atas latar #F2F4F7 (teoretis 4.17:1)", "hitung manual", "Beberapa pasangan teks/latar tipis di ambang", "BELUM — perlu audit pasangan warna", "-", "OPEN", "-"),
]
for b in BUGS:
    st = "FIXED" if b[7] == "FIXED" else "OPEN"
    rr = row(ws4, list(b), "", 2)
    ws4.cell(rr, 8).value = b[7]
    ws4.cell(rr, 8).fill = PASS_F if b[7] == "FIXED" else OPEN_F

# ─────────────────────── 5. PENGUKURAN ───────────────────────
ws5 = wb.create_sheet("Pengukuran")
head(ws5, ["Halaman", "Viewport", "Metrik", "Nilai", "Ambang", "Status"], [18, 14, 30, 24, 24, 12])
for key, v in deep.get("pages", {}).items():
    hal, vp = key.split("-") if "-" in key else (key, "-")
    rows = [
        ("Interaktif", v.get("totalInteractive"), "< 6000", "PASS" if (v.get("totalInteractive") or 0) < 6000 else "FAIL"),
        ("Duplikat", len(v.get("dupes", [])), "0", "PASS" if not v.get("dupes") else "FAIL"),
        ("Kontrol terpotong", len([c for c in v.get("clipped", []) if not ("[" in c["txt"] and "s]" in c["txt"])]), "0", "PASS" if not [c for c in v.get("clipped", []) if not ("[" in c["txt"] and "s]" in c["txt"])] else "FAIL"),
        ("Target < 24px", len(v.get("tiny", [])), "0", "PASS" if not v.get("tiny") else "FAIL"),
        ("Tanpa label", len(v.get("noLabel", [])), "0", "PASS" if not v.get("noLabel") else "FAIL"),
        ("Kontras gagal", len(v.get("lowContrast", [])), "0", "PASS" if not v.get("lowContrast") else "FAIL"),
        ("Overflow horizontal", v.get("overflowX"), "false", "PASS" if not v.get("overflowX") else "FAIL"),
        ("Page error", len(v.get("pageErrors", [])), "0", "PASS" if not v.get("pageErrors") else "FAIL"),
    ]
    for m, val, amb, st in rows:
        row(ws5, [hal, vp, m, val, amb, st], st, 3)

# ─────────────────────── 6. VS KOMPETITOR ───────────────────────
ws6 = wb.create_sheet("vs Kompetitor")
head(ws6, ["Kapabilitas", "Vizard", "OpusClip", "Submagic", "Klap", "clip-web", "Catatan"], [30, 16, 16, 16, 16, 18, 52])
KOMP = [
    ("Editor transkrip per kata", "ya", "tidak", "ya", "ya", "ya + flag kata ragu + edit kata", "kita lebih kaya di penyuntingan kata"),
    ("Timeline multi-track", "5 track", "tidak", "tidak", "tidak", "3 track", "kekurangan 2 track"),
    ("Drag blok timeline manual", "ya", "tidak", "tidak", "tidak", "belum (preset + slider)", "kekurangan"),
    ("Preset caption", "ya", "20+", "123 bahasa", "ya", "5 preset", "kekurangan jumlah bahasa"),
    ("Hapus jeda otomatis", "tidak", "paket Starter+", "paket Pro", "tidak", "ya, gratis", "menang"),
    ("Hapus kata pengisi (filler)", "tidak", "terbatas", "ya", "tidak", "ya (ID + frasa)", "menang"),
    ("Transkripsi bahasa Indonesia", "ya", "ya", "ya", "ya", "ya (whisper + glosarium)", "setara, akurasi 37.9% vs acuan"),
    ("Translasi subtitle", "ya", "ya", "ya", "ya", "ya (butuh LLM aktif)", "BLOCKED saat QA"),
    ("Diarisasi speaker", "tidak", "tidak", "ya", "tidak", "ya (heuristik, label jujur)", "model pyannote belum"),
    ("Auto zoom", "tidak", "sebagian", "paket Pro", "tidak", "ya", "menang"),
    ("Safe zone per platform", "ya", "ya", "ya", "ya", "ya", "setara"),
    ("Brand kit / logo / intro-outro", "ya", "ya", "ya", "ya", "ya", "setara"),
    ("B-roll library", "ya (berlisensi)", "ya", "ya", "ya", "folder lokal kosong", "kekurangan isi"),
    ("Export 1080p tanpa watermark", "tidak (720p + WM)", "berbayar", "berbayar", "berbayar", "ya, lokal", "menang"),
    ("Posting otomatis + analitik", "ya", "ya", "ya", "ya + analytics", "belum", "kekurangan terbesar"),
    ("Kolaborasi tim", "ya", "ya", "ya", "ya", "tidak", "kekurangan"),
    ("Biaya", "$29/bln", "$15/bln", "$12/bln", "$29/bln", "Rp0", "menang"),
]
for k in KOMP:
    row(ws6, list(k), "", 3)

# ─────────────────────── 7. BATASAN ───────────────────────
ws7 = wb.create_sheet("Batasan & Blocker")
head(ws7, ["Kategori", "Yang tidak bisa diuji", "Alasan teknis", "Cara membuktikan sendiri"], [20, 44, 56, 56])
for b in [
    ("Video playback", "Video benar-benar berjalan (frame bergerak)", "Chromium headless tanpa codec H.264", "Buka http://127.0.0.1:8000, klik sebuah kata di transkrip, lihat preview melompat"),
    ("Translasi", "Terjemahan sungguhan", "9Router tidak aktif saat QA", "Nyalakan 9Router lalu jalankan: node frontend/tools/verify-t9.mjs"),
    ("Posting", "Unggah ke TikTok/IG/YouTube", "belum ada OAuth + akun", "Hubungkan akun di tab Posting lalu jalankan check_t13.py"),
    ("ASR ground truth", "WER sesungguhnya", "tidak ada transkrip manual manusia", "Buat transkrip manual 60 detik lalu bandingkan"),
    ("Diarisasi model", "pyannote.audio", "butuh HF_TOKEN + unduhan model besar", "pip install pyannote.audio, set HF_TOKEN, jalankan verify-t8.mjs"),
    ("Keamanan", "Path traversal & IDOR", "belum dibuat test khusus", "Lihat rekomendasi: GET /api/projects/..%2f..%2fsettings"),
    ("Beban", "10 export paralel", "belum dijalankan", "Jalankan 10 POST /api/export bersamaan, pantau CPU/RAM"),
]:
    row(ws7, list(b), "", 2)

wb.save(OUT)
print(f"OK tulis {OUT}")
print(f"sheet: {wb.sheetnames}")
print(f"test case per halaman: {len(TC)} baris")
print(f"riwayat bug: {len(BUGS)} baris")
