# youtube-no-download — ingest & render tanpa unduh penuh (preview IFrame + unduhan per rentang klip)

## Context

User bertanya apakah video YouTube bisa diambil tanpa unduh. Fakta terverifikasi: transkrip sudah tanpa unduh (`core_engine.youtube_transcript` memakai `youtube-transcript-api`, core_engine.py:220-260; bukti `work/6e1ad13b1a/transcript.json` → `"model": "youtube-api"`), tetapi ingest masih menunggu unduhan proxy 360p penuh 63 MB sebelum project siap (server.py:832-855), dan render tier hd/best mengunduh penuh 509 MB / 1.18 GB per project (server.py:1047-1055). YouTube Data API v3 tidak punya endpoint file/stream, jadi satu-satunya jalan hemat byte adalah: preview pakai embed IFrame (0 byte), byte nyata hanya diambil saat render, dan hanya untuk rentang klip.

Keputusan yang diminta dan dijawab user: (1) preview default IFrame + tombol on-demand "Muat preview tajam 720p"; (2) render mengunduh rentang klip saja (5-60 MB); (3) setiap kegagalan jalur cepat → notifikasi + berhenti, menunggu tombol pengguna.

End state: project YouTube siap dalam detik (metadata + transkrip + preview embed), Crop Studio & preview tajam hanya saat diminta, dan "Potong Klip" tidak pernah mengunduh video penuh kecuali pengguna menekan tombol fallback.

## Approach

### 1. Backend — preset & unduhan per rentang (`core_engine.py`)

- `YT_PRESETS` (baris 53-60) tambah entri:
```python
    # preview: 720p H.264 untuk player Studio + Crop Studio (±120-180 MB)
    'preview': {'format': 'bv*[height<=720]+ba/b[height<=720]/b', 'sort': 'res:720,vcodec:h264'},
```
- Fungsi baru di bawah `download_to` (setelah baris 165):
```python
def download_section(url: str, dest: Path, start: float, end: float, preset: str = 'hd') -> Path:
    """Unduh hanya rentang [start, end] detik video sumber ke dest (.mp4)."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if preset not in YT_PRESETS:
        raise ValueError(f"Preset tidak dikenal: {preset}")
    cfg = YT_PRESETS[preset]
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist",
        "--merge-output-format", "mp4",
        "--js-runtimes", "node",
        "--retries", "10",
        "--fragment-retries", "10",
        "--concurrent-fragments", "8",
        "--download-sections", f"*{start:.3f}-{end:.3f}",
        "--force-keyframes-at-cuts",
        "-f", cfg["format"],
        "-S", cfg["sort"],
        "--newline",
        "-o", str(dest), url,
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            bufsize=1, encoding='utf-8', errors='replace')
    tail = collections.deque(maxlen=40)
    for line in proc.stdout:
        tail.append(line.rstrip('\r\n'))
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"yt-dlp section gagal (kode {rc}): " + "\n".join(tail))
    if not dest.exists():
        raise RuntimeError("Section download tidak menghasilkan mp4.")
    expected = float(end) - float(start)
    actual = media_duration(dest)          # ffprobe format=duration; lihat helper baru di bawah
    if actual <= 0 or abs(actual - expected) > 0.75:
        raise RuntimeError(f"Durasi section tidak sesuai: {actual:.2f}s vs {expected:.2f}s")


def media_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except (TypeError, ValueError):
        return 0.0


def probe_start_time(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=start_time", "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except (TypeError, ValueError):
        return 0.0
```
- `yt_dlp_cmd` dan `download_to` tidak diubah.

### 2. Backend — ingest tanpa unduh (`server.py:_ingest_worker`, baris 786-880)

- Hapus Step 3 (unduhan proxy + blok `cb`/`span`/`max_pct`, baris 832-855). Urutan baru: metadata (1-3) → transkrip YouTube (4-40) → finalize (95-100).
- Tambah cabang Whisper: bila `_ingest_cancelled` false, `not transcript_file.exists()`, dan `url` ada → unduh `preset='preview'` ke `pdir / 'source'` dengan progress 40-85 (`message=f'Mengunduh video 720p untuk transkripsi... {round(f*100)}%'`), lalu tulis `meta['local_tier'] = 'preview'` (via `read_project_meta`/`write_project_meta`), lanjut Whisper (85-95). Ini satu-satunya kasus ingest masih mengunduh, karena Whisper butuh audio.
- Finalize: `grab_cover` hanya bila `get_source_video_path(pid)` ada; bila tidak, `cover.jpg` dari thumbnail oembed yang sudah diunduh di Step 1 (server.py:800-806). Oembed gagal → biarkan tanpa cover (ProjectsView.jsx:100-103 sudah punya placeholder).
- Hapus variabel `has_yt_transcript` bila jadi tidak terpakai setelah Step 3 dibuang.

