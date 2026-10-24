# CARA JALANIN — clip-web

## Cepat (cara yang disarankan)
Klik dua kali **`dev.bat`** di `C:\Users\faust\orca\clip-web`.

Yang terjadi:
- jendela 1: backend `:8000` (hot reload — simpan file `.py`, server muat ulang sendiri)
- jendela 2: frontend vite `:5173` (HMR — simpan file `.jsx`, halaman update sendiri)
- browser terbuka otomatis ke http://127.0.0.1:5173

Untuk berhenti: tutup dua jendela itu.

## Manual (kalau `dev.bat` rewel)
Terminal 1:
```bash
cd C:\Users\faust\orca\clip-web
py -3.13 -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
Terminal 2:
```bash
cd C:\Users\faust\orca\clip-web\frontend
npm run dev
```
Buka http://127.0.0.1:5173

## Mode build (tanpa vite, lebih ringan)
```bash
cd C:\Users\faust\orca\clip-web
run.bat          # backend :8000 + browser
```
Backend juga menyajikan `frontend/dist` — jadi cukup satu proses. Cocok kalau cuma mau pakai, bukan ngoding.

## Yang bisa langsung dicoba di UI
| Mau tes apa | Langkah |
|---|---|
| **Project + Studio** | kartu project → panel transkrip kiri, stage tengah, rail kanan, timeline bawah, clip strip |
| **Transcript (T2)** | klik kata mana pun → video melompat ke detik itu; cari kata; seleksi 2+ kata → `Potong bagian ini` |
| **Timeline (T3)** | klik ruler → seek; tombol `25/50/100/200%`; chevron buka/tutup; playhead ikut playback |
| **Timeline → b-roll (T10)** | rail `B-roll` → `Muat ulang index` → `Sisipkan` (butuh file di `data/broll/`) |
| **Subtitles (T5)** | rail `Subtitles` → slider jeda + `Terapkan`; pilih 1 dari 5 preset caption |
| **Layout (T6/T12)** | pill di bawah preview: `Ratio (9:16)` / `Background` / `Layout` → isi latar, susunan, offset |
| **Export (T4)** | tombol `Unduh` di kartu klip → modal → resolusi/fps/caption → Export → `Unduh` |
| **Brand kit (T11)** | `Pengaturan` → tab `4. Brand Kit` → logo, warna, font, intro/outro |
| **Akurasi ASR (T7)** | `Pengaturan` → tab `Akurasi ASR` → glosarium + tabel WER |
| **Posting (T13)** | header `Posting` → kalender 7 hari, jadwalkan, salin caption |

## Kalau ada masalah
| Gejala | Sebab & solusi |
|---|---|
| `:5173` kosong putih | vite masih kompilasi — tunggu 5 detik, refresh |
| `Failed to fetch` / data kosong | backend belum hidup. Cek http://127.0.0.1:8000/api/health harus `{"status":"ok",...}` |
| `Address already in use` | ada server lama. `netstat -ano | findstr :8000` lalu `taskkill /PID <pid> /F` |
| Backend error saat start | pastikan `py -3.13` (bukan `python` — env itu tanpa dependency) |
| Panel transkrip kosong | project belum punya transkrip → jalankan ingest dulu (butuh backend hidup) |
| `Belum tersedia` di Analitik | normal — OAuth platform belum dipasang (T13) |

## Catatan
- Port: backend **8000**, frontend **5173**. Mock lama `_mock.py` pakai 8005 — jangan dipakai bareng.
- 9Router (`:20128`) mati → fitur translasi & pilih model AI tampil pesan jujur, bukan error mentah.
