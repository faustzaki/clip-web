# T8 — BLOCKED: jalur A (diarisasi model pyannote) tidak bisa jalan di mesin ini

## Perintah precheck + output (docs/evidence/T8/precheck.txt)

```
$ py -3.13 -c "import torch;print('torch', torch.__version__)"
torch 2.13.0+cpu

$ py -3.13 -c "import pyannote.audio"
ModuleNotFoundError: No module named 'pyannote.audio'

$ py -3.13 -c "import os;print(os.environ.get('HF_TOKEN') or 'NO_HF')"
NO_HF
```

Prasyarat jalur A absen: `pyannote.audio` belum dipasang dan `HF_TOKEN` belum di-set
(model `pyannote/speaker-diarization-3.1` gated di HuggingFace). `torch` 2.13.0+cpu sudah ada.

## Yang sudah jalan (jalur B)

- `POST /api/projects/{id}/diarize {"engine":"heuristic"}` → 200
  `{ok:true, engine:"heuristic", confidence:"estimate", speakers:[…], duration_ms, duration_before_ms}`.
- Akurasi kata **100% (62/62)** pada audio uji dua suara TTS (tanpa pyannote/HF_TOKEN),
  diukur `py -3.13 scripts/check_t8.py`.
- Badge nama speaker + label `(perkiraan)` di panel transkrip, filter `Semua / Speaker n`,
  rename speaker, toggle `Tampilkan nama di caption` (prefix nama masuk ke caption export).
- Diarisasi tidak menggeser/memotong audio: `duration_before_ms == duration_ms`, timing kata identik.

## Yang belum jalan (jalur A)

- `POST /api/projects/{id}/diarize {"engine":"model"}` → 200
  `{ok:false, reason:"Diarisasi model butuh pyannote.audio, HF_TOKEN (belum tersedia di mesin ini)",
   hint:"py -3.13 -m pip install pyannote.audio lalu set HF_TOKEN HuggingFace (model gated), atau
   pakai Diarisasi (perkiraan) yang jalan tanpa model"}` — 200, bukan 500, dan UI menampilkan
  alasan itu dengan tombol `Diarisasi (model)` disabled.

## Cara unblock (tanpa ubah kode lain)

1. `py -3.13 -m pip install pyannote.audio` (butuh ±2 GB, torch sudah ada).
2. Set `HF_TOKEN` ke token HuggingFace yang sudah menyetujui lisensi
   `pyannote/speaker-diarization-3.1` + `pyannote/segmentation-3.0`.
3. Restart backend → `GET /api/projects/{id}/transcript` akan melaporkan
   `diarize_model.ok = true`, tombol `Diarisasi (model)` aktif, hasilnya `confidence="model"`
   tanpa label `(perkiraan)`.
