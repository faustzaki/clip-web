# DATA-MODEL — skema & kontrak

Prinsip (ADR-007): **additive**. Tabel lama tidak diubah. Semua `CREATE TABLE IF NOT EXISTS` saat startup.

## 1. Tambahan tabel (SQLite, `data/app.db`)
```sql
-- kata-level transkrip; sumber klip & caption
CREATE TABLE IF NOT EXISTS transcript_words (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL,
  idx INTEGER NOT NULL,           -- urutan
  word TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  speaker TEXT,                   -- null kalau tidak ada diarisasi
  deleted INTEGER DEFAULT 0,      -- 1 = dipotong user
  UNIQUE(project_id, idx)
);
CREATE INDEX IF NOT EXISTS ix_tw_project ON transcript_words(project_id, idx);

-- isi timeline (per klip final maupun draft)
CREATE TABLE IF NOT EXISTS timeline_items (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL,
  clip_id TEXT,                   -- null = timeline project
  track INTEGER NOT NULL,         -- 1 video, 2 teks, 3 audio
  kind TEXT NOT NULL,             -- video|text|caption|audio|broll
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  payload TEXT,                   -- JSON: {text,style,src,vol,zoom_keyframes}
  z INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_ti_clip ON timeline_items(clip_id, track, start_ms);

-- riwayat export
CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  clip_id TEXT,
  engine TEXT NOT NULL,           -- local|vizard
  preset TEXT NOT NULL,           -- 1080p30|720p30|...
  burn_caption INTEGER DEFAULT 1,
  status TEXT NOT NULL,           -- queued|running|done|failed
  path TEXT,
  error TEXT,
  created_at INTEGER,
  finished_at INTEGER
);
```

## 2. Kontrak API (yang sudah ada, jangan diubah bentuknya)
| Method | Path | Catatan |
|---|---|---|
| GET | `/api/health` | `{status,ffmpeg,yunet,ninerouter}` |
| GET | `/api/projects` | `{projects:[{id,title,created_at,status,...}]}` |
| GET | `/api/projects/{id}/state` | `{project,video,transcript,candidates,ingest,clips}` |
| GET | `/api/projects/{id}/clips` | daftar klip |
| GET/POST | `/api/settings` | termasuk daftar model |

## 3. Endpoint baru (tugas yang membutuhkannya)
| Method | Path | Body / respons | Dipakai tugas |
|---|---|---|---|
| GET | `/api/projects/{id}/transcript?word=1` | `{words:[{idx,word,start_ms,end_ms,deleted}]}` | T2 |
| POST | `/api/projects/{id}/cut` | `{from_idx,to_idx}` → `{removed_ms,new_duration_ms}` | T2 |
| GET | `/api/projects/{id}/timeline` | `{duration_ms,tracks:[{track,items:[]}]}` | T3 |
| POST | `/api/projects/{id}/timeline` | `{items:[...]}` → `{ok:true}` | T3 |
| POST | `/api/export` | `{clip_id,resolution,fps,burn_caption,name}` → `{job_id}` | T4 |
| GET | `/api/export/{job_id}` | `{status,path,error}` | T4 |
| POST | `/api/projects/{id}/tighten` | `{silence_ms:400,filler:true}` → `{saved_ms}` | T5 |
| POST | `/api/projects/{id}/zoom-keyframes` | `{candidate_index,zoom_manual?,aspect?}` → `{ok:true,keyframes:[{t,x,y,w,h}]}` (0..1, koordinat sumber; tanpa yunet → `{ok:false,reason,hint}` status 200) | T6 |
| GET | `/api/projects/{id}/transcript?word=1` | tambah `avg_logprob`, `edited`, `needs_check`, `model`, `check_threshold` per kata | T7 |
| POST | `/api/projects/{id}/transcript/word` | `{idx,text}` → `{ok:true,from_idx,count,words:[{idx,word,start_ms,end_ms}]}`; timing lama dibagi proporsional per karakter | T7 |
| GET/PUT | `/api/glossary` | `{path,text,terms:[…]}` ↔ `{text}` → `{ok:true,terms}`; berkas `data/glossary.txt` dibuat kalau belum ada | T7 |
| GET | `/api/accuracy` | `{ok:true,source,window,reference_note,measured_at,rows:[{id,label,words,errors,wer}],improvement}`; sampel `data/wer_sample.json` absen → `{ok:false,reason,hint}` status 200 | T7 |

