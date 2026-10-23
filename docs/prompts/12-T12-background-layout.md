Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 12 — T12: Background Fill + Layout Reframe (6 jam) · P2

Branch: `t12-background`.

## BACA
`docs/UI-SPEC.md` §4 (pill toolbar) · `chopify/render_clips.py`

## TUGAS
1. Panel `Layout` (dari pill toolbar):
   - `Isi latar`: `Blur` / `Warna` (color picker) / `Hitam`.
   - `Susunan`: `Tengah` (video full, latar blur), `Atas-bawah` (video di atas, latar di bawah), `Kotak` (video 90% dengan border radius).
2. Preview: render CSS yang sama dengan hasil ffmpeg (blur via `filter: blur(24px)` pada duplikat video).
3. Render: `scale` + `boxblur` untuk latar, overlay video utama, `crop` sesuai ratio.
4. Drag vertikal di preview → simpan `offset_y` (-30%..30%) → `crop=...:y='...'`.

## KRITERIA TERIMA
- Source 16:9 → export 9:16 tidak ada black bar (screenshot).
- Tiga susunan menghasilkan tiga file berbeda (sha256).
- Drag offset menggeser subjek dan bertahan setelah reload.
- Preview dan hasil render mirip (selisih posisi subjek < 5% tinggi frame).

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
