# T8 — Diarisasi speaker

TUGAS: T8 — Diarisasi Speaker (jalur A pyannote BLOCKED → jalur B jalan penuh)
STATUS: PARTIAL (jalur A blocked karena prasyarat mesin; jalur B + seluruh UI selesai)

FILE:
- baru `diarize.py` — jalur A (pyannote 3.1, butuh HF_TOKEN) + jalur B (VAD jeda >500 ms,
  f0 autokorelasi FFT, energi, k-means 2–4 klaster deterministik), `prefix_words()` untuk caption
- baru `scripts/make_t8_fixture.py` — audio uji dua suara TTS Windows + timing kata + skor akurasi
- baru `scripts/check_t8.py` — 8 cek, exit 0
- baru `frontend/tools/verify-t8.mjs` — 9 cek UI + screenshot
- `server.py` — `POST /api/projects/{id}/diarize`, `PATCH /api/speakers/{id}`,
  `GET /api/projects/{id}/transcript` + `speaker`/`speakers`/`diarize_model`,
  `_caption_words()` dipakai `render_clip` + `_run_export`, pref `speaker_names_in_caption`
- `frontend/src/components/TranscriptPanel.jsx` — badge nama di kiri paragraf, warna 4 speaker,
  filter `Semua / Speaker n`, rename (pensil/Enter), toggle `Tampilkan nama di caption`, label `(perkiraan)`
- `frontend/src/api.js`, `frontend/src/hooks/useEditorState.js`,
  `frontend/src/components/GeneratePanel.jsx`, `frontend/src/components/StudioView.jsx` — wiring aksi+pref
- `_mock.py` — endpoint diarisasi/speaker untuk screenshot
- `docs/DATA-MODEL.md` — kontrak endpoint + catatan penyimpanan speakers

BUKTI:
- `docs/evidence/T8/precheck.txt` — torch 2.13.0+cpu ADA · pyannote.audio TIDAK · HF_TOKEN TIDAK ·
  dua suara TTS (Microsoft David/Zira) tersedia
- `docs/evidence/T8/check.txt` — `py -3.13 scripts/check_t8.py` → **SEMUA CEK T8 LULUS** (8/8):
  akurasi kata 100% (62/62) pada audio 35,56 s dua suara; durasi 35560→35560 ms; rename tersimpan;
  prefix `Nama: ` di 6/6 giliran speaker
- `docs/evidence/T8/ui-check.txt` — `node tools/verify-t8.mjs` → 9/9 lulus (panel speaker, badge,
  tombol model disabled + alasan Indonesia, diarisasi perkiraan, filter 13→7 kata, rename, toggle)
- `docs/evidence/T8/ffprobe.txt` + `after/captions-host.ass` vs `after/captions-budi-santoso.ass`
  → caption export berubah `HOST: HALO SEMUANYA HARI` → `BUDI SANTOSO: HALO SEMUANYA HARI`
- `docs/evidence/T8/after/export-caption-1-host.png` & `export-caption-2-budi.png` — 2 frame hasil
  export nyata (ffmpeg burn caption), durasi keduanya 6,037188 s (audio tidak bergeser)
- `docs/evidence/T8/after/speaker-panel.png`, `speaker-filter.png`, `speaker-rename.png`,
  `speaker-caption-toggle.png` — UI light theme
- `cd frontend && npm run build` → ✓ built, 0 error
- `docs/evidence/T8/BLOCKED.md` — jalur A: perintah, output, yang jalan, yang belum, cara unblock

MENYIMPANG:
1. `docs/DATA-MODEL.md` menaruh speaker di tabel SQLite `speakers`; repo ini **tidak punya SQLite
   sama sekali** (T2/T3/T7 juga file-based). T8 menyimpan `speakers[]` di `work/<pid>/project.json`
   dan `speaker` per kata di `transcript.json`; id dibuat unik antar project agar
   `PATCH /api/speakers/{id}` (tanpa project di path) tetap unambiguous. Bentuk API sama.
2. Pref `speaker_names_in_caption` ditambahkan ke `DEFAULT_RENDER_PREFS` (`render_prefs` bebas dict,
   `PrefsRequest` tidak diubah).
3. `frontend/src/components/GeneratePanel.jsx` dan `StudioView.jsx` ikut disentuh (wiring prop) —
   daftar file prompt tidak menyebutnya, tapi tanpa itu UI speaker tak bisa menerima data.
4. `bg-black/60` di `GeneratePanel.jsx:436` (scrim preview video dari T7) dibiarkan — bukan kode T8.
5. `librosa` tidak dipakai (absen di mesin); pitch jalur B pakai autokorelasi FFT `numpy` — sesuai
   izin prompt ("atau numpy FFT kalau librosa tak ada").

SISA:
- Diarisasi dengan model (pyannote) belum bisa diuji di mesin ini → jalur A hanya tervalidasi
  lewat kontrak placeholder + kode; unblock: `pip install pyannote.audio` + set `HF_TOKEN`.
- Caption ber-prefix nama hanya berlaku untuk export (`/api/render`, `/api/export`) yang memakai
  transkrip project; `POST /api/clips/{slug}/subtitles` masih memakai cache kata per klip
  (tanpa informasi speaker) sehingga tidak mendapat prefix.
