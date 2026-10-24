# HANDOFF-PM — status proyek clip-web saat dihentikan sementara

Ditulis: 24 Okt 2026, sesi PM dihentikan karena laptop dimatikan.

## 1. Status git (PENTING)
- Branch aktif: **`t6-safezone-zoom`** (belum ada commit; belum ada perubahan file)
- `main` sudah bersih dan ter-push: commit terakhir **`0e34a14` Merge T5: filler + preset caption**
- Semua kerja T0–T5 sudah di `origin/main`. Tidak ada pekerjaan yang hilang kalau laptop mati.

## 2. Yang sudah selesai (P0)
| Tugas | Commit | Hasil |
|---|---|---|
| T0 orchestrator | `dd10393` | `docs/TASKS.md` 13 tugas + baseline screenshot |
| T1 token + shell | `4c06797` | token `--vz-*`, header 56 / rail 72 / strip 96 / sidebar 360 |
| T1b sapu tema gelap | `8a455ee` | `grep dark:neon:gradient frontend/src` kosong |
| T2a backend transcript | `8147ce9` | `GET /transcript?word=1`, `POST /cut` |
| T2b panel transcript | `7b5cc2e` | panel 360px, klik kata → seek, cari, potong |
| T3a backend timeline | `98c6511` | `GET/POST /timeline`, 3 track, caption turunan |
| T3b komponen timeline | `0512f53` | ruler, playhead, zoom, collapse 240/320 |
| T3c pecah StudioView | `00a4d68` | 2.051 → 337 baris (3 komponen + 2 hook) |
| T4a backend export | `545fb5e` | `POST /api/export` + `GET /api/export/{id}` |
| T4b modal export | `a125443` | modal 480px, polling 2s, unduh 200 video/mp4 |
| T5 filler + preset caption | `0e34a14` | tighten + 5 preset, ToolPanel 320px |
| T6 safe zone + ratio + auto zoom | `ea23d7a` | pill berlabel, 4 ratio (9:16/1:1/4:5/16:9), safe zone 88×80, zoompan+yunet |

Verifier PM yang harus tetap hijau:
```
cd frontend
node tools/verify-t2b.mjs   # 6/6
node tools/verify-t3b.mjs   # 6/6
node tools/verify-t4b.mjs   # 10/10
node tools/verify-t5.mjs    # 0 gagal
node tools/verify-t6.mjs    # 0 gagal
py -3.13 scripts/check_t5.py
```

## 3. Status terkini (diperbarui 24 Okt, 22:5x)
**SEMUA 13 TUGAS SELESAI** (P0 T1–T6 · P1 T7–T9 · P2 T10–T13).

| Fase | Tugas | Commit puncak |
|---|---|---|
| P0 | T1, T1b, T2a/T2b, T3a/T3b/T3c, T4a/T4b, T5, T6 | `ea23d7a` |
| P1 | T7 akurasi ASR, T8 diarisasi, T9 translasi | `9231372`, `802d2eb` |
| P2 | T10 b-roll, T11 brand kit, T12 background, T13 posting | `f7a1a19`, `164ea10`, `614e010`, `ddd8749` |

Yang masih terbuka: `docs/PUNCHLIST.md` (utang visual/teknis) dan **T9 belum diuji dengan model nyata** (9Router mati). T13 hanya BLOCKED untuk OAuth (queue lokal + UI jalan penuh).

## 3b. Catatan lama
- **P0 SELESAI SEMUA (T1–T6)** — T6 merged di `ea23d7a`. Gate P0 lolos: check_t6 0 gagal, verify-t6 0 gagal, regresi t2b 6/6 · t3b 6/6 · t4b 10/10 · t5 0 gagal.
- **Berikutnya P1**: T7 akurasi ASR (`docs/prompts/07-T7-akurasi-transkripsi.md`), lalu T8 diarisasi & T9 translasi
- P2: T10 b-roll, T11 brand kit, T12 background/layout, T13 posting+analitik

## 4. Cara melanjutkan (setelah laptop hidup)
```bash
cd C:\Users\faust\orca\clip-web
git checkout main && git pull
run_backend.bat          # backend :8000 dengan --reload (hot reload, ala next dev)
git branch --show-current          # main — semua tugas selesai
# nyalakan backend asli (WAJIB untuk verifikasi, bukan mock)
py -3.13 -m uvicorn server:app --host 127.0.0.1 --port 8000
```
Jalankan P1 (T7) setelah backend hidup:
```bash
git checkout -b t7-akurasi
omp -p --approval-mode=yolo --max-time=2400 \
  --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low \
  @AGENTS.md @docs/prompts/07-T7-akurasi-transkripsi.md
```

## 5. Hal yang mudah terlupa
- Verifikasi **selalu pakai backend asli `:8000`**, bukan `_mock.py`. Kalau kode `server.py` berubah, **restart uvicorn** dulu (tanpa `--reload`).
- Model: `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`. `ocf/*` dilarang (plan-mode). `cbai/deepseek` hanya untuk tugas 1 file.
- Jangan pakai `MouseEvent` sintetis di verifier — pakai `page.mouse.click` (pernah bikin false-FAIL).
- Semua file uji harus dibersihkan: `clips/<pid>/*.mp4` hasil export PM dan `work/<pid>/timeline.json`.
- Punchlist terbuka: `docs/PUNCHLIST.md` (P-01, P-02, P-04, P-05, P-06, P-07, P-09, P-10, P-11).
