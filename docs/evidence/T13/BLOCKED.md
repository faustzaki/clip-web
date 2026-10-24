# BLOCKED — T13 bagian OAuth platform (unggah otomatis + analitik nyata)

## Perintah deteksi (precheck)
```bash
env | grep -ci 'tiktok_client\|ig_client\|yt_client'
grep -n 'publish' server.py | head -3
```
Output (lihat `docs/evidence/T13/precheck.txt`):
```
0
2655:@app.post("/api/projects/{project_id}/clips/{slug}/publish")
2656:def publish_clip(project_id: str, slug: str):
2679:    # Auto-copy published clip to global render_dir
```

## Yang belum ada
- `TIKTOK_CLIENT_ID`/`TIKTOK_CLIENT_SECRET`, `IG_CLIENT_ID`/`IG_CLIENT_SECRET`,
  `YT_CLIENT_ID`/`YT_CLIENT_SECRET` (0 variabel terdeteksi).
- `FERNET_KEY` untuk enkripsi payload `oauth_tokens`.
- Izin OAuth tiap platform (alur consent interaktif) — tidak bisa dijalankan headless.

## Yang sudah jalan tanpa kredensial (bukan placeholder)
- Antrian posting tersimpan di `data/post_queue.json`: `POST /api/post/queue`,
  `GET /api/post/queue?project_id=`, `DELETE /api/post/queue/{id}` (jadwal + batal).
- UI kalender 7 hari ke depan (`frontend/src/components/PostQueue.jsx`) dengan tombol
  `Jadwalkan` dan `Batal`, plus status koneksi per platform dari `GET /api/post/status`.
- Ekspor metadata: `GET /api/post/caption` → judul + maks 5 hashtag dari keywords,
  dipotong di 2200 karakter; tombol `Salin caption` di UI menaruh teks itu di clipboard.

## Yang belum (placeholder jujur)
- Unggah video otomatis saat jadwal tiba (worker 60 detik + refresh token): belum ada.
  Worker itu butuh token tersimpan + endpoint upload per platform, jadi menulisnya sekarang
  berarti kode mati tanpa cara menguji.
- `GET /api/analytics/{clip_id}` balas status 200
  `{ok:false,reason:"Belum tersedia",detail:"Belum terhubung ke akun platform",hint:"…",metrics:null,days:[]}`.
  Tidak ada permintaan jaringan ke platform mana pun.

## Cara unblock (tanpa ubah kode fitur lain)
1. Isi env kredensial aplikasi platform (`*_CLIENT_ID`, `*_CLIENT_SECRET`) + `FERNET_KEY`.
2. Jalankan alur izin OAuth sekali, simpan payload token (terenkripsi) ke `data/oauth_tokens.json`.
3. Tambah worker unggah 60 detik + pemanggilan endpoint analytics platform; `POST /api/post/queue`
   dan UI kalender tidak perlu berubah.
