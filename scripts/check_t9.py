"""scripts/check_t9.py — cek T9 (terjemahan subtitle). Exit 0 kalau lulus.

Uji nyata tanpa 9Router: server LLM tiruan (stdlib) yang meniru 9Router, jadi jalur
batch/retry/QA/cache benar-benar dieksekusi. Yang diperiksa: timing kata tidak bergeser
1 ms pun, istilah glosarium tidak diterjemahkan, panggilan kedua memakai cache (tanpa
request baru), baris > 42 karakter dikirim ulang dengan instruksi "lebih padat" lalu
ditandai, render dua bahasa benar-benar dibakar ffmpeg (bukti PNG), dan placeholder
jujur saat router mati.
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "chopify"))

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
import subtitle_burn  # noqa: E402

PID = "f9e8d7c6b5"        # 10 hex, cocok dengan PID_RE server
SLUG = "clip_001"
PDIR = ROOT / "work" / PID
CDIR = ROOT / "clips" / PID
EVID = ROOT / "docs" / "evidence" / "T9" / "after"
WORDS = ["Halo", "eee", "semua", "apa", "ya", "hari", "Mixue", "enak", "sekali",
         "Koperasi", "Merah", "Putih", "kita", "bahas", "captions", "biar", "rapi",
         "di", "video", "ini"]
SRC = ROOT / "frontend" / "src"
CALLS: list[str] = []
fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def read(path):
    p = pathlib.Path(path)
    return p.read_text(encoding="utf-8") if p.is_file() else ""


class StubRouter(BaseHTTPRequestHandler):
    """9Router tiruan: cukup untuk /chat/completions, mencatat tiap request."""

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        req = json.loads(self.rfile.read(n) or b"{}")
        user = str(req["messages"][-1]["content"])
        CALLS.append(user)
        items = json.loads(re.search(r"\[\{.*\}\]", user, re.DOTALL).group(0))
        dense = "lebih padat" in user
        out = []
        for it in items:
            i, text = int(it["i"]), str(it["text"])
            if i == 1:
                # baris yang selalu panjang: harus dikirim ulang "lebih padat" lalu ditandai
                text = f"baris ini sengaja panjang {'sekali ' if dense else ''}{text} dan terus panjang melewati batas"
            elif i == 2 and "[[" in text:
                # token glosarium dihapus model: translate.py wajib memulihkan istilahnya
                text = text.replace("[[1]]", "?")
            else:
                text = f"{text} (en)"
            out.append({"i": i, "text": text})
        body = json.dumps({"choices": [{"message": {"content": json.dumps(out)}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def build_project():
    shutil.rmtree(PDIR, ignore_errors=True)
    shutil.rmtree(CDIR, ignore_errors=True)
    PDIR.mkdir(parents=True)
    (CDIR / "raw").mkdir(parents=True)
    (PDIR / "project.json").write_text(json.dumps({
        "title": "Uji terjemahan T9", "created_at": 1,
        "render_prefs": {"subtitle_lang": "", "subtitle_dual": False,
                         "subtitle_style": dict(subtitle_burn.DEFAULT_STYLE)},
    }, ensure_ascii=False), encoding="utf-8")
    (PDIR / "transcript.json").write_text(json.dumps({
        "language": "id", "model": "medium", "duration": 10.0,
        "words": [{"word": w, "start": i * 0.5, "end": i * 0.5 + 0.45}
                  for i, w in enumerate(WORDS)],
    }, ensure_ascii=False), encoding="utf-8")
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=#1b1b1b:s=320x568:r=25",
                    "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    str(CDIR / "raw" / f"{SLUG}.mp4")], check=True, capture_output=True)
    # kata yang dipakai caption klip (bertahap, timing absolut)
    (CDIR / f"{SLUG}.words.json").write_text(json.dumps({
        "language": "id", "duration": 10.0, "model": "stub",
        "words": [{"word": w, "start": round(i * 0.5, 3), "end": round(i * 0.5 + 0.45, 3)}
                  for i, w in enumerate(WORDS)],
    }, ensure_ascii=False, indent=2), encoding="utf-8")


stub = ThreadingHTTPServer(("127.0.0.1", 0), StubRouter)
threading.Thread(target=stub.serve_forever, daemon=True).start()
STUB_URL = f"http://127.0.0.1:{stub.server_address[1]}"

client = TestClient(server.app)
build_project()
words_file = CDIR / f"{SLUG}.words.json"
words_before = words_file.read_text(encoding="utf-8")

# arahkan modul ke 9Router tiruan
server.load_global_config = lambda: {          # noqa: E731
    "llm_endpoint": f"{STUB_URL}/v1", "llm_api_key": "stub",
    "translate_model": "stub/translate-model", "render_dir": str(ROOT / "work" / "_t9_render"),
}

try:
    # ---------------------------------------------------- 1. terjemahan + timing
    r1 = client.post(f"/api/clips/{SLUG}/translate", json={"lang": "en"})
    d1 = r1.json()
    chunks = subtitle_burn.chunk_words(json.loads(words_before)["words"], 3)
    ck("terjemahan jalan: 1 baris per potongan caption, kata sumber utuh",
       r1.status_code == 200 and d1.get("ok") is True and len(d1.get("lines") or []) == len(chunks)
       and words_file.read_text(encoding="utf-8") == words_before,
       f"{r1.status_code} {len(d1.get('lines') or [])} baris / {len(chunks)} potongan")

    # ---------------------------------------------------- 2. glosarium tidak diterjemahkan
    terms = ["Mixue", "Koperasi Merah Putih"]
    texts = [l["text"] for l in d1.get("lines") or []]
    gloss_ok = all(any(t in x for x in texts) for t in terms) and all("[[" not in x for x in texts)
    gloss_lines = [x for x in texts if any(t in x for t in terms)]
    ck("istilah glosarium tetap utuh walau model menghapus tokennya", gloss_ok,
       f"{len(gloss_lines)} baris: {gloss_lines[:2]}")

    # ---------------------------------------------------- 3. cache: panggilan kedua tanpa LLM
    calls_before = len(CALLS)
    r2 = client.post(f"/api/clips/{SLUG}/translate", json={"lang": "en"})
    d2 = r2.json()
    ck("panggilan kedua = cache hit, 0 request LLM baru",
       d2.get("cached") is True and len(CALLS) == calls_before
       and [l["text"] for l in d2.get("lines") or []] == texts,
       f"cached={d2.get('cached')} request {calls_before}→{len(CALLS)}")

    # ---------------------------------------------------- 4. QA baris panjang
    flagged = d1.get("flagged") or []
    dense_sent = any("lebih padat" in c for c in CALLS)
    ck("baris > 42 karakter dikirim ulang 'lebih padat' lalu ditandai",
       dense_sent and flagged == [1] and len(d1["lines"][1]["text"]) > 42,
       f"flagged={flagged} panjang={len(d1['lines'][1]['text'])} instruksi terkirim={dense_sent}")

    # ---------------------------------------------------- 5. render dua bahasa (ffmpeg nyata)
    EVID.mkdir(parents=True, exist_ok=True)
    dual = [l["text"] for l in d1["lines"]]
    style = dict(subtitle_burn.DEFAULT_STYLE)
    out_mp4 = EVID / "render-dua-bahasa.mp4"
    subtitle_burn.burn_subtitles(CDIR / "raw" / f"{SLUG}.mp4", json.loads(words_before)["words"],
                                 style, out_mp4, 320, 568, dual_lines=dual)
    ass = subtitle_burn.build_caption_ass(json.loads(words_before)["words"], 10.0,
                                          EVID / "cek.ass", 320, 568, style, dual_lines=dual)
    ass_text = read(ass)
    lines_ass = [l for l in ass_text.splitlines() if l.startswith("Dialogue:")]
    dual_count = [len(re.findall(r"\\N", l)) for l in lines_ass]
    fs = max(10, round(subtitle_burn.resolved(style, 568)["font_size"] * subtitle_burn.DUAL_SCALE))
    src_words = json.loads(words_before)["words"]
    timing_ok = all(l.split(",")[1] == subtitle_burn.ass_time(src_words[i]["start"])
                    for i, l in enumerate(lines_ass))
    frame = EVID / "render-dua-bahasa.png"
    subprocess.run(["ffmpeg", "-y", "-ss", "1.0", "-i", str(out_mp4), "-frames:v", "1", str(frame)],
                   check=True, capture_output=True)
    (EVID / "cek.ass").unlink(missing_ok=True)
    ck("render dua bahasa: maks 1 baris kedua/potongan, 80% ukuran, timing asli",
       out_mp4.exists() and frame.exists() and max(dual_count) == 1
       and f"\\fs{fs}" in ass_text and timing_ok,
       f"{len(lines_ass)} event, \\N per baris maks {max(dual_count)}, fs={fs}, frame={frame.name}")

    # ---------------------------------------------------- 6. placeholder router mati
    server.ninerouter_reachable = lambda timeout=1.5: False   # noqa: E731
    r3 = client.post(f"/api/clips/{SLUG}/translate", json={"lang": "ja", "force": True})
    d3 = r3.json()
    opts = client.get("/api/options").json()
    ck("router mati → 200 {ok:false,reason,hint} + options.translate.ok false",
       r3.status_code == 200 and d3.get("ok") is False
       and d3.get("reason") == "9Router tidak merespons" and bool(d3.get("hint"))
       and opts["translate"]["ok"] is False,
       f"{r3.status_code} {str(d3)[:80]}")
    server.ninerouter_reachable = lambda timeout=1.5: True    # noqa: E731

    # ---------------------------------------------------- 7. parameter export subtitle_lang
    ck("param export subtitle_lang: dual:id+en valid, kode asing → 400",
       server._parse_subtitle_lang("dual:id+en") == ("en", True)
       and server._parse_subtitle_lang("ja") == ("ja", False)
       and client.post("/api/export", json={"clip_id": SLUG, "resolution": "720p",
                                            "subtitle_lang": "xx"}).status_code == 400,
       str(server._parse_subtitle_lang("dual:id+en")))

    # ---------------------------------------------------- 8. aturan keras
    touched = [ROOT / "translate.py", ROOT / "server.py", ROOT / "chopify" / "subtitle_burn.py",
               ROOT / "chopify" / "render_clips.py", SRC / "api.js",
               SRC / "components" / "ToolPanel.jsx", SRC / "components" / "StudioView.jsx"]
    dark = [p.name for p in touched if re.search(r"dark:|bg-dark-|bg-black|neon|gradient", read(p))]
    junk = [p.name for p in touched if re.search(r"console\.log|TODO|FIXME", read(p))]
    ck("light theme + tanpa console.log/TODO di berkas yang disentuh", not dark and not junk,
       ",".join(dark + junk))
finally:
    stub.shutdown()
    shutil.rmtree(PDIR, ignore_errors=True)
    shutil.rmtree(CDIR, ignore_errors=True)

print()
if fails:
    print(f"GAGAL {len(fails)}: " + "; ".join(fails))
    sys.exit(1)
print("SEMUA CEK T9 LULUS")
