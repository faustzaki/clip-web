"""scripts/check_t7.py — cek T7 (akurasi transkripsi). Exit 0 kalau lulus.

  1) statis  : parameter ASR di core_engine + chopify/download_and_transcribe.py, endpoint T7 di
               server.py, UI kata ragu/edit di TranscriptPanel + SettingsModal, aturan keras
               (light theme, tanpa console.log/TODO)
  2) backend : TestClient tanpa server hidup — /api/glossary (GET+PUT), /transcript needs_check,
               POST /transcript/word (timing proporsional + persist), /api/accuracy (WER turun),
               placeholder saat sampel/transkrip absen
  3) angka   : data/wer_sample.json wajib memuat WER sebelum > sesudah + waktu ukur

Jalankan dari root repo: python scripts/check_t7.py
"""
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "chopify"))

from fastapi.testclient import TestClient  # noqa: E402

import core_engine  # noqa: E402
import server  # noqa: E402

SRC = ROOT / "frontend" / "src"
PID = "abcdef1234"        # harus cocok PID_RE server (10 hex)
PDIR = ROOT / "work" / PID
fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def read(path):
    p = pathlib.Path(path)
    return p.read_text(encoding="utf-8") if p.is_file() else ""


client = TestClient(server.app)

# ---------------------------------------------------------------- statis
core_src = read(ROOT / "core_engine.py")
cli_src = read(ROOT / "chopify" / "download_and_transcribe.py")
srv_src = read(ROOT / "server.py")
panel_src = read(SRC / "components" / "TranscriptPanel.jsx")
settings_src = read(SRC / "components" / "SettingsModal.jsx")
api_src = read(SRC / "api.js")

ck("core_engine: default model medium", 'DEFAULT_ASR_MODEL = "medium"' in core_src)
ck("core_engine: beam_size 5", "ASR_BEAM_SIZE = 5" in core_src)
ck("core_engine: vad min_silence 400 ms", "ASR_VAD_MIN_SILENCE_MS = 400" in core_src)
ck("core_engine: bahasa dikunci id", 'ASR_LANGUAGE = "id"' in core_src and "else ASR_LANGUAGE" in core_src)
ck("core_engine: condition_on_previous_text=False", "condition_on_previous_text=False" in core_src)
ck("core_engine: compute_type int8", "ASR_COMPUTE_TYPE" in core_src and 'compute_type=ASR_COMPUTE_TYPE' in core_src)
ck("core_engine: word_timestamps", "word_timestamps=True" in core_src)
ck("core_engine: avg_logprob per kata", "math.log(max(float(w.probability)" in core_src)
ck("core_engine: glosarium → initial_prompt", "def glossary_initial_prompt" in core_src
   and "initial_prompt=initial_prompt" in core_src)
ck("core_engine: auto upgrade ≥10 GB", "LARGE_MODEL_MIN_FREE_GB = 10.0" in core_src
   and "def resolve_model_size" in core_src)

ck("cli stage-1: parameter sama", all(s in cli_src for s in
   ('LANGUAGE = "id"', "BEAM_SIZE = 5", "VAD_MIN_SILENCE_MS = 400",
    "condition_on_previous_text=False", "glossary_prompt", "avg_logprob")))
ck("cli stage-1: model default medium", 'DEFAULT_MODEL = "medium"' in cli_src
   and 'default="medium"' in cli_src)

ck("server: route glossary", '@app.get("/api/glossary")' in srv_src and '@app.put("/api/glossary")' in srv_src)
ck("server: route edit kata", '@app.post("/api/projects/{project_id}/transcript/word")' in srv_src)
ck("server: route akurasi", '@app.get("/api/accuracy")' in srv_src)
ck("server: model dari setting", "def _asr_model_size" in srv_src and "payload.model_size or 'base'" not in srv_src
   and 'Form("base")' not in srv_src)
ck("server: ambang keyakinan -1.0", "CONFIDENCE_MIN_LOGPROB = -1.0" in core_src)

ck("panel: underline kuning #E0A800", "CHECK_UNDERLINE = '#E0A800'" in panel_src)
ck("panel: filter perlu dicek", "Hanya perlu dicek" in panel_src and "needs_check" in panel_src)
ck("panel: edit kata inline", "onEditWord" in panel_src and "commitEdit" in panel_src)
ck("panel: simpan dengan Enter", "e.key === 'Enter'" in panel_src)
ck("settings: tab Akurasi ASR", "Akurasi ASR" in settings_src and "handleSaveGlossary" in settings_src)
ck("api: fungsi T7", all(s in api_src for s in
   ("fetchGlossary", "updateGlossary", "editTranscriptWord", "fetchAccuracy")))

