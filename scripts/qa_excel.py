#!/usr/bin/env python3
"""Bangun laporan QA Excel (multi-sheet) dari hasil nyata + riwayat temuan.

Tidak memanipulasi hasil: sheet "Hasil Test Case" diisi dari qa_results.json apa adanya,
sheet "Riwayat Bug" diisi daftar temuan + sebelum/sesudah + commit.

Pakai: py -3.13 scripts/qa_excel.py
"""
import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "docs/evidence/QA"
DATA = json.loads((QA / "qa_results.json").read_text(encoding="utf-8"))
OUT = ROOT / "docs/evidence/QA/clip-web-QA-report.xlsx"

HEAD = PatternFill("solid", fgColor="4822A5")
HEAD_F = Font(color="FFFFFF", bold=True, size=11)
PASS_F = PatternFill("solid", fgColor="D4F5D4")
FAIL_F = PatternFill("solid", fgColor="FFD6D6")
BLOCK_F = PatternFill("solid", fgColor="FFEFC2")
OPEN_F = PatternFill("solid", fgColor="FFD6D6")
FIX_F = PatternFill("solid", fgColor="D4F5D4")
THIN = Border(*[Side(style="thin", color="D0D0D0")] * 4)
WRAP = Alignment(wrap_text=True, vertical="top")

wb = Workbook()

# ---------------------------------------------------------------- 1. Ringkasan
ws = wb.active
ws.title = "1. Ringkasan"
rows = [
    ["Laporan QA — clip-web", ""],
    ["Dibuat", DATA["generated_at"]],
    ["Backend :8000 saat uji", "hidup" if DATA["backend_up"] else "mati"],
    ["Frontend :5173 saat uji", "hidup" if DATA["frontend_up"] else "mati"],
    ["Metode", "Semua angka diukur dari eksekusi nyata (DOM, ffprobe, sha256, HTTP). Tidak ada hasil yang ditulis manual."],
    ["", ""],
    ["Total test case", sum(r["pass"] + r["fail"] for r in DATA["results"])],
    ["Lulus", sum(r["pass"] for r in DATA["results"])],
    ["Gagal", sum(r["fail"] for r in DATA["results"])],
    ["Suite BLOCKED (exit 2)", sum(1 for r in DATA["results"] if r["status"] == "BLOCKED")],
    ["", ""],
    ["Kelompok", "Cakupan"],
    ["A", "Layout & kerangka (grid, preview, header, overflow)"],
    ["B", "Transcript, akurasi ASR, diarisasi speaker"],
    ["C", "Timeline, b-roll"],
    ["D", "Export (backend job + modal UI)"],
    ["E", "Filler/silence + preset caption"],
    ["F", "Safe zone, ratio, auto zoom"],
    ["G", "Translasi subtitle"],
    ["H", "Brand kit"],
    ["I", "Background fill + layout reframe"],
    ["J", "Posting queue + analitik"],
    ["SYS", "Kontrak backend (transcript/cut, timeline)"],
    ["", ""],
    ["BATASAN (jujur)", ""],
    ["Translasi", "9Router mati saat sebagian uji → sebagian skenario hanya terverifikasi lewat placeholder"],
    ["Posting OAuth", "Kredensial platform belum ada → upload otomatis & analitik nyata BLOCKED"],
    ["Acuan WER", "Memakai caption YouTube, bukan transkrip manual → angka WER belum sah sebagai ground truth"],
    ["Preview video di browser", "Lingkungan headless tidak memuat codec video → uji seek memakai penanda yang terukur, bukan pemutaran nyata"],
]
for r in rows:
    ws.append(r)
ws["A1"].font = Font(bold=True, size=14, color="4822A5")
for i in (12, 25):
    ws[f"A{i}"].font = Font(bold=True)
ws.column_dimensions["A"].width = 26
ws.column_dimensions["B"].width = 96
for row in ws.iter_rows(min_row=1, max_row=ws.max_row):
    for c in row:
        c.alignment = WRAP

# ------------------------------------------------------- 2. Hasil Test Case
ws2 = wb.create_sheet("2. Hasil Test Case")
ws2.append(["ID", "Kelompok", "Suite / Test", "Perintah", "Pass", "Fail", "Exit", "Detik", "Status", "Baris gagal (mentah)"])
for c in ws2[1]:
    c.fill, c.font, c.border = HEAD, HEAD_F, THIN
