Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 04 — T4: Export Modal (2 jam)

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `server.py (export job)`
- `baru: components/ExportModal.jsx`
- `StudioView.jsx + ClipStrip.jsx (pasang tombol)`

Branch: `t4-export`

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/cbai/deepseek-v4.1-flash
```
Eskalasi **hanya kalau gagal 2× nyata**:
1. `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`
```bash
# cek dulu model ini bisa nulis file (bukan plan-mode)
py -3.13 docs/scripts/check_model_tools.py "ninerouter/cbai/deepseek-v4.1-flash"
omp -p --approval-mode=yolo --model="ninerouter/cbai/deepseek-v4.1-flash" --thinking=low @AGENTS.md @docs/prompts/04-T4-export.md
```
⚠️ `ocf/*` **jangan dipakai**: model di provider itu balas "Plan mode block file writes" — tidak bisa menulis file.

## BACA
`docs/UI-SPEC.md` §5 · `docs/DATA-MODEL.md` §3 (`export_jobs`)

## TUGAS
1. Backend: `POST /api/export` body `{clip_id,resolution,fps,burn_caption,name}` → buat baris `export_jobs` status `queued`, balas `{job_id}`. `GET /api/export/{job_id}` → `{status,path,error}`. Render memakai `chopify` yang sudah ada.
2. Buat `components/ExportModal.jsx`:
   - modal 480px, radius 12, shadow lg, overlay `rgba(0,0,0,.48)`.
   - field: nama file (prefill judul klip), resolusi (1080p/720p), fps (30/24), burn caption (toggle), format mp4, perkiraan ukuran.
   - footer: `Batal` (secondary) + `Export` (primary, 40px).
   - state: `form` → `submitting` (spinner di tombol) → `done` (link `Unduh`) → `failed` (alasan + Coba lagi).
3. Polling `GET /api/export/{job_id}` tiap 2s, berhenti saat `done`/`failed` (maks 5 menit).
4. Tombol `Unduh` di `ClipStrip` membuka modal ini.

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/T4/precheck.txt)
```bash
ffmpeg -version | head -1; ffmpeg -encoders | grep -c libx264; curl -s localhost:8000/api/health
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau `/api/render` sudah ada dan jalan → **pakai itu**, tambahkan tabel job di atasnya. Jangan bikin pipeline render kedua.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/T4/BLOCKED.md`.

## KRITERIA TERIMA
- Export 720p dan 1080p menghasilkan dua file berbeda — buktikan `ffprobe` (resolusi tercetak).
- Burn caption off/on menghasilkan file berbeda — buktikan sha256 beda + screenshot frame.
- Modal bisa ditutup dengan Esc dan klik overlay; fokus kembali ke tombol asal.

## ATURAN (mengikat)
- Light theme saja. Tanpa `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, glow. Satu aksen `--vz-accent`.
- Jangan sentuh `server.py`/`chopify/` kecuali tugas menyebutnya.
- Jangan hapus CropStudioModal, SubtitleStyleEditor, pemilih model AI.
- Jangan tambah dependency. Jangan port CSS/aset Vizard (angka boleh, kode/gambar tidak).
- Tidak boleh ada TODO/stub/console.log/data dummy di akhir.
- Bahasa UI: Indonesia, konsisten.

## VERIFIKASI (jalankan, jangan diklaim)
```bash
cd frontend && npm run build
```
Screenshot: pakai `_mock.py` (API tiruan) + `_shot2.py`, simpan ke `docs/evidence/<TUGAS>/after/`.

## OUTPUT
Laporan format `AGENTS.md` §Format laporan: TUGAS / STATUS / FILE / BUKTI / MENYIMPANG / SISA.
