Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 08 — T8: Diarisasi Speaker (6 jam) · P1

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `baru: diarize.py`
- `server.py`
- `TranscriptPanel.jsx`
- `DATA-MODEL: tabel speakers`

Branch: `t8-diarisasi`. Tergantung T7.

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/cbai/deepseek-v4.1-flash
```
Eskalasi **hanya kalau gagal 2× nyata**:
1. `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`
```bash
# cek dulu model ini bisa nulis file (bukan plan-mode)
py -3.13 docs/scripts/check_model_tools.py "ninerouter/cbai/deepseek-v4.1-flash"
omp -p --approval-mode=yolo --model="ninerouter/cbai/deepseek-v4.1-flash" --thinking=low @AGENTS.md @docs/prompts/08-T8-diarisasi.md
```
⚠️ `ocf/*` **jangan dipakai**: model di provider itu balas "Plan mode block file writes" — tidak bisa menulis file.

## BACA
`docs/DATA-MODEL.md` §1 (`transcript_words.speaker`) · `docs/UI-SPEC.md` §4

## TUGAS
Jalur A (utama) — `pyannote.audio` 3.1 / `whisperx`:
1. Tambah `diarize.py`: muat `pyannote/speaker-diarization-3.1`, butuh `HF_TOKEN` di env. Kalau torch/token tidak ada → **jangan crash**, aktifkan jalur B.
2. Gabungkan hasil diarisasi ke kata: untuk tiap kata, ambil speaker dengan overlap terbesar.
3. `speaker_label` disimpan di tabel `speakers` (id, project_id, label, color_idx).

Jalur B (fallback wajib) — heuristik tanpa torch:
4. Segmentasi dari jeda VAD > 500ms + pitch rata-rata (`librosa.pyin` atau `numpy` FFT kalau librosa tak ada) → klaster 2–4 speaker sederhana (k-means pada pitch+energi).
5. Tandai hasil jalur B dengan `confidence="estimate"`; UI **wajib** menampilkan label `(perkiraan)`.

UI (dua jalur sama):
6. Warna 4 speaker (`#4822A5`, `#0E7C86`, `#B45309`, `#9D174D`), badge nama di kiri tiap paragraf.
7. Klik nama speaker → rename (mis. "Host", "Narasumber").
8. Filter `Semua / Speaker 1 / …` di panel transcript menyaring kata yang tampil.
9. Toggle `Tampilkan nama di caption` — kalau aktif, `subtitle_burn` menambahkan prefix `Nama: `.

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/T8/precheck.txt)
```bash
python -c "import torch;print(torch.__version__)" 2>&1 | head -1; python -c "import pyannote.audio" 2>&1 | head -1; test -n "$HF_TOKEN" && echo HF_OK || echo NO_HF
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau torch/pyannote/HF_TOKEN absen → **jalur B wajib jalan** (VAD jeda >500ms + pitch), semua label `(perkiraan)`, tombol `Diarisasi (model)` disabled dengan alasan. Jangan menambah dependency tanpa izin.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/T8/BLOCKED.md`.

## KRITERIA TERIMA
- Uji dengan audio 2 speaker (bikin dengan TTS dua suara, 40 detik) → minimal **80%** kata mendapat speaker benar.
- Kalau jalur B aktif, label `(perkiraan)` muncul dan tidak ada exception di log.
- Rename speaker mengubah caption hasil export (bukti: screenshot 2 frame).
- Diarisasi **tidak** memotong/menggeser audio; durasi total identik sebelum-sesudah.

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
