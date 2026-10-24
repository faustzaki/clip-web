TUGAS: T13 — Antrian Posting + Analitik
STATUS: PARTIAL (bagian OAuth platform BLOCKED, lihat di bawah)

FILE:
- `server.py` (+169 baris): `data/post_queue.json` + endpoint `GET/POST /api/post/queue`,
  `DELETE /api/post/queue/{id}`, `GET /api/post/caption`, `GET /api/post/status`,
  `GET /api/analytics/{clip_id}` (placeholder 200).
- `frontend/src/components/PostQueue.jsx` (baru, kalender 7 hari + form jadwal + tab Analitik).
- `frontend/src/components/EditorHeader.jsx` (tombol `Posting` + prop `onOpenPostQueue`).
- `frontend/src/components/StudioView.jsx` (state modal + render `PostQueue`).
- `frontend/src/api.js` (`fetchPostQueue`, `schedulePost`, `cancelPost`, `fetchPostCaption`,
  `fetchPostStatus`, `fetchAnalytics`).
- `_mock.py` (endpoint T13 + 2 jadwal contoh supaya kalender terisi saat direview).
- `scripts/check_t13.py`, `frontend/tools/verify-t13.mjs` (baru).
- `docs/DATA-MODEL.md` (kontrak endpoint T13 + catatan file-based).

BUKTI:
- `docs/evidence/T13/precheck.txt` — `env | grep -ci 'tiktok_client\|ig_client\|yt_client'` → `0`.
- `docs/evidence/T13/check.txt` — `py -3.13 scripts/check_t13.py` → **0 gagal** (8 assertion).
- `docs/evidence/T13/ui-verify.txt` — `node tools/verify-t13.mjs` → **9 lulus, 0 gagal**.
- `docs/evidence/T13/after/post-queue-kalender.png`, `post-queue-terjadwal.png`, `post-analitik.png`.
- `cd frontend && npm run build` → `✓ built in 6.06s`, 0 error.
- `docs/evidence/T13/BLOCKED.md` — jalur OAuth + langkah unblock.

Kriteria terima:
- Queue tersimpan, tampil di kalender, bisa dibatalkan → PASS (check #3–#6; UI: 2 → 3 item lalu batal → 2).
- Tombol salin caption → teks < 2200 karakter dengan hashtag → PASS (mock: 85 karakter, 5 hashtag;
  check backend: `length == len(caption) < 2200`).
- Tanpa OAuth: status `Belum terhubung`, tanpa error console, tanpa panggilan jaringan ke platform →
  PASS (`errors.length === 0`; banner `Belum terhubung`; analitik balas 200 `{ok:false,reason:"Belum tersedia",hint}`).
- Dengan OAuth: 1 unggahan uji + URL bukti → **belum bisa**, kredensial & izin OAuth absen (0/6 env var).

MENYIMPANG:
- Tabel `post_queue` (DATA-MODEL §6) disimpan sebagai `data/post_queue.json`, sama seperti T8/T9 —
  repo ini belum punya SQLite. Kontrak endpoint tetap sama; catatan ditambahkan di `docs/DATA-MODEL.md`.
- `oauth_tokens` (payload FERNET_KEY) tidak dibuat: belum ada token untuk disimpan, dan menulis
  enkripsi + worker unggah 60 detik sekarang = kode mati tanpa cara menguji.

SISA:
- Worker unggah otomatis (refresh token, unggah video + caption saat jadwal tiba) dan penarikan
  views/likes/comments nyata dari API platform. Butuh `*_CLIENT_ID`/`*_CLIENT_SECRET` +
  `FERNET_KEY` + izin OAuth sekali; langkahnya di `docs/evidence/T13/BLOCKED.md`.
  `POST /api/post/queue` dan UI kalender tidak perlu berubah saat itu dipasang.
