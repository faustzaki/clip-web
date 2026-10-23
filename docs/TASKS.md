# TASKS — clip-web (dibuat oleh prompt 00, 24 Okt 2026)

## 0. Ringkas (10 baris)

1. Yang dibangun: **editor klip**, bukan generator — transcript → timeline → export, semua light theme satu aksen `#4822A5`.
2. Backend FastAPI (`server.py` 1.565) + `chopify/` (render ffmpeg lokal) sudah jalan; kerja T1–T13 = **PATCH** file yang ada.
3. Masalah utama sekarang: `StudioView.jsx` 1.916 baris + tema gelap (`bg-dark-bg`, `neon`) padahal ADR-001 minta light-only.
4. Keputusan terkunci: ADR-001 light-only · ADR-002 editor bukan generator (rail 4 tool) · ADR-003 render lokal default di atas Vizard · ADR-004 caption = data + style JSON, bukan gambar · ADR-005 model AI dipilih user (9Router, fallback `cbai/deepseek-v4.1-flash`) · ADR-006 tanpa state global baru (`StudioView` ≤ 400 baris) · ADR-007 DB additive · ADR-008 cakupan final T1–T13 (P0→P1→P2).
5. Prompt 00 menyebut "6 tugas"; **ADR-008 (23 Okt 2026) merevisi cakupan jadi T1–T13**. Prioritas dokumen: ADR > prompt → tabel di bawah memuat T1–T13; T1–T6 tetap blok P0 yang harus lulus gate dulu.
6. Gate P0 sebelum P1: build 0 error, screenshot 1440×900 + 1280×800 tanpa overflow, kriteria terima terpenuhi, `grep "dark:\|bg-black\|bg-dark\|neon\|gradient"` kosong di file yang disentuh, tanpa TODO/`console.log`/data dummy.
7. Prasyarat absen per 23 Okt: `pyannote.audio` + `HF_TOKEN` (T8 → jalur B), OAuth TikTok/IG/YT (T13 → queue lokal), font Inter belum lokal (pakai CDN/`@fontsource/inter`).
8. Skrip screenshot proyek (`_shot.py`/`_shot2.py`) **tidak ada di repo** — kondisi awal diambil lewat mock + Playwright ad-hoc, lihat `docs/evidence/before/README.md`.
9. Model: default termurah yang terbukti tool-call `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`; **semua `ocf/*` dilarang** (plan mode, tidak bisa tulis file).
10. Status sekarang: **0 dari 13 tugas dikerjakan** — semua `TODO`.

## 1. Tabel tugas

Satu tugas = satu branch = satu PR. Cek per tugas = `scripts/check_t<N>.py` (exit 0).

