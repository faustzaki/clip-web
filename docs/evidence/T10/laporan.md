TUGAS: T10 — B-roll dari folder lokal
STATUS: DONE (materi b-roll memakai 3 aset uji buatan — lihat BLOCKED.md)

FILE:
- baru: `broll_index.py` (index folder, tag nama file + `tags.json`, thumbnail ffmpeg, skor saran)
- `server.py`: import `broll_index`, mount `/broll`, `GET /api/broll/index`, `POST /api/broll/refresh`,
  `_clip_keywords()`, `_broll_payload()`, `_stored_broll_spans()`, argumen `brolls=` di render klip & export
- `chopify/render_clips.py`: parameter `brolls`, `_kept_time()`, `_remap_broll()`, overlay
  `scale+crop → setpts → overlay ... enable='between(t,s,e)'` sebelum caption dibakar
- `frontend/src/api.js`: `fetchBrollIndex()`, `refreshBrollIndex()`
- `frontend/src/hooks/useEditorState.js`: `insertBroll()`, `moveBroll()`, `removeBroll()` (track 2, 2500 ms, opacity 1.0)
- `frontend/src/components/ToolPanel.jsx`: panel `B-roll` (catatan playhead, grid kartu 2 kolom, tag, durasi, `Sisipkan`, `Muat ulang index`, empty state, 5 saran bertanda "Saran")
- `frontend/src/components/Timeline.jsx`: kartu b-roll + tombol geser ‹ › 0,5 s & hapus ×
- `frontend/src/components/StudioView.jsx`: wiring props panel + timeline
- `_mock.py`: endpoint mock `/api/broll/index`, `/api/broll/refresh`, static `/broll/*`, mode `MOCK_NO_BROLL=1`, 1 item b-roll contoh di timeline
- baru: `scripts/check_t10.py`, `frontend/tools/verify-t10.mjs`
- `.gitignore`: `data/broll/*` diabaikan, `.gitkeep` disimpan

BUKTI:
- `docs/evidence/T10/precheck.txt` — `ls data/broll` kosong → `NO_BROLL_DIR`, ffmpeg/ffprobe 9.0 ada
- `docs/evidence/T10/check.txt` — `py -3.13 scripts/check_t10.py` → **0 gagal** (8 assertion):
  refresh 200 + jumlah item = jumlah berkas; index 200 + ≤5 saran urut skor menurun;
  folder kosong → `{ok:true,count:0,hint}`; index 50 file **2,77 s** (< 10 s);
  3 b-roll tersisip via `POST /timeline` lalu **muncul di render** (`rgb` merah/biru/hijau vs dasar);
  di luar jendela b-roll frame kembali ke video asli; audio aac 6,000 s tanpa jeda senyap;
  tanpa `TODO`/`console.log`/`dark:` di berkas yang disentuh
- `docs/evidence/T10/ffprobe.txt` — 1080×1920 h264 180 frame + aac 260 frame, durasi 6 s
- `docs/evidence/T10/after/frame-broll-1.png · frame-broll-2.png · frame-broll-3.png` — 3 frame hasil render (3 b-roll berbeda)
- `docs/evidence/T10/verify-ui.txt` — `node tools/verify-t10.mjs` → **12 lulus, 0 gagal** (panel, grid 2 kolom, thumbnail, saran, sisipkan di playhead, kartu timeline, geser, hapus, empty state, tanpa error runtime)
- `docs/evidence/T10/after/broll-panel.png · broll-sisip.png · broll-timeline.png · broll-empty.png`
- `cd frontend && npm run build` → 0 error (index-DU…/index-Bh4dX4Qo.js 389,70 kB)
- `docs/evidence/T10/BLOCKED.md` — folder awal kosong: empty state jalan, aset uji buatan didokumentasikan

MENYIMPANG:
- Saran tag ikut dikirim di `GET /api/broll/index?project_id=&candidate_index=` (bukan endpoint terpisah)
  supaya satu panggilan saja; `docs/DATA-MODEL.md` hanya menyebut `/api/broll/index` + `/api/broll/refresh`.
- Item b-roll disimpan/diubah lewat `POST /api/projects/{id}/timeline` yang sudah ada (T3), jadi tidak ada endpoint timeline baru.
- Tombol geser/hapus ditaruh di sisi kanan blok b-roll (blok 2500 ms terlalu sempit untuk memuat 3 tombol di dalamnya).
- Waktu item b-roll digeser otomatis saat `do_tighten` (pemetaan keep-range) — tanpa itu overlay akan jatuh di titik yang salah.

SISA:
- Tidak ada. Sisa di luar lingkup: b-roll belum punya transisi/fade, pencarian tag manual, dan penyesuaian durasi per item (durasi tetap 2500 ms sesuai prompt).
