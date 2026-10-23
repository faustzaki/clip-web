# Laporan T4b — Export modal + polling

TUGAS: T4b — Export modal + polling (endpoint export T4a sudah ada)
STATUS: DONE
FILE:
- `frontend/src/components/ExportModal.jsx` (baru, 308 baris)
- `frontend/src/components/ClipStrip.jsx` (pemicu unduh buka modal; menu `⋯` satu-item dihapus)
- `frontend/src/components/StudioView.jsx` (mount modal, simpan elemen pemicu, fokus balik saat tutup)
- `frontend/src/api.js` (`startExport`, `getExport`)
- `scripts/check_t4b.py` (baru)
- `frontend/dist/*` (hasil `npm run build`)

## BUKTI
- `docs/evidence/T4b/precheck.txt` — backend `:8000` hidup (ffmpeg true), endpoint export T4a ada,
  tombol unduh klip hanya di `ClipStrip` (ClipsPanel tidak punya).
- `docs/evidence/T4b/check.txt` — `py -3.13 scripts/check_t4b.py` **40 PASS / 0 FAIL** (exit 0) + 2 regresi.
- `docs/evidence/T4b/after/export-modal.png` — modal state `form`, viewport 1440×900.
- `docs/evidence/T4b/after/export-modal-pm.png` — harness browser `verify-t4b.mjs`, 1440×900.
- `docs/evidence/T4b/sha256.txt` — `burn_caption=false` ≠ `burn_caption=true`:
  `8ca15e0c43b6…` vs `bd58521a561a…` (resolusi 720p sama, file path sama, isi beda).
- `frontend/tools/verify-t4b.mjs`: **8 lulus / 0 gagal**, termasuk
  - link unduh `/clips/<pid>/<slug>_720p.mp4` → fetch **200 `video/mp4`**,
  - `Escape` menutup modal, `document.activeElement` = `"Unduh klip …"` (kembali ke pemicu),
  - lebar modal 480px, tanpa `pageerror`.
- `cd frontend && npm run build` → `✓ built in 4.88s`, 0 error.

## CARA KERJA (singkat)
- `ClipStrip` tombol unduh → `onDownload(clip, e.currentTarget)` → `StudioView.handleOpenExport`
  (simpan elemen pemicu + buka modal) → `ExportModal` POST `/api/export` → polling `GET /api/export/{id}`
  tiap 2s sampai `done`/`failed`, batas 5 menit → `Terlalu lama, coba lagi`.
- Fokus: `ExportModal` fokuskus field nama saat buka; `StudioView.handleCloseExport` mengembalikan fokus
  ke tombol unduh asal (juga untuk jalur Esc).
- Job export tetap jalan di server kalau modal ditutup (polling berhenti, tidak membatalkan job).

## MENYIMPANG
1. Menu `⋯` di `ClipStrip` (satu item: `Unduh`) diganti tombol unduh langsung berikon `Download`
   (`aria-label="Unduh klip <judul>"`). Alasan: pemicu modal harus satu tempat dan langsung terlihat;
   menu satu-item hanya menambah satu klik tanpa pilihan lain. Sisa kartu strip tidak berubah.
2. `PreviewStage` masih punya anchor unduh langsung (di luar daftar file tugas) — tidak disentuh.

## SISA
- 4 assertion statis lama masih FAIL **sebelum patch T4b** (dibuktikan lewat `git stash` = baseline identik):
  `check_t2b.py`: "StudioView impor + pakai TranscriptPanel", "StudioView kirim words/onSeek/onCut",
  "sidebar 360px tetap ada"; `check_t3b.py`: "StudioView: fetchTimeline + zoom/collapse persisten".
  Semua akibat pemecahan `StudioView.jsx` (T3a/T3c: panel pindah ke `GeneratePanel`/`useEditorState`) —
  bukan regresi T4b. Uji fungsional keduanya tetap lulus: `verify-t2b` probe 6/6, `verify-t3b` 6/6.