### 3. Backend — endpoint prepare (`server.py`)

- Dekat `INGEST_JOBS` (baris 155-156) tambah:
```python
PREPARE_JOBS: dict[str, dict] = {}     # pid -> {'tier': str}
PREPARE_LOCK = threading.Lock()
PREPARE_DEFAULT = {"status": "idle", "tier": None, "percent": 0, "message": "", "error": None}
```
- Model request dekat `IngestUrlRequest` (baris 277-280):
```python
class PrepareRequest(BaseModel):
    tier: Optional[str] = "preview"
```
- Helper dekat `_validate_pid` (baris 543-545):
```python
YT_ID_RE = re.compile(r"(?:v=|youtu\.be/|/shorts/|/embed/)([0-9A-Za-z_-]{11})")

def _youtube_id(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    m = YT_ID_RE.search(url)
    return m.group(1) if m else None

def _prepare_write(pid: str, **fields):
    try:
        meta = read_project_meta(pid)
        state = dict(PREPARE_DEFAULT)
        state.update(meta.get('prepare') or {})
        state.update(fields)
        meta['prepare'] = state
        write_project_meta(pid, meta)
    except Exception:
        pass

def _prepare_worker(pid: str, url: str, tier: str):
    label = '720p' if tier == 'preview' else ('1080p' if tier == 'hd' else 'terbaik')
    try:
        _prepare_write(pid, status='running', tier=tier, percent=1, error=None,
                       message=f'Mengunduh video {label}... 0%')

        def cb(frac):
            f = frac if frac is not None else 0.0
            _prepare_write(pid, percent=min(99, 1 + round(f * 98)),
                           message=f'Mengunduh video {label}... {round(f * 100)}%')

        path = core_engine.download_to(url, project_dir(pid) / 'source', preset=tier, on_progress=cb)
        meta = read_project_meta(pid)
        meta['local_tier'] = tier
        write_project_meta(pid, meta)
        if not (project_dir(pid) / 'cover.jpg').exists():
            grab_cover(pid, path)
        _prepare_write(pid, status='done', percent=100, message='Video lokal siap')
    except Exception as e:
        import traceback
        traceback.print_exc()
        _prepare_write(pid, status='error', error=str(e), message='Gagal mengunduh video')
    finally:
        with PREPARE_LOCK:
            PREPARE_JOBS.pop(pid, None)
```
- Endpoint (taruh setelah `ingest_url`/`upload_video`, baris ~946):
```python
@app.post("/api/projects/{project_id}/prepare")
def prepare_video(project_id: str, payload: PrepareRequest):
    _validate_pid(project_id)
    meta = read_project_meta(project_id)
    tier = (payload.tier or 'preview').lower()
    if tier not in ('preview', 'hd', 'best'):
        raise HTTPException(400, "Kualitas tidak dikenal: pakai preview|hd|best")
    if not meta.get('source_url'):
        raise HTTPException(400, "Project ini tidak punya sumber YouTube")
    if get_source_video_path(project_id):
        raise HTTPException(400, "Video lokal sudah ada")
    with PREPARE_LOCK:
        if project_id in PREPARE_JOBS:
            raise HTTPException(409, "Unduhan lain sedang berjalan")
        with INGEST_LOCK:
            if project_id in INGEST_JOBS:
                raise HTTPException(409, "Unduhan lain sedang berjalan")
        PREPARE_JOBS[project_id] = {'tier': tier}
    threading.Thread(target=_prepare_worker, args=(project_id, meta['source_url'], tier),
                     daemon=True, name=f'prepare-{project_id}').start()
    return {"status": "started"}
```
- `get_state` (baris 682-730) tambah dua field di dict return:
```python
    yt_id = _youtube_id(meta.get('source_url'))
    ...
        "youtube": {"id": yt_id} if yt_id else None,
        "prepare": meta.get('prepare') or dict(PREPARE_DEFAULT),
```
- `reset_workspace` (baris 1415-1435): tambah `shutil.rmtree(pdir / '_section', ignore_errors=True)` dan hapus key `prepare` + `local_tier` dari meta (pola `meta.pop('ingest', None)` yang sudah ada di sana).
- `clear_temp_cache` (baris 114-148): tambah sapuan direktori `work/*/_section` mengikuti pola loop yang sudah ada.

### 4. Backend — render dari rentang klip (`render_clip`, server.py:1022-1090)