changed = [ROOT / "core_engine.py", ROOT / "chopify" / "download_and_transcribe.py",
           ROOT / "frontend" / "src" / "api.js", SRC / "components" / "TranscriptPanel.jsx",
           SRC / "components" / "SettingsModal.jsx", SRC / "hooks" / "useEditorState.js",
           SRC / "components" / "NewProjectView.jsx", SRC / "components" / "StudioView.jsx"]
bad_dark = [p.name for p in changed if re.search(r"dark:|bg-black|bg-dark-", read(p))]
bad_dbg = [p.name for p in changed if re.search(r"console\.log|TODO|FIXME", read(p))]
ck("light theme (tanpa dark:/bg-black)", not bad_dark, ",".join(bad_dark))
ck("tanpa console.log/TODO", not bad_dbg, ",".join(bad_dbg))

# ------------------------------------------------------- WER (unit, murni)
ck("WER identik = 0", server._wer("halo dunia", "halo dunia")["wer"] == 0)
ck("WER 1 dari 4 kata = 0.25", server._wer("a b c d", "a x c d")["wer"] == 0.25)
ck("WER abaikan tag non-ucapan", server._wer("[musik] halo dunia", "halo dunia")["wer"] == 0)
ck("WER abaikan tanda baca & huruf besar", server._wer("Halo, dunia!", "halo dunia")["wer"] == 0)

# ----------------------------------------------------------------- glosarium
glossary_backup = core_engine.GLOSSARY_FILE.read_text(encoding="utf-8") if core_engine.GLOSSARY_FILE.is_file() else None
try:
    res = client.get("/api/glossary")
    ck("GET /api/glossary 200", res.status_code == 200, str(res.status_code))
    ck("GET /api/glossary bentuk {ok,terms,text}", set(["ok", "terms", "text"]) <= set(res.json()))
    body = client.put("/api/glossary", json={"text": "# komentar\nKoperasi Merah Putih\n\nMixue\n"}).json()
    ck("PUT /api/glossary simpan 2 istilah", body.get("terms") == ["Koperasi Merah Putih", "Mixue"], str(body.get("terms")))
    ck("glosarium tersimpan di disk", "Mixue" in core_engine.GLOSSARY_FILE.read_text(encoding="utf-8"))
    prompt = core_engine.glossary_initial_prompt()
    ck("glosarium jadi initial_prompt", prompt is not None and "Koperasi Merah Putih" in prompt, str(prompt))
finally:
    if glossary_backup is not None:
        core_engine.GLOSSARY_FILE.write_text(glossary_backup, encoding="utf-8")

# ------------------------------------------------- model ASR dari setting
free = core_engine.disk_free_gb()
real_free = core_engine.disk_free_gb
core_engine.disk_free_gb = lambda path=None: 12.0
ck("auto + disk ≥10 GB → large-v3", core_engine.resolve_model_size("auto") == "large-v3")
core_engine.disk_free_gb = lambda path=None: 4.0
ck("auto + disk <10 GB → medium", core_engine.resolve_model_size("auto") == "medium")
core_engine.disk_free_gb = real_free
ck("model eksplisit dihormati", core_engine.resolve_model_size("base") == "base")
ck("_asr_model_size(None) = default medium",
   server._asr_model_size(None) in ("medium", "large-v3", "small", "base"), server._asr_model_size(None))