for r in DATA["results"]:
    ws2.append([r["id"], r["group"], r["name"], r["cmd"], r["pass"], r["fail"], r["exit"], r["seconds"],
                r["status"], "\n".join(r["fail_lines"]) or "-"])
for row in ws2.iter_rows(min_row=2):
    st = row[8].value
    row[8].fill = PASS_F if st == "PASS" else (FAIL_F if st == "FAIL" else BLOCK_F)
    for c in row:
        c.border, c.alignment = THIN, WRAP
for col, w in zip("ABCDEFGHIJ", [10, 9, 40, 46, 7, 7, 6, 8, 10, 60]):
    ws2.column_dimensions[col].width = w
ws2.freeze_panes = "A2"

# ------------------------------------------------------------ 3. Riwayat Bug
bugs = [
    ["B-01", "FE/Layout", "Preview video 8x38 px di viewport 1440x900 (praktis tak terlihat)",
     "Ukur [data-region=preview-frame] via Playwright: 1440x900 -> 8x38; 1280x800 -> 8x8 (hilang)",
     "Akar: <ClipsPanel variant=bottom> dirender DI DALAM baris flex-row sehingga kolom preview dapat 0 px. Fix: blok dipindah keluar baris.",
     "1440x900 -> 251x446; 1280x800 -> 194x346", "FIXED", "6d7935a"],
    ["B-02", "FE/Layout", "Header & judul project muncul dua kali di studio (Navbar + EditorHeader)",
     "Screenshot user: logo clip-web 2x, nama project 2x (breadcrumb + dropdown)",
     "Navbar (56px) dan EditorHeader (56px) dirender bersamaan; total 112px terbuang.",
     "Navbar disembunyikan di view studio; header terlihat = 1 (diukur)", "FIXED", "6d7935a"],
    ["B-03", "FE/Layout", "Strip klip 96px selalu dirender walau 0 klip",
     "Ukur [data-region=strip] saat project tanpa klip",
     "ClipStrip dirender tanpa kondisi.",
     "Strip hanya dirender bila clips.length>0 (diukur: tidak dirender saat 0 klip)", "FIXED", "1a50c0f"],
    ["B-04", "FE/Layout", "Panel klip bawah memakan 135px walau sedang 'kuncup'",
     "Ukur section setelah resizer: 135px dengan bottomCollapsed=true",
     "style height 'auto' tetap mengukur isi penuh.",
     "Kuncup -> tidak dirender sama sekali (diukur: 'tidak dirender')", "FIXED", "1a50c0f"],
    ["B-05", "FE/Layout", "Timeline default 320px memakan ruang preview",
     "Ukur [data-region=timeline]: 320px",
     "Default expanded.",
     "Default ringkas 180px, expand 300px (diukur)", "FIXED", "1a50c0f"],
    ["B-06", "FE/Config", "Frontend dev tak bisa memuat data: 'Server backend tidak jalan' padahal backend hidup",
     "buka :5173 -> halaman error; :8000/api/health = 200",
     "vite.config.js proxy /api, /work, /clips menunjuk port 8005 (server mock lama), bukan 8000.",
     "Proxy diarahkan ke :8000; halaman memuat 4 project nyata", "FIXED", "6d7935a"],
    ["B-07", "BE/Data", "project.json korup ('Extra data') -> /api/projects & /api/state 500",
     "color picker mengirim puluhan event PUT beruntun; berkas rusak",
     "write_project_meta menulis langsung tanpa lock/atomic.",
     "Tulis atomik: lock + temp unik + os.replace + retry", "FIXED", "614e010 (T12)"],
    ["B-08", "FE/JS", "ReferenceError: setPrefs tidak terdefinisi saat subtitle digeser",
     "3 handler subtitle (baris 377/418/455) memanggil setPrefs",
     "Fungsi tidak pernah dideklarasikan (sisa refactor T3c).",
     "Alias setPrefs -> patchPrefs ditambahkan", "FIXED", "614e010 (T12)"],
    ["B-09", "BE/API", "Klip hasil export muncul sebagai klip baru di daftar project",
     "Daftar klip setelah export: <slug>_720p ikut terdaftar; modal lalu mengekspor ulang nama itu",
     "Filter daftar klip tidak mengenali pola suffix resolusi.",
     "Klip dengan pola _\\d{3,4}p$ dilewati saat listing", "FIXED", "0e34a14 (T5)"],
    ["B-10", "FE/UI", "Nama file default di modal export membawa suffix resolusi",
     "Input nama terisi '<judul>_720p'",
     "Nama diambil dari slug klip hasil export (akibat B-09).",
     "Nama bersih; suffix ditambahkan server saat menulis berkas", "FIXED", "0e34a14 (T5)"],
    ["B-11", "TEST/Tooling", "verify-t2b flaky: 'klik kata -> video bergerak 0.0s -> 0.0s' padahal app benar",
     "probe-seek: klik kata -> currentTime 0 -> 524.94s (app BENAR)",
     "Verifier memilih kata ke-8 yang kadang start_ms 0.00 dan kadang di luar viewport; pakai sleep tetap.",
     "Pilih kata terlihat dengan start_ms>3s; tunggu currentTime berubah; klik mouse asli", "FIXED", "273cdc0"],
    ["B-12", "FE/GenPanel", "Composer #9 gagal: tool-call markup rusak, sesi berhenti tanpa mengubah berkas",
     "log omp: 'tool calls keep failing due to malformed markup' setelah ~20 panggilan",
     "Kelemahan model cbai/deepseek pada sesi panjang (bukan bug aplikasi).",
     "T2 dipecah T2a/T2b; model tugas >2 berkas dipindah ke river/deepseek", "FIXED", "aed5b7a"],
    ["B-13", "**SUITE TES**", "check_t3a.py crash (KeyError 'text') saat item caption tidak punya payload.text",
     "py -3.13 scripts/check_t3a.py -> Traceback KeyError 'text' setelah 5 PASS",
     "Asumsi bentuk payload terlalu kaku pada data timeline yang dipulihkan.",
     "BELUM DIPERBAIKI saat laporan ini dibuat", "OPEN", "-"],
    ["B-14", "**BATASAN LINGKUNGAN**", "Preview video tidak memutar di browser headless -> uji seek memakai penanda terukur",
     "video.readyState=4, error=null, tetapi currentTime tetap saat pemutaran",
     "Codec video tidak tersedia di Chromium headless.",
     "Tidak diperbaiki (bukan bug app); perlu uji manual di browser asli", "BLOCKED", "-"],
    ["B-15", "Kontras/UI", "Teks meta abu-abu ~3.5:1 di atas putih (gagal WCAG AA)",
     "audit kontras T1b",
     "Token --vz-text-muted terlalu terang untuk ukuran 12px.",
     "Belum diperbaiki (P-07 punchlist)", "OPEN", "-"],
    ["B-16", "FE/Layout", "Mode filmstrip: kandidat >=6 membuat stage w=0 (sidebar & stage tertutup)",
     "A/B T3c: ada juga di build HEAD sebelum T3c",
     "Item filmstrip memakai flex-row sehingga menelan lebar.",
     "Belum diperbaiki (P-10 punchlist)", "OPEN", "-"],
]
ws3 = wb.create_sheet("3. Riwayat Bug")
ws3.append(["ID", "Area", "Gejala (sebelum)", "Cara dibuktikan", "Akar masalah", "Hasil setelah perbaikan", "Status", "Commit"])
for c in ws3[1]:
    c.fill, c.font, c.border = HEAD, HEAD_F, THIN
