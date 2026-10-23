Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 02 — T2: Transcript Panel (6–8 jam)

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `server.py (endpoint transcript+cut)`
- `frontend/src/components/StudioView.jsx (pasang panel)`
- `baru: components/TranscriptPanel.jsx`

Branch: `t2-transcript` · Butuh `server.py` (endpoint baru, sudah dispesifikasikan)

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/cbai/deepseek-v4.1-flash
```
Eskalasi **hanya kalau gagal 2× nyata**:
1. `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`
2. `ninerouter/T-SOTA/claude-sonnet-5`
```bash
# cek dulu model ini bisa nulis file (bukan plan-mode)
py -3.13 docs/scripts/check_model_tools.py "ninerouter/cbai/deepseek-v4.1-flash"
omp -p --approval-mode=yolo --model="ninerouter/cbai/deepseek-v4.1-flash" --thinking=low @AGENTS.md @docs/prompts/02-T2-transcript.md
```
⚠️ `ocf/*` **jangan dipakai**: model di provider itu balas "Plan mode block file writes" — tidak bisa menulis file.

## BACA
`docs/UI-SPEC.md` §4 "Aturan transcript" · `docs/DATA-MODEL.md` §1, §3 · `docs/ADR.md` ADR-004

## TUGAS
1. Backend (satu-satunya tugas yang boleh menyentuh `server.py`):
   - `GET /api/projects/{id}/transcript?word=1` → `{words:[{idx,word,start_ms,end_ms,deleted}]}` (baca dari ASR yang sudah tersimpan).
   - `POST /api/projects/{id}/cut` body `{from_idx,to_idx}` → set `deleted=1`, balas `{removed_ms,new_duration_ms}`.
2. Buat `components/TranscriptPanel.jsx`:
   - toggle `Transkrip` / `Edit subtitle` (segmented control, pill, radius 99).
   - kolom cari (`.vz-input`, ikon magnifier), filter kata yang cocok.
   - render kata inline: `kata` + `[3.0s]` (12px italic muted), klik = `onSeek(start_ms)`.
   - kata aktif mengikuti `current` (background `--vz-accent-tint`, teks `--vz-accent`, radius 6).
   - drag seleksi rentang kata → tombol mengambang `Potong bagian ini` → `onCut(from,to)`.
   - kata `deleted` = line-through + opacity .45.
   - auto-scroll ikut playhead, berhenti saat user scroll manual (flag `userScrolled`).
3. Pasang di slot sidebar 360px; resizable 320–520 (drag handle 4px).
4. State: `loading` (3 skeleton baris) · `empty` (`Transkrip belum siap. Jalankan analisis dulu.`) · `loaded`.

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/T2/precheck.txt)
```bash
curl -s localhost:8000/api/health; grep -n 'transcript' server.py | head; python -c "import json,pathlib;print([p.name for p in pathlib.Path('data').glob('*')][:5])"
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau transkrip belum tersimpan di DB (masih di file JSON project) → endpoint membaca dari JSON itu dulu, tulis DB belakangan. Jangan minta re-transcribe.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/T2/BLOCKED.md`.

## KRITERIA TERIMA
- Klik kata → video seek ke timestamp itu (buktikan dengan screenshot playhead + teks aktif).
- Seleksi 3 kata → klik Potong → `POST /cut` terpanggil (buktikan dari log network) dan durasi total berkurang.
- Cari kata → hanya kata cocok yang tersorot, jumlahnya masuk akal.
- Tidak ada `console.log` tersisa.

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
