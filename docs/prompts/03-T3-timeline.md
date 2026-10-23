Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 03 — T3: Timeline 3 Track (5–6 jam)

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `server.py (timeline get/post)`
- `StudioView.jsx (pakai hook)`
- `baru: components/Timeline.jsx, hooks/useEditorState.js`

Branch: `t3-timeline`

## BACA
`docs/UI-SPEC.md` §4 "Aturan timeline" · `docs/DATA-MODEL.md` §1, §3

## TUGAS
1. Backend: `GET /api/projects/{id}/timeline` → `{duration_ms,tracks:[{track,items:[]}]}`; `POST` untuk simpan.
2. Buat `components/Timeline.jsx`:
   - ruler 24px dengan tick tiap 5 detik + label `m:ss`.
   - 3 track: video (blok dari klip), teks/caption, audio. Tinggi track 40, gap 8, blok radius 8.
   - playhead 2px `--vz-accent`, draggable, klik ruler = seek.
   - zoom 25/50/100/200% (4 tombol kecil di kanan atas), tanpa pinch.
   - collapse/expand: 240px ↔ 320px (tombol chevron, state disimpan di localStorage).
   - track kosong menampilkan 1 baris petunjuk, bukan area kosong.
3. Integrasi ke `StudioView`: `current` dipakai bersama transcript + preview; `onSeek` satu sumber.
4. `StudioView.jsx` setelah tugas ini wajib ≤ 400 baris — pindahkan sisa logika ke komponen/hook `useEditorState.js`.

## KRITERIA TERIMA
- Playhead mengikuti playback dan bisa digeser; seek dari transcript menggerakkan playhead (dua arah).
- Zoom mengubah lebar blok, durasi total tetap.
- Collapse tetap menyimpan posisi playhead.
- `wc -l frontend/src/components/StudioView.jsx` ≤ 400.
- Build lulus + screenshot collapsed & expanded.

## JANGAN
- Jangan bikin drag-resize blok kalau belum stabil; trim boleh P1 (`onTrim` disiapkan tapi no-op dengan komentar `ponytail:`).

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
