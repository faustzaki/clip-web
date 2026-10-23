# PROMPT 02b — T2b: Panel transcript di UI (3–4 jam) · P0

## MODE: PATCH, BUKAN BUILD ULANG
`StudioView.jsx` 1.967 baris sudah punya sidebar 360px (`data-region="sidebar"`, sekitar baris 858). Tugas ini **menaruh panel baru di dalam sidebar** dan menyambungkan seek/potong ke state yang sudah ada. Jangan memecah StudioView di tugas ini (itu T3).

**File yang disentuh:**
- `frontend/src/components/TranscriptPanel.jsx` (baru)
- `frontend/src/components/StudioView.jsx` (pasang panel + sambung handler, maksimal +80 baris)
- `frontend/src/api.js` (tambah 2 fungsi fetch)
- `scripts/check_t2b.py` (baru)

## MODEL
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi kalau gagal 2×: `ninerouter/T-SOTA/claude-sonnet-5`
```bash
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/02b-T2b-panel-transcript.md
```

## BACA (hanya ini)
- `docs/UI-SPEC.md` §4 "Aturan transcript"
- `frontend/src/components/StudioView.jsx` baris 850–900 (sidebar) dan cari `videoRef`/`currentTime`
- `frontend/src/index.css` (token `--vz-*`)

## PRECHECK
```bash
curl -s "localhost:8000/api/projects/%(pid)s/transcript?word=1" | head -c 200
grep -n "videoRef\|currentTime\|setCurrent" frontend/src/components/StudioView.jsx | head
```

## TUGAS
1. `TranscriptPanel.jsx` props: `words, current, onSeek, onCut, loading, error`.
   - toggle `Transkrip` / `Edit subtitle` (segmented, pill, radius 999)
   - input cari (`.vz-input`, ikon kaca pembesar) → sorot kata cocok, tampilkan `n hasil`
   - render kata inline: teks + `[3.0s]` (12px italic, `text-vz-dim`), `cursor-pointer`
   - kata aktif (`current` di antara start/end) → `bg-vz-accent-tint text-vz-accent rounded-[6px]`
   - kata `deleted` → `line-through opacity-45`
   - seleksi: klik kata A lalu Shift+klik kata B (atau drag) → bilah mengambang `Potong bagian ini` → `onCut(from,to)`
   - auto-scroll mengikuti kata aktif; berhenti kalau user scroll manual (`userScrolled` flag, reset saat klik)
   - state: `loading` 3 skeleton baris · `error` teks + `Coba lagi` · kosong: `Transkrip belum siap. Jalankan analisis dulu.`
2. `StudioView`: pakai panel di sidebar, ambil kata dari `/api/projects/:id/transcript?word=1`, `onSeek` → `video.currentTime = ms/1000`, `onCut` → POST lalu refetch.
3. `api.js`: `fetchTranscript(pid)`, `cutTranscript(pid, from, to)`.
4. Jangan mengubah panel Generate Clip yang sudah ada — taruh transcript di bawahnya, sidebar tetap 360px dan bisa di-scroll.

## KRITERIA TERIMA
- Klik kata → `video.currentTime` berubah (buktikan dengan screenshot + nilai `currentTime` di laporan).
- Cari kata → jumlah hasil muncul dan kata cocok tersorot.
- Seleksi 3 kata → tombol muncul → potong → ada kata `line-through` dan durasi total berkurang.
- Build 0 error; tidak ada `console.log`; screenshot 1440 & 1280.

## BUKTI
`docs/evidence/T2b/`: `precheck.txt`, `check.txt`, `after/*.png`, laporan AGENTS.
