# PROMPT 03b — T3b: Komponen Timeline (3–4 jam) · P0

## MODE: PATCH, BUKAN BUILD ULANG
Backend timeline sudah ada (T3a). `StudioView.jsx` 1.967 baris tetap utuh kecuali penambahan blok pemasangan. Jangan memecah StudioView di tugas ini (itu T3c).

**File yang disentuh:**
- `frontend/src/components/Timeline.jsx` (baru)
- `frontend/src/components/StudioView.jsx` (pasang di antara stage dan clip strip, maksimal +60 baris)
- `frontend/src/api.js` (fetchTimeline, saveTimeline)
- `scripts/check_t3b.py` (baru)

## MODEL
```
ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash
```
Eskalasi kalau gagal 2×: `ninerouter/T-SOTA/claude-sonnet-5`
```bash
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @AGENTS.md @docs/prompts/03b-T3b-timeline-komponen.md
```

## BACA (hemat konteks)
- `docs/UI-SPEC.md` §1 (grid) & §4 "Aturan timeline"
- `frontend/src/components/TranscriptPanel.jsx` (pola props + token yang dipakai)
- `frontend/src/api.js` (pola fetch yang ada)

## PRECHECK
```bash
curl -s localhost:8000/api/projects/<pid>/timeline | head -c 300
grep -n "data-region" frontend/src/components/StudioView.jsx | head
```

## TUGAS
1. `Timeline.jsx` props: `items, duration, current, zoom, collapsed, onSeek, onZoom, onToggleCollapse, onTrim`
   - `data-region="timeline"`, tinggi **240px** (collapsed) / **320px** (expanded), `border-t border-vz-border bg-vz-surface`
   - ruler 24px: tick tiap 5000ms, label `m:ss` tiap 15 detik, klik ruler → `onSeek(ms)` dari hitungan proporsional lebar (`e.clientX - rect.left` / `rect.width * duration`)
   - 3 track: label kiri 56px (`Video` / `Teks` / `Audio`), track tinggi **40px**, gap **8px**, blok `rounded-vz` (8px)
   - blok item: `kind` menentukan warna — video `bg-vz-accent-tint` + border accent, caption `bg-vz-surface-muted`, audio `bg-vz-success-bg` (kalau token tak ada, pakai `bg-vz-surface-muted` + opacity)
   - playhead: garis **2px** `bg-vz-accent`, posisi `current/duration*100%`, draggable (mousedown → mousemove → mouseup, `onSeek`)
   - zoom: 4 tombol `25/50/100/200%`, mengubah lebar konten (`width: zoom%`), scroll horizontal
   - collapse: tombol chevron, state disimpan `localStorage["vz.timeline.collapsed"]`
   - track kosong: satu baris petunjuk `Belum ada item di track ini.` (bukan area kosong)
2. `StudioView`: ambil timeline lewat `fetchTimeline(pid)`, simpan `zoom`/`collapsed`, teruskan `current` dari video (`timeupdate`), `onSeek` → `video.currentTime = ms/1000`.
3. `api.js`: `fetchTimeline(pid)`, `saveTimeline(pid, items)`.
4. Jangan memakai library timeline baru (no dependency). Drag-resize blok tidak wajib; `onTrim` disiapkan tapi boleh `// ponytail: trim blok ditunda ke T3c`.

## KRITERIA TERIMA
- Timeline tampil 3 track, ruler berlabel, playhead mengikuti playback (buktikan: screenshot saat `current` > 0 dan posisi garis bergeser).
- Klik ruler → `video.currentTime` berubah (buktikan angka sebelum/sesudah).
- Zoom 200% memperlebar blok, durasi total tidak berubah; collapse 240↔320 dan bertahan setelah reload.
- Build 0 error, tanpa `console.log`, screenshot 1440 & 1280.

## BUKTI
`docs/evidence/T3b/`: `precheck.txt`, `check.txt`, `after/*.png`, laporan AGENTS.
