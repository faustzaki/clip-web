# MODELS — murah dulu, mahal hanya kalau perlu

Endpoint `http://127.0.0.1:20128/v1` · semua diuji 23 Okt 2026 dengan request nyata.

## 0. Kebijakan biaya (mengikat)
1. **Default = model gratis.** Yang berbayar hanya untuk tugas yang sudah terbukti butuh.
2. **Eskalasi setelah 2 kegagalan nyata** (build gagal / output tidak valid / file rusak). Ragu bukan alasan.
3. **Dilarang pakai premium untuk**: CSS, ganti class, rename, tambah prop, ubah teks, bikin file kecil.
4. `--thinking=low` untuk semua tugas kode. `high` hanya untuk T2/T3 perencanaan, dan hanya kalau perlu.
5. `--prewalk` boleh — pindah ke model kecil setelah rencana jadi.
6. Jangan kirim seluruh repo ke konteks. Kirim 1–3 file target + dokumen yang relevan.

## 1. Murah & terbukti (dipakai sehari-hari)
Uji koding nyata: bikin `Timeline.jsx` (props, ruler 5s, 3 track 40px, playhead, onSeek). Skor 5/5 = semua syarat terpenuhi.

| Model | Latensi | Skor | Catatan |
|---|---|---|---|
| `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | **2.2s** | **5/5** | tercepat + tepat, kandidat utama |
| `ninerouter/cbai/deepseek-v4.1-flash` | 4.2s | **5/5** | output panjang (4165 char), bagus untuk file besar |
| `ocf/glm-5.3-flash-free` | 5.9s | **5/5** | gratis, rapi, bagus untuk CSS/komponen |
| `ocf/deepseek-v4.1-flash-free` | 7.8s | **5/5** | gratis, cadangan |
| `ocf/mimo-v2.6-flash-free` | 2.7s | belum diuji koding | gratis, untuk tugas pendek |
| `ocf/nemotron-3.5-lightning-free` | 1.9s | belum diuji koding | gratis, cepat |
| `ocf/beam-free` | 1.0s | belum diuji koding | gratis, paling cepat (jawaban pendek) |
| `ninerouter/ag/gemini-3.8-flash-low` | 21.3s | belum | lambat tapi beda keluarga — bagus untuk review |

## 2. Premium — hanya eskalasi
| Model | Latensi | Catatan |
|---|---|---|
| `ninerouter/T-SOTA/claude-sonnet-5` | 2.9s (waktu probe awal) | **saat uji koding gagal koneksi** → jangan dijadikan default |
| `ninerouter/T-SOTA/claude-opus-5-5` | 3.9s | terakhir, kalau sonnet juga gagal |
| `ninerouter/T-SOTA/claude-opus-5` | 2.6s | review mendalam saja |

## 3. Mati — jangan dipilih walau muncul di picker
`beat/*` (404 no credentials) · `tokenharbor/*` (404) · `ocf/minimax-m3.1-flash-free` (503) · `ocf/longcat-2.5-preview-free` (503) ·
`mistral/*` · `clean/*` · `cx/*` · `ag/claude-*` (404) · `nara/*` (402) · `seekai/*` · `xkiro/openai/*` ·
`cbai/glm-5.0`, `cbai/kimi-*`, `cbai/minimax-*` · `ag/gemini-3.1-pro-low`

## 4. Peta tugas (murah dulu)
| Tugas | Utama (murah) | Eskalasi 1 | Eskalasi 2 |
|---|---|---|---|
| 00 orkestrator | `ocf/glm-5.3-flash-free` | `ocf/deepseek-v4.1-flash-free` | — |
| T1 shell | `ocf/glm-5.3-flash-free` | `ocf/deepseek-v4.1-flash-free` | `ninerouter/T-SOTA/claude-sonnet-5` |
| T2 transcript | `ninerouter/cbai/deepseek-v4.1-flash` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/T-SOTA/claude-sonnet-5` |
| T3 timeline | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | `ninerouter/cbai/deepseek-v4.1-flash` | `ninerouter/T-SOTA/claude-sonnet-5` |
| T4 export | `ocf/deepseek-v4.1-flash-free` | `ninerouter/cbai/deepseek-v4.1-flash` | — |
| T5 filler+caption | `ocf/glm-5.3-flash-free` | `ocf/mimo-v2.6-flash-free` | — |
| T6 safe-zone+zoom | `ocf/glm-5.3-flash-free` | `ocf/deepseek-v4.1-flash-free` | — |
| T7 akurasi ASR | `ninerouter/cbai/deepseek-v4.1-flash` | `ocf/glm-5.3-flash-free` | — |
| T8 diarisasi | `ninerouter/cbai/deepseek-v4.1-flash` | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | — |
| T9 translasi | `ocf/deepseek-v4.1-flash-free` | `ninerouter/cbai/deepseek-v4.1-flash` | — |
| T10 b-roll | `ocf/glm-5.3-flash-free` | `ocf/deepseek-v4.1-flash-free` | — |
| T11 brand kit | `ocf/glm-5.3-flash-free` | `ocf/mimo-v2.6-flash-free` | — |
| T12 background | `ocf/glm-5.3-flash-free` | `ninerouter/ag/gemini-3.8-flash-low` | — |
| T13 posting | `ninerouter/cbai/deepseek-v4.1-flash` | `ocf/deepseek-v4.1-flash-free` | — |
| 99 review | `ninerouter/ag/gemini-3.8-flash-low` | `ninerouter/T-SOTA/claude-sonnet-5` | — |

Premium cuma muncul di 4 baris, semuanya sebagai eskalasi terakhir.

## 5. Nama di OMP (prefix provider wajib)
| Kebutuhan | Nama di OMP |
|---|---|
| gratis, CSS/komponen | `ocf/glm-5.3-flash-free` |
| gratis, cepat | `ocf/deepseek-v4.1-flash-free` |
| gratis, tugas pendek | `ocf/mimo-v2.6-flash-free` |
| murah, cepat & tepat | `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` |
| murah, output panjang | `ninerouter/cbai/deepseek-v4.1-flash` |
| beda keluarga (review) | `ninerouter/ag/gemini-3.8-flash-low` |
| eskalasi terakhir | `ninerouter/T-SOTA/claude-sonnet-5` |

```bash
omp -p --model="ocf/glm-5.3-flash-free" --thinking=low @AGENTS.md @docs/prompts/01-T1-shell.md
omp -p --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" --thinking=low @docs/prompts/03-T3-timeline.md
```

## 6. Hemat token
- Kirim file target saja: `@frontend/src/components/StudioView.jsx`, bukan `@frontend`.
- Jangan ulang dokumen tiap sesi kalau model sudah baca `AGENTS.md`.
- `max_tokens` wajar (jangan 32k untuk edit kecil).
- Satu tugas per sesi — konteks panjang = mahal, dan model kecil mulai melantur.
- Kalau tugas gagal karena model, **ganti model** — jangan ulang prompt yang sama 5×.
