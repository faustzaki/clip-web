Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 07 — Review & QA (jalan setelah tiap tugas merge)

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `hanya membaca diff — tidak menulis kode`

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/cbai/deepseek-v4.1-flash
```
Eskalasi **hanya kalau gagal 2× nyata**:
1. `ninerouter/T-SOTA/claude-sonnet-5`
2. `grok-cli/grok-4.5` (kadang cuma membalas teks, bukan memanggil tool)
```bash
py -3.13 docs/scripts/check_model_tools.py "ninerouter/cbai/deepseek-v4.1-flash"
omp -p --approval-mode=yolo --model="ninerouter/cbai/deepseek-v4.1-flash" --thinking=low @docs/prompts/99-REVIEW.md
```
⚠️ `ocf/*` **jangan dipakai**: balas "Plan mode block file writes" — tidak bisa menulis file.

## BACA
`docs/AGENTS.md` (aturan keras) · `docs/UI-SPEC.md` · diff PR yang direview.

## TUGAS
1. Periksa diff terhadap 10 aturan keras `AGENTS.md`. Laporkan tiap pelanggaran: file, baris, aturan.
2. Cek konsistensi visual: bandingkan screenshot `after/` dengan `docs/UI-SPEC.md` §1–§2. Sebut angka yang menyimpang (px, warna, radius).
3. Cek kualitas kode: komponen >200 baris, prop drilling >3 level, `useEffect` tanpa cleanup, duplikasi logika waktu.
4. Cek state: apakah semua state di §4 UI-SPEC punya tampilan (loading/empty/error)?
5. Jalankan `npm run build` sendiri. Jangan percaya laporan agen lain.
6. Keluarkan verdict: `APPROVE` / `REQUEST CHANGES` + maksimal 7 butir actionable, diurut dampak.

## JANGAN
- Jangan menulis kode perbaikan. Tugas reviewer hanya menilai.
- Jangan memuji. Hanya temuan dan verdict.

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