- `RenderRequest` (baris 314-323) tambah: `full_download: Optional[bool] = False`.
- Ganti blok tier (baris 1043-1055) dengan:
```python
    tier = (payload.quality or 'hd').lower()
    if tier == 'original':
        if not src:
            tier = 'hd'          # tidak ada file lokal: pakai 1080p (upload selalu punya file lokal)
    elif tier not in ('proxy', 'preview', 'hd', 'best'):
        raise HTTPException(400, "Kualitas tidak dikenal: pakai proxy|preview|hd|best|original")

    section_dir = pdir / '_section'
    section_path = None
    offset = 0.0
    if tier != 'original' and meta.get('source_url'):
        if payload.full_download:
            hq = pdir / 'hq' / f'{tier}.mp4'
            if not hq.exists():
                try:
                    core_engine.download_to(meta['source_url'], pdir / 'hq' / tier, preset=tier)
                except Exception as e:
                    return JSONResponse(status_code=409, content={
                        "detail": f"Unduhan penuh gagal: {e}",
                        "code": "full_download_failed",
                    })
            src = hq
        else:
            MARGIN = 3.0
            total = float(transcript.get('duration') or 0) or (float(seg['end']) + MARGIN)
            S = max(0.0, float(seg['start']) - MARGIN)
            E = min(total, float(seg['end']) + MARGIN)
            section_dir.mkdir(parents=True, exist_ok=True)
            sec = section_dir / f"{tier}_{int(S * 1000)}.mp4"
            try:
                core_engine.download_section(meta['source_url'], sec, S, E, preset=tier)
            except Exception as e:
                return JSONResponse(status_code=409, content={
                    "detail": f"Gagal mengunduh potongan klip: {e}",
                    "code": "section_download_failed",
                })
            fs = core_engine.probe_start_time(sec)
            if abs(fs) > 0.05:
                norm = sec.with_name(sec.stem + '_norm.mp4')
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", f"{fs:.3f}", "-i", str(sec),
                     "-c", "copy", "-avoid_negative_ts", "make_zero", str(norm)],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                sec.unlink(missing_ok=True)
                norm.rename(sec)
            src = sec
            section_path = sec
            offset = S
```
- Sebelum pemanggilan `render_clips.render` (baris 1057-1075), sisipkan pergeseran timeline dan pakai `seg_render`/`words_render`:
```python
        seg_render, words_render = seg, transcript["words"]
        if section_path:
            seg_render = {**seg, "start": float(seg["start"]) - offset, "end": float(seg["end"]) - offset}
            words_render = [
                {"word": w["word"], "start": float(w["start"]) - offset, "end": float(w["end"]) - offset}
                for w in transcript["words"]
            ]
```
  lalu ganti argumen `seg=seg, words=transcript["words"]` menjadi `seg=seg_render, words=words_render`.
- Bersihkan section di `finally` blok render (atau tepat setelah `render(...)` sukses/gagal):
```python
        if section_path and section_dir.exists():
            for f in section_dir.glob('*.mp4'):
                f.unlink(missing_ok=True)
```
- `w, h = render_clips.ffprobe_dims(src)` dibiarkan (mengukur file section → resolusi sesuai tier). `JSONResponse` sudah tersedia? Belum diimport: tambah `from fastapi.responses import JSONResponse` ke blok import fastapi (baris 26).

Dasar kebenaran: `render()` memakai `start`/`end` dari `seg` untuk `ffmpeg -ss` (render_clips.py:321), `detect_track(render_src, start, dur, ...)` (baris 308), dan `tighten.plan_cuts(words, start, end)` (baris 259) — semuanya di timeline file sumber. Setelah `seg` + `words` digeser `-offset`, seluruh perhitungan konsisten dengan file section. `crop_for(W,H,tw,th)` (baris 76-91) hanya bergantung rasio, jadi aman untuk resolusi tier apa pun. Caption kata tidak terpengaruh karena dibakar di langkah terpisah dari clip mentah (`chopify/subtitle_burn.apply_to_clip` lewat `apply_subtitles`, server.py:1310-1330).

### 5. Frontend — komponen player embed (`frontend/src/components/YouTubePreview.jsx`, file baru)

Props: `{ videoId, start, muted, onTime, onDuration, onError, apiRef }`. Tidak ada komponen embed di repo ini (`grep -r iframe frontend/src` kosong), jadi file baru memang perlu.

