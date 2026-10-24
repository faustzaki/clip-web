"""Mock API + static server so josjis's real UI can be rendered and judged visually.

Serves the built frontend from frontend/dist and answers the read-only endpoints
with realistic data (poster/video taken from the harvested Vizard assets).
No writes, no jobs — purely for UI review.
"""
import json
import mimetypes
import os
import re
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

DIST = Path(__file__).resolve().parent / "frontend" / "dist"
ASSETS = Path(__file__).resolve().parent / "work" / "assets"
MEDIA = Path(__file__).resolve().parent / "_mockmedia"

sys.path.insert(0, str(Path(__file__).resolve().parent / "chopify"))
import subtitle_burn  # noqa: E402  — registry preset asli, bukan salinan mock

CAPTION_PRESETS = [
    {"id": name, "label": preset.get("label") or name, "style": subtitle_burn.preset_style(name)}
    for name, preset in subtitle_burn.CAPTION_PRESETS.items()
]
PREFS = {
    "subtitles_enabled": True,
    "caption_preset": subtitle_burn.DEFAULT_CAPTION_PRESET,
    "subtitle_style": subtitle_burn.preset_style(subtitle_burn.DEFAULT_CAPTION_PRESET),
    "speaker_names_in_caption": True,   # T8: contoh toggle aktif supaya terlihat di screenshot
}
WORDS = [
    ("Halo", 0.4, 0.9), ("eee", 1.0, 1.3), ("semua", 1.4, 1.9),
    ("apa", 2.0, 2.3), ("ya", 2.3, 2.6), ("hari", 4.2, 4.7),
    ("ini", 4.8, 5.1), ("gitu", 5.2, 5.5), ("kita", 5.6, 6.0),
    ("bahas", 6.1, 6.5), ("captions", 6.6, 7.2), ("biar", 8.9, 9.3),
    ("rapi", 9.4, 9.9),
]
# T8: diarisasi contoh — dua speaker hasil perkiraan (mesin uji tanpa pyannote/HF_TOKEN)
SPEAKERS = [
    {"id": 1, "label": "Host", "color_idx": 0, "confidence": "estimate"},
    {"id": 2, "label": "Narasumber", "color_idx": 1, "confidence": "estimate"},
]
SPEAKER_OF_WORD = {i: (1 if i < 6 else 2) for i in range(len(WORDS))}
DIARIZE_MODEL = {
    "ok": False,
    "reason": "Diarisasi model butuh pyannote.audio, HF_TOKEN (belum tersedia di mesin ini)",
    "hint": "py -3.13 -m pip install pyannote.audio lalu set HF_TOKEN HuggingFace",
}
LOW_CONF_IDX = {1, 7, 11}   # kata contoh dengan keyakinan rendah → underline kuning di pratinjau
GLOSSARY_TEXT = "# Satu istilah per baris.\nKoperasi Merah Putih\nMixue\nCakung\nMio J\n"
ROOT = Path(__file__).resolve().parent
WER_SAMPLE = ROOT / "data" / "wer_sample.json"
NON_SPEECH = re.compile(r"\[[^\]]*\]|\([^)]*\)", re.UNICODE)


def _wer_tokens(text):
    """Normalisasi sama seperti server: buang tag non-ucapan + tanda baca, kecilkan huruf."""
    clean = NON_SPEECH.sub(" ", text or "")
    return re.sub(r"[^\w\s]", " ", clean, flags=re.UNICODE).lower().split()


def _wer(reference, hypothesis):
    ref, hyp = _wer_tokens(reference), _wer_tokens(hypothesis)
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    errors = prev[-1]
    return {"words": len(ref), "errors": errors,
            "wer": round(errors / len(ref), 4) if ref else None}


