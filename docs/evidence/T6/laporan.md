TUGAS: T6 — Safe Zone + Ratio Berlabel + Auto Zoom (zoompan + yunet)
STATUS: DONE

FILE
- `chopify/render_clips.py` — `ASPECTS` dapat `4:5`; mesin zoom baru: `compute_zoom_keyframes()` (YuNet per 0.2 s → kotak crop berasio target → ramp `snap_inputs`, dedupe), `zoompan_filter()`, `_sendcmd_lines()`, `_build_crop_filter()`; `render()` terima `zoom_manual` + `zoom_keyframes` (payload timeline) dan tetap `crop_mode` (`center`/`blur`/`solid`) sebagai dasar crop
- `server.py` — `POST /api/projects/{id}/zoom-keyframes` (`{ok,keyframes}`; tanpa yunet → 200 `{ok:false,reason,hint}`), prefs `safe_zone`/`zoom_auto`/`zoom_manual` (+ validasi 400 rentang 100–160), `_stored_zoom_keyframes()` dibaca `POST /api/render` & export klip; `GET /api/options` mengirim 4 rasio
- `frontend/src/components/PreviewStage.jsx` — pill toolbar berlabel teks di bawah preview (`Ratio (9:16)` · `Background` · `Layout` · `Layar penuh`), menu Ratio 4 pilihan, overlay safe zone (88% x 80% garis putus-putus + label `Area aman`), panel Layout (toggle Area aman/Auto zoom, slider Zoom manual 100–160%, pilihan Tampilan video + Overlay pindah dari ikon atas ke panel ini)
- `frontend/src/components/IconDropdown.jsx` — **dihapus** (86 baris); penggantinya pill toolbar berlabel + panel Layout, jadi tidak ada dua toolbar tumpang tindih
- `frontend/src/components/Timeline.jsx`, `frontend/src/hooks/useEditorState.js`, `frontend/src/api.js` — `saveZoomKeyframes()` (payload track video, kunci per `candidate_index`), badge `Zoom` di track video, `computeZoomKeyframes()`
- `frontend/src/components/StudioView.jsx` — nilai awal prefs (`safe_zone`, `zoom_auto`, `zoom_manual`) + alur simpan; `savePrefs` ikut memperbarui `prefsRef.current` supaya dua PUT berurutan tidak saling menimpa
- `frontend/src/components/PreviewStage.jsx` — `patchPrefs()` merge dari `prefsRef` (bukan prop `prefs` yang bisa basi di tick yang sama) dan `runAutoZoom()` memakai nilai zoom terbaru; sebelum ini geser slider Auto zoom ON menulis `zoom_manual 130` lalu langsung ditimpa balik `100` oleh PUT auto zoom
- `_mock.py` — `/api/options` 4 rasio, `POST .../zoom-keyframes` (keyframes palsu deterministik), prefs `safe_zone`/`zoom_auto`/`zoom_manual`, `POST /api/render` menghormati `zoom_manual`
- `frontend/tools/verify-t6.mjs` (baru), `scripts/check_t6.py` (baru), `docs/UI-SPEC.md` + `docs/DATA-MODEL.md` (rasio & kontrak endpoint/`payload.zoom_keyframes`)
- Diff (tanpa `frontend/dist` & evidence): +685 / −171 baris (lihat MENYIMPANG soal angka ini)

BUKTI
- `docs/evidence/T6/precheck.txt` — `zoompan` ada (ffmpeg 1 filter), `yunet.onnx` 232.589 B ada di root + `work/`, `render_clips.py` sudah mereferensikannya → jalur penuh dipakai (placeholder tidak diperlukan)
- `docs/evidence/T6/check.txt` — `py -3.13 scripts/check_t6.py` → **exit 0, 0 gagal (34 PASS)**. Termasuk:
  - `POST /zoom-keyframes` → `ok:true`, 60 kotak untuk 12 s (≥1/detik), kotak berasio 9:16 dan di dalam frame, 46 posisi x unik, dx pusat kotak vs wajah 0.094
  - kriteria terima ratio: `9:16 → (1080,1920)` vs `4:5 → (1080,1350)` (beda resolusi per ratio, durasi tetap 12.00 s)
  - auto zoom: `sha256` render 9:16 + auto zoom **identik** dengan render yang memakai `payload.zoom_keyframes` tersimpan
  - subjek: simpangan dari tengah `0.188` (zoom) vs `0.354` (center crop) → lebih terpusat
  - `PUT /prefs` simpan `safe_zone`/`zoom_auto`/`zoom_manual`; `zoom_manual=200` → 400
