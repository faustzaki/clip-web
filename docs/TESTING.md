# TESTING — tes per fitur, bukan di akhir

Aturan: **satu tugas = satu skrip cek yang bisa dijalankan**. Tanpa skrip, tugas belum selesai.

## 1. Alur wajib tiap tugas
```
PRECHECK  → deteksi prasyarat (tempel output ke docs/evidence/<T>/precheck.txt)
BUILD     → patch kode
CHECK     → python scripts/check_<tugas>.py   (exit 0 = lulus)
SCREENSHOT→ docs/evidence/<T>/after/*.png
LAPOR     → format di docs/AGENTS.md
```
Kalau prasyarat tidak ada: **jangan berhenti, jangan crash** — pasang placeholder (lihat §4), lalu kerjakan bagian yang bisa.

## 2. Skrip cek (template)
Buat `scripts/check_t1.py` dst. Pakai stdlib + `requests` saja. Tanpa pytest.
```python
# scripts/check_t3.py — exit 0 kalau semua assertion lulus
import sys, json, sqlite3, subprocess, requests, pathlib

BASE = "http://127.0.0.1:8000"
fails = []
def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond: fails.append(name)

# 1. endpoint ada dan bentuk benar
r = requests.get(f"{BASE}/api/projects", timeout=10)
ck("projects 200", r.status_code == 200, str(r.status_code))

# 2. ukuran layout (dari build statis, bukan tebak)
css = pathlib.Path("frontend/src/index.css").read_text()
ck("token accent ada", "--vz-accent" in css)

# 3. file wajib ada
for f in ["frontend/src/components/Timeline.jsx"]:
    ck(f"file {f}", pathlib.Path(f).exists())

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
```
Aturan isi cek: **maksimal 8 assertion**, semuanya bisa diukur (status code, file ada, angka di DB, `ffprobe`, sha256). Jangan cek rasa/estetika — itu tugas reviewer (`99-REVIEW.md`).

## 3. Cek wajib yang sama untuk semua tugas
1. `cd frontend && npm run build` exit 0.
2. `grep -rn "dark:\|bg-dark\|bg-black\|gradient" frontend/src` → kosong untuk file yang disentuh.
3. `grep -rn "TODO\|console.log" <file yang disentuh>` → kosong.
4. Tidak ada file baru dengan fungsi yang sudah ada (bandingkan daftar komponen).

## 4. Placeholder (kalau prasyarat tidak ada)
Wajib tiga hal, bukan satu:
1. **Endpoint tetap ada**, balas `{"ok":false,"reason":"<alasan>","hint":"<cara unblock>"}` dengan status 200 (bukan 500).
2. **UI menampilkan state jujur**: tombol disabled + teks alasan Indonesia, bukan sembunyi, bukan toast error.
3. **`docs/evidence/<T>/BLOCKED.md`** berisi: perintah precheck, outputnya, apa yang sudah jalan, apa yang belum.
Unblock nanti = isi prasyarat (token/dependency), tanpa ubah kode lain.

## 5. Matriks prasyarat (hasil deteksi = isi precheck.txt)
| Tugas | Prasyarat | Cara deteksi | Kalau tidak ada |
|---|---|---|---|
| T2/T3/T4 | FastAPI jalan, ffmpeg | `curl -s localhost:8000/api/health`; `ffmpeg -version` | BLOCKED, jangan ngoding BE |
| T5 | `chopify/tighten.py` ada | `ls chopify/tighten.py` | tulis sendiri, 60 baris maks |
| T6 | `zoompan` + yunet | `ffmpeg -filters \| grep zoompan`; `ls chopify/*yunet*` | zoom tanpa face-track (center crop) |
| T7 | faster-whisper | `python -c "import faster_whisper"` | BLOCKED (ASR inti) |
| T8 | torch + pyannote + `HF_TOKEN` | `python -c "import torch, pyannote.audio"`; `test -n "$HF_TOKEN"` | **jalur B** (VAD+pitch), label `(perkiraan)` |
| T9 | 9Router hidup | `curl -s $NINE_ROUTER_URL/models -H "Authorization: Bearer $NINE_ROUTER_API_KEY"` | BLOCKED translate, sisanya jalan |
| T10 | folder b-roll | `ls data/broll` | empty state + tombol buat folder |
| T11 | — | — | selalu bisa |
| T12 | `boxblur` | `ffmpeg -filters \| grep boxblur` | latar warna solid |
| T13 | OAuth platform | `env \| grep -i "TIKTOK_CLIENT\|IG_CLIENT\|YT_CLIENT"` | queue lokal saja + status `Belum terhubung` |

## 6. Bukti yang harus ada per tugas di `docs/evidence/<T>/`
```
precheck.txt      output perintah deteksi
check.txt         output scripts/check_<t>.py  (harus "0 gagal")
after/*.png       minimal 1 screenshot layar yang berubah
ffprobe.txt       (T4, T6, T11, T12) resolusi/durasi hasil render
sha256.txt        (T4, T11, T12) pembanding dua file
BLOCKED.md        hanya kalau ada prasyarat yang absen
```

## 7. Hasil deteksi mesin josjis (23 Okt 2026, `py -3.13`)
Dijalankan sungguhan, bukan perkiraan. **Semua perintah backend memakai `py -3.13`** (`python` di PATH = env lain, tanpa dependency).

| Dependency | Status | Efek |
|---|---|---|
| `fastapi` | ✅ | BE bisa jalan |
| `faster_whisper` 1.2.1 | ✅ | T7 bisa langsung |
| `torch` 2.13.0+cpu | ✅ | bahan T8 ada |
| `numpy` 2.3.3 · `cv2` 4.13.0 | ✅ | face track & sinyal |
| ffmpeg `zoompan` + `boxblur` | ✅ | T6 & T12 jalan |
| `pyannote.audio` | ❌ | T8 jalur A perlu `py -3.13 -m pip install pyannote.audio` |
| `HF_TOKEN` | ❌ | T8 jalur A perlu token HuggingFace (gratis, model gated) |
| `librosa` | ❌ | tidak dipakai — jalur B pakai FFT `numpy` |
| `whisperx` | ❌ | tidak perlu |
| `edge_tts` | ❌ | hanya untuk bikin audio uji, bukan fitur |

Konsekuensi: T7 **siap**, T8 **mulai dari jalur B** dan tombol `Diarisasi (model)` disabled sampai pyannote+HF_TOKEN dipasang.
