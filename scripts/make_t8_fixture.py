"""Bangun audio uji dua speaker (TTS SAPI) + timing kata sintetis (T8, sekali pakai).

Dipakai scripts/check_t8.py: TTS dua suara Windows (David/Zira) tidak butuh dependency baru,
timing kata didistribusikan proporsional panjang karakter di dalam tiap giliran bicara —
cukup untuk mengukur penugasan speaker (diarisasi hanya butuh timing, bukan teks tepat).
"""
from __future__ import annotations

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

TURNS = [
    ("Microsoft David Desktop", "Halo semuanya hari ini kita bahas cara membuat klip pendek dari video panjang"),
    ("Microsoft Zira Desktop", "Betul setelah momen terpilih potong bagian yang tidak perlu supaya lebih padat"),
    ("Microsoft David Desktop", "Lalu tambahkan caption otomatis untuk penonton yang menonton tanpa suara"),
    ("Microsoft Zira Desktop", "Pilih rasio sembilan banding enam belas untuk platform vertikal"),
    ("Microsoft David Desktop", "Terakhir ekspor dengan kualitas seribu delapan puluh piksel"),
    ("Microsoft Zira Desktop", "Klip siap dibagikan ke semua platform favorit kamu hari ini"),
]
GAP_S = 0.7
EXPECTED_SPEAKER = {voice: i for i, voice in enumerate(dict.fromkeys(v for v, _ in TURNS))}


def _synthesize(dest: Path) -> list[Path]:
    ps = dest / "_tts.ps1"
    lines = ["Add-Type -AssemblyName System.Speech"]
    for i, (voice, text) in enumerate(TURNS):
        lines.append(
            f"$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;$s.SelectVoice('{voice}');"
            f"$s.SetOutputToWaveFile('{(dest / f'turn{i}.wav').resolve().as_posix()}');"
            f"$s.Speak('{text}');$s.Dispose()")
    ps.write_text("\n".join(lines) + "\n", encoding="utf-8")
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps)],
                   check=True, capture_output=True)


def _read(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, sr


def build(dest: Path, force: bool = False) -> dict:
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    meta = dest / "fixture.json"
    if meta.exists() and not force:
        return json.loads(meta.read_text(encoding="utf-8"))

    if force or not all((dest / f"turn{i}.wav").exists() for i in range(len(TURNS))):
        _synthesize(dest)

    parts: list[np.ndarray] = []
    words: list[dict] = []
    speaker_ids: list[int] = []
    sr = 22050
    cursor = 0.0
    for i, (voice, text) in enumerate(TURNS):
        x, sr = _read(dest / f"turn{i}.wav")
        if i:
            parts.append(np.zeros(int(sr * GAP_S), dtype=np.float32))
            cursor += GAP_S
        span = len(x) / sr
        tokens = text.split()
        total = sum(len(t) for t in tokens)
        inner = 0.0
        for tok in tokens:
            dur = span * len(tok) / total
            words.append({"word": tok, "start": round(cursor + inner, 3),
                          "end": round(cursor + inner + dur, 3)})
            speaker_ids.append(EXPECTED_SPEAKER[voice])
            inner += dur
        parts.append(x)
        cursor += span

    audio = np.concatenate(parts)
    wav_path = dest / "two_speakers.wav"
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())

    data = {"wav": str(wav_path), "words": words, "speaker_ids": speaker_ids,
            "duration_s": round(len(audio) / sr, 2),
            "voices": [v for v, _ in TURNS]}
    meta.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def accuracy(word_speakers: list[int], expected: list[int]) -> float:
    """Akurasi setelah memetakan label prediksi → label harapan mayoritas (label bebas urutan)."""
    mapping: dict[int, int] = {}
    for want in (0, 1):
        counts: dict[int, int] = {}
        for pred, exp in zip(word_speakers, expected):
            if exp == want:
                counts[pred] = counts.get(pred, 0) + 1
        if counts:
            mapping[max(counts, key=counts.get)] = want
    hit = sum(1 for pred, exp in zip(word_speakers, expected) if mapping.get(pred) == exp)
    return hit / max(1, len(expected))


if __name__ == "__main__":
    out = build(Path(sys.argv[1] if len(sys.argv) > 1 else "work/t8_fixture"))
    print(f"{out['duration_s']}s, {len(out['words'])} kata, wav={out['wav']}")
