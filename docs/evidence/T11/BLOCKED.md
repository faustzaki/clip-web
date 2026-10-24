# T11 — BLOCKED (sebagian): `data/brand.json` belum ada saat precheck

## Perintah precheck + output
```
$ ls data/brand.json 2>/dev/null || echo NO_BRAND; ffmpeg -filters | grep -c overlay
NO_BRAND
6
```
Output lengkap: `docs/evidence/T11/precheck.txt`.

## Artinya
Prasyarat keras T11 **tidak ada satu pun yang absen** (ffmpeg punya `overlay`, jadi logo bisa
ditempel). Yang belum ada hanya **file brand milik user** — jadi jalur yang dipakai adalah
placeholder seperti diminta prompt: default tanpa logo, UI tetap tampil, export jalan seperti biasa.

## Yang sudah jalan tanpa `data/brand.json`
- `GET /api/brand` → 200 `{ok:true, configured:false, brand:{default}, fonts:[…], corners:[…]}` — bukan 500/crash.
- Tab **Pengaturan → 4. Brand Kit** tampil dengan teks jujur: “Brand kit belum tersimpan — export tetap
  jalan dengan gaya bawaan sampai kit ini kamu simpan.”
- Render/export **tidak berubah**: tanpa file brand, `brand_for_render()` balas `{active:false}` dan
  `brand_style()` mengembalikan gaya caption prefs apa adanya (dibuktikan hasil `sha256` render tanpa
  brand = 0ad1593c… yang identik sebelum & sesudah patch).

## Yang belum (butuh aksi user, bukan kode)
- Logo/intro/outro asli: user harus mengunggah lewat tab Brand (berkas masuk `data/brand/`).
- `data/brand.json` sengaja **tidak** ditinggalkan di repo (aturan “tanpa data dummy”); dibuat otomatis
  saat user pertama menekan **Simpan Brand Kit** atau mengunggah berkas.

## Cara unblock
Buka **Pengaturan → 4. Brand Kit**, unggah `logo.png` transparan, atur warna/posisi/ukuran,
tekan **Simpan Brand Kit**, lalu render klip. Verifikasi ulang:
`py -3.13 scripts/check_t11.py` (exit 0) dan `cd frontend && node tools/verify-t11.mjs`.
