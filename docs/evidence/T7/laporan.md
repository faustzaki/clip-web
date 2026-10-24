TUGAS: T7 — Akurasi Transkripsi
STATUS: DONE (satu kriteria waktu tidak terpenuhi untuk default baru — lihat MENYIMPANG)

FILE
Backend
- `core_engine.py` — parameter ASR T7: `DEFAULT_ASR_MODEL="medium"`, `ASR_BEAM_SIZE=5`, `ASR_COMPUTE_TYPE="int8"`,
  `ASR_LANGUAGE="id"` (dikunci, 'auto' tetap dipaksa id), `ASR_VAD_MIN_SILENCE_MS=400`,
  `CONFIDENCE_MIN_LOGPROB=-1.0`; fungsi baru `read_glossary`, `glossary_initial_prompt`,
  `disk_free_gb`, `resolve_model_size` ('auto' → large-v3 kalau disk ≥ 10 GB); `condition_on_previous_text=False`;
  `avg_logprob` per kata (`ln probability`) + per segmen; blok `params` di transcript.json.
- `chopify/download_and_transcribe.py` — parameter sama untuk stage-1 CLI + glosarium + `avg_logprob`.
- `server.py` — `GET/PUT /api/glossary` (berkas dibuat kalau belum ada), `POST /api/projects/{id}/transcript/word`
  (timing lama dibagi proporsional per karakter), `GET /api/accuracy` (WER Levenshtein vs `data/wer_sample.json`),
  `avg_logprob/edited/needs_check/model/check_threshold` di `GET /transcript`, setting `whisper_model`
  (`_asr_model_size`) dipakai semua jalur ASR (ingest URL, upload, transkripsi klip, burn subtitle),
  helper `_save_transcript` dipakai cut/tighten/edit kata.
Frontend
- `frontend/src/components/TranscriptPanel.jsx` — underline kuning `#E0A800` untuk kata `perlu dicek`,
  filter `Hanya perlu dicek (n)`, edit kata inline (klik dua kali → input → Enter simpan, Esc batal).
- `frontend/src/components/SettingsModal.jsx` — tab `3. Akurasi ASR`: pilihan model Whisper, editor glosarium
  (`data/glossary.txt`), tabel WER sebelum/sesudah + placeholder jujur.
- `frontend/src/api.js` — `fetchGlossary`, `updateGlossary`, `editTranscriptWord`, `fetchAccuracy`;
  `ingestUrl`/`uploadVideoFile` tidak lagi memaksa `model_size='base'`.
- `frontend/src/hooks/useEditorState.js`, `StudioView.jsx`, `GeneratePanel.jsx`, `NewProjectView.jsx` — wiring.
Data & alat
- `data/glossary.txt` (baru, 4 istilah), `data/wer_sample.json` (baru, sampel 60 detik + hasil ukur).
- `scripts/check_t7.py` (baru, 47 assertion, exit 0), `frontend/tools/verify-t7.mjs` (baru, 17 assertion + screenshot).
- `docs/DATA-MODEL.md`, `docs/TESTING.md` — endpoint/kolom/skrip cek T7.
- `_mock.py` — endpoint `/api/glossary`, `/api/accuracy`, edit kata, `needs_check` di transkrip mock.

BUKTI
- `docs/evidence/T7/precheck.txt` — faster_whisper 1.2.1 ada; `data/glossary.txt` TIDAK ada (dibuat kosong + UI editor).
- `docs/evidence/T7/check.txt` — `python scripts/check_t7.py` → **SEMUA CEK T7 LULUS** (exit 0).
- `docs/evidence/T7/ui-check.txt` — `cd frontend && node tools/verify-t7.mjs` → **PASS 17 / FAIL 0**.
- Screenshot `docs/evidence/T7/after/`: `transcript-kata-ragu.png`, `transcript-filter-perlu-dicek.png`,
  `transcript-edit-kata.png`, `akurasi-wer.png`, `akurasi-glosarium-tersimpan.png`; `before/` = baseline studio.
- `cd frontend && npm run build` → built in 14.47s, 0 error.
- WER 60 detik: **62.1% → 37.9%** (turun 24.2 poin persen) — `docs/evidence/T7/wer.txt`, angka nyata dari
  `GET /api/accuracy` (dipakai mock agar screenshot tidak memakai angka salinan).
- Edit kata: tersimpan di `transcript.json` + backup, bertahan setelah reload, timing dibagi per karakter
  (kata "eee" 1.0–1.6 s → "eh" 1.0–1.24 s + "iya" 1.24–1.6 s), ditandai `edited=1` sehingga tidak lagi `perlu dicek`.
- Waktu: `docs/evidence/T7/waktu.txt`.

MENYIMPANG
1. **Kriteria "waktu proses ≤ 2x sebelumnya" tidak terpenuhi untuk default baru.** Terukur pada CPU int8,
   audio 60 detik: base+beam1 15.5 s (sebelum) vs medium+beam5 58.6 s (sesudah) = **3.78x**.
   Penyebab: ukuran model (medium 3.05x base), beam 5 hanya +1.24x. Parameter prompt (medium + beam 5) tidak
   bisa memenuhi ≤2x di CPU. Mitigasi yang sudah tersedia: setting `whisper_model` di tab Akurasi ASR —
   `small` = 1.60x, `base` = 1.78x (keduanya memenuhi ≤2x). Default tetap `medium` sesuai prompt.
2. **Upgrade otomatis ke `large-v3`** diimplementasikan sebagai opsi model `auto` (dipilih pengguna), bukan
   perilaku default: default `large-v3` akan melanggar kriteria waktu lebih jauh (≈2–4x medium di CPU).
3. **Pintu masuk edit kata = klik dua kali**, bukan klik tunggal: UI-SPEC §4 mengikat "klik kata = `seek(t)`",
   jadi klik tunggal dipertahankan dan edit dibuka lewat klik dua kali (tertulis di `title` kata).
4. **Acuan WER** memakai caption YouTube project yang sama (60 detik, tag non-ucapan dibuang) karena tidak ada
   transkrip manual di repo; angka sebelum/sesudah diukur dengan acuan yang sama sehingga selisihnya sahih.
   Catatan ini ditulis di `data/wer_sample.json` (`reference_note`).
5. `bg-black/60` di `GeneratePanel.jsx` (overlay video, baris 430) sudah ada sebelum T7 dan tidak disentuh;
   file itu hanya menerima 2 baris prop baru, jadi tidak masuk pemindaian tema di `check_t7.py`.

SISA
- Tidak ada. `large-v3` belum diukur (butuh unduhan besar); opsinya sudah ada di UI dan resolvernya diuji unit.
