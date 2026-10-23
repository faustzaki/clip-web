# PROMPT 04b — T4b: Export modal + polling (2 jam) · P0

## MODE: PATCH, BUKAN BUILD ULANG
Endpoint export sudah ada (T4a). Tugas ini membuat modal dan menyambungkannya ke tombol unduh yang sudah ada.

**File yang disentuh:**
- `frontend/src/components/ExportModal.jsx` (baru)
- `frontend/src/components/ClipsPanel.jsx` atau `ClipStrip.jsx` (pasang tombol buka modal — pilih **satu** yang punya tombol unduh)
- `frontend/src/api.js` (startExport, getExport)
- `scripts/check_t4b.py` (baru)

## MODEL
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi kalau gagal 2×: `ninerouter/cbai/deepseek-v4.1-flash` (tugas 1–2 file saja)
```bash
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/04b-T4b-export-modal.md
```

## BACA
- `docs/UI-SPEC.md` §5 (Export modal) & §2 (token)
- `frontend/src/components/SubtitleApplyModal.jsx` (pola modal repo ini: overlay, fokus, Esc)

## PRECHECK
```bash
curl -s localhost:8000/api/projects | head -c 200
grep -n "ExportModal\|unduh\|download" frontend/src/components/*.jsx | head
```

## TUGAS
1. `ExportModal.jsx` props: `open, clip, onClose, onStart`
   - modal **480px**, radius 12, `shadow-vz-lg`, overlay `rgba(0,0,0,.48)`, Esc + klik overlay menutup, fokus kembali ke tombol asal
   - field: nama file (prefill judul klip), resolusi (`1080p` / `720p`), fps (`30` / `24`), toggle `Bakar caption`, format `mp4` (disabled, satu pilihan), perkiraan ukuran (teks)
   - footer: `Batal` (secondary, 40px) + `Export` (primary, 40px)
   - state: `form` → `submitting` (spinner di tombol, field disabled) → `running` (progress + teks `Menyiapkan klip…`) → `done` (tombol `Unduh` + nama file) → `failed` (alasan + `Coba lagi`)
2. Polling `GET /api/export/{job_id}` tiap **2s**, berhenti saat `done`/`failed`, batas 5 menit → tampilkan `Terlalu lama, coba lagi`.
3. Pasang pemicu di tombol unduh yang sudah ada (satu tempat saja).
4. Jangan mengubah ClipStrip/Timeline kecuali menambah handler buka modal.

## KRITERIA TERIMA
- Buka modal → isi form → Export → job berjalan → `done` → `Unduh` mengarah ke file yang bisa di-fetch (200, `content-type: video/mp4`).
- Esc menutup modal, fokus kembali ke tombol asal (buktikan `document.activeElement`).
- `burn_caption` on/off menghasilkan dua file berbeda (sha256 beda) — boleh diverifikasi lewat backend, catat di laporan.
- Build 0 error, tanpa `console.log`, screenshot modal (1440) di evidence.
- Regresi: `verify-t2b` 6/6 dan `verify-t3b` 6/6 tetap lulus.

## BUKTI
`docs/evidence/T4b/`: `precheck.txt`, `check.txt`, `after/export-modal.png`, laporan AGENTS.
