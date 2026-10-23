Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 01 — T1: Token + Shell (5 jam)

Branch: `t1-shell`

## BACA
`docs/UI-SPEC.md` §1–§2, §6 · `docs/ADR.md` ADR-001 · `design/tokens.css` · `design/tailwind.theme.js`

## TUGAS
1. Salin `design/tokens.css` → `frontend/src/index.css` (ganti total isi lama). Hapus semua kelas dark/gradient/glow.
2. `frontend/tailwind.config.js`: tambahkan `theme.extend` dari `design/tailwind.theme.js`.
3. `frontend/index.html`: muat Inter 400/500/600 (Google Fonts atau woff2 lokal). `lang="id"`.
4. Buat `components/EditorHeader.jsx` — tinggi 56px, logo, slot tengah (judul editable + chevron), slot kanan (Save + avatar), props: `title,onTitle,canUndo,canRedo,saveState,onSave,onUndo,onRedo`.
5. Buat `components/ToolRail.jsx` — lebar 72px, 4 item berlabel (Subtitles, Audio, B-roll, Text), ikon 22px + label 11px, props `active,onSelect`.
6. Buat `components/ClipStrip.jsx` — tinggi 96px, kartu 160×120, badge skor, durasi `m:ss`, tombol `⋯`, props `clips,selected,onSelect,onDownload`.
7. `StudioView.jsx`: pasang grid shell (header 56 / kiri 360 / stage flex / rail 72 / timeline 240 / strip 96). Isi lama tetap dirender di dalam stage untuk sementara — jangan hapus logika.
8. `App.jsx`: hapus kelas gelap global; wrapper jadi `bg-vz-bg text-vz-text font-sans`.

## KRITERIA TERIMA
- Tidak ada `dark:`, `bg-black`, `bg-dark`, `neon`, `gradient` di `frontend/src` (kecuali di file yang belum disentuh — catat mana).
- Di DevTools: header = 56px, rail = 72px, strip = 96px, sidebar = 360px.
- Halaman projects tampil putih; tidak ada rail ikon terpotong di x=0.
- Build lulus.

## JANGAN
- Jangan refactor isi StudioView (itu T2/T3). Jangan hapus fitur apa pun.

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
