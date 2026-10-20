# Percepat buat project: unduh video proxy + transkrip duluan, HQ saat render

## Context

Klik "BUAT PROJECT" sekarang menunggu satu request `POST /api/projects/{pid}/ingest` yang mengunduh video YouTube kualitas tertinggi lalu mentranskrip seluruh video — form terkunci tanpa progress. Terukur untuk video uji `https://youtu.be/BQIwRiMxHXc` (32 menit, 4K60 AV1): selector `bestvideo*+bestaudio/best` memilih format `401+251` = **1.176.400.537 byte (1.18 GB)** — itu penyebab tunggal "lama sekali"; ditambah transkrip faster-whisper seluruh durasi.

Dua masalah tambahan yang memblokir hasil: `faster-whisper` dan `youtube-transcript-api` **tidak terpasang** di interpreter server (`C:\Python313\python.exe`, terverifikasi dari Process.Path PID server), jadi walau unduhan sukses transkrip akan selalu gagal; dan yt-dlp jalan tanpa JS runtime (`WARNING: No supported JavaScript runtime could be found` — node v22 ada di PATH tapi tidak dipakai), jalur ekstraksi yang deprecated.

Target akhir: (1) project siap (transkrip + video preview) dalam detik–puluhan detik memakai video proxy 360p, (2) form langsung kembali dan progress tampil live di Studio, (3) kualitas video render dipilih saat render (proxy / 1080p / terbaik) dan diunduh saat itu juga, di-cache untuk render berikutnya.

## Approach

### 1. Pasang dependency yang hilang + perbaiki launcher backend

Server berjalan di `C:\Python313\python.exe` (bukan `.venv` yang tidak ada). Jalankan:

```
C:/Python313/python.exe -m pip install "faster-whisper>=1.2.0" "youtube-transcript-api>=1.2.0"
C:/Python313/python.exe -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
```

Perintah kedua mengisi cache HuggingFace (~140 MB) sekarang, supaya ingest pertama user tidak ikut menunggu unduh model.

Edit `requirements.txt`: tambah baris `youtube-transcript-api>=1.2.0` (faster-whisper sudah ada, naikkan jadi `faster-whisper>=1.2.0`).

Edit `run.bat` baris 8 dan `run_backend.bat` baris 7: ganti `.venv\Scripts\uvicorn.exe` → `python -m uvicorn` (`.venv` tidak ada; kalau dibiarkan kedua file itu mati dan server cuma bisa start manual).

### 2. Preset unduhan + unduhan berprogress di `core_engine.py`

Ganti isi `download_source` (baris 52) dengan tiga fungsi. Selector di bawah sudah diverifikasi dengan `yt_dlp -F`/`--simulate` untuk video uji (angka = ukuran terpilih):

```python
YT_PRESETS = {
    # proxy: 134+251 = 63 MB (vs 1.18 GB sekarang)
    'proxy': {'format': 'bv*[height<=360]+ba/b[height<=360]/b', 'sort': 'res:360,vcodec:h264'},
    # hd: 299+251 = 509 MB, H.264 1080p (decode render paling cepat)
    'hd':    {'format': 'bv*[height<=1080]+ba/b[height<=1080]/b', 'sort': 'res:1080,vcodec:h264'},
    # best: 401+251 = 1.18 GB, 4K AV1; tanpa preferensi vcodec karena 4K H.264 tidak ada
    'best':  {'format': 'bv*+ba/b', 'sort': 'res'},
}

def yt_dlp_cmd(url: str, out_tmpl: Path, preset: str = 'proxy', progress: bool = False) -> list:
    """Rakit argumen yt-dlp. Flag tetap: --no-playlist --merge-output-format mp4
    --js-runtimes node --retries 10 --fragment-retries 10 --concurrent-fragments 8."""

def download_to(url: str, dest_base: Path, preset: str = 'proxy', on_progress=None) -> Path:
    """Unduh ke f'{dest_base}.%(ext)s', panggil on_progress(frac|None) tiap update."""

def download_source(url_or_path, workdir, preset: str = 'proxy', on_progress=None) -> Path:
    """Wrapper kompatibel 2-arg lama (dipakai app.py); cabang copy file lokal dipertahankan."""
```

