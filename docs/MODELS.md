# MODELS — murah dulu, tapi wajib bisa tool-call

Endpoint `http://127.0.0.1:20128/v1`. Semua diuji nyata 23 Okt 2026.

## 0. Kebijakan
1. **Default = model murah/gratis yang bisa tool-call.**
2. **Eskalasi hanya setelah 2 kegagalan nyata** (build gagal / file tidak tertulis / output invalid). Ragu bukan alasan.
3. Premium dilarang untuk CSS, rename, tambah prop, ubah teks, file kecil.
4. `--thinking=low` untuk tugas kode. `high` hanya untuk perencanaan T2/T3.
5. Gagal karena model → **ganti model**, jangan ulang prompt yang sama 5×.
6. **Cek tool-call dulu**: `py -3.13 docs/scripts/check_model_tools.py "<model>"`.

## 1. Jebakan besar: model "plan mode"
Provider **`ocf/*`** membalas literal `"Plan mode block file writes"` / `"Plan mode active — file writes blocked"`.
Model itu **tidak bisa menulis file** — kalau dipakai di OMP, agent cuma bercerita dan tidak mengerjakan apa pun.
`ocf/glm-5.3-flash-free` bahkan balas **kosong** tanpa `tool_calls`.

Karena itu semua `ocf/*` **dihapus dari peta tugas**. Kalau butuh jawaban teks saja (tanpa tulis file), boleh.

