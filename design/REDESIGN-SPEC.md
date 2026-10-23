# REDESIGN-SPEC — clip-web versi Vizard

Acuan angka: `tokens.css` (hasil pindai UI Vizard) + geometri `STUDIO-DIFF.md`.
Prinsip: **light, satu aksen ungu, Inter, radius 10/12, tiga ukuran teks kerja.**

## 1. Peta layar (grid tetap, satu sumber kebenaran)
```
┌───────────────────────────────────────────────────────────────┐
│ HEADER 56px · putih · border-bottom #E3E6EC                   │
│ [logo] [↶ ↷] ·············· [judul project ⌄] ···· [Save] [avatar] │
├──────────┬──────────────────────────────────┬─────────────────┤
│ LEFT     │ STAGE (flex)                     │ RIGHT RAIL 72px │
│ 360px    │ preview 9:16 max-h 62vh, center  │ icon+label      │
│ resizable│ toolbar pill di bawah preview    │ 4–10 tool       │
│          ├──────────────────────────────────┴─────────────────┤
│ transcript│ TIMELINE 240px (collapsed) / 320px (expanded)      │
│ + search │ ruler + 3 track: video · teks · audio              │
├──────────┴────────────────────────────────────────────────────┤
│ CLIP STRIP 96px · kartu horizontal (thumb, skor, durasi, ⋯)    │
└───────────────────────────────────────────────────────────────┘
```
Aturan kunci:
- header 56px, sidebar 360px, rail 72px, strip 96px — **angka tetap**, bukan persen.
- stage menyerap sisa lebar; preview tidak pernah melebihi `62vh`.
- timeline bisa collapse ke 240px; kalau kosong, tampilkan 1 baris "belum ada klip", bukan 120px kosong.
- di bawah 1280px: rail jadi 56px (ikon saja), strip jadi scroll horizontal.

## 2. Design system (pakai `tokens.css`, jangan bikin angka baru)
| Peran | Token |
|---|---|
| page bg / panel / kartu | `--vz-bg` / `--vz-surface` / `--vz-surface` + `--vz-border` |
| teks | `--vz-text` (utama) · `--vz-text-soft` (sekunder) · `--vz-text-muted` (meta) |
| aksi | `--vz-accent` (semua tombol primer), `--vz-accent-hover`, `--vz-accent-tint` (highlight kata) |
| status | success / warn / danger / info (4 badge, tidak lebih) |
| radius | input & tombol 10px · kartu 12px · pill 99px · chip 6px |
| bayangan | `--vz-shadow-sm` kartu · `--vz-shadow-md` hover · `--vz-shadow-lg` modal |
| huruf | Inter 400/500/600 · 12 meta · 13 label · 14 UI · 16 body · 20 judul · 32 display |

**Yang dihapus permanen:** gradien merah→ungu, glow, `bg-dark-*`, `neon`, teks uppercase ber-tracking, ikon emoji di header panel, radius 8/16 campur, dua aksen.