def accuracy_payload():
    """Pratinjau mock: WER asli dihitung dari data/wer_sample.json (ambil angka nyata, bukan salinan)."""
    if not WER_SAMPLE.is_file():
        return {"ok": False, "reason": "Sampel akurasi belum tersedia",
                "hint": "Siapkan data/wer_sample.json: 60 detik transkrip manual + teks pembanding"}
    sample = json.loads(WER_SAMPLE.read_text(encoding="utf-8-sig"))
    reference = sample.get("reference") or ""
    rows = []
    for key, fallback in (("baseline", "Sebelum"), ("after", "Sesudah")):
        entry = sample.get(key) or {}
        rows.append({"id": key, "label": entry.get("label") or fallback,
                     **_wer(reference, entry.get("text"))})
    return {"ok": True, "source": sample.get("source"), "window": sample.get("window"),
            "reference_note": sample.get("reference_note"), "measured_at": sample.get("measured_at"),
            "rows": rows,
            "improvement": round((rows[0]["wer"] or 0) - (rows[1]["wer"] or 0), 4)}
MEDIA.mkdir(exist_ok=True)
for src, dst in ((ASSETS / "snapshot.jpg", "cover.jpg"), (Path(r"C:/Users/faust/Downloads/clipper_re/work/exported720.mp4"), "clip.mp4")):
    if src.exists() and not (MEDIA / dst).exists():
        shutil.copy(src, MEDIA / dst)

PROJECTS = [
    {"id": "a1b2c3d4e5", "title": "Podcast Bisnis — Episode 42", "source_type": "youtube",
     "source_url": "https://youtube.com/watch?v=xxxx", "created_at": 1792760000, "updated_at": 1792770000,
     "has_source": True, "has_transcript": True, "duration": 1840.5, "candidate_count": 14,
     "clip_count": 3, "cover_url": "/mock/cover.jpg", "render_prefs": PREFS, "crops": {}},
    {"id": "f6g7h8i9j0", "title": "Webinar Marketing Q4", "source_type": "file",
     "source_url": None, "created_at": 1792650000, "updated_at": 1792700000,
     "has_source": True, "has_transcript": True, "duration": 900.0, "candidate_count": 8,
     "clip_count": 2, "cover_url": "/mock/cover.jpg", "render_prefs": PREFS, "crops": {}},
]

CLIPS = [
    {"slug": "clip_01", "name": "clip_01.mp4", "url": "/mock/clip.mp4", "raw_url": "/mock/clip.mp4",
     "poster_url": "/mock/cover.jpg", "subtitled": True, "score": 9.4, "candidate_index": 0, "duration": 42.6,
     "title": "Kenapa Hook 3 Detik Menentukan Segalanya"},
    {"slug": "clip_02", "name": "clip_02.mp4", "url": "/mock/clip.mp4", "raw_url": "/mock/clip.mp4",
     "poster_url": "/mock/cover.jpg", "subtitled": True, "score": 8.8, "candidate_index": 1, "duration": 58.0,
     "title": "Ritme Potongan yang Bikin Orang Bertahan"},
    {"slug": "clip_03", "name": "clip_03.mp4", "url": "/mock/clip.mp4", "raw_url": "/mock/clip.mp4",
     "poster_url": "/mock/cover.jpg", "subtitled": False, "score": 7.2, "candidate_index": 2, "duration": 30.5,
     "title": "Caption: Senjata Nonton Tanpa Suara"},
]


def build_timeline():
    dur, caps = 82_200, []
    for i in range(14):
        start = i * 5_600
        if start + 2_800 > dur:
            break
        caps.append({"id": f"d2-{i}", "kind": "caption", "start_ms": start, "end_ms": start + 2_800,
                     "payload": {"text": f"Kalimat caption {i + 1}"}})
    return {"duration_ms": dur, "tracks": [
        {"track": 1, "items": [{"id": "d1-0", "kind": "video", "start_ms": 0, "end_ms": dur, "payload": {}}]},
        {"track": 2, "items": caps},
        {"track": 3, "items": [{"id": "d3-0", "kind": "audio", "start_ms": 0, "end_ms": dur, "payload": {}}]},
    ]}


