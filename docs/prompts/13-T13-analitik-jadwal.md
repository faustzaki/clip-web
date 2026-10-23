Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 13 — T13: Antrian Posting + Analitik (8 jam) · P2, butuh OAuth

## MODE: PATCH, BUKAN BUILD ULANG
Repo sudah jalan (~7.500 baris). Tugas ini **mengubah** yang ada, bukan membuat aplikasi baru.
- Sebelum menulis: `wc -l` dan baca file target. Jangan menebak isi file.
- Komponen yang sudah ada **diedit di tempat** (pindahkan/potong baris). Jangan membuat file baru dengan fungsi sama.
- Jangan scaffold ulang `App.jsx`, `StudioView.jsx`, `server.py` dari nol. Jangan menghapus fitur yang sudah jalan.
- Diff maksimum ±600 baris. Kalau lebih, kemungkinan besar kamu mulai dari nol → berhenti dan lapor.

**File yang disentuh tugas ini:**
- `server.py (queue)`
- `baru: components/PostQueue.jsx (kalender)`

Branch: `t13-posting`. **Bisa BLOCKED** kalau kredensial OAuth platform belum ada — kerjakan bagian yang tidak butuh itu.

## MODEL (murah dulu, wajib bisa tool-call)
```
ninerouter/cbai/deepseek-v4.1-flash
```
Eskalasi **hanya kalau gagal 2× nyata**:
1. `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`
```bash
# cek dulu model ini bisa nulis file (bukan plan-mode)
py -3.13 docs/scripts/check_model_tools.py "ninerouter/cbai/deepseek-v4.1-flash"
omp -p --approval-mode=yolo --model="ninerouter/cbai/deepseek-v4.1-flash" --thinking=low @AGENTS.md @docs/prompts/13-T13-analitik-jadwal.md
```
⚠️ `ocf/*` **jangan dipakai**: model di provider itu balas "Plan mode block file writes" — tidak bisa menulis file.

## BACA
`server.py` (`/clips/{slug}/publish` sudah ada) · `docs/DATA-MODEL.md`

## TUGAS
1. Tanpa OAuth (selalu bisa): tabel `post_queue (id, clip_id, platform, caption, scheduled_at, status, error)`;
   UI kalender sederhana (7 hari ke depan, list per hari), tombol `Jadwalkan`, `Batal`.
2. Export metadata: tombol `Salin caption` (judul + hashtag dari keywords) per platform (TikTok/Reels/Shorts: caption + 5 hashtag).
3. Dengan OAuth (kalau kredensial tersedia): simpan token di tabel `oauth_tokens` (terenkripsi dengan `FERNET_KEY` dari env),
   refresh otomatis, unggah video + caption saat jadwal tiba (worker thread 60 detik).
4. Analitik: tarik views/likes/comments per post (endpoint platform), tampilkan 3 angka + grafik 7 hari terakhir. Jika API tidak mengizinkan, tampilkan `Belum tersedia`.

## PRECHECK (jalankan dulu, tempel output ke docs/evidence/13/precheck.txt)
```bash
env | grep -ci 'tiktok_client\|ig_client\|yt_client'; grep -n 'publish' server.py | head -3
```
Baca hasilnya sebelum menulis kode. Hasil deteksi menentukan jalur yang dipakai.

## PLACEHOLDER (kalau prasyarat tidak ada — jangan berhenti, jangan crash)
Kalau OAuth absen → **semua bagian queue lokal tetap dikerjakan**; tab Analitik tampil `Belum tersedia`; tidak ada request jaringan ke platform.
Aturan placeholder (detail di `docs/TESTING.md` §4): endpoint tetap balas 200 dengan `{ok:false,reason,hint}`, UI menampilkan alasan dalam Bahasa Indonesia, tulis `docs/evidence/13/BLOCKED.md`.

## KRITERIA TERIMA
- Queue tersimpan, tampil di kalender, bisa dibatalkan.
- Tombol salin caption menghasilkan teks < 2200 karakter dengan hashtag.
- Kalau OAuth belum ada: status `Belum terhubung`, tidak ada error di console, tidak ada panggilan jaringan ke platform.
- Kalau OAuth ada: 1 unggahan uji sukses (private/unlisted) dengan bukti URL.

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
