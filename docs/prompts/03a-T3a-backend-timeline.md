# PROMPT 03a — T3a: Backend timeline (2 jam) · P0

## MODE: PATCH, BUKAN BUILD ULANG
`server.py` sudah punya pola yang dipakai T2a (`project_dir`, `load_transcript_file`, tulis atomik `.tmp` + `os.replace`). Tugas ini **menambah 1 file state + 2 route**, bukan menulis ulang.

**File yang disentuh:**
- `server.py` (2 route + 2 helper, taruh dekat route `/cut` dari T2a)
- `scripts/check_t3a.py` (baru)

## MODEL
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi kalau gagal 2×: `ninerouter/T-SOTA/claude-sonnet-5`
```bash
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/03a-T3a-backend-timeline.md
```

## BACA (hemat konteks)
- `server.py` baris 740–830 (route T2a: transcript + cut)
- `docs/DATA-MODEL.md` §1 (`timeline_items`) & §3
- `work/<pid>/transcript.json` (struktur kata), `work/<pid>/clips.json` (kalau ada)

## PRECHECK
```bash
curl -s localhost:8000/api/health
grep -n "timeline" server.py | head
ls work/<pid>/ | head
```

## TUGAS
1. `GET /api/projects/{pid}/timeline`
   - kalau `work/<pid>/timeline.json` ada → kirim isinya
   - kalau belum ada → **turunan otomatis** (read-only, jangan tulis file):
     - `duration_ms` dari transkrip (`duration` × 1000) atau durasi video
     - track 1 (`video`): satu item `kind="video"` start 0 end duration_ms
     - track 2 (`caption`): item per kalimat dari kata (`kind="caption"`, `payload={"text": "..."}`), maksimal 12 kata per item
     - track 3 (`audio`): satu item `kind="audio"` 0..duration_ms
   - bentuk respons: `{"duration_ms": int, "tracks": [{"track":1,"items":[{"id","kind","start_ms","end_ms","payload"}]}]}`
2. `POST /api/projects/{pid}/timeline` body `{"items":[{"track","kind","start_ms","end_ms","payload"}]}`
   - validasi: `track` ∈ {1,2,3}, `0 <= start_ms < end_ms`, `end_ms <= duration_ms + 1000` → kalau tidak, 400 `{"ok":false,"reason":...}`
   - tulis `timeline.json` atomik (`.tmp` → `os.replace`), backup `.bak` sekali
   - balas `{"ok":true,"items":n}`
3. Jangan menyentuh `chopify/`, jangan mengubah route lain.

## KRITERIA TERIMA
- `scripts/check_t3a.py` exit 0: GET 200 + 3 track + durasi > 0; POST valid → `ok:true` dan file JSON terbaca; POST invalid (`end_ms < start_ms`, track 9) → **400 bukan 500**; GET ulang setelah POST mengembalikan item yang sama.
- Skrip cek **menghapus `timeline.json` buatan uji** di akhir (jangan tinggalkan data palsu).
- `GET /api/projects` dan `GET /transcript` tetap 200 (tanpa regresi).

## BUKTI
`docs/evidence/T3a/`: `precheck.txt`, `check.txt`, `curl.txt`, laporan AGENTS.
