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
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

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
    "subtitle_lang": "",                # T9: bahasa target terjemahan
    "subtitle_dual": False,             # T9: baris 2 = terjemahan
    "layout": "center",                 # T12: contoh susunan aktif supaya terlihat di screenshot
    "bg_fill": "blur",                  # T12: blur | color | black
    "bg_color": "#4822A5",              # T12: dipakai saat bg_fill="color"
    "offset_y": 0,                      # T12: -30..30 (% tinggi frame)
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
# T9: contoh terjemahan id→en per kata, dipakai endpoint /api/clips/<id>/translate di mock
EN_WORDS = {"Halo": "Hello", "eee": "uh", "semua": "everyone", "apa": "what", "ya": "right",
            "hari": "day", "ini": "this", "gitu": "like that", "kita": "we", "bahas": "cover",
            "captions": "captions", "biar": "so", "rapi": "neat"}
TRANSLATE_MODEL = "ninerouter/T-SOTA/claude-sonnet-5"
GLOSSARY_TEXT = "# Satu istilah per baris.\nKoperasi Merah Putih\nMixue\nCakung\nMio J\n"
ROOT = Path(__file__).resolve().parent
WER_SAMPLE = ROOT / "data" / "wer_sample.json"

# T11: brand kit contoh supaya tab Brand + logo di stage bisa dinilai visual (tanpa file asli)
BRAND = {
    "logo_path": "logo-mock.svg", "logo_url": "/brand/logo-mock.svg",
    "color_primary": "#FFFFFF", "color_secondary": "#4822A5", "font": "Impact",
    "logo_corner": "br", "logo_size_pct": 8,
    "intro_path": "", "intro_url": None, "outro_path": "", "outro_url": None,
}
BRAND_FONTS = ["Arial Black", "Impact", "Verdana"]
BRAND_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">'
    '<rect x="4" y="4" width="152" height="152" rx="34" fill="none" stroke="#4822A5" stroke-width="12"/>'
    '<path d="M44 46 L80 118 L116 46" fill="none" stroke="#4822A5" stroke-width="16" '
    'stroke-linecap="round" stroke-linejoin="round"/></svg>'
)
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


def translate_payload(clip_id, lang):
    """Baris terjemahan contoh (id→en), dipotong 3 kata seperti caption asli."""
    chunks = [WORDS[i:i + 3] for i in range(0, len(WORDS), 3)]
    lines, per_line = [], 3
    for i, grp in enumerate(chunks):
        text = " ".join(EN_WORDS.get(w[0], w[0]) for w in grp)
        lines.append({"i": i, "source": " ".join(w[0] for w in grp), "text": text,
                      "flagged": len(text) > 42})
    return {
        "ok": True, "project_id": PROJECTS[0]["id"], "clip_id": clip_id, "lang": lang,
        "source_lang": "id", "model": TRANSLATE_MODEL, "per_line": per_line,
        "lines": lines, "flagged": [l["i"] for l in lines if l["flagged"]],
        "created_at": 1792770000, "cached": False,
    }

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

def load_broll_index():
    """Index b-roll asli kalau ada (hasil `broll_index.py`), kalau tidak → empty state."""
    if os.environ.get("MOCK_NO_BROLL") == "1":
        return {"ok": True, "dir": "data/broll", "count": 0, "items": [], "scanned_at": 0,
                "scanned_ms": 12, "hint": "Folder b-roll masih kosong. Taruh video di data/broll."}
    try:
        data = json.loads((ROOT / "data" / "broll" / "index.json").read_text(encoding="utf-8-sig"))
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data
    except Exception:
        pass
    return {"ok": True, "dir": "data/broll", "count": 0, "items": [], "scanned_at": 0,
            "scanned_ms": 0, "hint": "Folder b-roll masih kosong. Taruh video di data/broll."}

def broll_payload():
    """Index + 5 saran (mock: item pertama dianggap paling cocok) untuk review UI."""
    data = load_broll_index()
    items = data.get("items") or []
    suggestions = [dict(it, score=len(items) - i, matched_tags=(it.get("tags") or [])[:2])
                   for i, it in enumerate(items[:5])]
    return {"ok": True, "dir": data.get("dir") or "data/broll", "count": len(items), "items": items,
            "scanned_at": data.get("scanned_at"), "scanned_ms": data.get("scanned_ms"),
            "suggestions": suggestions, **({"hint": data["hint"]} if not items and data.get("hint") else {})}