- Loader modul-scope sekali:
```js
let ytApiPromise = null;
function loadIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytApiPromise;
}
```
- `useEffect` mount: `loadIframeApi().then((YT) => { playerRef.current = new YT.Player(hostRef.current, { videoId, playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, enablejsapi: 1, start: Math.floor(start || 0), origin: window.location.origin }, events: { onReady, onError } }) })`.
- `apiRef.current` diisi:
```js
    apiRef.current = {
      play: () => player.playVideo(),
      pause: () => player.pauseVideo(),
      seek: (t) => player.seekTo(t, true),
      muted: (m) => (m ? player.mute() : player.unMute()),
      isPaused: () => player.getPlayerState() !== 1,
    };
```
- `onReady`: `onDuration(player.getDuration())`; `intervalRef.current = setInterval(() => onTime(player.getCurrentTime?.() || 0), 250)`.
- `onError: (e) => onError(e.data)`.
- Cleanup unmount: `clearInterval`, `playerRef.current?.destroy()`.
- Render: `<div className="w-full h-full"><div ref={hostRef} className="w-full h-full" /></div>` (YT mengganti div itu dengan iframe).
- Efek `[muted]`: `muted ? player.mute() : player.unMute()`; efek `[start, videoId]`: `player.seekTo(start || 0, true)`.

### 6. Frontend — komponen notifikasi (`frontend/src/components/NoticeBar.jsx`, file baru)

Belum ada sistem toast di repo (`grep -r 'toast|Toast|notif' frontend/src` kosong). Props: `{ tone = 'warn', message, actionLabel, onAction, busy, onDismiss }`. Render bar compact: container `flex items-start gap-2 rounded-xl border px-3 py-2 text-xs` dengan warna per tone (`warn` → `border-amber-500/40 bg-amber-950/30 text-amber-200`, `error` → `border-red-500/40 bg-red-950/40 text-red-300`, `info` → `border-dark-border bg-dark-bg/80 text-gray-300`), ikon `AlertTriangle`, teks `message`, tombol aksi (`px-2 py-1 rounded-lg bg-dark-card border border-dark-border font-bold hover:border-neon hover:text-neon`, label `busy ? 'Memproses...' : actionLabel`, disabled saat `busy`), tombol tutup `X` memanggil `onDismiss`. Ikon dari `lucide-react` (sudah dependency).

### 7. Frontend — `StudioView.jsx` wiring

- Turunan baru setelah `const activeCandidate = ...` (baris 232):
```jsx
  const youtubeId = state?.youtube?.id || null;
  const hasLocal = !!currentVideo?.url;
  const [embedFailed, setEmbedFailed] = useState(false);
  const useEmbed = !hasLocal && !!youtubeId && !embedFailed;
  const ytApiRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const effDuration = duration || Number(state?.transcript?.duration || 0);
  const prepare = state?.prepare;
```
- `import { scoreMoments, renderClip, putPrefs, publishClip, prepareVideo } from '../api';` (baris 26) + `import YouTubePreview from './YouTubePreview';` + `import NoticeBar from './NoticeBar';`.
- Ganti gate (baris persis lihat Critical files):
  - baris 799 `{!state?.video ? (...)}` → `{!hasLocal && !useEmbed ? (...)}` (teks warning dipertahankan).
  - baris 1005 `disabled={isScoring || !state?.video}` → `disabled={isScoring || !state?.transcript}` (skoring hanya butuh transkrip; tombol tetap aktif saat embed).
  - baris 1176 `{currentVideo?.url && prefs?.subtitles_enabled !== false && (` → `{(hasLocal || useEmbed) && prefs?.subtitles_enabled !== false && (`.
  - baris 1415 `{currentVideo?.url && frameSize.w > 0 && (` → `{(hasLocal || useEmbed) && frameSize.w > 0 && (`.
  - Semua perhitungan `pct`/label scrubber (baris 289, 1417-1418) memakai `effDuration`, bukan `duration`.
- `handleTimeUpdate` (baris 290-297) jadi menerima argumen opsional (event `<video>` juga masuk sebagai argumen → guard tipe):
```jsx
  const handleTimeUpdate = (t) => {
    const time = typeof t === 'number' ? t : (videoRef.current?.currentTime ?? 0);
    setCurrentTime(time);
    if (activeCandidate && typeof activeCandidate.end === 'number' && time >= activeCandidate.end) {
      if (useEmbed) ytApiRef.current?.seek(activeCandidate.start || 0);
      else if (videoRef.current) videoRef.current.currentTime = activeCandidate.start || 0;
    }
  };
```
- `togglePlay` (baris 303-308) tambah cabang embed di awal:
```jsx
    if (useEmbed) {
      const api = ytApiRef.current;
      if (!api) return;
      if (api.isPaused()) api.play(); else api.pause();
      return;
    }
```
- `toggleMute` (baris ~311) tambah di awal:
```jsx
    if (useEmbed) {
      const next = !isMuted;
      ytApiRef.current?.muted(next);
      setIsMuted(next);
      return;
    }
```
- `seekToClientX` (baris 310-326): guard `!duration` → `!effDuration`; setelah menghitung `t`, cabang embed:
```jsx
    if (useEmbed) {
      ytApiRef.current?.seek(t);
      setCurrentTime(t);
    } else {
      v.currentTime = t;
      setCurrentTime(t);
    }
```
  (penentuan `activeCandidateIdx` dari `candidates.findIndex` tetap sama).
