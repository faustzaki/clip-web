# REQUIREMENTS — yang harus ada sebelum T1 dijalankan

Diperiksa di mesin josjis 23 Okt 2026. Yang ❌ harus dibereskan dulu.

## 1. Wajib (tanpa ini T1–T6 tidak jalan)
| Kebutuhan | Status | Nilai terukur | Tindakan kalau ❌ |
|---|---|---|---|
| Node.js ≥ 20 | ✅ | v22.23.2 | — |
| npm | ✅ | 12.0.2 | — |
| Git | ✅ | 2.47.1 | — |
| ffmpeg + ffprobe | ✅ | 9.0-full (gyan) | `winget install Gyan.FFmpeg` |
| Python 3.13 + fastapi | ✅ | `py -3.13` | semua perintah BE pakai `py -3.13`, **bukan** `python` |
| `frontend/node_modules` | ✅ | ada | `cd frontend && npm i` |
| Playwright (screenshot) | ✅ | 1.64.1 via npx | `npx playwright install chromium` |
| 9Router hidup | ✅ | :20128 | nyalakan 9router |
| **Ruang disk** | ⚠️ **5.3 GB (99% penuh)** | `df -h /c` | **kosongkan ≥ 10 GB** — whisper large-v3 ±3 GB + render temp |
| Font Inter | ❌ lokal | — | pakai CDN Google Fonts **atau** `npm i @fontsource/inter` (butuh izin) |

## 2. Khusus per tugas
| Tugas | Butuh | Status |
|---|---|---|
| T7 | `faster_whisper` 1.2.1 ✅ | siap |
| T7 | model whisper: `medium` (±1.5 GB) atau `large-v3` (±3 GB) | **pakai `medium` dulu** karena disk 5.3 GB; naik ke large-v3 setelah disk lega |
| T8 | `pyannote.audio` + `HF_TOKEN` | ❌ → jalur B (FFT numpy) dulu |
| T4/T6/T11/T12 | ffmpeg `libx264`, `zoompan`, `boxblur`, `overlay` | ✅ semua ada |
| T9/T13 | `NINE_ROUTER_API_KEY` di env | wajib diisi di shell runner |
| T13 (OAuth) | `TIKTOK_CLIENT_ID/SECRET`, `IG_CLIENT_ID/SECRET`, `YT_CLIENT_ID/SECRET` | ❌ → queue lokal dulu |

## 3. Port
| Port | Dipakai untuk | Status |
|---|---|---|
| 8000 | backend (uvicorn) | ✅ kosong |
| 5173 | vite dev | ✅ kosong |
| 8005 | `_mock.py` untuk screenshot | ✅ kosong (sudah dibersihkan) |
| 20128 | 9Router | ✅ jalan |
| 9222 | Chrome CDP | ✅ jalan |

## 4. Env yang harus di-export sebelum sesi
```bash
export NINE_ROUTER_URL="http://127.0.0.1:20128/v1"
export NINE_ROUTER_API_KEY="<dari config Hermes>"
export HF_TOKEN=""            # kosongkan kalau belum ada → T8 jalur B
export VIZARDAI_API_KEY=""    # opsional, Lane A
```
Jangan pernah commit nilai key. `.env` sudah ada di `.gitignore`? **cek dulu** sebelum menyimpan.

## 5. Aturan interpreter
```bash
# BACKEND
py -3.13 -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
# FRONTEND
cd frontend && npm run dev        # :5173
# BUILD + SCREENSHOT
cd frontend && npm run build
npx playwright --version          # harus 1.64.x
```
`python` di PATH = env Hermes tanpa dependency. Jangan dipakai untuk backend.

## 6. Risiko yang belum tertutup
1. **Disk 99%** — paling mungkin bikin T7/T8 gagal. Bereskan dulu.
2. Model whisper `large-v3` belum diunduh; unduhan pertama butuh waktu + disk.
3. `@fontsource/inter` tidak ada → kalau offline, font jatuh ke system sans. Boleh, tapi UI tidak persis.
4. Chrome CDP 9222 masih hidup dari sesi reverse — tidak dipakai proyek, boleh dimatikan.
