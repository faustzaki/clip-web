# Evidence — kondisi awal (prompt 00, 24 Okt 2026)

## Isi
| File | Layar | Viewport |
|---|---|---|
| `projects-1440x900.png` | Projects (2 kartu, badge status) | 1440×900 |
| `projects-1280x800.png` | Projects | 1280×800 |
| `studio-1440x900.png` | Studio (panel Generate Clip, preview 9:16, clip strip) | 1440×900 |
| `studio-1280x800.png` | Studio | 1280×800 |

Screenshot memperlihatkan baseline **tema gelap** (`#0d0d11`) + aksen merah/`neon` — inilah yang wajib hilang menurut ADR-001.

## Cara ambil (menyimpang dari `AGENTS.md`)
`AGENTS.md` menyuruh `python _mock.py` + `python _shot2.py`. Dua kendala nyata:

1. **`_shot.py` / `_shot2.py` tidak ada di repo** (`ls _shot*.py` → not found), jadi skrip itu dibuat ad-hoc di luar repo.
2. **`_mock.py` menyajikan build repo lain**: `DIST = C:/Users/faust/Downloads/clip-web-review/frontend/dist`, dan
   `md5sum` membuktikan build itu beda dari `frontend/dist` repo ini
   (`index-DumZOmRi.js` → repo `b8b3616e…` vs review `64f28660…`). Screenshot akan menampilkan kode yang salah.

Karena kriteria terima melarang modifikasi file sumber (`git status` bersih selain `docs/`), `_mock.py` **tidak** diubah.
Skrip sekali-pakai di `%TEMP%/clipweb-shot/`:

- `mock_local.py` — baca `_mock.py` apa adanya, ganti string DIST ke `C:/Users/faust/orca/clip-web/frontend/dist`, lalu `exec`.
- `shot.py` — Playwright (chromium) `py -3.13`, buka `http://127.0.0.1:8005`, screenshot Projects, klik kartu "Podcast Bisnis", screenshot Studio, untuk 2 ukuran viewport.

```bash
py -3.13 %TEMP%/clipweb-shot/mock_local.py     # API tiruan :8005
py -3.13 %TEMP%/clipweb-shot/shot.py shots     # 4 png + daftar pageerror
```

Hasil: `pageerrors: none` — UI render tanpa error runtime di kedua layar.

## Sisa untuk T1
Skrip screenshot permanen (`_shot2.py`) dan perbaikan path `DIST` di `_mock.py` belum dibuat karena di luar cakupan prompt 00 —
kerjakan di T1 supaya bukti `before/after` tugas berikutnya bisa direproduksi satu perintah.
