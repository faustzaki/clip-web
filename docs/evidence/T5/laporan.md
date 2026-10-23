TUGAS: T5 — Filler/Silence + 5 Preset Caption
STATUS: DONE

FILE
- `chopify/subtitle_burn.py` — registry `CAPTION_PRESETS` (5 entri) + `preset_style()` + `DEFAULT_CAPTION_PRESET` (satu sumber untuk UI, export, burn)
- `chopify/tighten.py` — kosakata filler Indonesia (`FILLER_TOKENS_ID`, sekuens `apa ya`/`gitu ya`/`gimana ya`); perencana `plan_cuts` dipakai ulang, tidak ditulis ulang
- `server.py` — `POST /api/projects/{id}/tighten` (pakai `chopify/tighten.plan_cuts`), `caption_presets` di `GET /api/options`, `caption_preset` di `PUT /api/projects/{id}/prefs` (+ validasi 400), default prefs
- `frontend/src/components/ToolPanel.jsx` (baru, 240 baris) — panel kolom kanan 320px: toggle Hapus jeda + slider 200–1200 ms (default 400), toggle Hapus kata pengisi, tombol Terapkan, grid 2 kolom 5 preset
- `frontend/src/components/StudioView.jsx` — pasang `ToolPanel` untuk tool aktif dari ToolRail
- `frontend/src/components/SubtitlePreview.jsx` — prop opsional `fontScale` supaya teks contoh tetap terbaca di kartu mini (default 1 = perilaku lama GeneratePanel)
- `frontend/src/api.js` — `applyTighten()`
- `_mock.py` — `/api/options` (preset dari registry asli), `/api/projects/{id}/transcript`, `POST .../tighten`, `PUT .../prefs`
- `frontend/tools/verify-t5.mjs` (baru), `scripts/check_t5.py` (baru)
- Diff kode (tanpa `frontend/dist`): +197 / −8 baris

BUKTI
- `docs/evidence/T5/precheck.txt` — `chopify/tighten.py` ada; `subtitle_burn.py` punya `Fontsize/BorderStyle/Alignment` di header ASS; `CAPTION_PRESETS` belum ada (jalur placeholder tidak diperlukan)
- `docs/evidence/T5/check.txt` — `py -3.13 scripts/check_t5.py` → **0 gagal** (19 assertion). Termasuk:
  - `POST /tighten` → `saved_ms` 3300; kata `deleted` 0 → 4; durasi timeline 8000 → 4700 ms
  - `GET /api/options` → 5 preset dengan label + gaya
  - `PUT prefs caption_preset=bold-yellow` → tersimpan (`subtitle_style.primary_color == #FFE100`); preset tak dikenal → 400
  - kelima preset di-export `burn_caption=True` → semua `done`
- `docs/evidence/T5/sha256.txt` — 5 sha256 berbeda (satu per preset) → export nyata memakai preset terpilih; clean-white `0423ceca…` ≠ bold-yellow `34165bfa…`
- `frontend && npm run build` → exit 0 (`dist/assets/index-Cdxovi_g.css`, `index-DvO3Cy2-.js`)
- `docs/evidence/T5/after/` — `subtitles-panel.png`, `preset-clean-white.png`, `preset-bold-yellow.png`, `preset-boxed-dark.png`, `preset-karaoke-highlight.png`, `preset-minimal-outline.png`, `tighten-result.png` (dari `node tools/verify-t5.mjs`, 12 PASS / 0 FAIL; preview stage terbukti ikut berubah: warna span stage == `primary_color` preset, mis. `rgb(255, 225, 0)`)

MENYIMPANG
- Untuk screenshot, server mock `_mock.py` (port 8005) dihidupkan mandiri oleh `verify-t5.mjs`; satu proses uvicorn lama di port 8000 (kode sebelum patch, bukan dijalankan sesi ini) dihentikan agar cek backend mengukur kode baru.
- `frontend/dist/*` ikut berubah karena build (artefak ini memang ter-track di repo).

SISA
- none