| T | Judul | Prio | Tergantung | Branch | Model utama | Eskalasi | Cek | Status |
|---|---|---|---|---|---|---|---|---|
| T1 | Token + shell light-only (header 56, rail 72, strip 96) | P0 | — | `t1-shell` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` → `ninerouter/T-SOTA/claude-sonnet-5` | `check_t1.py` | TODO |
| T2 | Transcript panel: kata `[3.0s]`, seek klik, potong seleksi | P0 | T1 | `t2-transcript` | `ninerouter/cbai/deepseek-v4.1-flash` | `river/deepseek` → sonnet-5 | `check_t2.py` | TODO |
| T3 | Timeline 3 track (video/teks/audio) + playhead + zoom | P0 | T2 | `t3-timeline` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` → sonnet-5 | `check_t3.py` | TODO |
| T4 | Export modal + job (`/api/export`, 1080p/720p, burn caption) | P0 | T3 | `t4-export` | `ninerouter/cbai/deepseek-v4.1-flash` | `river/deepseek` | `check_t4.py` | TODO |
| T5 | Filler/silence removal (`chopify/tighten.py`) + 5 preset caption | P0 | T1 | `t5-filler-caption` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` | `check_t5.py` | TODO |
| T6 | Safe-zone overlay + ratio + auto zoom (`zoompan` + yunet) | P0 | T3 | `t6-safezone-zoom` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` | `check_t6.py` | TODO |
| — | **GATE P0** (build + screenshot + kriteria terima T1–T6) | — | T1–T6 | — | — | — | — | PROJECT |
| T7 | Akurasi transkripsi: `large-v3`, glosarium, WER | P1 | P0 lulus | `t7-akurasi` | `ninerouter/cbai/deepseek-v4.1-flash` | `river/deepseek` | `check_t7.py` | TODO |
| T8 | Diarisasi speaker (pyannote / jalur B FFT) + label `(perkiraan)` | P1 | T7 | `t8-diarisasi` | `ninerouter/cbai/deepseek-v4.1-flash` | `river/deepseek` | `check_t8.py` | TODO |
| T9 | Translasi subtitle + cache `subtitle_translations` | P1 | T7 | `t9-translasi` | `ninerouter/cbai/deepseek-v4.1-flash` | `river/deepseek` | `check_t9.py` | TODO |
| T10 | B-roll folder lokal (`data/broll/index.json`) | P2 | T3 | `t10-broll` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` | `check_t10.py` | TODO |
| T11 | Brand kit (logo/font/warna → export) | P2 | T4 | `t11-brandkit` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` | `check_t11.py` | TODO |
| T12 | Background fill + layout (`boxblur` / warna solid) | P2 | T3 | `t12-background` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` | `check_t12.py` | TODO |
| T13 | Antrian posting + analitik (queue lokal dulu, OAuth menyusul) | P2 | T4 | `t13-posting` | `ninerouter/cbai/deepseek-v4.1-flash` | `river/deepseek` | `check_t13.py` | TODO |

## 2. Inventaris `frontend/src/components/` (kondisi awal, 24 Okt 2026)

| File | Baris | Isi (1 baris) |
|---|---|---|
| `StudioView.jsx` | 1.916 | Layar studio monolit: panel Generate Clip (pemilih model AI, min/max durasi, mode framing/crop) + player preview 9:16 + daftar klip + pemicu Crop Studio & Potong Klip. Target T3: ≤ 400 baris. |
| `CropStudioModal.jsx` | 605 | Modal crop manual per kandidat (drag rect, preview) — **jangan dihapus**; diakses dari `StudioView` lewat `onOpenCropStudio`. |
| `SettingsModal.jsx` | 601 | Pengaturan global: sumber endpoint LLM (OpenAI-compatible/9Router), API key, model Whisper, reset workspace. |
| `SubtitleApplyModal.jsx` | 448 | Transkrip audio klip (Whisper) + pilih font/posisi lalu terapkan style subtitle ke klip. |
| `App.jsx` (src root) | 256 | Shell aplikasi: state `view` (projects/new/project), muat projects/state/options/health, host semua modal; masih tema gelap. |
| `SubtitleStyleEditor.jsx` | 250 | Editor style caption (font, ukuran, posisi, jarak tepi, warna) → JSON style untuk `subtitle_burn.py`. **Jangan dihapus**. |
| `NewProjectView.jsx` | 197 | Form project baru: nama, sumber YouTube link atau upload file, bahasa, opsi ingest. |
| `GalleryView.jsx` | 181 | Galeri klip project: kartu klip, copy teks, download, empty state "Belum ada klip untuk project ini." |
| `ProjectsView.jsx` | 159 | Daftar project: grid kartu + badge status ("Belum ada video", "Siap di-clip", jumlah klip/kandidat), rename, hapus, tombol Project Baru. |
| `Navbar.jsx` | 108 | Header: logo, tab `Studio Clipper` / `Galeri Klip`, `Lihat Project`, `Pengaturan`. |
| `IconDropdown.jsx` | 86 | Dropdown ikon generik (toolbar/tool switcher). |
| `GlitchHorseIcon.jsx` | 65 | Logo SVG animasi (glitch horse). |
| `SubtitlePreview.jsx` | 55 | Render pratinjau caption memakai style terpilih. |

File `UI-SPEC.md` §6 minta pecahan baru untuk T1: `EditorHeader.jsx`, `TranscriptPanel.jsx`, `PreviewStage.jsx`, `ToolRail.jsx`, `ToolPanel.jsx`, `Timeline.jsx`, `ClipStrip.jsx`, `ExportModal.jsx` — belum ada satu pun (dibuat di T1–T4).

## 3. Baseline lain (jangan di-scaffold ulang)

| File | Baris |
|---|---|
| `server.py` | 1.565 |
| `chopify/subtitle_burn.py` | 423 |
| `chopify/tighten.py` | 128 |
| `frontend/src/api.js` | 244 |
| `_mock.py` | 107 |

`_mock.py` DIST masih menunjuk `C:/Users/faust/Downloads/clip-web-review/frontend/dist` (build repo lain) — skrip bantu ini perlu diarahkan ke repo sendiri sebelum dipakai untuk bukti screenshot tugas berikutnya.
