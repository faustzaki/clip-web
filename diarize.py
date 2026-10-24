"""Diarisasi speaker (T8).

Jalur A: `pyannote/speaker-diarization-3.1` — butuh torch + `pyannote.audio` + `HF_TOKEN`.
Jalur B (wajib, tanpa torch): VAD jeda > 500 ms + f0 (autokorelasi FFT) & energi,
lalu k-means 2–4 klaster. Semua label jalur B ditandai `confidence="estimate"`.

Modul ini tidak pernah crash karena prasyarat absen: `model_available()` selalu balas dict,
`run()` otomatis jatuh ke jalur B kalau jalur A tidak tersedia.
"""
from __future__ import annotations

import os
import subprocess
import wave
from pathlib import Path
from typing import Any, Optional

import numpy as np

SAMPLE_RATE = 16000
FRAME_MS = 25
HOP_MS = 10
MIN_GAP_MS = 500          # jeda VAD pemisah segmen (jalur B)
MIN_SEGMENT_MS = 200      # pulsa lebih pendek dari ini bukan segmen
F0_MIN, F0_MAX = 70.0, 350.0
MAX_SPEAKERS = 4          # jumlah warna speaker di UI
COLOR_COUNT = 4
# Pitch pembeda utama antar speaker; energi hanya pendukung (variasi volume dalam
# satu orang lebih besar daripada beda volume antar orang). Rasio 3:1 hasil ukur
# pada audio uji dua suara (docs/evidence/T8): 100% vs 68% akurasi kata.
PITCH_WEIGHT = 3.0
SILHOUETTE_MARGIN = 0.05  # tambah speaker hanya kalau pemisahan jelas lebih baik


def model_available() -> dict:
    """Cek prasyarat jalur A. Selalu balas dict {ok,reason,hint}; tidak pernah raise."""
    missing = []
    try:
        import torch  # noqa: F401
    except Exception:
        missing.append("torch")
    try:
        import pyannote.audio  # noqa: F401
    except Exception:
        missing.append("pyannote.audio")
    if not os.environ.get("HF_TOKEN"):
        missing.append("HF_TOKEN")
    if missing:
        return {
            "ok": False,
            "reason": "Diarisasi model butuh " + ", ".join(missing) + " (belum tersedia di mesin ini)",
            "hint": "py -3.13 -m pip install pyannote.audio lalu set HF_TOKEN HuggingFace (model gated), "
                    "atau pakai Diarisasi (perkiraan) yang jalan tanpa model",
        }
    return {"ok": True, "reason": "", "hint": ""}


# --------------------------------------------------------------------------
# Audio → numpy
# --------------------------------------------------------------------------
def decode_audio(media: Path | str, wav_path: Path | str) -> Path:
    """Ekstrak mono 16 kHz dari video/audio apa pun lewat ffmpeg. Tidak mengubah durasi."""
    wav_path = Path(wav_path)
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(media), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
         "-f", "wav", str(wav_path)],
        check=True, capture_output=True)
    return wav_path


def read_wav(path: Path | str) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    dtype = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    data = np.frombuffer(raw, dtype=dtype).astype(np.float32)
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    data /= float(np.iinfo(dtype).max)
    return data, sr


