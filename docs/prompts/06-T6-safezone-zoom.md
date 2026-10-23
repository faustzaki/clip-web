Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 06 — T6: Safe Zone + Ratio Berlabel + Auto Zoom (4 jam)

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `chopify/render_clips.py (zoompan)`
- `server.py (simpan ratio/offset)`
- `Timeline.jsx`
- `StudioView.jsx`

Branch: `t6-safezone-zoom`

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi **hanya kalau gagal 2× nyata**:
1. `ninerouter/cbai/deepseek-v4.1-flash`
```bash
# cek dulu model ini bisa nulis file (bukan plan-mode)
py -3.13 docs/scripts/check_model_tools.py "ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash"
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/06-T6-safezone-zoom.md
```
⚠️ `ocf/*` **jangan dipakai**: model di provider itu balas "Plan mode block file writes" — tidak bisa menulis file.

## BACA
`docs/UI-SPEC.md` §4 · `design/COMPETITOR-MATRIX.md` (baris auto zoom)

## TUGAS
1. Pill toolbar di bawah preview: 4 tombol berlabel teks (bukan ikon saja):
   `Ratio (9:16)` · `Background` · `Layout` · fullscreen. Klik Ratio → menu 9:16 / 1:1 / 4:5 / 16:9.
2. Overlay safe zone (toggle di panel Layout): kotak area aman TikTok/Reels — 88% lebar, 80% tinggi, garis putus-putus 1px `--vz-text-muted`, label kecil `Area aman`.
3. Auto zoom: deteksi wajah (`yunet.onnx` yang sudah ada) → hitung crop box per detik → tulis `zoom_keyframes` ke payload timeline item. Render lewat `ffmpeg zoompan` di `chopify`.
4. Panel Layout: toggle `Auto zoom`, `Zoom manual` slider 100–160%.

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/T6/precheck.txt)
```bash
ffmpeg -filters | grep -c zoompan; ls chopify/*.py | head; grep -rn 'yunet\|onnx' chopify/ | head -3
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau model yunet tidak ada → zoom tengah (center crop) + slider manual; toggle `Auto zoom` disabled dengan alasan `Model deteksi wajah belum ada`.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/T6/BLOCKED.md`.

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
