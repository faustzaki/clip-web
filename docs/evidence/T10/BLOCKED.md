# BLOCKED — T10 (b-roll dari folder lokal)

## 1. Perintah precheck + output

```
$ ls data/broll 2>/dev/null | head -3 || echo NO_BROLL_DIR
(baris kosong)

$ test -d data/broll && echo EXISTS || echo NO_BROLL_DIR
NO_BROLL_DIR

$ ffmpeg -version | head -1
ffmpeg version 9.0-full_build-www.gyan.dev ...

$ ffprobe -version | head -1
ffprobe version 9.0-full_build-www.gyan.dev ...
```
Output lengkap: `docs/evidence/T10/precheck.txt`.

## 2. Yang sudah jalan (bukan crash, bukan fitur disembunyikan)

| Bagian | Status |
|---|---|
| Folder `data/broll/` dibuat otomatis (impor `broll_index.py`, bukan error) | jalan |
| `GET /api/broll/index` saat folder kosong | `200 {"ok":true,"count":0,"items":[],"hint":"Folder b-roll masih kosong. Taruh video di data/broll/."}` |
| Panel `B-roll` saat folder kosong | `B-ROLL (0)` + teks alasan Indonesia + tombol `Muat ulang index` (screenshot `after/broll-empty.png`) |
| Index, tag, thumbnail, saran, sisipkan, geser/hapus, overlay render | jalan penuh (dibuktikan `after/frame-broll-1..3.png`) |

## 3. Yang belum: materi b-roll milik user

Folder `data/broll/` **awalnya tidak ada**, jadi tidak ada video b-roll asli milik user.
Supaya kriteria terima bisa diukur, dipakai **3 aset uji buatan** (ffmpeg `testsrc2` + warna
solid, 4 detik, 640×360):

| Berkas | Tag dari nama | Warna uji |
|---|---|---|
| `data/broll/pantai-sunset.mp4` | `pantai`, `sunset` | merah |
| `data/broll/senja-kota.mp4` | `senja`, `kota` | biru |
| `data/broll/kopi-latte.mp4` | `kopi`, `latte` | hijau |

`data/broll/tags.json` berisi contoh tag tambahan (`pantai-sunset.mp4` → `drone`, `laut`).
Aset uji ini **di-gitignore** (`data/broll/*` di `.gitignore`), jadi repo tidak ikut kotor.

## 4. Cara unblock (tanpa ubah kode)

1. Taruh video/gambar b-roll asli di `data/broll/` (mp4/mov/webm/jpg/jpeg/png, subfolder boleh).
2. Opsional: tambah tag manual di `data/broll/tags.json`,
   bentuk `{"nama-file.mp4": ["drone"], "sunset": ["pantai-sunset.mp4"]}`.
3. Buka panel `B-roll` di studio → tekan `Muat ulang index` (atau `POST /api/broll/refresh`).
4. Hapus 3 aset uji kalau tidak diperlukan lagi.
