# STUDIO-DIFF — clip-web Studio vs Vizard Editor

Sumber: `_shots/10_studio.png` (clip-web, 1680×1050) vs `design/ref_clip_editor.png` (Vizard, 1920×964).
Ukuran Vizard diukur dari DOM (`ref_clip_editor_geo.json`), bukan diperkirakan.

## Geometri: beda paling kelihatan
| Bagian | Vizard | clip-web | Selisih |
|---|---|---|---|
| Header | 56–72px, **putih**, ada undo/redo + Save | 56px, **hitam**, tanpa undo/redo, Save tidak ada | identitas + fungsi |
| Panel kiri | **650px** (34% layar), transcript | **318px** (20%), form generate | 2× lebih sempit, isi beda |
| Preview | 252×457 (9:16), di kanan-tengah | 390×685, di tengah | proporsi mirip |
| Rail kanan | 70px, **10 tool berlabel** | tidak ada | hilang total |
| Timeline | 5 track, ~360px tinggi | tidak ada (drawer "Clips" 120px) | hilang total |
| Toolbar preview | pill mengambang: Ratio / Background / Layout | 3 ikon tanpa label | tanpa label |
| Drawer klip | strip horizontal + kartu | drawer kosong 120px | salah bentuk |

## Fitur: yang Vizard punya, repo lu belum
| # | Fitur Vizard | Bukti di Vizard | Di repo lu | Prioritas |
|---|---|---|---|---|
| 1 | **Transcript sebagai timeline** — klik kata = seek, hapus kata = potong video | panel kiri, `[3.0s]` inline per kata | `grep transcript StudioView.jsx` = **0** | **P0** |
| 2 | Edit subtitles terpisah dari transcript (tab) | tab Transcript / Edit subtitles | ada `SubtitleApplyModal` tapi bukan editor per-kata | P1 |
| 3 | Undo / redo | ikon ↶ ↷ di header | 0 kemunculan | **P0** |
| 4 | Save eksplisit + indikator sinkron | tombol Save ungu + ikon cloud | autosave implisit, tanpa indikator | P1 |
| 5 | Rail tool kanan: AI tools, Generate, Brand kit, Template, Subtitles, Upload, Audio, B-roll, Transition, Text | 10 ikon berlabel | tidak ada | **P0** (minimal 4: Subtitles, Audio, B-roll, Text) |
| 6 | Multi-track timeline + track video/teks/overlay | 5 baris blok | `timeline` = 1 kemunculan | **P0** |
| 7 | Ratio selector berlabel (9:16, 1:1, 4:5, 16:9) | "Ratio (9:16)" di pill | ada `ratio` 23×, tapi ikon tanpa label | P1 |
| 8 | Background / Layout (fill, blur, reframe) | tombol di pill | tidak ada | P2 |
| 9 | Search dalam transcript | kolom Search + filter | tidak ada | P1 |
| 10 | Brand kit / template | rail + tombol diamond | tidak ada | P2 |
| 11 | B-roll & emoji insertion | rail | 0 | P2 |
| 12 | Audio: musik, TTS voice | rail Audio | tidak ada (chopify punya edge-tts, belum diekspos) | P1 |
| 13 | Safe zone / overlay platform | panduan di preview | 0 (`safe` = 0) | P1 |
| 14 | Watermark removal berbayar | upsell "Remove watermark" | repo lu **punya** `Watermark Handle` (12×) | lebih |
| 15 | Export panel (resolusi, fps, burn caption) | "Save & Export" | ada `download` 3×, tanpa panel opsi | **P0** |

## Fitur repo lu yang Vizard TIDAK punya (jangan dihapus)
| Fitur | Kenapa penting |
|---|---|
| Pemilihan model AI per generate (`ag/gemini…`, `river/deepseek…`) | Vizard kunci ke `clip_v1`; lu bisa ganti otak |
| Render lokal (chopify) tanpa kredit | biaya nol, tanpa watermark |
| `SubtitleStyleEditor` + `CropStudioModal` interaktif | Vizard kunci di balik plan |
| Galeri klip terpisah | Vizard tidak punya |
| Watermark handle | Vizard jual sebagai fitur berbayar |
| Face-tracking crop (`yunet.onnx`) | setara, tapi milik sendiri |

## Diagnosis satu baris
Studio lu sekarang = **form generator + preview**. Studio Vizard = **editor berbasis transkrip + timeline**.
Selama transkrip dan timeline belum ada, dia tidak akan pernah "kelihatan seperti editor", seberapa pun rapi CSS-nya.

## Urutan menutup celah (dampak per jam kerja)
| Urutan | Kerjaan | Dampak visual | Estimasi |
|---|---|---|---|
| 1 | Transcript panel (kiri 360px) + klik-seek + hapus kata | ★★★★★ | 6–8 jam |
| 2 | Timeline 3 track (video/teks/audio) read-only dulu | ★★★★☆ | 5–6 jam |
| 3 | Rail kanan 4 tool berlabel + panel kanan 320px | ★★★★☆ | 3 jam |
| 4 | Header: undo/redo + Save + status simpan | ★★★☆☆ | 2 jam |
| 5 | Ratio selector berlabel + safe zone overlay | ★★★☆☆ | 2 jam |
| 6 | Export panel (1080p/720p, burn caption, fps) | ★★☆☆☆ | 2 jam |
| 7 | Restyle token Vizard (light, ungu, Inter) | ★★★★★ (murah) | 2 jam |

Catatan: nomor 7 paling murah dan paling besar efek persepsinya. Kerjakan **bareng** nomor 1, jangan ditunda.