def insert_mock_broll(index):
    """Tambah satu item b-roll ke track 2 supaya kartu timeline + tombolnya terlihat."""
    items = load_broll_index().get("items") or []
    if not items:
        return
    src = items[min(1, len(items) - 1)]
    TIMELINE["tracks"][1]["items"].append({
        "id": f"broll-mock-{index}", "kind": "broll",
        "start_ms": 33_600 + index * 500, "end_ms": 36_100 + index * 500,
        "payload": {"src": src["path"], "name": src["name"],
                    "tags": src.get("tags") or [], "opacity": 1.0}})

insert_mock_broll(0)   # contoh item b-roll di track Teks supaya tombol hapus/geser terlihat


# T13: antrian posting contoh — jadwal relatif ke waktu mock jalan, jadi kalender selalu terisi
POST_PLATFORM_LABELS = {"tiktok": "TikTok", "reels": "Instagram Reels", "shorts": "YouTube Shorts"}
POST_CAPTION_MAX = 2200
POST_OAUTH_HINT = ("Isi kredensial platform (TIKTOK_CLIENT_ID, IG_CLIENT_ID, YT_CLIENT_ID + secret) "
                   "lalu hubungkan akun lewat izin OAuth.")

def _seed_post_queue():
    now = int(time.time() * 1000)
    day = 86_400_000
    return {"next_id": 3, "items": [
        {"id": 1, "project_id": PROJECTS[0]["id"], "clip_id": "clip_01", "platform": "tiktok",
         "caption": "Kenapa Hook 3 Detik Menentukan Segalanya\n\n#hook #detik #menentukan #segalanya",
         "scheduled_at": now + 2 * 3_600_000, "status": "queued", "error": None, "created_at": now},
        {"id": 2, "project_id": PROJECTS[0]["id"], "clip_id": "clip_02", "platform": "reels",
         "caption": "Ritme Potongan yang Bikin Orang Bertahan\n\n#ritme #potongan #bertahan #orang",
         "scheduled_at": now + 3 * day, "status": "queued", "error": None, "created_at": now},
    ]}

POST_QUEUE = _seed_post_queue()

def post_platforms():
    return [{"id": key, "label": label, "connected": False,
             "reason": "Belum terhubung", "hint": POST_OAUTH_HINT}
            for key, label in POST_PLATFORM_LABELS.items()]

