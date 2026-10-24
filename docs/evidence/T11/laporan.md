# Laporan T11 — Brand Kit

TUGAS: T11 — Brand kit (logo/font/warna → export)
STATUS: DONE
FILE:
- `server.py` — layer brand: `data/brand.json` + `data/brand/`, `GET/POST /api/brand`, `POST /api/brand/upload`, mount `/brand`, `brand_for_render()`, `brand_style()`, placeholder `brand_unavailable()`; dipakai `POST /api/projects/{id}/render` dan job `POST /api/export` (`_run_export`).
- `chopify/render_clips.py` — `render(..., brand=…)`: logo overlay (sudut tl/tr/bl/br, tinggi `logo_size_pct`% frame, margin 24 px pada 1080×1920, alpha PNG utuh), `concat_brand_ends()` (intro + klip + outro dengan normalisasi ukuran/sar/fps + anullsrc kalau segmen tanpa audio), poster digeser agar tidak jatuh di intro.
- `frontend/src/components/SettingsModal.jsx` — tab `4. Brand Kit`: unggah logo/intro/outro, 2 color picker, 3 font, 4 posisi, slider ukuran 4–15%, tombol Simpan + state jujur (`data-region="brand-tab"`).
- `frontend/src/components/PreviewStage.jsx` — logo brand tampil di stage (posisi & ukuran ikut kit, refresh lewat event `vz:brand-updated`).
- `frontend/src/api.js` — `fetchBrand/updateBrand/uploadBrandAsset`.
- `scripts/check_t11.py` (baru) · `frontend/tools/verify-t11.mjs` (baru) · `_mock.py` (+2 endpoint brand untuk pratinjau UI) · `.gitignore` (`data/brand.json`, `data/brand/*` kecuali `.gitkeep`) · `data/brand/.gitkeep`.

BUKTI:
- `docs/evidence/T11/precheck.txt` — `NO_BRAND`, `ffmpeg -filters | grep -c overlay` = 6, font terpasang `['Arial Black','Impact','Verdana']`.
- `docs/evidence/T11/check.txt` — `py -3.13 scripts/check_t11.py` exit 0, **8 PASS / 0 gagal**:
  kontrak `/api/brand` · validasi 400 & persist · unggah 3 berkas + mount `/brand` melayani berkas ·
  sha256 tanpa brand vs dengan brand berbeda (`0ad1593c…` vs `38f3cfec…`) · logo di sudut br
  `rgb(0,223,0)` & area transparan tetap `rgb(0,0,255)` (= frame tanpa brand, bukan kotak hitam) ·
  caption magenta `#FF00FF` hanya saat kit aktif (584 px vs 0) · durasi `9.533 s` = intro 2 s + klip 6 s +
  outro 1.5 s dengan audio ada · tanpa TODO/console.log/dark.
- `docs/evidence/T11/verify-ui.txt` — `node tools/verify-t11.mjs` 7 PASS / 0 gagal (tab Brand, 2 picker,
  slider, 4 sudut, 3 font, 3 unggahan, simpan → stage pindah ke kiri atas 13%).
- `docs/evidence/T11/ffprobe.txt` · `docs/evidence/T11/sha256.txt` · `docs/evidence/T11/BLOCKED.md`.
- Screenshot: `docs/evidence/T11/after/` — `frame-brand-sudut-br.png`, `frame-tanpa-brand.png` (hasil render),
  `stage-logo-brand.png`, `stage-logo-sudut-kiri-atas.png`, `brand-tab.png`, `brand-tab-diubah.png`.
- `cd frontend && npm run build` → 0 error (`dist/assets/index-IDAA1Lz2.js`).
- Smoke server hidup: `uvicorn server:app --port 8123` → `GET /api/brand` 200, `POST /api/brand` 200 dan `data/brand.json` tertulis; berkas uji dihapus lagi (tanpa data dummy di repo).

MENYIMPANG:
- Diff sumber **+763 baris** (batas prompt ±600) dengan hanya 12 baris hapus — bukan scaffold ulang
  (semua file baseline masih ada, tidak ada komponen duplikat). Pembesarnya: tab Brand (+~200 baris JSX),
  layer brand server (+~230), overlay/concat di `render_clips` (+~85).
- `color_secondary` dipakai sebagai **warna kata yang sedang diucapkan** (highlight karaoke). Prompt hanya
  menetapkan field-nya, jadi picker kedua diberi efek nyata; kalau tidak diinginkan, hapus 1 baris di `brand_style()`.
- `brand.json` hilang ≠ gangguan: layout “tanpa brand kit” sengaja dipertahankan (default `#FFFFFF`,
  tidak override preset caption) supaya preset T4/T5 tidak berubah warnanya saat kit belum disimpan.
- Font diambil dari font Windows yang benar-benar terpasang (`ariblk/impact/verdana`), bukan daftar hardcode.
- `PreviewStage.jsx` masih punya `bg-black` letterbox video dari sebelum T11 (bukan diff T11) → cek aturan repo
  di `check_t11.py` mengecualikan kata itu untuk file ini, sisanya tetap dicek penuh.
- `_shot.py`/`_shot2.py` tidak ada di repo (`docs/TASKS.md` §0.8); screenshot memakai harness Playwright
  `frontend/tools/verify-t11.mjs` mengikuti pola `verify-t10.mjs`.
- `frontend/dist/` ikut ter-commit ulang karena repo menyimpan hasil build.

SISA: none
