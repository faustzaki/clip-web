# BLOCKED T9 — terjemahan subtitle

## Perintah precheck
```bash
curl -s http://127.0.0.1:20128/v1/models -H "Authorization: Bearer $NINEROUTER_API_KEY" | head -c 120
ls data/glossary.txt
```
Output lengkap: `docs/evidence/T9/precheck.txt`

## Hasil deteksi (24 Okt 2026, 20:13)
```
## 9Router
HTTP 000            <- tidak ada proses yang menjawab di 127.0.0.1:20128
## glossary
-rwxrwxrwx 1 somebody somegroup 200 Oct 24 20:12 data/glossary.txt
```
`NINE_ROUTER_URL` / `NINE_ROUTER_API_KEY` tidak di-set di shell; endpoint default `http://127.0.0.1:20128/v1` juga tidak hidup.

## Yang belum bisa diverifikasi (butuh 9Router hidup)
- Mutu terjemahan model nyata `T-SOTA/claude-sonnet-5` (prompt `docs/prompts/translate.md`).
- Latensi & pemakaian batch 40 baris ke provider asli.

## Yang sudah jalan & terbukti tanpa 9Router
- `scripts/check_t9.py` (exit 0, 8/8) memakai server LLM tiruan stdlib yang meniru
  `/chat/completions`: batch, retry JSON invalid, QA "lebih padat", cache, glosarium,
  burn dua bahasa via ffmpeg, dan placeholder router mati — semua dieksekusi nyata.
- Placeholder: `POST /api/clips/{id}/translate` balas 200 `{ok:false,reason:"9Router tidak merespons",hint}`,
  panel Subtitles menampilkan alasan itu dan tombol `Terjemahkan klip` disabled
  (`docs/evidence/T9/after/translate-router-mati.png`).
- Glossary kosong tetap aman: tanpa istilah, tidak ada masking yang dikirim.

## Cara unblock (tanpa ubah kode)
1. Jalankan 9Router sampai `http://127.0.0.1:20128/v1/models` balas 200.
2. Muat ulang halaman Studio → tombol `Terjemahkan klip` aktif, panel berhenti menampilkan peringatan.
3. Ulangi: `py -3.13 scripts/check_t9.py` lalu `cd frontend && node tools/verify-t9.mjs`
   (keduanya memakai tiruan/mock, jadi tetap hijau; bedanya hanya mutu terjemahan asli).