def post_caption_payload(clip_id, platform):
    clip = next((c for c in CLIPS if c["slug"] == clip_id), CLIPS[0])
    title = clip.get("title") or clip["slug"]
    tags, seen = [], set()
    for token in re.findall(r"\w+", title):
        key = token.lower()
        if len(token) < 4 or key in seen:
            continue
        seen.add(key)
        tags.append(f"#{key}")
        if len(tags) == 5:
            break
    caption = f"{title.strip()}\n\n{' '.join(tags)}".strip()[:POST_CAPTION_MAX]
    return {"ok": True, "clip_id": clip_id, "platform": platform,
            "label": POST_PLATFORM_LABELS.get(platform, platform), "title": title,
            "hashtags": tags, "caption": caption, "length": len(caption), "max_chars": POST_CAPTION_MAX}

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
                               "translate": {
                                   "ok": os.environ.get("MOCK_ROUTER_DOWN") != "1",
                                   "reason": "9Router tidak merespons" if os.environ.get("MOCK_ROUTER_DOWN") == "1" else "",
                                   "hint": "Jalankan 9Router lalu muat ulang halaman",
                                   "model": TRANSLATE_MODEL,
                                   "langs": [{"code": "id", "label": "Indonesia"},
                                             {"code": "en", "label": "Inggris"},
                                             {"code": "zh", "label": "Mandarin"},
                                             {"code": "ja", "label": "Jepang"},
                                             {"code": "ar", "label": "Arab"},
                                             {"code": "es", "label": "Spanyol"}],
                                   "max_chars": 42, "max_lines": 2},
                               "models": ["ocf/deepseek-v4.1-flash-free", "nara/glm-5.3", "cbai/kimi-k2.7"],
                               "clip_lengths": [30, 45, 60, 90],
                               "aspect_ratios": ["9:16", "1:1", "4:5", "16:9"],
                               "capabilities": {"overlay": True,
                                                "blur": os.environ.get("MOCK_NO_BLUR") != "1"},
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
        if p == "/api/post/status":
            items = POST_QUEUE["items"]
            return self._json({"ok": True, "platforms": post_platforms(),
                               "queue": {"total": len(items),
                                         "queued": sum(1 for i in items if i["status"] == "queued")}})
        if p == "/api/post/queue":
            qs = parse_qs(urlparse(self.path).query)
            pid = (qs.get("project_id") or [None])[0]
            items = sorted([i for i in POST_QUEUE["items"] if not pid or i["project_id"] == pid],
                           key=lambda i: i["scheduled_at"])
            return self._json({"ok": True, "items": items, "server_time_ms": int(time.time() * 1000),
                               "platforms": post_platforms()})
        if p == "/api/post/caption":
            qs = parse_qs(urlparse(self.path).query)
            return self._json(post_caption_payload((qs.get("clip_id") or [CLIPS[0]["slug"]])[0],
                                                  (qs.get("platform") or ["tiktok"])[0]))
        if p.startswith("/api/analytics/"):
            return self._json({"ok": False, "reason": "Belum tersedia",
                               "detail": "Belum terhubung ke akun platform",
                               "hint": POST_OAUTH_HINT, "metrics": None, "days": []})
        if p == "/api/brand":
            return self._json({"ok": True, "configured": True, "brand": BRAND,
                               "fonts": BRAND_FONTS, "corners": ["tl", "tr", "bl", "br"],
                               "hint": "Unggah logo transparan (PNG) atau simpan warna, lalu render ulang klip."})
        if p == "/brand/logo-mock.svg":
            data = BRAND_SVG.encode()
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if p == "/api/broll/index":
            return self._json(broll_payload())
        if p.startswith("/broll/"):
            f = (ROOT / "data" / "broll" / p[len("/broll/"):]).resolve()
            if f.is_file() and ROOT in f.parents:
                data = f.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", mimetypes.guess_type(f.name)[0] or "image/jpeg")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            return self._json({"error": "not found"}, 404)
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
        if p == "/api/post/queue":
            when = int(body.get("scheduled_at") or 0)
            platform = (body.get("platform") or "").lower()
            clip_id = (body.get("clip_id") or "").strip()
            if platform not in POST_PLATFORM_LABELS:
                return self._json({"ok": False, "detail": "Platform tidak dikenal."}, 400)
            if not clip_id:
                return self._json({"ok": False, "detail": "Klip belum dipilih"}, 400)
            if when <= int(time.time() * 1000):
                return self._json({"ok": False, "detail": "Waktu jadwal harus di masa depan"}, 400)
            item = {"id": POST_QUEUE["next_id"], "project_id": body.get("project_id") or PROJECTS[0]["id"],
                    "clip_id": clip_id, "platform": platform,
                    "caption": (body.get("caption") or post_caption_payload(clip_id, platform)["caption"])[:POST_CAPTION_MAX],
                    "scheduled_at": when, "status": "queued", "error": None,
                    "created_at": int(time.time() * 1000)}
            POST_QUEUE["next_id"] += 1
            POST_QUEUE["items"].append(item)
            return self._json({"ok": True, "item": item})
        if p.endswith("/timeline"):
            tracks = {}
            for it in body.get("items") or []:
                tracks.setdefault(int(it.get("track") or 1), []).append(it)
            TIMELINE["tracks"] = [{"track": t, "items": tracks.get(t, [])} for t in (1, 2, 3)]
            return self._json({"ok": True, "items": sum(len(v) for v in tracks.values())})
        if p == "/api/brand":
            for key in ("color_primary", "color_secondary", "font", "logo_corner", "logo_size_pct"):
                if key in body:
                    BRAND[key] = body[key]
            return self._json({"ok": True, "configured": True, "brand": BRAND,
                               "fonts": BRAND_FONTS, "corners": ["tl", "tr", "bl", "br"]})
        if p == "/api/broll/refresh":
            return self._json(broll_payload())
        if p.endswith("/translate"):
            clip_id = p.split("/")[3] if p.startswith("/api/clips/") else "clip_01"
            return self._json(translate_payload(clip_id, (body.get("lang") or "en").lower()))
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

    def do_DELETE(self):
        p = urlparse(self.path).path
        m = re.match(r"^/api/post/queue/(\d+)$", p)
        if m:
            qid = int(m.group(1))
            before = len(POST_QUEUE["items"])
            POST_QUEUE["items"] = [i for i in POST_QUEUE["items"] if i["id"] != qid]
            if len(POST_QUEUE["items"]) == before:
                return self._json({"ok": False, "detail": f"Jadwal {qid} tidak ditemukan"}, 404)
            return self._json({"ok": True, "removed": qid})
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
PORT = int(os.environ.get("MOCK_PORT") or 8005)
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