Detail yang harus persis:

- `yt_dlp_cmd` selalu menambahkan `--newline`, dan bila `progress=True` juga
  `--progress-template "download:PROGRESS:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s"`.
  `-f` dan `-S` diambil dari `YT_PRESETS[preset]`; preset tak dikenal → `ValueError`.
- `download_to`: `dest_base.parent.mkdir(parents=True, exist_ok=True)`;
  `subprocess.Popen(cmd, stdout=PIPE, stderr=STDOUT, text=True, bufsize=1, encoding='utf-8', errors='replace')`;
  baca baris; baris mulai `PROGRESS:` → pecah `d|t|te`, `total = t if t != 'NA' else te`; bila `d`/`total` numerik dan `total > 0` → `on_progress(min(0.99, d/total))`; selain itu `on_progress(None)`. Baris lain masuk `collections.deque(maxlen=40)` sebagai log tail.
  - `on_progress` melempar → `proc.kill(); proc.wait()` lalu re-raise (dipakai untuk batal).
  - `rc != 0` → `RuntimeError(f"yt-dlp gagal (kode {rc}): " + "\n".join(tail))` — pesan detail, bukan cuma exit code.
  - Return: `dest_base.parent.glob(dest_base.name + '.*')`, buang suffix non-video dan `.part`, ambil pertama (sorted); kosong → `RuntimeError('Tidak ada file video hasil unduhan.')`.

Ubah selector lama `bestvideo*+bestaudio/best` dihapus dari kedua call site (tidak ada alias/kompatibilitas).

`get_transcript` (baris 84) — tiga perubahan:

1. Hapus `W, H = ffprobe_dims(video_path)` di jalur subtitle YouTube (baris ~123): hasilnya tidak dipakai, dan pemanggilan itu memaksa video sudah ada sebelum transkrip siap.
2. Pindahkan isi Method 1 (blok youtube-transcript-api) jadi fungsi baru `youtube_transcript(url: str, language: str = None) -> dict` (raise kalau gagal; regex id video dipertahankan apa adanya), plus `write_transcript(workdir: Path, tr: dict) -> Path` untuk menulis `transcript.json`. `get_transcript` memanggil keduanya di dalam `try/except` yang sudah ada (pesan print `YouTube Transcript API unavailable or failed (...)` tetap).
3. Whisper lebih cepat:

```python
model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
segments, info = model.transcribe(str(video_path), language=lang_code, word_timestamps=True,
                                  vad_filter=True, beam_size=1, condition_on_previous_text=False)
```

`os` sudah di-import. Model tetap `base` (pilihan user).

### 3. Unduhan HQ saat render (cache per project) — `core_engine.py` + `server.py`

File project jadi:

| File | Isi |
|---|---|
| `work/<pid>/source.mp4` | proxy 360p (selalu ada setelah ingest) |
| `work/<pid>/hq/hd.mp4` | 1080p H.264, dibuat saat pertama render 1080p |
| `work/<pid>/hq/best.mp4` | kualitas tertinggi, dibuat saat pertama render "terbaik" |

`server.py`:

- `RenderRequest` tambah field: `quality: Optional[str] = "hd"`.
- Di `render_clip` (baris 528), sebelum `ffprobe_dims(src)`: tentukan `src`:

```python
meta = read_project_meta(project_id)          # sudah dibaca di baris ~525, pakai itu
tier = (payload.quality or 'hd').lower()
if not meta.get('source_url') or tier == 'original':
    pass                                       # project upload: pakai source.* apa adanya
else:
    if tier not in ('proxy', 'hd', 'best'):
        raise HTTPException(400, "Kualitas tidak dikenal: pakai proxy|hd|best|original")
    if tier != 'proxy':
        hq = pdir / 'hq' / f'{tier}.mp4'
        if not hq.exists():
            core_engine.download_to(meta['source_url'], pdir / 'hq' / tier, preset=tier)
        src = hq
```

  `src` yang sudah ada di baris 528 di-override oleh hasil di atas; gagal unduh → error yt-dlp naik jadi HTTP 500 `Render failed: ...` (tanpa downgrade diam-diam). `render_clips.render(...)` tidak berubah (`W, H` diambil dari file tier terpilih).

