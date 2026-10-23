# PROMPT 02a — T2a: Backend transcript + cut (2–3 jam) · P0

## MODE: PATCH, BUKAN BUILD ULANG
`server.py` sudah 1.565 baris dan punya `load_transcript_file()` (baris 185) + `project_dir()`. Tugas ini **menambah 2 endpoint**, bukan menulis ulang file.

**File yang disentuh tugas ini:**
- `server.py` (tambah 2 route + helper, di dekat route transcript yang ada)
- `scripts/check_t2a.py` (baru)

## MODEL
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi kalau gagal 2×: `ninerouter/T-SOTA/claude-sonnet-5`
```bash
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/02a-T2a-backend-transcript.md
```

## BACA (hanya ini, jangan boros konteks)
- `server.py` baris 170–240 (`project_dir`, `load_transcript_file`, ringkasan project)
- `server.py` baris 680–740 (route GET state yang sudah mengembalikan info transcript)
- `docs/DATA-MODEL.md` §3

## PRECHECK
```bash
curl -s localhost:8000/api/health
grep -n "load_transcript_file\|def project_dir" server.py | head
py -3.13 -c "import json,pathlib;d=json.loads((pathlib.Path('work')/'%(pid)s'/'transcript.json').read_text());print(len(d['words']), d.keys())"
```

## TUGAS
1. `GET /api/projects/{pid}/transcript?word=1`
   - baca `work/<pid>/transcript.json`
   - balas `{"words":[{"idx","word","start_ms","end_ms","deleted"}], "language","duration_ms"}`
   - konversi waktu: sumber boleh detik float → **selalu milidetik integer** di respons
   - `deleted` default 0 kalau tidak ada
   - 404 `{"ok":false,"reason":"Transkrip belum siap","hint":"Jalankan analisis dulu"}` kalau file tidak ada
2. `POST /api/projects/{pid}/cut` body `{"from_idx":int,"to_idx":int}`
   - validasi: `0 <= from_idx <= to_idx < len(words)` → kalau tidak, 400 `{"ok":false,"reason":"Rentang tidak valid"}`
   - tandai `deleted=1` pada rentang itu, **simpan atomik** (tulis `.tmp` lalu `os.replace`)
   - **buat backup** `transcript.json.bak` sekali sebelum perubahan pertama
   - hitung `removed_ms` = jumlah `end_ms-start_ms` kata yang dipotong; `new_duration_ms` = durasi - removed
   - balas `{"ok":true,"removed_ms":int,"new_duration_ms":int,"deleted":n}`
3. Jangan mengubah bentuk respons route lain. Jangan menyentuh `chopify/`.

## KRITERIA TERIMA
- `scripts/check_t2a.py` exit 0: 200 + words>0 + field lengkap; cut valid → removed_ms>0; cut invalid → 400 bukan 500; file tetap bisa dibaca JSON setelah cut.
- Backup `transcript.json.bak` dibuat, dan skrip cek **memulihkan** file asli setelah uji.
- `GET /api/projects` tetap berjalan (tidak ada regresi).

## BUKTI
`docs/evidence/T2a/`: `precheck.txt`, `check.txt`, `curl.txt` (2 contoh respons), laporan AGENTS.
