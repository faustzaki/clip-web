# MODELS — pilihan model di 9Router (diuji, bukan diasumsikan)

Endpoint: `http://127.0.0.1:20128/v1` · auth `Authorization: Bearer $NINE_ROUTER_API_KEY`
Diuji 23 Okt 2026 dengan request nyata (max_tokens 8, prompt "Reply with exactly: OK").
Total katalog: **558 model / 22 provider**. Yang benar-benar menjawab: di bawah.

## 1. Hidup dan cepat (dipakai)
| Model | Latensi | Peran |
|---|---|---|
| `cbai/deepseek-v4.1-flash` | **0.9s** | kerja mekanis, refactor kecil, rename, prop threading |
| `oc/glm-5.3-flash-free` | **1.3s** | CSS/tailwind, ubah class, kerja berulang |
| `oc/flint-40b-free` | 1.5s | baca file panjang, ringkas konteks (gratis) |
| `oc/deepseek-v4.1-flash-free` | 2.1s | fallback cepat tanpa biaya |
| `oc/mimo-v2.6-flash-free` | 2.4s | eksperimen, tugas sekali pakai |
| `T-SOTA/claude-sonnet-4-6` | 2.0s | coding harian, diff sedang |
| `T-SOTA/claude-sonnet-5` | 2.9s | **utama**: komponen React, logika editor |
| `T-SOTA/claude-opus-5` | 2.6s | review, cari bug halus |
| `T-SOTA/claude-opus-5-5` | 3.9s | **utama**: refactor besar (pecah StudioView 1.916 baris) |
| `T-SOTA/claude-sonnet-5-thinking` | 6.5s | perencanaan urutan kerja, analisis ketergantungan |
| `T-SOTA/claude-opus-5-thinking` | 2.6s | keputusan desain rumit (state editor) |
| `T-SOTA/claude-haiku-5-5` | 3.0s | tugas cepat, jawaban pendek |
| `ag/gemini-3.8-flash-high` | 3.9s | **utama**: UI/visual, CSS rumit, overlay canvas |
| `gcli/grok-4.5` | 7.9s | opini kedua saat desain mentok |
| `T-SOTA/claude-fable-5` | 7.3s | alternatif opus kalau kuota habis |

## 2. Mati / jangan dipakai (503/404/402/429 saat diuji)
`ag/claude-sonnet-5-5*`, `ag/claude-opus-5-5` (404 upstream) · `xkiro/openai/*` (403) · `nara/*` (402/429—kredit habis) ·
`clean/*` (402) · `cf/@cf/*` (502) · `seekai/*` (401) · `tokenharbor/*` (404) · `bai/kimi-k3` (404) ·
`unikey/*` (koneksi diputus) · `groq/*`, `mistral/*`, `xkiro/qwen/*` (koneksi diputus).
Kalau butuh salah satu ini, cek dulu: status bisa pulih, tapi **jangan jadikan dependensi tugas**.

## 3. Peta tugas → model
| Tugas | Utama | Fallback 1 | Fallback 2 | Alasan |
|---|---|---|---|---|
| T1 shell/token | `T-SOTA/claude-sonnet-5` | `T-SOTA/claude-sonnet-4-6` | `oc/glm-5.3-flash-free` | banyak file kecil, butuh konsistensi kelas |
| T2 transcript | `T-SOTA/claude-opus-5-5` | `T-SOTA/claude-sonnet-5` | `T-SOTA/claude-opus-5` | logika waktu + seleksi + sinkron playhead |
| T3 timeline | `T-SOTA/claude-opus-5-5` | `T-SOTA/claude-sonnet-5-thinking` | `T-SOTA/claude-opus-5` | geometri, drag, zoom — rawan bug tepi |
| T4 export | `T-SOTA/claude-sonnet-5` | `cbai/deepseek-v4.1-flash` | `oc/deepseek-v4.1-flash-free` | pola modal + polling, sudah jelas |
| T5 filler+caption | `oc/glm-5.3-flash-free` | `cbai/deepseek-v4.1-flash` | `oc/deepseek-v4.1-flash-free` | banyak edit kecil, murah, cepat |
| T6 safe-zone+zoom | `ag/gemini-3.8-flash-high` | `oc/glm-5.3-flash-free` | `T-SOTA/claude-sonnet-5` | overlay visual & CSS |
| Review/QA | `T-SOTA/claude-opus-5` | `gcli/grok-4.5` | `T-SOTA/claude-opus-5-5` | harus beda keluarga dari penulis kode |
| Baca dokumen panjang | `oc/flint-40b-free` | `oc/glm-5.3-flash-free` | — | gratis, konteks besar |