## 4. Bentuk data klip (harus identik dua engine)
```json
{
  "id": "clip_001",
  "title": "…",
  "reason": "…",
  "keywords": ["…"],
  "start_ms": 12000, "end_ms": 52000,
  "viral_score": 8.8,
  "engine": "local|vizard",
  "caption_style": "clean-white",
  "segments": [{"start_ms":0,"end_ms":9800}]
}
```
Aturan: field tidak boleh beda antar engine. Kalau Vizard tidak menyediakan sesuatu, isi `null`, jangan dihilangkan.

## 5. Aturan data
- semua waktu **milidetik integer**, bukan float detik.
- `clip_id` string stabil, tidak berubah saat rename.
- file media: `data/media/{project_id}/` — `source.mp4`, `clip_{id}.mp4`, `thumb_{id}.jpg`.
- jangan simpan token/API key di DB; ambil dari env (`VIZARDAI_API_KEY`, `NINE_ROUTER_API_KEY`).

## 6. Tabel tambahan untuk P1–P2 (T7–T13)
```sql
-- T7: keyakinan per kata + glosarium di file data/glossary.txt
ALTER TABLE transcript_words ADD COLUMN avg_logprob REAL;   -- additive, aman
ALTER TABLE transcript_words ADD COLUMN edited INTEGER DEFAULT 0;  -- 1 = teks sudah diperbaiki manual

-- T8: diarisasi
CREATE TABLE IF NOT EXISTS speakers (
  id INTEGER PRIMARY KEY, project_id TEXT NOT NULL, label TEXT NOT NULL,
  color_idx INTEGER DEFAULT 0, confidence TEXT DEFAULT 'model'  -- model|estimate
);
-- transcript_words.speaker = id speaker (nullable)
-- CATATAN IMPLEMENTASI T8 (repo ini belum punya SQLite; T2/T3/T7 juga file-based):
--   speakers[] disimpan di `work/<project_id>/project.json`, `transcript.json` tiap kata
--   menyimpan `speaker` = id (bukan PK tabel). Id dibuat unik antar project:
--   `id = int(project_id, 16) * 4 + urutan` supaya `PATCH /api/speakers/{id}` (tanpa project
--   di path) tetap unambiguous. Bentuk respons API sama seperti tabel di atas.

-- T9: cache translasi
CREATE TABLE IF NOT EXISTS subtitle_translations (
  id INTEGER PRIMARY KEY, project_id TEXT, clip_id TEXT, lang TEXT NOT NULL,
  payload TEXT NOT NULL, created_at INTEGER,
  UNIQUE(clip_id, lang)
);
-- CATATAN IMPLEMENTASI T9 (repo ini belum punya SQLite; T2/T3/T7/T8 juga file-based):
--   cache disimpan di `work/<project_id>/translations.json`, kunci `"<clip_id>|<lang>"`,
--   nilai = {project_id, clip_id, lang, payload:{lines,flagged,per_line,model,lang}, created_at}.
--   `payload.lines[i]` = {i, source, text, flagged}; satu baris = satu potongan caption
--   (`words_per_line`), jadi jumlahnya wajib sama dengan jumlah potongan saat burn.

-- T10: index b-roll (file-based, bukan DB berat)
-- data/broll/index.json = [{path,tags:[],dur_ms,thumb}]

-- T13: antrian posting + token
CREATE TABLE IF NOT EXISTS post_queue (
  id INTEGER PRIMARY KEY, clip_id TEXT NOT NULL, platform TEXT NOT NULL,
  caption TEXT, scheduled_at INTEGER, status TEXT DEFAULT 'queued', error TEXT
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  platform TEXT PRIMARY KEY, payload TEXT NOT NULL,   -- terenkripsi FERNET_KEY
  expires_at INTEGER
);
```
Endpoint baru P1–P2:
| Method | Path | Tugas |
|---|---|---|
| POST | `/api/projects/{id}/transcribe?quality=high` | T7 |
| GET | `/api/projects/{id}/wer` | T7 |
| POST | `/api/projects/{id}/diarize` | body `{engine:"auto"\|"model"\|"heuristic"}` → `{ok:true,engine,confidence,speakers:[{id,label,color_idx,confidence}],duration_ms,duration_before_ms}`; engine `model` tanpa pyannote/HF_TOKEN → `{ok:false,reason,hint}` status **200** | T8 |
| PATCH | `/api/speakers/{id}` | body `{label,color_idx?}` → `{ok:true,speaker:{…}}`; label kosong → 400 | T8 |
| POST | `/api/clips/{id}/translate` | T9 |
| GET | `/api/broll/index`, `POST /api/broll/refresh` | T10 |
| GET/POST | `/api/brand` | T11 |
| POST | `/api/post/queue`, `DELETE /api/post/queue/{id}` | T13 |
| GET | `/api/analytics/{clip_id}` | T13 |