- `jumpToCandidate` (baris 546-553):
```jsx
  const jumpToCandidate = (idx) => {
    setActiveCandidateIdx(idx);
    const cand = candidates[idx];
    if (!cand) return;
    if (useEmbed) {
      ytApiRef.current?.seek(cand.start);
      ytApiRef.current?.play();
      return;
    }
    if (videoRef.current) {
      videoRef.current.currentTime = cand.start;
      videoRef.current.play().catch(() => {});
    }
  };
```
- Selector mode video (baris 1056-1083) dan mini-dock freeform (baris 1347) hanya saat lokal: bungkus `{hasLocal && ( ... )}` (transform/object-fit tidak berlaku untuk iframe).
- Tombol on-demand, taruh di bar atas setelah pill rasio (blok baris 1039-1054):
```jsx
            {useEmbed && (
              <button
                type="button"
                onClick={() => prepareVideo(projectId, 'preview')}
                disabled={prepare?.status === 'running'}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-dark-card border border-dark-border text-gray-200 hover:border-neon hover:text-neon transition-all disabled:opacity-50"
                title="Unduh video 720p untuk preview tajam + Crop Studio"
              >
                {prepare?.status === 'running' ? `Mengunduh... ${prepare.percent || 0}%` : 'Muat preview tajam 720p'}
              </button>
            )}
```
- Baris player (baris 1306-1342) jadi tiga cabang:
```jsx
              {hasLocal ? (
                <video /* ... atribut & className yang ada sekarang, tidak diubah ... */ />
              ) : useEmbed ? (
                <>
                  <YouTubePreview
                    videoId={youtubeId}
                    start={activeCandidate?.start || 0}
                    muted={isMuted}
                    apiRef={ytApiRef}
                    onTime={handleTimeUpdate}
                    onDuration={setDuration}
                    onError={() => {
                      setEmbedFailed(true);
                      setNotice({
                        tone: 'warn',
                        message: 'Video ini tidak bisa di-embed. Muat video lokal untuk preview.',
                        actionLabel: 'Muat video 720p',
                        onAction: () => prepareVideo(projectId, 'preview'),
                      });
                    }}
                  />
                  <div className="absolute inset-0 z-10 cursor-pointer" onClick={togglePlay} title="Klik untuk play/pause" />
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-gray-500 space-y-2">
                  <FileVideo className="w-12 h-12 text-gray-600" />
                  <p className="text-xs">Project ini belum punya video source.</p>
                </div>
              )}
```
  `z-10` pada lapisan klik sengaja di bawah overlay subtitle (`z-20`, baris 1178) agar drag subtitle tetap menerima pointer.
- Efek notifikasi:
```jsx
  useEffect(() => {
    if (prepare?.status === 'error') {
      setNotice({
        tone: 'error',
        message: prepare.error || 'Gagal mengunduh video',
        actionLabel: 'Coba lagi',
        onAction: () => prepareVideo(projectId, 'preview'),
      });
    }
  }, [prepare?.status, prepare?.error]);
```
- Banner progress prepare, tepat setelah banner ingest (baris 771-794), memakai gaya identik banner ingest:
```jsx
                {prepare?.status === 'running' && (
                  <div className="p-3 rounded-xl border border-dark-border bg-dark-bg/80 space-y-2 shrink-0">
                    <div className="flex items-center justify-between text-[11px] text-gray-300">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-neon" />
                        {prepare.message || 'Mengunduh video 720p...'}
                      </span>
                      <span className="text-neon font-mono font-bold text-[11px]">{prepare.percent || 0}%</span>
                    </div>
                    <div className="w-full bg-dark-card rounded-full h-1.5 overflow-hidden">
                      <div className="bg-gradient-to-r from-[#c11e38] to-[#220b34] h-full transition-all duration-300"
                           style={{ width: `${prepare.percent || 0}%` }} />
                    </div>
                  </div>
                )}
```
- Render `NoticeBar` di dalam `<main>` tepat setelah blok bar atas (baris 1084):
```jsx
          {notice && (
            <div className="w-full max-w-[520px] shrink-0 px-1">
              <NoticeBar {...notice} onDismiss={() => setNotice(null)} />
            </div>
          )}
```
- `handleRenderSingle(idx, opts = {})` (baris 587-601): payload
```jsx
        quality: state?.project?.source_url ? renderQuality : 'original',
        full_download: !!opts.full_download,
```
  (baris `aspect`, `crop_mode`, `crop_rect`, `do_tighten`, `custom_hook` tidak berubah) dan blok `catch (err)`:
```jsx
    } catch (err) {
      setRenderingIndices((prev) => { const next = new Set(prev); next.delete(idx); return next; });
      if (err.code === 'section_download_failed') {
        setNotice({
          tone: 'error',
          message: err.message,
          actionLabel: 'Unduh penuh & render',
          onAction: () => handleRenderSingle(idx, { full_download: true }),
        });
      } else {
        alert(`Render gagal: ${err.message}`);
      }
    }
```

### 8. Frontend — `api.js`

- Tambah fungsi:
```js
export async function prepareVideo(projectId, tier = 'preview') {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/prepare`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier })
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Gagal menyiapkan video'); }
  return res.json();
}
```
- Ganti `renderClip` (baris 78-83) agar `code` dari body 409 terbaca:
```js
export async function renderClip(projectId, params) {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/render`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || 'Render failed');
    e.status = res.status;
    e.code = err.code;
    throw e;
  }
  return res.json();
}
```

### 9. Frontend — `App.jsx` polling + Crop Studio

- Import `prepareVideo` dari `./api` (baris 11).
- Polling (baris 63-67) tambah kondisi prepare:
```js
  useEffect(() => {
    const busy = ['running', 'starting'].includes(state?.ingest?.status) || state?.prepare?.status === 'running';
    if (!activeProjectId || !busy) return;
    const t = setInterval(() => loadProjectState(activeProjectId), 1500);
    return () => clearInterval(t);
  }, [activeProjectId, state?.ingest?.status, state?.prepare?.status]);
```
- `CropStudioModal` (baris 150-160) tambah prop `prepare={state?.prepare}` dan `onPrepare={() => prepareVideo(activeProjectId, 'preview')}`.

### 10. Frontend — `CropStudioModal.jsx` panel "video belum lokal"

- Tambah `FileVideo` ke import lucide-react dan prop `prepare`, `onPrepare` di signature (baris 1-15).
- Bungkus body modal (baris 351-523, `<div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">`) dengan kondisi; bila `!videoUrl` render panel ini dan konten crop yang ada tidak dirender:
```jsx
        {!videoUrl ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3">
              <FileVideo className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-sm text-gray-300">
                Crop Studio butuh video lokal untuk memetakan kotak crop. Unduh versi 720p (sekali, ±150 MB).
              </p>
              {prepare?.status === 'running' ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">{prepare.message || 'Mengunduh video 720p...'} {prepare.percent || 0}%</p>
                  <div className="w-full bg-dark-card rounded-full h-1.5 overflow-hidden">
                    <div className="bg-neon h-full" style={{ width: `${prepare.percent || 0}%` }} />
                  </div>
                </div>
              ) : (
                <button type="button" onClick={onPrepare}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#c11e38] to-[#220b34] text-white text-xs font-bold hover:opacity-90 transition-all">
                  Unduh video 720p (±150 MB)
                </button>
              )}
              {prepare?.status === 'error' && (
                <p className="text-xs text-red-400">{prepare.error || 'Unduhan gagal'}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* konten crop yang sudah ada, tidak diubah */}
          </div>
        )}
```
- Setelah `state.video` terisi, modal memakai `videoUrl`/`videoWidth`/`videoHeight` nyata; `rect` tetap normalized sehingga arti crop tidak berubah.

## Critical files & anchors

- `server.py` — `INGEST_JOBS`/`INGEST_LOCK` (155-156, tempat `PREPARE_JOBS`), `IngestUrlRequest` (277-280, tempat `PrepareRequest`), `RenderRequest` (314-323), `_validate_pid` (543-545, tempat `_youtube_id`/`_prepare_write`/`_prepare_worker`), `get_state` (682-730), `_ingest_worker` (786-880), endpoint baru setelah `upload_video` (~946), `render_clip` blok tier + `render(...)` (1022-1090), `reset_workspace` (1415-1435), `clear_temp_cache` (114-148), import `JSONResponse` (baris 26).
- `core_engine.py` — `YT_PRESETS` (53-60), `yt_dlp_cmd` (80-87), `download_to` (90-165); fungsi baru `download_section`/`media_duration`/`probe_start_time` di bawahnya.
- `frontend/src/components/StudioView.jsx` — gate `!state?.video` (799, 1005), `currentVideo?.url` (1176, 1307, 1415), `handleTimeUpdate` (290-297), `togglePlay`/`toggleMute`/`seekToClientX` (303-341), `jumpToCandidate` (546-553), selector mode video (1056-1083) + mini-dock (1347), `handleRenderSingle` (587-601), banner ingest (771-794), bar atas pill rasio (1039-1054), `<main>` (1087-1344).
- `frontend/src/components/CropStudioModal.jsx` — import + signature (1-15), body modal (351-523). `frontend/src/App.jsx` — import api (11), polling (63-67), prop CropStudioModal (150-160).
- `frontend/src/api.js` — `renderClip` (78-83) + `prepareVideo` baru.
- File baru: `frontend/src/components/YouTubePreview.jsx`, `frontend/src/components/NoticeBar.jsx`.

## Verification

Prasyarat: root `C:/Users/faust/orca/clip-web`; project uji YouTube `6e1ad13b1a` (transkrip `youtube-api`, punya `work/6e1ad13b1a/source.mp4` sebagai referensi alignment); server `python -m uvicorn server:app --host 127.0.0.1 --port 8005 --reload`; frontend `cd frontend && npm run dev` (5173); ffmpeg/ffprobe/yt-dlp di PATH.

1. **Alignment section download (paling berisiko, uji dulu sebelum menyentuh server)**:
```bash
mkdir -p /tmp/sec && python -m yt_dlp --no-playlist --merge-output-format mp4 --js-runtimes node \
  --download-sections "*148.590-168.680" --force-keyframes-at-cuts \
  -f "bv*[height<=1080]+ba/b[height<=1080]/b" -S "res:1080,vcodec:h264" \
  --newline -o /tmp/sec/hd.mp4 "https://youtu.be/6d57Av6Kvyg"
ffprobe -v error -show_entries format=start_time,duration -of default=nw=1 /tmp/sec/hd.mp4
ffmpeg -y -ss 0 -i /tmp/sec/hd.mp4 -frames:v 1 /tmp/f0.png
ffmpeg -y -ss 153.590 -i work/6e1ad13b1a/source.mp4 -frames:v 1 /tmp/f1.png
ffmpeg -i /tmp/f0.png -i /tmp/f1.png -filter_complex ssim -f null - 2>&1 | tail -1
```
   Lulus: `duration` ≈ 20.09s (±0.75), dan `All:…SSIM` > 0.98 (frame pertama section = frame sumber di `S`). Bila `start_time` ≠ 0 → cabang normalisasi copy-remux di langkah 4 plan wajib dipakai; ulangi uji SSIM dari file hasil normalisasi.
2. **Ingest tanpa unduh**: `curl -s -X POST localhost:8005/api/projects/<pid2>/ingest -H "Content-Type: application/json" -d "{\"url\":\"https://youtu.be/6d57Av6Kvyg\"}"` (buat project baru dulu via `POST /api/projects`), lalu pantau:
```bash
curl -s localhost:8005/api/projects/<pid2>/state | python -c "import sys,json;d=json.load(sys.stdin);print(d['ingest']['status'],d['ingest']['stage'],d['video'],d['youtube'],d['transcript'] and d['transcript']['model'])"
ls work/<pid2>
```
   Lulus: `done finalize None {'id': '6d57Av6Kvyg'} youtube-api`, dan `ls work/<pid2>` TIDAK memuat `source.mp4` (hanya `project.json`, `transcript.json`, `cover.jpg`).
3. **Render section tanpa file lokal**: `curl -s -X POST localhost:8005/api/projects/<pid2>/score -H "Content-Type: application/json" -d '{"use_llm":false,"model_name":"heuristic"}'` lalu `curl -s -X POST localhost:8005/api/projects/<pid2>/render -H "Content-Type: application/json" -d '{"candidate_index":0,"aspect":"9:16","quality":"hd","crop_mode":"speaker-tracked","do_tighten":true}'`.
   Lulus: HTTP 200; `ls work/<pid2>/_section` kosong; `ls work/<pid2>/hq` tidak ada; `clips/<pid2>/raw/*.mp4` ada dan `ffprobe -v error -show_entries format=duration -of default=nw=1 clips/<pid2>/raw/<slug>.mp4` ≈ durasi kandidat (±1.5s); frame awal klip cocok dengan detik `candidate.start` (bandingkan dengan preview kandidat di UI).
4. **Fallback penuh (notifikasi + tombol)**: ubah sementara `work/<pid2>/project.json` `source_url` → `https://youtu.be/00000000000`; render `quality="hd"` → HTTP 409 body `{"detail":"Gagal mengunduh potongan klip: …","code":"section_download_failed"}`; di UI muncul NoticeBar dan tombol "Unduh penuh & render"; klik tombol itu → render ulang dengan `full_download: true` → 409 `{"code":"full_download_failed"}` (URL memang rusak) dan NoticeBar tetap menampilkan pesan. Kembalikan `source_url` asli sesudah uji.
5. **Prepare 720p**: `curl -s -X POST localhost:8005/api/projects/<pid2>/prepare -H "Content-Type: application/json" -d '{"tier":"preview"}'` → `{"status":"started"}`; poll `state.prepare` sampai `status == "done"`; `ls -l work/<pid2>/source.mp4` ≈ 120-180 MB; `state.video.url` terisi; POST kedua → HTTP 400 `{"detail":"Video lokal sudah ada"}`.
6. **UI Studio (browser, `http://127.0.0.1:5173`)**: buka project baru (tanpa file lokal) → (a) tidak ada banner "belum punya video source", player embed YouTube tampil, klik layar → play/pause, klik 25% track → lompat ~25% durasi transkrip dan label `mm:ss` berubah, klik kandidat di panel kiri → player lompat ke `start` kandidat dan loop di rentang klip; (b) "TEMUKAN MOMEN VIRAL" aktif walau tanpa file lokal; (c) tombol "Muat preview tajam 720p" → banner progress naik → setelah `done` player berganti ke `<video>` lokal dan selector Fit/Cover/Bebas, drag subtitle, dan drag/zoom video aktif kembali; (d) drag subtitle saat masih embed → tersimpan (`curl -s localhost:8005/api/projects/<pid2>/state | python -c "import sys,json;print(json.load(sys.stdin)['project']['render_prefs']['subtitle_style']['position'])"` berubah sesuai posisi drop).
7. **Crop Studio tanpa video lokal**: buka Crop Studio pada project baru → panel "Crop Studio butuh video lokal"; klik "Unduh video 720p" → progress tampil, setelah selesai buka lagi → canvas crop normal; `Terapkan Crop` → `state.project.crops["0"].w` berubah.
8. **Regresi upload lokal** (`5aedd1102e`, punya `source.mp4`): Studio langsung pakai `<video>` (tidak ada iframe), render `quality="original"` → 200 tanpa unduhan dan tanpa `_section`; render `quality="hd"` pada project yang punya `source_url` → sukses lewat section (tidak membuat `work/<pid>/hq/hd.mp4`).
9. `python -m py_compile server.py core_engine.py` dan `cd frontend && npm run build` sama-sama tanpa error.

## Assumptions & contingencies

- Kualitas embed mengikuti ukuran player (≈360-480p pada frame 340-420px), jadi iframe bukan peningkatan ketajaman; karena itu tombol 720p on-demand dipertahankan. Tidak ada fallback lain untuk ketajaman.
- `--download-sections --force-keyframes-at-cuts` (yt-dlp 2026.08.19, terverifikasi ada di `--help`) diasumsikan menghasilkan file mulai tepat di `S`. Bila `probe_start_time > 0.05` → jalankan normalisasi copy-remux yang sudah dispesifikasikan (bukan unduhan ulang). Bila setelah normalisasi durasi masih meleset > 0.75s → `download_section` melempar `RuntimeError` → server balas 409 `section_download_failed` → notifikasi + tombol fallback. Tidak ada kompensasi linier offset.
- Video non-YouTube (project upload) tidak punya `source_url` → section download dilewati seluruhnya; file lokal wajib ada (upload selalu punya) dan `quality="original"` memakainya.
- Pemilik video memblokir embed (YT error 101/150) → `embedFailed=true`, iframe tidak dicoba dua kali, NoticeBar + tombol "Muat video 720p" muncul.
- Pill "Proxy 360p" tetap tersedia; artinya kini mengunduh potongan 360p (±2-5 MB) alih-alih memakai file lokal 720p. Bila nanti ingin memakai file lokal untuk tier yang sama, bandingkan `meta['local_tier']` dengan `tier` sebelum section download.
- `meta['local_tier']` hanya informatif (tidak dipakai untuk keputusan render) agar tidak ada state ganda yang bisa bertentangan.
- Ingest ulang pada project yang sudah punya video lokal tetap ditolak `ingest_url` (server.py:903-907) seperti sekarang; prepare juga ditolak dengan pesan "Video lokal sudah ada" — pengguna harus `Reset Workspace` untuk mengulang.