def _frames(x: np.ndarray, sr: int) -> tuple[np.ndarray, int]:
    fl = int(sr * FRAME_MS / 1000)
    hop = int(sr * HOP_MS / 1000)
    if len(x) < fl:
        return np.zeros((0, fl), dtype=np.float32), hop
    idx = np.arange(fl)[None, :] + hop * np.arange(1 + (len(x) - fl) // hop)[:, None]
    return x[idx], hop


def _f0(frame: np.ndarray, sr: int) -> float:
    """f0 per frame via autokorelasi FFT; 0.0 kalau tidak yakin."""
    f = frame - float(frame.mean())
    if not np.any(f):
        return 0.0
    n = 1
    while n < 2 * len(f):
        n *= 2
    spec = np.fft.rfft(f, n)
    ac = np.fft.irfft(spec * np.conj(spec), n)[:len(f)]
    if ac[0] <= 0:
        return 0.0
    ac = ac / ac[0]
    lo, hi = int(sr / F0_MAX), min(len(ac) - 1, int(sr / F0_MIN))
    if hi <= lo:
        return 0.0
    seg = ac[lo:hi + 1]
    k = int(np.argmax(seg))
    return sr / (lo + k) if seg[k] >= 0.3 else 0.0


def _vad(x: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, int]:
    """Balas (voiced_mask per frame, f0 per frame, hop)."""
    fr, hop = _frames(x, sr)
    if not len(fr):
        return np.zeros(0, dtype=bool), np.zeros(0), hop
    rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms + 1e-12)
    voiced = db > max(float(np.percentile(db, 35)) + 6.0, float(db.max()) - 35.0)
    f0 = np.zeros(len(fr))
    for i in np.flatnonzero(voiced):
        f0[i] = _f0(fr[i], sr)
    return voiced, f0, hop


def segments_from_vad(voiced: np.ndarray, hop: int) -> list[tuple[int, int]]:
    """Segmen = frame bersuara berurutan, digabung kalau jedanya ≤ MIN_GAP_MS."""
    min_gap_frames = max(1, int(MIN_GAP_MS / HOP_MS))
    min_seg_frames = max(1, int(MIN_SEGMENT_MS / HOP_MS))
    runs: list[list[int]] = []
    for i in np.flatnonzero(voiced):
        if runs and i - runs[-1][1] <= min_gap_frames:
            runs[-1][1] = int(i)
        else:
            runs.append([int(i), int(i)])
    return [(a, b) for a, b in runs if b - a + 1 >= min_seg_frames]


def _features(f0: np.ndarray, db: np.ndarray) -> np.ndarray:
    """Dua fitur klaster: pitch rata-rata (median f0) dan energi rata-rata.

    ponytail: dua fitur saja — f0 + energi cukup memisahkan suara berbeda tinggi.
    Kalau nanti perlu dua speaker ber-pitch mirip, tambah embedding model (jalur A).
    """
    voiced_f0 = f0[f0 > 0]
    f0_med = float(np.median(voiced_f0)) if voiced_f0.size else 0.0
    return np.array([f0_med, float(np.mean(db))], dtype=float)


def _kmeans(X: np.ndarray, k: int, iters: int = 30) -> tuple[np.ndarray, float]:
    """k-means deterministik (init titik terjauh), balas (label, SSE)."""
    centers = [X[int(np.argmax(np.linalg.norm(X - X.mean(axis=0), axis=1)))]]
    for _ in range(k - 1):
        d = np.min(np.stack([np.linalg.norm(X - c, axis=1) for c in centers]), axis=0)
        centers.append(X[int(np.argmax(d))])
    C = np.stack(centers)
    labels = np.full(len(X), -1, dtype=int)
    for _ in range(iters):
        dist = np.linalg.norm(X[:, None, :] - C[None, :, :], axis=2)
        new = np.argmin(dist, axis=1)
        if np.array_equal(new, labels):
            break
        labels = new
        for j in range(k):
            members = labels == j
            if members.any():
                C[j] = X[members].mean(axis=0)
    dist = np.linalg.norm(X[:, None, :] - C[None, :, :], axis=2)
    return labels, float(np.sum(np.min(dist, axis=1) ** 2))


def _silhouette(X: np.ndarray, labels: np.ndarray) -> float:
    k = len(set(labels.tolist()))
    if k < 2 or k >= len(X):
        return -1.0
    d = np.linalg.norm(X[:, None, :] - X[None, :, :], axis=2)
    scores = []
    for i in range(len(X)):
        own = labels == labels[i]
        own[i] = False
        if not own.any():
            scores.append(0.0)
            continue
        a = float(d[i, own].mean())
        other = [float(d[i, labels == j].mean()) for j in range(k) if j != labels[i] and (labels == j).any()]
        b = min(other) if other else 0.0
        scores.append((b - a) / max(a, b) if max(a, b) > 0 else 0.0)
    return float(np.mean(scores))