- `get_source_video_path` (baris 68): buang file temp format yt-dlp, karena `source.f134.mp4` juga match glob `source.*` dan bisa terbaca sebagai source tanpa audio saat merge:
  `and not re.match(r'^source\.f\d+\.', p.name)`.

- `reset_workspace` (baris 594): tambah `shutil.rmtree(pdir / 'hq', ignore_errors=True)` dan hapus key `ingest` dari meta.

### 4. Ingest async + progress — `server.py`

Tambah `import threading` dan state modul:

```python
INGEST_JOBS: dict[str, dict] = {}      # pid -> {'cancel': bool}
INGEST_LOCK = threading.Lock()
```

Helper baru di `server.py`:

- `_ingest_write(pid, **fields)` — merge ke `meta['ingest']` lalu `write_project_meta`; semua exception ditelan (`try/except`) karena project bisa dihapus di tengah proses.
- `_ingest_cancelled(pid) -> bool` — baca `INGEST_JOBS.get(pid, {}).get('cancel', False)`.
- `_start_ingest(pid, url=None, uploaded=False, model_size='base')` — tolak bila `_ingest_cancelled` entry sudah ada & belum selesai → `HTTPException(409, "Proses lain masih berjalan")`; set `INGEST_JOBS[pid] = {'cancel': False}`; `threading.Thread(target=_ingest_worker, args=(pid, url, uploaded, model_size), daemon=True).start()`.
- `_Cancelled(Exception)`.

Bentuk `meta['ingest']` (persisted di `project.json`):

```json
{"status": "running|done|error|idle", "stage": "metadata|transcript|download|finalize",
 "percent": 0, "message": "teks untuk UI", "error": null,
 "started_at": 0.0, "finished_at": null}
```

Urutan `_ingest_worker` (percent adalah satu angka untuk progress bar):

1. `status='running'`, `stage='metadata'`, `percent=1`, `message='Menyiapkan project...'`. Bila `url`: `meta['source_type']='youtube'; meta['source_url']=url`, ambil `yt_oembed` → `title` (hanya bila `title_auto`) + `cover.jpg` (blok try/except seperti sekarang).
2. Bila `url`: `stage='transcript'`, `percent=4`, `message='Menyalin subtitle YouTube...'` → `tr = core_engine.youtube_transcript(url, None)`, sukses → `core_engine.write_transcript(pdir, tr)`. Gagal → `print` alasan, lanjut (transkrip nanti via Whisper).
3. Bila `uploaded` → langsung ke 5 (video sudah ada di `source.<ext>`).
   Selain itu `stage='download'`, `message='Mengunduh video proxy...'`; panggil `core_engine.download_to(url, pdir / 'source', preset='proxy', on_progress=cb)` dengan `cb(frac)` = `_ingest_write(percent=12 + round((frac or 0) * 73), message=f'Mengunduh video proxy... {round((frac or 0)*100)}%')`; di dalam `cb` cek `_ingest_cancelled(pid)` → `raise _Cancelled`. Batas atas 85 (atau 92 bila transkrip sudah ada dari langkah 2).
4. Bila transkrip belum ada: `stage='transcript'`, `percent=92`, `message='Transkripsi audio (Whisper)...'` → `core_engine.get_transcript(video_path=..., workdir=pdir, yt_url=None, model_size=model_size)`.
5. `stage='finalize'`, `percent=98`, `message='Menyelesaikan...'` → `grab_cover` bila `cover.jpg` belum ada, `write_project_meta`.
6. Sukses → `_ingest_write(status='done', percent=100, message='Siap', finished_at=time.time())`. Exception → `_ingest_write(status='error', error=str(e), message='Gagal memproses project')` + `traceback.print_exc()`. `_Cancelled` → `_ingest_write(status='error', error='Proses dibatalkan', ...)`.
   Urutan wajib: video + `transcript.json` sudah di disk sebelum `status='done'`.

