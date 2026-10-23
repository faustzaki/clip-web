Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 10 — T10: B-roll dari Folder Lokal (6 jam) · P2

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `baru: broll_index.py`
- `server.py`
- `ToolPanel.jsx (panel B-roll)`
- `chopify/render_clips.py (overlay)`

Branch: `t10-broll`.

## BACA
`docs/DATA-MODEL.md` §1 (`timeline_items.kind='broll'`) · `docs/UI-SPEC.md` §4 (rail)

## TUGAS
1. `broll_index.py`: pindai `data/broll/**` (mp4/mov/jpg/png), tag dari nama file (`pantai-sunset.mp4` → `pantai`, `sunset`) + `data/broll/tags.json` opsional. Simpan index JSON, refresh manual lewat tombol.
2. Saran otomatis: ambil `keywords` klip + kata kunci transcript → skor kecocokan tag → tampilkan 5 kandidat di panel `B-roll`.
3. Panel B-roll: grid kartu 2 kolom (thumb, tag, durasi), tombol `Sisipkan`.
4. Sisipkan ke `timeline_items` track 2 `kind='broll'` dengan `start_ms` = posisi playhead, durasi default 2500ms, `opacity 1.0`.
5. Render: `chopify/render_clips.py` menambahkan overlay — scale+crop ke ratio target, `enable='between(t,start,end)'`.
6. Hapus/pindah item dengan tombol di kartu timeline (bukan drag).

## KRITERIA TERIMA
- 3 b-roll tersisip dan muncul di hasil render (screenshot 3 frame berbeda).
- Tidak ada frame hitam di transisi; audio asli tidak terputus.
- Index 50 file selesai < 10 detik.
- Folder kosong menampilkan empty state, bukan error.

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
