# UI-SPEC — clip-web

Sumber angka: `design/tokens.css`, `design/vizard-tokens.json`, `design/STUDIO-DIFF.md`.
Prinsip: **light, satu aksen, Inter, tiga ukuran teks kerja, radius 10/12.**

## 1. Grid (angka tetap, bukan persen)
| Region | Ukuran | Catatan |
|---|---|---|
| Header | `56px` | sticky, border-bottom `#E3E6EC` |
| Sidebar kiri (transcript) | `360px` | resizable 320–520, default 360 |
| Stage (preview) | sisa lebar | preview 9:16, `max-height: 62vh` |
| Rail kanan | `72px` | ikon 22px + label 11px |
| Panel tool kanan | `320px` | muncul saat tool aktif |
| Timeline | `240px` collapsed / `320px` expanded | 3 track |
| Clip strip | `96px` | scroll horizontal |
| Content max (projects) | `1280px` | margin auto, padding `32px 20px` |

Responsif: `<1280px` → rail 56px (ikon saja), panel tool jadi overlay 320px. `<900px` → sidebar transcript jadi drawer.

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER 56  [logo] [↶][↷] ···· [judul project ⌄] ···· [Save]  │
├──────────┬───────────────────────────────┬───────────────────┤
│LEFT 360  │ STAGE (flex, bg #F2F4F7)      │ RAIL 72           │
│ transcript│  ┌──────────┐                │ ▣ Subtitles       │
│ search    │  │ 9:16     │  preview       │ ♪ Audio           │
│ words     │  │ preview  │                │ ▤ B-roll          │
│ [3.0s]    │  └──────────┘                │ T Text            │
│           │  ( Ratio · Background · Layout · ⛶ )             │
├──────────┴───────────────────────────────┴───────────────────┤
│ TIMELINE 240/320 · ruler · track video · teks · audio        │
├──────────────────────────────────────────────────────────────┤
│ CLIP STRIP 96 · [thumb score] [thumb score] [⋯]              │
└──────────────────────────────────────────────────────────────┘
```

## 2. Token pemakaian (jangan bikin nilai baru)
| Peran | Nilai |
|---|---|
| halaman / kartu / kontrol | `--vz-bg` / `--vz-surface` / `--vz-surface-muted` |
| teks utama / sekunder / meta | `--vz-text` / `--vz-text-soft` / `--vz-text-muted` |
| aksi | `--vz-accent`, hover `--vz-accent-hover`, highlight `--vz-accent-tint` |
| status | success/warn/danger/info (4 badge saja) |
| radius | tombol+input 10 · kartu 12 · chip 6 · pill 99 |
| shadow | sm=istirahat · md=hover · lg=modal |

## 3. Layar: Projects
1. Header 56 + logo + avatar.
2. Baris judul: "Project" 20px/600 + subteks 13px `--vz-text-muted`.
3. Toolbar: search 280px, select sort (Terbaru/Nama/Durasi), filter status.
4. Grid `repeat(auto-fill, minmax(280px,1fr))`, gap 24.
5. Kartu: thumb 16:9, judul 14px/500 clamp-2, meta 12px (`m:ss`), badge status, tombol `⋯`.
6. State: `loading` (skeleton 6 kartu) · `empty` (ikon 48 + teks + tombol primer) · `error` (pesan + Coba lagi).

## 4. Layar: Studio
| Zona | Isi | State |
|---|---|---|
| Header | logo, undo/redo (disabled kalau kosong), judul editable, indikator "Tersimpan/ Menyimpan…", tombol Save, avatar | `saved`/`saving`/`error` |
| Transcript | search, toggle Transcript/Edit subtitles, daftar kata `kata [3.0s]` | `loading`/`empty`/`loaded`/`searching`/`selection` |
| Stage | preview 9:16, safe-zone overlay (88% x 80%), pill toolbar (Ratio 9:16/1:1/4:5/16:9 · Background · Layout · Layar penuh), panel Layout: Auto zoom + Zoom manual 100–160% | `no-source`/`ready`/`playing` |
| Rail | 4 tool berlabel | `idle`/`active` |
| Panel tool | isi tool aktif | `idle`/`loaded` |
| Timeline | ruler, 3 track, playhead, zoom | `empty`/`collapsed`/`playing`/`trimming` |
| Strip | kartu klip 160×120 + skor + `⋯` | `empty`(CTA)/`filled`/`selected`/`exporting` |
| Banner job | progres generate: tahap + persen + Batal | `generating`/`error` |

### Aturan transcript
- kata normal 16px/1.6 `--vz-text`; timestamp inline 12px italic `--vz-text-muted` format `[3.0s]`
- kata aktif (playhead) = background `--vz-accent-tint`, warna `--vz-accent`, radius 6
- kata dihapus = `line-through` + `opacity:.45`
- klik kata = `seek(t)`; drag seleksi = tombol "Potong bagian ini" muncul mengambang
- auto-scroll mengikuti playhead, tapi berhenti kalau user scroll manual

### Aturan timeline
- track 1 video, track 2 teks/caption, track 3 audio
- tinggi track 40, gap 8, ruler 24, blok radius 8
- playhead 2px `--vz-accent`, bisa digeser
- zoom 25/50/100/200% (tombol), tanpa pinch

## 5. Layar: Export (modal)
Field: nama file · resolusi (1080p/720p) · fps (30/24) · burn caption (on/off) · format (mp4) · perkiraan ukuran.
Tombol: Batal (secondary) / Export (primary). State: `form` → `submitting` → `done` (link unduh) → `failed` (alasan).

## 6. Komponen (file wajib)
| File | Tanggung jawab | Props inti |
|---|---|---|
| `EditorHeader.jsx` | header 56, undo/redo, save | `title,onTitle,canUndo,canRedo,saveState,onSave` |
| `TranscriptPanel.jsx` | kata + seek + potong | `words,current,onSeek,onCut,search` |
| `PreviewStage.jsx` | canvas + overlay | `src,ratio,safeZone,onFullscreen` |
| `ToolRail.jsx` | 4 tool | `active,onSelect` |
| `ToolPanel.jsx` | isi tool | `tool,project,onChange` |
| `Timeline.jsx` | 3 track | `items,duration,current,zoom,onSeek,onTrim` |
| `ClipStrip.jsx` | kartu klip | `clips,selected,onSelect,onDownload` |
| `ExportModal.jsx` | form export | `open,clip,onClose,onSubmit` |

Aturan: tidak ada komponen generik (`Box`, `Stack`, `Panel`). Satu komponen = satu file = satu tanggung jawab.

## 7. Copy (Indonesia, konsisten)
| Konteks | Teks |
|---|---|
| Tombol utama studio | `Temukan Momen Viral` |
| Tombol simpan | `Simpan` / status `Tersimpan`, `Menyimpan…`, `Gagal menyimpan` |
| Empty clips | `Belum ada klip. Klik Temukan Momen Viral untuk mulai.` |
| Empty transcript | `Transkrip belum siap. Jalankan analisis dulu.` |
| Rate limit | `Batas permintaan tercapai. Coba lagi dalam {n} detik.` |
| LLM mati | `9Router tidak merespons. Periksa koneksi lalu coba lagi.` |
| Export sukses | `Klip siap. Unduh` |
Dilarang: teks uppercase ber-tracking untuk judul panel, istilah campur (`logic`, `framing`), nama panel berbeda untuk hal yang sama.

## 8. Aksesibilitas & kualitas
- kontras teks kecil minimal 4.5:1 (jangan `#8a8a8a` di atas `#141414`).
- semua kontrol ikon wajib `aria-label` + `title`.
- fokus terlihat: `box-shadow: 0 0 0 3px var(--vz-accent-ring)`.
- target klik minimal 40×40 untuk tombol, 24×24 untuk ikon di dalam baris teks.
- tidak ada animasi lebih dari 200ms; `prefers-reduced-motion` dihormati.
