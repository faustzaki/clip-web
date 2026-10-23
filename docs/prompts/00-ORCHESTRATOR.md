Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 00 — Orchestrator (jalankan sekali di awal proyek)

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `docs/TASKS.md (baru)`
- `docs/evidence/before/ (screenshot)`

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi **hanya kalau gagal 2× nyata**:
1. `ninerouter/cbai/deepseek-v4.1-flash`
```bash
# cek dulu model ini bisa nulis file (bukan plan-mode)
py -3.13 docs/scripts/check_model_tools.py "ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash"
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/00-ORCHESTRATOR.md
```
⚠️ `ocf/*` **jangan dipakai**: model di provider itu balas "Plan mode block file writes" — tidak bisa menulis file.

## BACA (berurutan, jangan lompat)
`docs/AGENTS.md` → `docs/ADR.md` → `docs/UI-SPEC.md` → `docs/DATA-MODEL.md` → `docs/IMPLEMENTATION-STRATEGY.md` → `docs/MODELS.md`

## TUGAS
1. Ringkas dalam 10 baris: apa yang dibangun, 7 keputusan terkunci, 6 tugas.
2. Buat `docs/evidence/` dan `docs/evidence/before/` — ambil screenshot kondisi sekarang:
   jalankan `python _mock.py` + `python _shot2.py`, salin hasil ke `docs/evidence/before/`.
3. Inventaris file: untuk tiap file di `frontend/src/components/`, tulis 1 baris isi + jumlah baris.
4. Tulis `docs/TASKS.md`: tabel T1–T6 dengan status `TODO`, model utama, branch yang akan dipakai.
5. Berhenti. Jangan tulis kode.

## KRITERIA TERIMA
- `docs/TASKS.md` ada, 6 baris tugas, semua status TODO.
- `docs/evidence/before/` berisi ≥2 screenshot (projects + studio).
- Tidak ada file sumber yang diubah (`git status` bersih selain `docs/`).

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