## 3. Komponen → file
| Komponen baru | File | Isi |
|---|---|---|
| Header | `components/EditorHeader.jsx` (baru, dipisah dari StudioView) | logo, undo/redo, judul editable, indikator simpan, tombol Save, avatar |
| Transcript panel | `components/TranscriptPanel.jsx` (baru) | search, daftar kata ber-timestamp, klik=seek, seleksi=potong, tab Transcript/Edit subtitles |
| Preview stage | `components/PreviewStage.jsx` (baru) | canvas 9:16, safe-zone overlay, toolbar pill (Ratio/Background/Layout/fullscreen) |
| Tool rail | `components/ToolRail.jsx` (baru) | ikon 22px + label 11px: AI tools, Subtitles, Audio, B-roll, Text, Brand kit |
| Right panel | `components/ToolPanel.jsx` (baru) | isi tool yang aktif (320px) |
| Timeline | `components/Timeline.jsx` (baru) | ruler, 3 track, playhead, zoom, split/trim |
| Clip strip | `components/ClipStrip.jsx` (baru) | kartu 160×120: thumb, badge skor, durasi, `⋯` (unduh/duplikat/hapus) |
| Export dialog | `components/ExportModal.jsx` (baru) | resolusi, fps, burn caption on/off, nama file, estimasi |
| Studio shell | `StudioView.jsx` (dipecah) | cuma layout + state; dari 1.916 baris jadi < 400 |
| Daftar project | `ProjectsView.jsx` (restyle) | sesuai `RESTYLE-PLAN.md` P3 |
| Form project | `NewProjectView.jsx` (restyle + 2 langkah) | langkah 1 sumber, langkah 2 preflight (estimasi klip, biaya, durasi) |
| Crop studio | `CropStudioModal.jsx` (restyle) | pertahankan logika; bungkus modal token |
| Subtitle style | `SubtitleStyleEditor.jsx` (restyle) | pertahankan; pindah ke ToolPanel |
| Galeri | `GalleryView.jsx` (restyle) | grid 4 kolom, filter status |

## 4. State yang wajib ada (per layar)
| Layar | State |
|---|---|
| Studio | `idle` · `ready` (ada sumber) · `generating` (progress + tahap) · `has-clips` · `editing` (ada seleksi transcript) · `rendering` · `error` |
| Transcript | `loading` · `empty` · `loaded` · `searching` · `selection` |
| Timeline | `empty` · `collapsed` · `playing` · `trimming` |
| Clip strip | `empty` (CTA) · `filled` · `selected` · `exporting` |
| Export | `form` · `submitting` · `done` (link) · `failed` (alasan) |

## 5. Token yang dipakai untuk transcript (meniru Vizard, bukan menyalin kode)
- kata normal: `--vz-text`, 16px/1.6
- timestamp inline: 12px italic `--vz-text-muted`, format `[3.0s]`
- kata terpilih / posisi playback: `background: var(--vz-accent-tint)`, `color: var(--vz-accent)`, radius 6px
- kata dihapus: `text-decoration: line-through`, `opacity: .45`
- hover kata: `background: #F1F3F7`, cursor `text`

## 6. Fase kerja
| Fase | Isi | Selesai bila |
|---|---|---|
| R1 (2 jam) | token: index.css, tailwind extend, Inter, buang dark | semua halaman putih, tidak ada gradien/glow |
| R2 (3 jam) | header 56 + rail 72 + strip 96 + shell grid | 4 region terukur di DevTools, tidak ada elemen terpotong |
| R3 (8 jam) | TranscriptPanel + klik-seek + hapus kata | hapus 1 kata → durasi video berkurang, klip ikut | 
| R4 (6 jam) | Timeline 3 track read-only + playhead | playhead ikut playback, track sesuai media |
| R5 (3 jam) | ToolPanel + 4 tool (Subtitles/Audio/B-roll/Text) | tiap tool buka panel kanan 320px |
| R6 (2 jam) | ExportModal + opsi | export 720p & 1080p, burn caption on/off terbukti beda file |
| R7 (2 jam) | restyle Projects/New/Crop/Subtitle/Gallery | tidak ada kelas `dark-*`/`neon` tersisa |

Total ± 26 jam kerja. R1+R2 dulu (5 jam) karena itu yang langsung mengubah penilaian orang.

## 7. Larangan
- Jangan port CSS Vizard. Ambil **angka** dari `vizard-tokens.json`, tulis CSS sendiri.
- Jangan bikin komponen generik (`<Box>`, `<Stack>`) — 8 komponen spesifik lebih cepat dibaca.
- Jangan sentuh `server.py` di fase redesign. Ini murni UI.
- Jangan hapus `CropStudioModal`, `SubtitleStyleEditor`, pemilih model — itu keunggulan repo ini.