Endpoint:

- `POST /api/projects/{pid}/ingest` → validasi seperti sekarang (project ada, belum ada `source`, url non-kosong), lalu `_start_ingest(pid, url=url, model_size=payload.model_size or 'base')` dan **return `{"status": "started"}`** tanpa menunggu (blok `try/except` lama yang memanggil download/transkrip sinkron dihapus seluruhnya).
- `POST /api/projects/{pid}/upload` → streaming file ke `source.<ext>` tetap sinkron seperti sekarang, lalu `_start_ingest(pid, uploaded=True, model_size=model_size)` dan return `{"status": "started"}` (blok `get_transcript` + respons video dihapus).
- `GET /api/projects/{pid}/state` → tambah `"ingest": meta.get('ingest') or {"status": "idle"}`; sebelum itu normalisasi job basi: bila `status == 'running'` dan `pid not in INGEST_JOBS` → `{"status": "error", "error": "Server restart di tengah proses", "message": "Gagal memproses project", "percent": 0}` (server dev pakai `--reload`).
- `DELETE /api/projects/{pid}` dan `DELETE .../reset` → set `INGEST_JOBS[pid]['cancel'] = True` sebelum menghapus file.

### 5. Frontend: form langsung kembali, progress di Studio

`frontend/src/components/NewProjectView.jsx`:

- `handleSubmit` (baris 15): `statusMessage` selama request pendek sekarang `'Menyiapkan project...'`; setelah `ingestUrl`/`uploadVideoFile` selesai → `onCreated(pid)` seperti sekarang (respons `{status:'started'}` tidak dipakai — sudah begitu sekarang). Tidak ada perubahan lain; tidak ada polling di sini.

`frontend/src/App.jsx` — tambah effect polling setelah `useEffect` health (baris 60-69):

```jsx
useEffect(() => {
  const s = state?.ingest?.status;
  if (!activeProjectId || (s !== 'running' && s !== 'starting')) return;
  const t = setInterval(() => loadProjectState(activeProjectId), 1500);
  return () => clearInterval(t);
}, [activeProjectId, state?.ingest?.status]);
```

Effect berhenti sendiri saat `status` jadi `done`/`error`.

`frontend/src/components/StudioView.jsx`:

- Banner status ingest, sisipkan tepat sebelum blok `{/* Primary Action Button */}` (baris ~336): tampil bila `state?.ingest && !['idle', 'done'].includes(state.ingest.status)`. Running → teks `state.ingest.message` + bar progress (`width: ${state.ingest.percent}%`) dengan warna `bg-neon`; error → kotak merah (`border-red-500/40 bg-red-950/40 text-red-400`) berisi `state.ingest.error`.
- Pilih kualitas render: `const [renderQuality, setRenderQuality] = useState('hd');` + pills `Proxy 360p` / `1080p` / `Terbaik` (label → `'proxy' | 'hd' | 'best'`) bergaya sama seperti pills aspect (baris ~377), hanya dirender bila `state?.project?.source_url` truthy. Pemilih ini diletakkan di kolom kiri, di atas tombol render (baris ~599), bukan di kolom tengah.
- `handleRenderSingle` (baris 136, satu-satunya call site `renderClip`): tambah `quality: renderQuality && state?.project?.source_url ? renderQuality : 'original'`.

`frontend/src/api.js` tidak berubah.

## Critical files & anchors

- `core_engine.py:52-82` — `download_source` → `YT_PRESETS`/`yt_dlp_cmd`/`download_to`/wrapper; selector 1.18 GB dihapus di sini.
- `core_engine.py:84-163` — `get_transcript`: buang `ffprobe_dims`, pecah `youtube_transcript`/`write_transcript`, percepat Whisper.
- `server.py:68-70` — `get_source_video_path`: buang `source.fNNN.*` temp yt-dlp.
- `server.py:352-441` — `ingest_url`/`upload_video`: jadi pemanggil `_start_ingest`; worker + helper ingest baru ditaruh di atas blok endpoint ini.
- `server.py:528-563` — `render_clip`: pilih tier + unduh HQ bila perlu.
- `frontend/src/components/StudioView.jsx:336,377,599` — banner progress, pills kualitas, param `quality`.