# ------------------------------------------------------ transkrip + edit kata
try:
    if PDIR.exists():
        shutil.rmtree(PDIR)
    PDIR.mkdir(parents=True)
    (PDIR / "project.json").write_text(json.dumps({"id": PID, "title": "cek T7"}), encoding="utf-8")
    transcript = {
        "language": "id", "duration": 4.0, "model": "medium",
        "segments": [{"start": 0.0, "end": 4.0, "text": "halo eee dunia ragu", "avg_logprob": -0.4}],
        "words": [
            {"word": "halo", "start": 0.0, "end": 1.0, "avg_logprob": -0.2},
            {"word": "eee", "start": 1.0, "end": 1.6, "avg_logprob": -1.6},
            {"word": "dunia", "start": 1.6, "end": 3.0, "avg_logprob": -0.3},
            {"word": "ragu", "start": 3.0, "end": 4.0, "avg_logprob": -2.2},
        ],
    }
    (PDIR / "transcript.json").write_text(json.dumps(transcript, ensure_ascii=False), encoding="utf-8")

    body = client.get(f"/api/projects/{PID}/transcript").json()
    ck("kata ragu ditandai needs_check", [w["needs_check"] for w in body["words"]] == [False, True, False, True],
       str([w["needs_check"] for w in body["words"]]))
    ck("avg_logprob diteruskan ke UI", body["words"][1]["avg_logprob"] == -1.6)
    ck("ambang keyakinan dikirim", body["check_threshold"] == -1.0)

    res = client.post(f"/api/projects/{PID}/transcript/word", json={"idx": 1, "text": "eh iya"})
    ck("POST edit kata 200", res.status_code == 200, str(res.status_code))
    words = json.loads((PDIR / "transcript.json").read_text(encoding="utf-8"))["words"]
    ck("satu kata jadi dua", len(words) == 5, str([w["word"] for w in words]))
    ck("kata pengganti benar", [w["word"] for w in words[1:3]] == ["eh", "iya"], str(words[1:3]))
    span = {"start": 1.0, "end": 1.6}
    ck("rentang tetap di window kata lama",
       round(words[1]["start"], 3) == span["start"] and round(words[2]["end"], 3) == span["end"],
       f'{words[1]["start"]}-{words[2]["end"]}')
    total_chars = len("eh") + len("iya")
    expected_split = round(span["start"] + (span["end"] - span["start"]) * len("eh") / total_chars, 3)
    ck("timing dibagi per karakter", round(words[1]["end"], 3) == expected_split,
       f'{words[1]["end"]} vs {expected_split}')
    ck("hasil edit ditandai edited + tidak perlu dicek",
       words[1]["edited"] == 1 and server._needs_check(words[1]) is False)
    ck("neighbours tidak berubah", words[0]["word"] == "halo" and words[3]["word"] == "dunia")
    ck("backup transkrip dibuat", (PDIR / "transcript.json.bak").is_file())

    reload_body = client.get(f"/api/projects/{PID}/transcript").json()
    ck("edit bertahan setelah reload", [w["word"] for w in reload_body["words"]][1:3] == ["eh", "iya"])

    res = client.post(f"/api/projects/{PID}/transcript/word", json={"idx": 99, "text": "x"})
    ck("indeks salah ditolak 400", res.status_code == 400, str(res.status_code))
    res = client.post(f"/api/projects/{PID}/transcript/word", json={"idx": 0, "text": "   "})
    ck("teks kosong ditolak 400", res.status_code == 400, str(res.status_code))

    # placeholder: transkrip belum ada
    empty_pid = "aaaa111122"
    empty_dir = ROOT / "work" / empty_pid
    empty_dir.mkdir(parents=True, exist_ok=True)
    (empty_dir / "project.json").write_text(json.dumps({"id": empty_pid}), encoding="utf-8")
    res = client.get(f"/api/projects/{empty_pid}/transcript")
    payload = res.json()
    ck("transkrip kosong → placeholder jujur",
       res.status_code == 404 and payload.get("ok") is False and payload.get("reason") and payload.get("hint"),
       str(payload))
    shutil.rmtree(empty_dir, ignore_errors=True)
finally:
    shutil.rmtree(PDIR, ignore_errors=True)

# ------------------------------------------------------------------- akurasi
sample_file = ROOT / "data" / "wer_sample.json"
sample = json.loads(sample_file.read_text(encoding="utf-8-sig")) if sample_file.is_file() else {}
ck("wer_sample.json ada", sample_file.is_file())
if sample:
    ck("sampel punya reference/baseline/after",
       all(k in sample for k in ("reference", "baseline", "after")), str(sorted(sample)))
    ck("sampel punya waktu ukur", "timing" in sample, str(sample.get("timing")))
    ck("window 60 detik", round(sample.get("window", {}).get("end", 0) - sample.get("window", {}).get("start", 0)) == 60,
       str(sample.get("window")))

res = client.get("/api/accuracy")
payload = res.json()
ck("GET /api/accuracy 200", res.status_code == 200, str(res.status_code))
ck("akurasi ok", payload.get("ok") is True, str(payload)[:160])
if payload.get("ok"):
    before, after = payload["rows"][0], payload["rows"][1]
    ck("ada 2 baris (sebelum & sesudah)", len(payload["rows"]) == 2)
    ck("WER sesudah < sebelum", after["wer"] < before["wer"], f'{before["wer"]} → {after["wer"]}')
    ck("improvement positif", payload["improvement"] > 0, str(payload["improvement"]))
    print(f"INFO WER sebelum={before['wer']:.4f} ({before['errors']}/{before['words']}) "
          f"sesudah={after['wer']:.4f} ({after['errors']}/{after['words']})")
if "timing" in sample:
    t = sample["timing"]
    print("INFO waktu transkrip 60 detik (detik): " +
          ", ".join(f"{k}={v.get('transcribe_sec')}" for k, v in t.items()))
    ck("waktu sebelum & sesudah terukur", all("transcribe_sec" in v for v in t.values()))

# placeholder: sampel akurasi absen
real_sample = server.WER_SAMPLE_FILE
server.WER_SAMPLE_FILE = ROOT / "data" / "__tidak_ada__.json"
try:
    payload = client.get("/api/accuracy").json()
    ck("sampel absen → placeholder jujur",
       payload.get("ok") is False and payload.get("reason") and payload.get("hint"), str(payload))
finally:
    server.WER_SAMPLE_FILE = real_sample

print()
if fails:
    print(f"GAGAL {len(fails)}: " + "; ".join(fails))
    sys.exit(1)
print("SEMUA CEK T7 LULUS")
