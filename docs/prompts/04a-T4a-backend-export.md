# PROMPT 04a — T4a: Backend export job (3 jam) · P0

## MODE: PATCH, BUKAN BUILD ULANG
Render klip **sudah ada** di `server.py` (`/api/render` / fungsi render dari `chopify`). Tugas ini membungkusnya jadi **job** dengan status, bukan menulis pipeline render baru.

**File yang disentuh:**
- `server.py` (2 route + state job di `work/<pid>/exports.json`)
- `scripts/check_t4a.py` (baru)

## MODEL
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi kalau gagal 2×: `ninerouter/T-SOTA/claude-sonnet-5`
```bash
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/04a-T4a-backend-export.md
```

## BACA (hemat konteks)
- `server.py`: cari `render` dan `chopify` (grep), baca route render yang ada
- `docs/DATA-MODEL.md` §1 (`export_jobs`) & §3

## PRECHECK
```bash
grep -n "render" server.py | head
grep -rn "def render" chopify/*.py | head
curl -s localhost:8000/api/health
```

## TUGAS
1. `POST /api/export` body `{"clip_id","resolution":"1080p|720p","fps":30|24,"burn_caption":bool,"name":str}`
   - buat entri job `{id, clip_id, status:"queued", resolution, fps, burn_caption, path, error, created_at}` → simpan `exports.json`
   - jalankan render di **thread** (`threading.Thread`), status `running` → `done`/`failed`
   - **pakai fungsi render yang sudah ada**; kalau perlu, tambah parameter resolusi/fps/burn_caption ke fungsi itu (jangan duplikasi ffmpeg command)
   - balas `{"ok":true,"job_id":...}` segera (tanpa menunggu render)
2. `GET /api/export/{job_id}` → `{"status","path","error","progress"}` (`progress` opsional 0..100)
3. File hasil: `clips/<pid>/<clip_id>_<resolution>.mp4`. Path yang dikembalikan harus path web (`/clips/...`) supaya bisa diunduh dari UI.
4. Kalau `clip_id` tidak ada → 404 `{ok:false,reason}`; kalau ffmpeg tidak ada → `status:"failed"` dengan `error` jelas (bukan 500).

## KRITERIA TERIMA
- `scripts/check_t4a.py` exit 0: POST → `job_id`; polling sampai `done` (maks 120s); file hasil ada dan `ffprobe` melaporkan resolusi **sesuai permintaan**; dua job (720p & 1080p) menghasilkan **sha256 berbeda**; `clip_id` salah → 404; job gagal punya `error` terisi.
- UI lama (`/api/render`) tetap 200 (tanpa regresi).
- Skrip cek **menghapus file hasil uji** setelah selesai; jangan tinggalkan sampah di `clips/`.

## BUKTI
`docs/evidence/T4a/`: `precheck.txt`, `check.txt`, `ffprobe.txt`, `sha256.txt`, laporan AGENTS.
