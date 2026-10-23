Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 07 — T7: Akurasi Transkripsi (5 jam) · P1

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `chopify/*transcribe*.py (cari: grep -ril whisper chopify/)`
- `server.py`
- `TranscriptPanel.jsx`
- `SettingsModal.jsx (editor glossary)`

Branch: `t7-akurasi`. Ini prasyarat T8/T9 — diarisasi & translasi jelek kalau transkripnya jelek.

## BACA
`chopify/transcribe.py` (atau file ASR yang ada) · `docs/DATA-MODEL.md` §1 · `docs/MODELS.md` §5

## TUGAS
1. Naikkan kualitas ASR (parameter, bukan model baru):
   - `model_size="large-v3"`, `compute_type="int8"`, `beam_size=5`, `language="id"` (dikunci, jangan auto),
   - `vad_filter=True`, `vad_parameters=dict(min_silence_duration_ms=400)`,
   - `condition_on_previous_text=False` (mencegah halusinasi berulang),
   - `word_timestamps=True`.
2. Glosarium: baca `data/glossary.txt` (1 istilah per baris: nama brand, produk, istilah teknis) → gabungkan ke `initial_prompt`. Tambah UI kecil di Settings untuk mengedit file itu.
3. Skor keyakinan: simpan `avg_logprob` per kata. Kata dengan `avg_logprob < -1.0` ditandai `perlu cek` (underline kuning `#E0A800`), plus filter `Hanya perlu dicek` di panel transcript.
4. Edit kata inline: klik kata → input → Enter → simpan teks baru; timing **tidak** dihitung ulang lewat ASR, tapi dibagi proporsional di rentang kata itu (`start..end` dibagi rata per karakter).
5. Halaman kecil `Akurasi`: tampilkan WER terhadap `data/wer_sample.json` (60 detik transkrip manual) — hitung Levenshtein, tampilkan sebelum/sesudah.

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/T7/precheck.txt)
```bash
python -c "import faster_whisper,sys;print(faster_whisper.__version__)"; ls data/glossary.txt 2>/dev/null || echo NO_GLOSSARY
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau `glossary.txt` tidak ada → buat file kosong + UI editor; jangan ubah prompt ASR tanpa glosarium.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/T7/BLOCKED.md`.

## KRITERIA TERIMA
- WER sampel 60 detik **turun** dibanding sebelum (tulis angka sebelum & sesudah di laporan).
- Kata ragu tampil dengan underline kuning dan bisa difilter.
- Edit kata tersimpan di DB dan bertahan setelah reload.
- Waktu proses tidak lebih dari 2× sebelumnya (ukur dengan `time`).

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
