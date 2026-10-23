Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 11 — T11: Brand Kit (4 jam) · P2

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `server.py (/api/brand)`
- `SettingsModal.jsx (tab Brand)`
- `chopify/render_clips.py + subtitle_burn.py`

Branch: `t11-brandkit`.

## BACA
`docs/DATA-MODEL.md` · `chopify/subtitle_burn.py`

## TUGAS
1. `data/brand.json`: `{logo_path, color_primary, color_secondary, font, logo_corner: "tl|tr|bl|br", logo_size_pct: 8, intro_path, outro_path}`.
2. UI Settings → tab `Brand`: unggah logo (png transparan), 2 color picker, pilih font (dari 3 yang tersedia), posisi & ukuran logo (slider 4–15%), unggah intro/outro mp4.
3. Terapkan ke export: logo overlay (posisi sudut, margin 24px), warna caption mengikuti `color_primary`, intro/outro di-concat kalau ada.
4. Preview: logo tampil di stage (bukan hanya di hasil render).

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/11/precheck.txt)
```bash
ls data/brand.json 2>/dev/null || echo NO_BRAND; ffmpeg -filters | grep -c overlay
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau `brand.json` tidak ada → buat default (tanpa logo), UI tetap tampil, export jalan seperti biasa.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/11/BLOCKED.md`.

## KRITERIA TERIMA
- Export dengan brand kit vs tanpa → sha256 berbeda + screenshot 2 frame (logo terlihat di sudut yang dipilih).
- Intro/outro ter-concat: durasi total = intro + klip + outro (bukti `ffprobe`).
- Logo transparan tidak berubah jadi kotak hitam.

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