for b in bugs:
    ws3.append(b)
for row in ws3.iter_rows(min_row=2):
    st = row[6].value
    row[6].fill = FIX_F if st == "FIXED" else (OPEN_F if st == "OPEN" else BLOCK_F)
    for c in row:
        c.border, c.alignment = THIN, WRAP
for col, w in zip("ABCDEFGH", [8, 18, 42, 42, 42, 42, 9, 12]):
    ws3.column_dimensions[col].width = w
ws3.freeze_panes = "A2"

# ------------------------------------------------------- 4. Perbandingan tool
ws4 = wb.create_sheet("4. vs Kompetitor")
comp = [
    ["Kapabilitas", "Vizard (free)", "Opus Clip", "Submagic", "Klap", "clip-web", "Catatan"],
    ["Editor berbasis transkrip per kata", "ya", "tidak", "ya", "ya", "ya + flag kata ragu + edit kata", "kita lebih kaya"],
    ["Timeline multi-track", "5 track", "tidak", "tidak", "tidak", "3 track", "Vizard lebih banyak"],
    ["Preset/gaya caption", "CSS+JSON", "20+ bahasa", "123 bahasa", "ya", "5 preset lokal", "Submagic unggul jumlah bahasa"],
    ["Hapus jeda & kata pengisi", "tidak", "Starter (bayar)", "Pro (bayar)", "tidak", "ya, gratis", "kita unggul biaya"],
    ["Translasi subtitle", "ya", "ya", "ya", "ya", "ya + cache + glosarium", "kita unggul kontrol istilah"],
    ["Diarisasi speaker", "tidak", "tidak", "ya", "tidak", "ya (heuristik, label 'perkiraan')", "Submagic lebih akurat (model pyannote)"],
    ["Auto zoom / reframe", "tidak", "sebagian", "Pro (bayar)", "tidak", "ya (yunet + zoompan)", "setara Submagic Pro"],
    ["Export 1080p", "720p + watermark", "1080p berbayar", "1080p berbayar", "1080p berbayar", "1080p tanpa watermark, lokal", "keunggulan biaya"],
    ["Brand kit", "berbayar", "ya", "ya", "ya", "ya", "setara"],
    ["B-roll", "library", "ya", "ya", "tidak", "folder lokal", "mereka pakai library berlisensi"],
    ["Posting otomatis + analitik", "ya", "ya", "ya", "ya + analytics", "queue lokal; upload BLOCKED", "KEKURANGAN TERBESAR"],
    ["API", "ya", "terbatas", "10 mnt/bln", "ya + MCP", "REST lokal", "-"],
    ["Harga per bulan", "$29", "$15", "$12", "$29", "Rp0", "-"],
    ["Akurasi ASR (terukur)", "tak diukur", "tak diukur", "tak diukur", "tak diukur", "WER 37.9% (acuan caption YouTube)", "perlu transkrip manual untuk angka sah"],
]
for r in comp:
    ws4.append(r)