## 2. Model yang terbukti bisa tool-call
| Model | Tool-call | Latensi | Skor kode | Peran |
|---|---|---|---|---|
| `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | ✅ `write_file` | **1.1s** | **5/5** | **default**, tercepat |
| `ninerouter/cbai/deepseek-v4.1-flash` | ⚠️ tool-call sering rusak di sesi panjang | 4.7s | 5/5 (teks) | **jangan untuk tugas multi-file** |
| `ninerouter/T-SOTA/claude-sonnet-5` | ✅ `write_file` | 2.7s | — | eskalasi terakhir |
| `grok-cli/grok-4.5` | ⚠️ tidak konsisten (kadang teks saja) | 13.3s | — | cadangan |
| `ocf/glm-5.3-flash-free` | ❌ kosong | 2.0s | 5/5 (teks) | teks saja, **bukan agent** |
| `ocf/deepseek-v4.1-flash-free` | ❌ plan mode | 2.4s | 5/5 (teks) | teks saja |
| `ocf/mimo-v2.6-flash-free` | ❌ plan mode | 13.0s | — | teks saja |

Bukti tool-call nyata lewat OMP:
```
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" "Write proof.txt containing TOOLS_WORK"
→ proof.txt written, contains TOOLS_WORK   (file benar-benar ada)
```

## 3. Mati — jangan dipilih
`beat/*` & `tokenharbor/*` (404 no credentials) · `ocf/minimax-m3.1-flash-free`, `ocf/longcat-2.5-preview-free` (503) ·
`mistral/*` · `clean/*` · `cx/*` · `ag/claude-*` (404) · `nara/*` (402) · `seekai/*` · `xkiro/openai/*` ·
`cbai/glm-5.0`, `cbai/kimi-*`, `cbai/minimax-*` · `ag/gemini-3.1-pro-low`

## 4. Peta tugas
| Tugas | Utama | Eskalasi 1 | Eskalasi 2 |
|---|---|---|---|
| 00 orkestrator | river/deepseek | cbai/deepseek | — |
| T1 shell | river/deepseek | cbai/deepseek | sonnet-5 |
| T2 transcript | cbai/deepseek | river/deepseek | sonnet-5 |
| T3 timeline | river/deepseek | cbai/deepseek | sonnet-5 |
| T4 export | cbai/deepseek | river/deepseek | — |
| T5 filler+caption | river/deepseek | cbai/deepseek | — |
| T6 safe-zone+zoom | river/deepseek | cbai/deepseek | — |
| T7 akurasi ASR | cbai/deepseek | river/deepseek | — |
| T8 diarisasi | cbai/deepseek | river/deepseek | — |
| T9 translasi | cbai/deepseek | river/deepseek | — |
| T10 b-roll | river/deepseek | cbai/deepseek | — |
| T11 brand kit | river/deepseek | cbai/deepseek | — |
| T12 background | river/deepseek | cbai/deepseek | — |
| T13 posting | cbai/deepseek | river/deepseek | — |
| 99 review | cbai/deepseek | sonnet-5 | grok-cli/grok-4.5 |

Semua `ninerouter/river/...` dan `ninerouter/cbai/...`. Premium hanya 4 sel eskalasi terakhir.

## 5. Perintah
```bash
# cek model bisa nulis file
py -3.13 docs/scripts/check_model_tools.py "ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash"

# jalankan tugas
omp -p --approval-mode=yolo --model="ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash" \
    --thinking=low @AGENTS.md @docs/prompts/01-T1-shell.md
```
`--approval-mode=yolo` wajib untuk `-p`, kalau tidak OMP menunggu approval dan berhenti.

## 5b. Pelajaran nyata (T2, 24 Okt)
`cbai/deepseek-v4.1-flash` gagal di T2: setelah ~20 tool call, dia menulis *"tool calls keep failing due to malformed markup"* dan berhenti tanpa mengubah file.
Aturan baru: **tugas yang menyentuh >2 file wajib pakai `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`**. `cbai` hanya untuk tugas 1 file.

## 6. Perbaikan config OMP yang sudah dilakukan
`~/.omp/agent/config.yml`:
- `default`: `ocf/glm-5.3-flash-free:xhigh` → **`ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash`** (ini penyebab "I'm in Plan mode")
- `plan`: `river/zai-org/GLM-5.3-Flash` → `river/deepseek-ai/DeepSeek-V4.1-Flash`
Backup: `config.yml.pre-cinder-*`.

## 7. Hemat token
- Kirim file target saja (`@frontend/src/components/StudioView.jsx`), bukan `@frontend`.
- Satu tugas per sesi.
- `max_tokens` wajar.

## 8. Model farm josjis (diuji 24 Okt 2026)
Semua diuji via 9Router `:20128` dengan tool-call + tugas koding nyata. **Nama OMP wajib pakai prefix `ninerouter/`.**

| Model | Tool-call | Skor kode | Latensi | Catatan |
|---|---|---|---|---|
| `ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash` | ✅ | 5/5 | 10.4s | **default proyek** |
| `ninerouter/cbai/kimi-k2.6` | ✅ | 5/5 | 8.8s | alternatif kuat |
| `ninerouter/moc/cx/gpt-5.6-luna-review` | ✅ | 5/5 | 5.2s | **tercepat** |
| `ninerouter/moc/qwen/qwen3.8-max:free` | ✅ | 5/5 | 12.1s | gratis |
| `ninerouter/moc/kr/glm-5` | ✅ | 5/5 | 27.0s | lambat tapi tepat |
| `ninerouter/moc/LongCat-2.5-Preview` | ✅ | 4/5 | 10.4s | cadangan |
| `ninerouter/moc/Atria-Dawn-Preview` | ✅ | 3–4/5 | 31.1s | lambat |
| `ninerouter/moc/deepseek-v4.1-flash` | ✅ | 0/5 | 6.7s | tool jalan, kode jelek |
| `ninerouter/g24/minimax-m2.7` | ❌ | 3/5 | 24.6s | tidak bisa jadi agent |
| `ninerouter/moc/grok-4.7` | ❌ | 5/5 | 34.2s | bagus kode, tanpa tool |
| `ninerouter/moc/gemini/*`, `moc/gemini-4-argon` | ❌ 422 | — | — | mati |
| `xkiro/*`, `bai/*`, `unikey/*`, `groq/*`, `mistral/*`, `cf/*` | ❌ | — | — | 403/404/429 (belum ada kredensial) |

**Jebakan OMP:** provider terpisah tidak bisa dipakai untuk id ber-slash. Kalau model 9Router bernama `moc/xxx`, di OMP harus didaftarkan di provider `ninerouter` dengan id **`moc/xxx`** — OMP mengirim id apa adanya.