## 4. Aturan pemakaian
- Satu tugas satu model. Kalau gagal 2×, **turun ke fallback**, jangan ganti-ganti acak.
- `thinking` hanya untuk perencanaan/analisis; jangan untuk edit file massal (lambat, mahal).
- Selalu kirim `temperature` rendah (0.2) untuk tugas kode.
- Cek hidup dulu sebelum sesi panjang:
```bash
curl -s -X POST http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer $NINE_ROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"T-SOTA/claude-sonnet-5","messages":[{"role":"user","content":"OK"}],"max_tokens":8}'
```
Kalau balasannya bukan `200`, ganti model sebelum mulai — jangan buang sesi.

---

# 5. Nama model untuk OMP (v18.12.6)
Picker OMP membaca `~/.omp/agent/models.yml`; prefix provider **wajib** ditulis.

| Kebutuhan | Nama di OMP | Status uji |
|---|---|---|
| default / kode harian | `ninerouter/T-SOTA/claude-sonnet-5` | ✅ `PICKER_OK` |
| refactor besar (T2, T3) | `ninerouter/T-SOTA/claude-opus-5-5` | ✅ 200 |
| review / QA | `ninerouter/T-SOTA/claude-opus-5` | ✅ 200 |
| perencanaan | `ninerouter/T-SOTA/claude-opus-5-thinking` | ✅ 200 |
| kerja mekanis | `ninerouter/cbai/deepseek-v4.1-flash` | ✅ 200 |
| CSS / edit massal | `ocf/glm-5.3-flash-free` | ✅ 200 (provider `ocf`) |
| overlay visual (T6) | `ninerouter/ag/gemini-3.8-flash-high` | ✅ 200 |
| opini kedua | `grok-cli/grok-4.5` | ✅ 200 (provider `grok-cli`) |

## Perintah OMP (pakai role, bukan flag model satu-satu)
```bash
export PI_PLAN_MODEL="ninerouter/T-SOTA/claude-opus-5-thinking"
export PI_SMOL_MODEL="ninerouter/cbai/deepseek-v4.1-flash"
export PI_SLOW_MODEL="ninerouter/T-SOTA/claude-opus-5-5"

# T1 (shell) — model utama sonnet-5
omp -p --model="ninerouter/T-SOTA/claude-sonnet-5" @docs/AGENTS.md @docs/prompts/01-T1-shell.md

# T2 / T3 (paling rawan) — opus 5.5, thinking tinggi
omp -p --model="ninerouter/T-SOTA/claude-opus-5-5" --thinking=high @docs/prompts/02-T2-transcript.md

# review setelah merge — beda keluarga dari penulis
omp -p --model="ninerouter/T-SOTA/claude-opus-5" @docs/prompts/07-REVIEW.md
```
`--prewalk` aman dipakai: dia pindah ke model `smol` setelah rencana jadi, hemat kuota.

## Jebakan
Model yang muncul di picker tapi **mati** saat diuji: `mistral/*`, `clean/*`, `beat/*`, `tokenharbor/*`,
`cx/*`, `ag/claude-*` (404), `cbai/glm-5.0`, `cbai/kimi-*`, `cbai/minimax-*`, `ag/gemini-3.1-pro-low`.
Jangan dipilih. Daftar lengkap: `READINESS-AUDIT.md` §1.