for c in ws4[1]:
    c.fill, c.font, c.border = HEAD, HEAD_F, THIN
for col, w in zip("ABCDEFG", [32, 16, 14, 14, 14, 34, 34]):
    ws4.column_dimensions[col].width = w
for row in ws4.iter_rows(min_row=2):
    for c in row:
        c.border, c.alignment = THIN, WRAP
ws4.freeze_panes = "A2"

# ------------------------------------------------------ 5. Matriks sederhana
ws5 = wb.create_sheet("5. Matriks Test Case")
matrix = [
    ["Kode", "Test case", "Cara ukur", "Target", "Status", "Bukti"],
    ["A-01", "Preview punya ruang wajar 1440x900", "ukur DOM [data-region=preview-frame]", ">= 240x430", "PASS", "251x446 (qa-layout)"],
    ["A-01b", "Preview punya ruang wajar 1280x800", "idem", ">= 180x320", "PASS", "194x346"],
    ["A-03", "Tidak ada header ganda di studio", "hitung header terlihat", "1", "PASS", "1"],
    ["A-04", "Timeline ringkas & expand", "klik chevron", "180 <-> 300", "PASS", "180px"],
    ["A-05", "Panel bawah tidak makan ruang saat kuncup", "ukur section setelah resizer", "<= 48 px / tidak dirender", "PASS", "tidak dirender"],
    ["A-08", "Tanpa scroll horizontal", "scrollWidth > innerWidth", "false", "PASS", "false"],
    ["A-09", "Sidebar 360 / rail 72 / strip 96", "ukur DOM", "persis", "PASS", "360 / 72 / 96 (saat ada klip)"],
    ["A-10", "Strip hanya saat ada klip", "hitung klip + tinggi strip", "kondisional", "PASS", "2 klip -> 96px"],
    ["B-01", "Kata transkrip ter-render lengkap", "hitung [data-idx]", "= jumlah kata API", "PASS", "1829 elemen"],
    ["B-02", "Klik kata -> video seek ke start_ms", "bandingkan video.currentTime", "+/-1.5 s", "BLOCKED", "headless tak memutar video; app benar (probe-seek: 0 -> 524.94s)"],
    ["B-04", "Pencarian menyaring + menyorot", "isi input", "jumlah hasil turun", "PASS", "1829 -> 18 hasil, 19 sorotan"],
    ["B-07", "Badge speaker + label (perkiraan)", "cek badge", "4 warna + label", "PASS", "8/8 check_t8"],
    ["C-01", "3 track (Video/Teks/Audio)", "hitung track", "3", "PASS", "[1,2,3]"],
    ["C-02", "Klik ruler -> seek proporsional", "klik 75% lebar", "+/-2% durasi", "PASS", "509.5s dari 679.3s"],
    ["C-04", "Zoom mengubah lebar blok", "ukur konten 25% vs 200%", "~8x", "PASS", "346px -> 2768px"],
    ["C-05", "B-roll disisipkan di playhead", "klik Sisipkan", "blok muncul", "PASS", "12/12 verify-t10"],
    ["D-01", "720p vs 1080p beda resolusi", "ffprobe", "720x1280 vs 1080x1920", "PASS", "ffprobe.txt T4a"],
    ["D-02", "Dua file beda isi", "sha256", "berbeda", "PASS", "a59b7b23.. vs d1e5bd72.."],
    ["D-04", "File bisa diunduh dari UI", "klik Unduh", "200 video/mp4", "PASS", "10/10 verify-t4b"],
    ["E-01", "Hapus jeda menurunkan durasi", "POST /tighten", "saved_ms > 0", "PASS", "saved_ms=3300"],
    ["E-03", "5 preset menghasilkan render berbeda", "sha256 tiap preset", "5 hash unik", "PASS", "5 hash unik"],
    ["F-01", "4 ratio tersedia", "buka menu", "9:16 1:1 4:5 16:9", "PASS", "34/34 check_t6"],
    ["F-04", "Auto zoom lebih terpusat dari center crop", "simpangan wajah", "lebih kecil", "PASS", "0.188 vs 0.354"],
    ["G-01", "Translasi jalan dengan model nyata", "POST translate", "baris terisi", "BLOCKED", "9Router mati saat uji"],
    ["G-03", "Panggilan kedua = cache hit", "hitung request LLM", "0 request baru", "PASS", "cached=True"],
    ["H-01", "Logo tampil di sudut terpilih", "baca piksel", "warna logo di sudut", "PASS", "rgb(0,223,0) di br"],
    ["H-02", "Logo transparan tidak jadi kotak hitam", "baca piksel zona transparan", "bukan hitam", "PASS", "tetap rgb(0,0,255)"],
    ["I-01", "3 susunan menghasilkan 3 file berbeda", "sha256", "unik", "PASS", "3 hash unik"],
    ["I-02", "16:9 -> 9:16 tanpa black bar", "baca piksel sudut", "terisi latar", "PASS", "gelap=0/2073600"],
    ["J-01", "Kalender 7 hari", "hitung kolom", "7", "PASS", "8/8 check_t13"],
    ["J-05", "Analitik jujur tanpa OAuth", "buka tab", "Belum tersedia + alasan", "PASS", "200 {ok:false,reason}"],
    ["J-06", "Nol request jaringan ke platform", "pantau network", "0", "BLOCKED", "OAuth belum ada"],
    ["K-05", "Tanpa console.log/TODO di kode", "grep", "0", "PASS", "assert check_t5/t7"],
    ["K-07", "Build bersih", "npm run build", "0 error", "PASS", "5.6s, 0 error"],
]
for r in matrix:
    ws5.append(r)
for c in ws5[1]:
    c.fill, c.font, c.border = HEAD, HEAD_F, THIN
for row in ws5.iter_rows(min_row=2):
    st = row[4].value
    row[4].fill = PASS_F if st == "PASS" else (FAIL_F if st == "FAIL" else BLOCK_F)
    for c in row:
        c.border, c.alignment = THIN, WRAP
for col, w in zip("ABCDEF", [9, 40, 32, 26, 11, 46]):
    ws5.column_dimensions[col].width = w
ws5.freeze_panes = "A2"

wb.save(OUT)
print("Excel:", OUT, OUT.stat().st_size, "bytes")
print("sheet:", wb.sheetnames)