## Verification

Prasyarat: backend aktif (`python server.py` di `C:\Users\faust\orca\clip-web`; jalankan ulang manual karena instance lama tanpa `--reload`), `pip install` langkah 1 selesai, `cd frontend && npm run build` (server menyajikan `frontend/dist`).

1. Dependency: `C:/Python313/python.exe -c "import faster_whisper, youtube_transcript_api; print('ok')"` → `ok`.
2. Ingest end-to-end (curl/PowerShell dari repo):
   - `POST /api/projects` `{"title":"tes cepat"}` → ambil `pid`.
   - `POST /api/projects/<pid>/ingest` `{"url":"https://youtu.be/BQIwRiMxHXc","model_size":"base"}` → balas `< 1s` dengan `{"status":"started"}`.
   - `GET /api/projects/<pid>/state` tiap 2 detik → `ingest.stage` berjalan `metadata`→`transcript`→`download`→`finalize`, `percent` naik, lalu `status="done"`.
   - Cek hasil: `ls -l work/<pid>/source.mp4` ≈ 63 MB (bukan 1.1 GB) dan `work/<pid>/transcript.json` punya `"model": "youtube-api"` (video uji punya auto-caption `id`) → Whisper **tidak** jalan.
   - Target: `done` dalam < 2 menit untuk video uji pada koneksi user (baseline sekarang: unduhan 1.18 GB saja sudah > 5 menit lalu gagal).
3. Fallback Whisper: ulangi langkah 2 dengan video tanpa subtitle (atau hapus `transcript.json` dan jalankan `python -c` yang memanggil `core_engine.get_transcript` pada `work/<pid>/source.mp4` tanpa `yt_url`) → `transcript.json` terisi, log memuat pesan Whisper; ukur durasi sebagai baseline.
4. Render kualitas: `POST /api/projects/<pid>/render` `{"candidate_index":0,"quality":"hd"}` → `work/<pid>/hq/hd.mp4` dibuat (~509 MB) dan clip muncul di `clips/<pid>/`; render kedua dengan `quality:"hd"` tidak mengunduh lagi (mtime `hd.mp4` tidak berubah).
5. UI: buka `http://127.0.0.1:8005`, buat project baru dari form → form langsung kembali ke Studio, banner progress tampil dan bergerak, player memuat `source.mp4` setelah selesai, tombol Temukan Momen aktif. Ulangi saat unduhan HQ render pertama untuk memastikan spinner render tetap seperti sekarang.
6. Batal: hapus project saat `status="running"` → tidak ada traceback "file not found" di log server, thread berhenti (`INGEST_JOBS` tidak menyimpan pid).

## Assumptions & contingencies

- Server runtime = `C:\Python313\python.exe` (terverifikasi dari `Get-Process ... Path` PID 25604). Bila nanti dipindah ke venv, install ulang dua paket dari `requirements.txt` di venv itu.
- `--js-runtimes node` mengandalkan Node v22 di PATH (`C:\Program Files\nodejs\node.exe`, terverifikasi). Kalau node tidak ada di mesin lain, yt-dlp hanya memberi warning dan tetap jalan — jangan tambah mekanisme fallback.
- Video uji punya auto-caption `id` (terverifikasi `--list-subs`), jadi jalur cepat subtitle YouTube terpakai. Kalau `youtube-transcript-api` diblokir untuk sebagian video, worker otomatis lanjut ke Whisper pada proxy (alur langkah 4) — hasil tetap benar, hanya lebih lambat.
- Proxy 360p dipakai untuk player `state.video.url` dan sebagai source render `quality="proxy"`. Kualitas "Terbaik" (4K AV1 1.18 GB) butuh ruang disk ~2 GB per project; kegagalan unduh HQ muncul apa adanya sebagai HTTP 500 di respons render.
- Transkrip dari subtitle YouTube memakai pembagian durasi per kata yang sudah ada (timing per kata hasil interpolasi segmen) — perilaku lama, tidak diubah.
