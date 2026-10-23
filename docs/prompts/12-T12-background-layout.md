Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 12 — T12: Background Fill + Layout Reframe (6 jam) · P2

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `server.py`
- `ToolPanel.jsx (panel Layout)`
- `chopify/render_clips.py (blur/overlay)`

Branch: `t12-background`.

## MODEL (jalankan dengan ini)
```
ninerouter/ag/gemini-3.8-flash-high
```
Fallback kalau gagal 2×: `ocf/glm-5.3-flash-free`.
```bash
omp -p --model="ninerouter/ag/gemini-3.8-flash-high" @AGENTS.md @docs/prompts/12-T12-background-layout.md
```
Temp: 0.2 · thinking: `low` (pakai `high` hanya untuk T2/T3 perencanaan). Ganti model = buang konteks tugas, mulai ulang dari prompt ini.

## BACA
`docs/UI-SPEC.md` §4 (pill toolbar) · `chopify/render_clips.py`

## TUGAS
1. Panel `Layout` (dari pill toolbar):
   - `Isi latar`: `Blur` / `Warna` (color picker) / `Hitam`.
   - `Susunan`: `Tengah` (video full, latar blur), `Atas-bawah` (video di atas, latar di bawah), `Kotak` (video 90% dengan border radius).
2. Preview: render CSS yang sama dengan hasil ffmpeg (blur via `filter: blur(24px)` pada duplikat video).
3. Render: `scale` + `boxblur` untuk latar, overlay video utama, `crop` sesuai ratio.
4. Drag vertikal di preview → simpan `offset_y` (-30%..30%) → `crop=...:y='...'`.

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/12/precheck.txt)
```bash
ffmpeg -filters | grep -c boxblur; grep -n 'ratio' server.py | head -3
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau `boxblur` tidak ada → opsi `Blur` disabled, sisa opsi `Warna`/`Hitam` tetap jalan.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/12/BLOCKED.md`.

## KRITERIA TERIMA
- Source 16:9 → export 9:16 tidak ada black bar (screenshot).
- Tiga susunan menghasilkan tiga file berbeda (sha256).
- Drag offset menggeser subjek dan bertahan setelah reload.
- Preview dan hasil render mirip (selisih posisi subjek < 5% tinggi frame).

## ATURAN (mengikat)
- Light theme saja. Tanpa `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, glow. Satu aksen `--vz-accent`.
- Jangan sentuh `chopify/` kecuali tugas menyebutnya. Jangan hapus CropStudioModal, SubtitleStyleEditor, pemilih model AI.
- Jangan tambah dependency kecuali disebut di tugas ini.
- Tidak boleh ada TODO/stub/console.log/data dummy di akhir.
- Bahasa UI: Indonesia, konsisten.

## VERIFIKASI (jalankan, jangan diklaim)
```bash
cd frontend && npm run build
```
Screenshot: `python _mock.py` + `python _shot2.py`, simpan ke `docs/evidence/<TUGAS>/after/`.

## OUTPUT
Laporan format `AGENTS.md`: TUGAS / STATUS / FILE / BUKTI / MENYIMPANG / SISA.
