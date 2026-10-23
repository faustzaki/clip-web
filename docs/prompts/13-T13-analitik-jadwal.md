Kamu agent pelaksana untuk repo `clip-web` (React 18 + Vite + Tailwind, backend FastAPI).
Kerja **hanya** sesuai dokumen. Jangan improvisasi arsitektur.

# PROMPT 13 — T13: Antrian Posting + Analitik (8 jam) · P2, butuh OAuth

Branch: `t13-posting`. **Bisa BLOCKED** kalau kredensial OAuth platform belum ada — kerjakan bagian yang tidak butuh itu.

## BACA
`server.py` (`/clips/{slug}/publish` sudah ada) · `docs/DATA-MODEL.md`

## TUGAS
1. Tanpa OAuth (selalu bisa): tabel `post_queue (id, clip_id, platform, caption, scheduled_at, status, error)`;
   UI kalender sederhana (7 hari ke depan, list per hari), tombol `Jadwalkan`, `Batal`.
2. Export metadata: tombol `Salin caption` (judul + hashtag dari keywords) per platform (TikTok/Reels/Shorts: caption + 5 hashtag).
3. Dengan OAuth (kalau kredensial tersedia): simpan token di tabel `oauth_tokens` (terenkripsi dengan `FERNET_KEY` dari env),
   refresh otomatis, unggah video + caption saat jadwal tiba (worker thread 60 detik).
4. Analitik: tarik views/likes/comments per post (endpoint platform), tampilkan 3 angka + grafik 7 hari terakhir. Jika API tidak mengizinkan, tampilkan `Belum tersedia`.

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
