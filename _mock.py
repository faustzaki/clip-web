"""Mock API + static server so josjis's real UI can be rendered and judged visually.

Serves the built frontend from frontend/dist and answers the read-only endpoints
with realistic data (poster/video taken from the harvested Vizard assets).
No writes, no jobs — purely for UI review.
"""
import json
import mimetypes
import os
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

DIST = Path(__file__).resolve().parent / "frontend" / "dist"
ASSETS = Path(__file__).resolve().parent / "work" / "assets"
MEDIA = Path(__file__).resolve().parent / "_mockmedia"
MEDIA.mkdir(exist_ok=True)
for src, dst in ((ASSETS / "snapshot.jpg", "cover.jpg"), (Path(r"C:/Users/faust/Downloads/clipper_re/work/exported720.mp4"), "clip.mp4")):
    if src.exists() and not (MEDIA / dst).exists():
        shutil.copy(src, MEDIA / dst)

PROJECTS = [
    {"id": "a1b2c3d4e5", "title": "Podcast Bisnis — Episode 42", "source_type": "youtube",
     "source_url": "https://youtube.com/watch?v=xxxx", "created_at": 1792760000, "updated_at": 1792770000,
     "has_source": True, "has_transcript": True, "duration": 1840.5, "candidate_count": 14,
     "clip_count": 3, "cover_url": "/mock/cover.jpg", "render_prefs": {}, "crops": {}},
    {"id": "f6g7h8i9j0", "title": "Webinar Marketing Q4", "source_type": "file",
     "source_url": None, "created_at": 1792650000, "updated_at": 1792700000,
     "has_source": True, "has_transcript": True, "duration": 900.0, "candidate_count": 8,
     "clip_count": 2, "cover_url": "/mock/cover.jpg", "render_prefs": {}, "crops": {}},
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
                               "clip_lengths": [30, 45, 60, 90]})
        if p == "/api/settings":
            return self._json({"base_url": "http://127.0.0.1:20128/v1", "model": "ocf/deepseek-v4.1-flash-free",
                               "api_key_set": True, "whisper_model": "small", "render_dir": "clips"})
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
        if p.startswith("/api/projects/") and p.endswith("/timeline"):
            dur, caps = 82_200, []
            for i in range(14):
                start = i * 5_600
                if start + 2_800 > dur:
                    break
                caps.append({"id": f"d2-{i}", "kind": "caption", "start_ms": start, "end_ms": start + 2_800,
                             "payload": {"text": f"Kalimat caption {i + 1}"}})
            return self._json({"duration_ms": dur, "tracks": [
                {"track": 1, "items": [{"id": "d1-0", "kind": "video", "start_ms": 0, "end_ms": dur, "payload": {}}]},
                {"track": 2, "items": caps},
                {"track": 3, "items": [{"id": "d3-0", "kind": "audio", "start_ms": 0, "end_ms": dur, "payload": {}}]},
            ]})
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

    def translate_path(self, path):
        p = urlparse(path).path
        if p.startswith("/api/"):
            return str(DIST / "__none__")
        return str(DIST / p.lstrip("/"))


os.chdir(DIST)
ThreadingHTTPServer(("127.0.0.1", 8005), H).serve_forever()