def _pick_k(X: np.ndarray) -> tuple[np.ndarray, int]:
    """Pilih 2–4 klaster dengan silhouette; speaker baru hanya kalau pemisahan jelas lebih baik."""
    best = None
    for k in range(2, min(MAX_SPEAKERS, len(X) - 1) + 1):
        labels, _ = _kmeans(X, k)
        score = _silhouette(X, labels)
        if best is None or score > best[1] + SILHOUETTE_MARGIN:
            best = (labels, score, k)
    if best is None:
        return np.zeros(len(X), dtype=int), 1
    return best[0], best[2]


def _normalize(F: np.ndarray) -> np.ndarray:
    """Z-score per kolom, lalu bobot pitch vs energi (pitch pembeda utama)."""
    sd = F.std(axis=0)
    sd[sd == 0] = 1.0
    out = (F - F.mean(axis=0)) / sd
    out[:, 0] *= PITCH_WEIGHT
    return out


# --------------------------------------------------------------------------
# Jalur A — model
# --------------------------------------------------------------------------
def _model_segments(media: Path, num_speakers: Optional[int]) -> list[tuple[float, float, str]]:
    from pyannote.audio import Pipeline

    pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1",
                                    use_auth_token=os.environ.get("HF_TOKEN"))
    kwargs = {"num_speakers": int(num_speakers)} if num_speakers else {}
    ann = pipe(str(media), **kwargs)
    return [(float(t.start), float(t.end), str(lbl)) for t, _, lbl in ann.itertracks(yield_label=True)]


# --------------------------------------------------------------------------
# Penugasan kata → speaker
# --------------------------------------------------------------------------
def _word_seconds(w: dict) -> tuple[float, float]:
    def val(key: str) -> float:
        ms = w.get(f"{key}_ms")
        return float(ms) / 1000.0 if ms is not None else float(w.get(key) or 0.0)
    s = val("start")
    return s, max(s, val("end"))


def _by_overlap(spans: list[tuple[float, float, str]], words: list[dict]) -> list[str]:
    """Ambil label dengan overlap terbesar; kalau nol, ambil segmen terdekat."""
    out = []
    for w in words:
        s, e = _word_seconds(w)
        best, best_ov = None, 0.0
        for a, b, lbl in spans:
            ov = min(e, b) - max(s, a)
            if ov > best_ov:
                best, best_ov = lbl, ov
        if best is None:
            mid = (s + e) / 2
            best = min(spans, key=lambda t: abs((t[0] + t[1]) / 2 - mid))[2]
        out.append(best)
    return out


def _by_frame_cluster(segments: list[dict], words: list[dict]) -> list[int]:
    """Tiap kata ambil klaster segmen yang memuat titik tengahnya (fallback: terdekat)."""
    out = []
    for w in words:
        s, e = _word_seconds(w)
        mid = (s + e) / 2
        hit = next((g for g in segments if g["start"] <= mid <= g["end"]), None)
        if hit is None:
            hit = min(segments, key=lambda g: min(abs(g["start"] - mid), abs(g["end"] - mid)))
        out.append(int(hit["cluster"]))
    return out