TIMELINE = build_timeline()


def mock_zoom_keyframes():
    """Kotak zoom mock: zigzag 9:16 (w 0.317, tinggi penuh) — cukup untuk menguji UI."""
    return [{"t": round(0.2 * i, 2),
             "x": round(0.34 + 0.31 * (1 if i % 8 < 4 else -1) * (i % 8) / 8, 5),
             "y": 0.0, "w": 0.317, "h": 1.0} for i in range(20)]


class H(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript",
                      ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json"}

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/api/health":
            return self._json({"status": "ok", "ffmpeg": True, "yunet": True, "ninerouter": True})
        if p == "/api/options":
            return self._json({"languages": [{"code": "id", "label": "Indonesia"}, {"code": "en", "label": "English"}],
                               "models": ["ocf/deepseek-v4.1-flash-free", "nara/glm-5.3", "cbai/kimi-k2.7"],
                               "clip_lengths": [30, 45, 60, 90],
                               "aspect_ratios": ["9:16", "1:1", "4:5", "16:9"],
                               "asr_models": [
                                   {"id": "medium", "label": "Medium — default, akurat & hemat waktu"},
                                   {"id": "large-v3", "label": "Large v3 — paling akurat, ~2-4x lebih lama di CPU"},
                                   {"id": "small", "label": "Small — cepat, akurasi lebih rendah"},
                                   {"id": "base", "label": "Base — paling cepat, untuk pratinjau"},
                                   {"id": "auto", "label": "Auto — large-v3 kalau disk ≥ 10 GB bebas, selain medium"},
                               ],
                               "caption_presets": CAPTION_PRESETS})
        if p == "/api/settings":
            return self._json({"base_url": "http://127.0.0.1:20128/v1", "model": "ocf/deepseek-v4.1-flash-free",
                               "api_key_set": True, "whisper_model": "medium", "asr_disk_free_gb": 23.5,
                               "render_dir": "clips"})
        if p == "/api/glossary":
            return self._json({"ok": True, "path": "data/glossary.txt", "text": GLOSSARY_TEXT,
                               "terms": [t for t in GLOSSARY_TEXT.splitlines() if t.strip() and not t.startswith("#")]})
        if p == "/api/accuracy":
            return self._json(accuracy_payload())
        if p == "/api/projects":
            return self._json({"projects": PROJECTS})
        if p.startswith("/api/projects/") and p.endswith("/state"):
            pid = p.split("/")[3]
            proj = next((x for x in PROJECTS if x["id"] == pid), PROJECTS[0])
            return self._json({"project": proj,
                               "video": {"name": "clip.mp4", "url": "/mock/clip.mp4", "width": 1280, "height": 720, "size_mb": 1.28},
                               "transcript": {"language": "id", "duration": 82.2, "words_count": 148, "model": "small"},
                               "candidates": CLIPS, "ingest": {"status": "done", "stage": "render", "percent": 100, "message": ""},
                               "clips": CLIPS})
        if p.startswith("/api/projects/") and "/clips" in p:
            return self._json({"clips": CLIPS})
        if p.startswith("/api/projects/") and p.endswith("/transcript"):
            return self._json({"words": [
                {"idx": i, "word": w, "start_ms": int(s * 1000), "end_ms": int(e * 1000), "deleted": 0,
                 "avg_logprob": -1.6 if i in LOW_CONF_IDX else -0.24,
                 "edited": 0, "needs_check": i in LOW_CONF_IDX,
                 "speaker": SPEAKER_OF_WORD.get(i)}
                for i, (w, s, e) in enumerate(WORDS)
            ], "language": "id", "model": "medium", "duration_ms": 12_000, "check_threshold": -1.0,
                "speakers": SPEAKERS,
                "speaker_names_in_caption": bool(PREFS.get("speaker_names_in_caption")),
                "diarize_model": DIARIZE_MODEL})
        if p.startswith("/api/projects/") and p.endswith("/timeline"):
            return self._json(TIMELINE)
        if p.startswith("/mock/"):
            f = MEDIA / p.split("/")[-1]
            if f.exists():
                data = f.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", mimetypes.guess_type(f.name)[0] or "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            return self._json({"error": "not found"}, 404)
        return super().do_GET()

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}") if n else {}
        except Exception:
            return {}

    def do_POST(self):
        p = urlparse(self.path).path
        body = self._body()
        if p.endswith("/transcript/word"):
            idx = int(body.get("idx") or 0)
            return self._json({"ok": True, "from_idx": idx, "count": 1,
                               "words": [{"idx": idx, "word": (body.get("text") or "").strip(),
                                          "start_ms": 0, "end_ms": 0}]})
        if p.endswith("/tighten"):
            return self._json({"ok": True, "saved_ms": 3200, "deleted": 3, "new_duration_ms": 8800,
                               "silence_ms": body.get("silence_ms", 400), "filler": bool(body.get("filler", True))})
        if p.endswith("/zoom-keyframes"):
            kfs = mock_zoom_keyframes()
            return self._json({"ok": True, "candidate_index": body.get("candidate_index", 0),
                               "aspect": "9:16", "zoom_manual": body.get("zoom_manual", 100),
                               "keyframes": kfs})
        if p.endswith("/timeline"):
            tracks = {}
            for it in body.get("items") or []:
                tracks.setdefault(int(it.get("track") or 1), []).append(it)
            TIMELINE["tracks"] = [{"track": t, "items": tracks.get(t, [])} for t in (1, 2, 3)]
            return self._json({"ok": True, "items": sum(len(v) for v in tracks.values())})
        if p.endswith("/render"):
            return self._json({"status": "ok", "clip": CLIPS[0]})
        if p.endswith("/diarize"):
            body_engine = (body.get("engine") or "heuristic").lower()
            if body_engine == "model" and not DIARIZE_MODEL["ok"]:
                return self._json({"ok": False, **DIARIZE_MODEL})
            return self._json({"ok": True, "engine": "heuristic", "confidence": "estimate",
                               "speakers": SPEAKERS, "words": len(WORDS), "segments": 4,
                               "duration_ms": 12_000, "duration_before_ms": 12_000, "note": ""})
        return self._json({"error": "not found"}, 404)

    def do_PATCH(self):
        p = urlparse(self.path).path
        body = self._body()
        m = re.match(r"^/api/speakers/(\d+)$", p)
        if m:
            sid = int(m.group(1))
            label = (body.get("label") or "").strip()
            if not label:
                return self._json({"ok": False, "reason": "Nama speaker tidak boleh kosong"}, 400)
            for sp in SPEAKERS:
                if sp["id"] == sid:
                    sp["label"] = label[:40]
                    return self._json({"ok": True, "speaker": sp})
            return self._json({"ok": False, "reason": f"Speaker {sid} tidak ditemukan"}, 404)
        return self._json({"error": "not found"}, 404)

    def do_PUT(self):
        p = urlparse(self.path).path
        body = self._body()
        if p == "/api/glossary":
            global GLOSSARY_TEXT
            GLOSSARY_TEXT = body.get("text") or ""
            return self._json({"ok": True, "path": "data/glossary.txt",
                               "terms": [t.strip() for t in GLOSSARY_TEXT.splitlines()
                                         if t.strip() and not t.strip().startswith("#")]})
        if p.endswith("/prefs"):
            PREFS.update(body.get("render_prefs") or {})
            return self._json({"status": "ok", "render_prefs": PREFS})
        return self._json({"error": "not found"}, 404)

    def translate_path(self, path):
        p = urlparse(path).path
        if p.startswith("/api/"):
            return str(DIST / "__none__")
        return str(DIST / p.lstrip("/"))


os.chdir(DIST)
ThreadingHTTPServer(("127.0.0.1", 8005), H).serve_forever()