- `docs/evidence/T6/ffprobe.txt` + `sha256.txt` — 4 render nyata: `t6-9x16.mp4` `5a1cf959…` = `t6-stored.mp4` (payload → render), `t6-baseline.mp4` `1c54e761…`, `t6-4x5.mp4` `b4fbdba1…`
- `docs/evidence/T6/ui-check.txt` — `node tools/verify-t6.mjs` (1920x1080) → **0 gagal (15 PASS)**: 4 pill berlabel, menu Ratio 4 pilihan, pill ikut berubah saat 4:5, preview 4:5 `110x138 = 0.800`, panel Layout + slider 100–160, safe zone `61x104 dari 69x130` (88% x 80%), komposisi preview tidak bergeser (`77x138 → 77x138`), label `Area aman`, catatan jumlah titik zoom, badge `Zoom` di timeline, `zoom_manual 130` tersimpan ke prefs **dan** label slider ikut jadi `Zoom manual 130%` (assertion ini awalnya merah: PUT auto zoom menimpa balik `zoom_manual` jadi 100 — sudah diperbaiki)
- `docs/evidence/T6/after/` — `pill-toolbar.png`, `ratio-menu.png`, `ratio-4x5.png`, `safe-zone.png`, `layout-panel.png`, `auto-zoom.png`, `zoom-manual-130.png`, serta `zoom-{10,50,90}pct.png` vs `baseline-{10,50,90}pct.png` (3 titik durasi, pembanding center crop)
- `cd frontend && npm run build` → exit 0 (`index-DbAmzr8V.js`, `index-BnjIzJzC.css`)
- smoke tambahan: `render(..., zoom_manual=140)` tanpa keyframes → `(1920,1080)` file valid (jalur zoom manual saja)

MENYIMPANG
- Auto zoom memakai `sendcmd` menggerakkan `crop x/y` (kotak berasio target) + `zoompan` untuk punch-in, bukan `zoompan` sendirian: `zoompan` tidak bisa mempertahankan rasio target saat menggeser fokus (`s=WxH` memaksa isi ulang). Rasio export tetap diputuskan `crop_for()`, jadi hasil 1:1/4:5/16:9 tetap benar.
- Safe zone + auto zoom + zoom manual disimpan di `render_prefs` (server, `PUT /prefs`), bukan localStorage: export di server harus tahu setelan yang sama. Konsekuensinya `_mock.py` ikut menyimpan tiga kunci itu.
- Panel Layout diposisikan `fixed top-[64px] right-[88px]` (panel mengapung di kanan, bukan di dalam kolom stage): pada 1440x900 kolom stage hanya ~230 px sehingga panel 280 px menutupi panel Generate kalau di-anchor di dalam stage. Pilihan Tampilan video + Overlay dari ikon lama dipindah ke panel ini; `IconDropdown.jsx` jadi tidak terpakai dan dihapus.
- Diff kode total +685 / −171 baris, di atas batas ±600 pada prompt. Tidak ada file yang di-scaffold ulang (semua file sudah ada dan diedit di tempat; `PreviewStage.jsx` 965 → 1249 karena panel Layout + overlay + menu Ratio memang diminta); `IconDropdown.jsx` (−86) dihapus sebagai penggantinya.
- `docs/evidence/T6/after/*.png` diambil pada viewport 1920x1080 (harness), bukan 1440x900: pada 1440x900 kolom stage menyusut sampai pill toolbar harus menggulir, sehingga 4 label tidak terbaca di screenshot. Pada 1920x1080 keempat pill tampil satu baris.
- `frontend/dist/*` ikut berubah karena build (artefak ter-track di repo).
- Perubahan tak terkait dari sesi lain (`docs/evidence/T2b/after/studio-transcript.png`, `docs/evidence/T3b/after/timeline-pm.png`) tidak saya sentuh dan tidak ikut di-commit.

SISA
- Branch: dibuat `t6-safezone-zoom` dari `main` (HEAD saat mulai `07eedbd`), perubahan T6 di-commit di sana; `main` tidak diubah.
- Baseline center crop pada frame 50% punya wajah `None` (deteksi gagal di frame gelap) → angka simpangan T6 dihitung dari frame yang terdeteksi saja; tidak ada penanganan khusus (cukup, karena ramp tetap menghaluskan).
- PUNCHLIST P-10 (filmstrip ≥6 kandidat bikin stage `w=0`) masih OPEN: file yang harus disentuh ada di `ClipsPanel.jsx`/`ClipStrip.jsx`, di luar daftar file T6, jadi tidak saya kerjakan. P-05 (letterbox preview landscape) hanya terjawab sebagian: pilihan `Tampilan video` pindah ke panel Layout, tapi default preview masih `fit` (letterbox) — mengubahnya jadi default `cover` akan mengubah tampilan semua proyek lama tanpa diminta.
- `PreviewStage.jsx` 1249 baris (sebelumnya 965) — pemecahan file belum dilakukan (PUNCHLIST P-11 masih OPEN).
