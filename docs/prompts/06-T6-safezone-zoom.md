Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 06 — T6: Safe Zone + Ratio Berlabel + Auto Zoom (4 jam)

Branch: `t6-safezone-zoom`

## BACA
`docs/UI-SPEC.md` §4 · `design/COMPETITOR-MATRIX.md` (baris auto zoom)

## TUGAS
1. Pill toolbar di bawah preview: 4 tombol berlabel teks (bukan ikon saja):
   `Ratio (9:16)` · `Background` · `Layout` · fullscreen. Klik Ratio → menu 9:16 / 1:1 / 4:5 / 16:9.
2. Overlay safe zone (toggle di panel Layout): kotak area aman TikTok/Reels — 88% lebar, 80% tinggi, garis putus-putus 1px `--vz-text-muted`, label kecil `Area aman`.
3. Auto zoom: deteksi wajah (`yunet.onnx` yang sudah ada) → hitung crop box per detik → tulis `zoom_keyframes` ke payload timeline item. Render lewat `ffmpeg zoompan` di `chopify`.
4. Panel Layout: toggle `Auto zoom`, `Zoom manual` slider 100–160%.

## KRITERIA TERIMA
- Ganti ratio → preview dan export mengikuti (bukti: `ffprobe` dua file, resolusi beda sesuai ratio).
- Safe zone tampil/hilang tanpa menggeser layout (koposisi preview tetap).
- Auto zoom menghasilkan file dengan subjek tetap di tengah (bukti: 3 frame di 10%, 50%, 90% durasi).

## ATURAN (mengikat)
- Light theme saja. Tanpa `dark:`, `bg-black`, `bg-dark-*`, `neon`, gradien, glow. Satu aksen `--vz-accent`.
- Jangan sentuh `server.py`/`chopify/` kecuali tugas menyebutnya.
- Jangan hapus CropStudioModal, SubtitleStyleEditor, pemilih model AI.
- Jangan tambah dependency. Jangan port CSS/aset Vizard (angka boleh, kode/gambar tidak).
- Tidak boleh ada TODO/stub/console.log/data dummy di akhir.
- Bahasa UI: Indonesia, konsisten.

## VERIFIKASI (jalankan, jangan diklaim)
```bash
cd frontend && npm run build
```
Screenshot: pakai `_mock.py` (API tiruan) + `_shot2.py`, simpan ke `docs/evidence/<TUGAS>/after/`.

## OUTPUT
Laporan format `AGENTS.md` §Format laporan: TUGAS / STATUS / FILE / BUKTI / MENYIMPANG / SISA.
