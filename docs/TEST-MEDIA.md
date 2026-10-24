# TEST-MEDIA — video uji untuk semua fitur

Diverifikasi dengan `yt-dlp -J` pada 24 Okt 2026 (judul, durasi, channel dicek nyata — bukan tebakan).

## 1. Sudah ada di repo (project josjis, transkrip siap)
| ID | Video | URL | Durasi | Transkrip | Catatan |
|---|---|---|---|---|---|
| `5aedd1102e` | Unboxing + tes fitur baru iPhone | https://youtu.be/BQIwRiMxHXc | 31.8 mnt | ✅ 4.133 kata | **2 klip** — ada sumber + klip final, terbaik untuk export/preset |
| `261e5b42f5` | BELANJA KE KOPDES | https://youtu.be/sIfvJZUszlw | 11.3 mnt | ✅ 1.829 kata | media waktu/WER |
| `6e1ad13b1a` | KEI & ORANGTUA… APA YG SEBENARNYA | https://youtu.be/6d57Av6Kvyg | 83.7 mnt | ✅ | 6 kandidat |
| `07f840b0ad` | PERANG MENGERIKAN KOREA DIMULAI | https://youtu.be/dkKPyVpGA6Q | 349 mnt | ✅ | terpanjang; uji beban |
| `80509fb51b` | Gue Telfonan Sama Satoshi Nakamoto | https://youtu.be/Yat3M3FqLF4 | — | ❌ | **sengaja tanpa transkrip** → uji placeholder |

## 2. Video uji yang baru diverifikasi (belum di repo)
| Keperluan | Video | URL | Durasi |
|---|---|---|---|
| **Podcast 2 orang, Indonesia** (uji T8 diarisasi) | ABIS DARI SINI KITA MUSUHAN — Vidi Aldiano × Deddy Corbuzier | https://www.youtube.com/watch?v=OIbNXqN0GZg | 86.6 mnt |
| Podcast 2 orang (cadangan) | FITROP: AYO OM DED JOGET BAPAK2… | https://www.youtube.com/watch?v=hHuahFR3_dc | 85.2 mnt |
| Ngobrol santai (uji T5 filler “eee/apa ya”) | Podcast Terpanjang di Dunia — Raditya Dika | https://www.youtube.com/watch?v=oI50zFiXcpM | 24 jam |
| **Podcast Inggris 2 host** (uji T9 translasi en→id) | Advanced Listening — Interview with Luke | https://www.youtube.com/watch?v=QO66N1LrNCg | 76.3 mnt |
| Single speaker, edukasi (basis WER bersih) | Semua Jenjang Pendidikan Tinggi di Indonesia Dijelaskan dalam 10 Menit | https://www.youtube.com/watch?v=0vS8qqE5YPQ | 10.1 mnt |

## 3. Peta fitur → video uji
| Fitur | Video yang dipakai | Kenapa |
|---|---|---|
| Ingest + ASR + WER (T7) | `5aedd1102e`, `261e5b42f5` | transkrip + audio Indonesia sudah ada |
| Diarisasi (T8) | **Vidi × Deddy** (2 orang jelas) | jalur A/B paling mudah dinilai |
| Filler/silence (T5) | **Raditya Dika** (banyak “eee/apa ya”) | podcast santai = banyak filler |
| Translasi (T9) | **Luke’s English Podcast** | sumber Inggris → target Indonesia |
| Timeline/transcript seek (T2/T3) | `5aedd1102e` | 4.133 kata, video 31 mnt |
| Export/ratio/preset (T4/T6) | `5aedd1102e` (punya 2 klip) | sumber + klip final sudah ada |
| Placeholder/blokir jujur | `80509fb51b` | sengaja tanpa transkrip |

## 4. Cara pakai
```bash
# tambah project dari URL (butuh backend :8000 hidup)
curl -s -X POST http://127.0.0.1:8000/api/projects   -H "Content-Type: application/json"   -d '{"source_type":"youtube","source_url":"https://www.youtube.com/watch?v=OIbNXqN0GZg","language":"id"}'
```
Ingest ±1–3 menit per 30 menit video (unduh + whisper). Video 24 jam **jangan** dipakai untuk ingest penuh — potong dulu atau pakai `?t=` supaya tidak makan disk.

## 5. Batas yang perlu dijaga
- Whisper `medium` CPU kira-kira **1× durasi audio** (video 30 mnt ≈ 30 mnt proses). Untuk uji cepat, pakai `small`.
- Disk: unduh 1080p 30 mnt ≈ 300–500 MB. Disk sekarang 27 GB → aman untuk 2–3 video sekaligus.
- Podcast 24 jam (Raditya) hanya untuk uji **potongan**; jangan ingest penuh.