def _speakers(labels: list[Any], id_base: int = 0) -> tuple[list[dict], dict]:
    """Label mentah (urut kemunculan) → daftar speaker UI: Speaker 1..n + warna.

    `id_base` membuat id unik antar project (tabel speakers di DATA-MODEL punya id global,
    sementara penyimpanan nyata per project di project.json).
    """
    ordered: list[Any] = []
    for lbl in labels:
        if lbl not in ordered:
            ordered.append(lbl)
    ordered = ordered[:MAX_SPEAKERS]
    return [
        {"id": id_base + i + 1, "label": f"Speaker {i + 1}", "color_idx": i % COLOR_COUNT,
         "confidence": "model"}
        for i in range(len(ordered))
    ], {lbl: id_base + i + 1 for i, lbl in enumerate(ordered)}


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def _analyze(media: Path, wav_path: Path, words: list[dict], engine: str,
             num_speakers: Optional[int], id_base: int) -> dict:
    use_model = engine == "model" or (engine == "auto" and model_available()["ok"])
    if use_model:
        try:
            spans = _model_segments(media, num_speakers)
            if not spans:
                raise RuntimeError("model tidak menemukan segmen suara")
            raw = _by_overlap(spans, words)
            speakers, id_of = _speakers(raw, id_base)
            for sp in speakers:
                sp["confidence"] = "model"
            return {"ok": True, "engine": "model", "confidence": "model",
                    "speakers": speakers,
                    "word_speakers": [id_of[lbl] for lbl in raw]}
        except Exception as e:  # model gagal (token/model/audio) → jangan crash, pakai jalur B
            fallback_reason = f"Jalur model gagal: {type(e).__name__}: {e}"
    else:
        fallback_reason = model_available()["reason"]

    x, sr = read_wav(wav_path)
    voiced, f0, hop = _vad(x, sr)
    runs = segments_from_vad(voiced, hop)
    if not runs:
        return {"ok": False, "reason": "Tidak ada suara yang terdeteksi di audio",
                "hint": "Pastikan audio punya bagian bicara, lalu ulangi diarisasi"}
    db = 20 * np.log10(np.sqrt((_frames(x, sr)[0] ** 2).mean(axis=1) + 1e-12) + 1e-12)
    segments = [
        {"start": a * hop / sr, "end": (b + 1) * hop / sr,
         "features": _features(f0[a:b + 1], db[a:b + 1])}
        for a, b in runs
    ]
    F = _normalize(np.stack([g["features"] for g in segments]))
    labels, k = _pick_k(F)
    for g, lbl in zip(segments, labels.tolist()):
        g["cluster"] = lbl
    speaker_of_cluster, _ = _speakers(labels.tolist(), id_base)
    speakers = [dict(sp, confidence="estimate") for sp in speaker_of_cluster]
    word_clusters = _by_frame_cluster(segments, words)
    return {"ok": True, "engine": "heuristic", "confidence": "estimate",
            "speakers": speakers, "word_speakers": [id_base + int(c) + 1 for c in word_clusters],
            "segments": len(segments), "clusters": k, "note": fallback_reason}


def run(media: Path | str, words: list[dict], engine: str = "auto",
        num_speakers: Optional[int] = None, wav_path: Path | str | None = None,
        id_base: int = 0) -> dict:
    """Diarisasi `words` (timing detik/ms, urut). Balas dict siap simpan.

    engine: `auto` (model kalau prasyarat ada, kalau tidak jalur B) | `model` | `heuristic`.
    id_base: offset id speaker supaya unik antar project.
    wav_path: pakai wav yang sudah ada; kalau None, ekstrak sementara lalu dibuang.
    """
    if not words:
        return {"ok": False, "reason": "Kata transkrip kosong", "hint": "Jalankan analisis dulu"}
    media = Path(media)
    own_wav = wav_path is None
    wav_path = Path(wav_path) if wav_path is not None else media.with_suffix(".diarize.wav")
    decode_audio(media, wav_path)
    try:
        return _analyze(media, wav_path, words, engine, num_speakers, id_base)
    finally:
        if own_wav:
            try:
                wav_path.unlink()
            except OSError:
                pass


def prefix_words(words: list[dict], speakers: list[dict]) -> list[dict]:
    """Salin kata; sisipkan `Label: ` di kata pertama tiap giliran speaker (untuk caption)."""
    labels = {int(s["id"]): (s.get("label") or f"Speaker {s['id']}") for s in speakers or []}
    out, last = [], None
    for w in words:
        w = dict(w)
        sid = w.get("speaker")
        sid = int(sid) if sid not in (None, "") else None
        if sid is not None and sid != last and labels.get(sid):
            w["word"] = f"{labels[sid]}: {w.get('word', '')}"
        last = sid
        out.append(w)
    return out
