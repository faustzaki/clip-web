"""scripts/check_t8.py — cek T8 (diarisasi speaker). Exit 0 kalau lulus.

Uji: jalur B (VAD jeda >500 ms + pitch + k-means) harus memisahkan dua suara TTS
dengan akurasi kata ≥ 80%, durasi audio tidak boleh bergeser, label speaker bisa
diganti, dan prefix nama speaker masuk ke kata yang dipakai caption.

Fixture audio dibuat oleh scripts/make_t8_fixture.py (TTS SAPI David/Zira, ±36 detik)
dan di-cache di docs/evidence/T8/audio supaya tidak diulang tiap run.
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "chopify"))
sys.path.insert(0, str(ROOT / "scripts"))

from fastapi.testclient import TestClient  # noqa: E402

import diarize  # noqa: E402
import make_t8_fixture as fixture  # noqa: E402
import server  # noqa: E402

PID = "aabbccdde1"          # harus cocok PID_RE server (10 hex)
PDIR = ROOT / "work" / PID
AUDIO_DIR = ROOT / "docs" / "evidence" / "T8" / "audio"
SRC = ROOT / "frontend" / "src"
fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def read(path):
    p = pathlib.Path(path)
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def build_project(fx):
    """Project uji: source.mp4 (dari audio TTS) + transkrip kata (timing fixture)."""
    shutil.rmtree(PDIR, ignore_errors=True)
    PDIR.mkdir(parents=True)
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=#202020:s=320x568:r=25",
         "-i", fx["wav"], "-shortest", "-c:v", "libx264", "-preset", "ultrafast",
         "-c:a", "aac", str(PDIR / "source.mp4")],
        check=True, capture_output=True)
    (PDIR / "project.json").write_text(
        json.dumps({"title": "Uji diarisasi T8", "created_at": 1}), encoding="utf-8")
    (PDIR / "transcript.json").write_text(json.dumps({
        "language": "id", "model": "medium", "duration": fx["duration_s"],
        "words": [{"word": w["word"], "start": w["start"], "end": w["end"],
                   "avg_logprob": -0.3, "edited": 0} for w in fx["words"]],
    }, ensure_ascii=False), encoding="utf-8")


client = TestClient(server.app)
fx = fixture.build(AUDIO_DIR)
build_project(fx)

try:
    # ---------------------------------------------------- prasyarat jalur A
    avail = diarize.model_available()
    res_model = client.post(f"/api/projects/{PID}/diarize", json={"engine": "model"})
    pl = res_model.json()
    if avail["ok"]:
        ck("jalur A siap (pyannote + HF_TOKEN)", res_model.status_code == 200 and pl.get("ok") is True,
           str(pl)[:120])
    else:
        ck("jalur A absen → placeholder jujur 200 {ok:false,reason,hint}",
           res_model.status_code == 200 and pl.get("ok") is False
           and bool(pl.get("reason")) and bool(pl.get("hint")),
           f"{res_model.status_code} {str(pl)[:120]}")

    # ---------------------------------------------------- jalur B diarisasi
    res = client.post(f"/api/projects/{PID}/diarize", json={"engine": "heuristic"})
    d = res.json()
    ck("diarisasi perkiraan jalan (estimate, ≥2 speaker)",
       res.status_code == 200 and d.get("ok") is True
       and d.get("confidence") == "estimate" and len(d.get("speakers") or []) >= 2,
       f"{res.status_code} {str({k: v for k, v in d.items() if k != 'speakers'})[:150]}")

    tr_after = json.loads((PDIR / "transcript.json").read_text(encoding="utf-8-sig"))
    assigned = [w.get("speaker") for w in tr_after["words"]]
    acc = fixture.accuracy(assigned, fx["speaker_ids"])
    ck("akurasi kata ≥ 80% (dua suara TTS)", acc >= 0.80, f"{acc * 100:.1f}% dari {len(assigned)} kata")

    # ---------------------------------------------------- timing tidak geser
    before = json.loads(json.dumps(fx["words"]))
    timing_same = all(
        abs(w["start"] - a["start"]) < 1e-9 and abs(w["end"] - a["end"]) < 1e-9
        for w, a in zip(before, tr_after["words"]))
    dur_same = d.get("duration_ms") == d.get("duration_before_ms")
    ck("diarisasi tidak memotong/menggeser audio",
       timing_same and dur_same and len(tr_after["words"]) == len(fx["words"]),
       f"durasi {d.get('duration_before_ms')}→{d.get('duration_ms')} ms, {len(tr_after['words'])} kata")

    # ---------------------------------------------------- kontrak API
    got = client.get(f"/api/projects/{PID}/transcript?word=1").json()
    ck("GET transcript: speaker per kata + daftar speakers",
       all(w.get("speaker") is not None for w in got["words"])
       and [s["label"] for s in got["speakers"]] == [s["label"] for s in d["speakers"]]
       and got["speaker_names_in_caption"] is False,
       f"{len(got['speakers'])} speaker, {len(got['words'])} kata")

    sid = d["speakers"][0]["id"]
    pat = client.patch(f"/api/speakers/{sid}", json={"label": "Host"})
    after = client.get(f"/api/projects/{PID}/transcript?word=1").json()
    ck("PATCH speaker: rename tersimpan",
       pat.status_code == 200 and pat.json()["speaker"]["label"] == "Host"
       and after["speakers"][0]["label"] == "Host",
       f"{pat.status_code} label={after['speakers'][0]['label']}")

    words_on = server._caption_words(PID, tr_after["words"], {"speaker_names_in_caption": True})
    words_off = server._caption_words(PID, tr_after["words"], {"speaker_names_in_caption": False})
    labels = {s["id"]: s["label"] for s in after["speakers"]}
    runs = [i for i, w in enumerate(tr_after["words"])
            if w.get("speaker") is not None
            and (i == 0 or tr_after["words"][i - 1].get("speaker") != w.get("speaker"))]
    prefixed_ok = all(words_on[i]["word"] == f"{labels[tr_after['words'][i]['speaker']]}: {tr_after['words'][i]['word']}"
                      for i in runs)
    ck("toggle caption: prefix 'Nama: ' di tiap giliran speaker",
       bool(runs) and prefixed_ok and len(words_on) == len(tr_after["words"])
       and [w["word"] for w in words_off] == [w["word"] for w in fx["words"]],
       f"{len(runs)} giliran: {words_on[runs[0]]['word'][:24]!r}")

    # ---------------------------------------------------- aturan keras
    touched = [ROOT / "diarize.py", ROOT / "server.py", SRC / "api.js",
               SRC / "hooks" / "useEditorState.js", SRC / "components" / "TranscriptPanel.jsx",
               SRC / "components" / "GeneratePanel.jsx", SRC / "components" / "StudioView.jsx"]
    dark = [p.name for p in touched if re.search(r"dark:|bg-dark-|neon|gradient", read(p))]
    junk = [p.name for p in touched if re.search(r"console\.log|TODO|FIXME", read(p))]
    ck("light theme + tanpa console.log/TODO", not dark and not junk, ",".join(dark + junk))
finally:
    shutil.rmtree(PDIR, ignore_errors=True)

print()
if fails:
    print(f"GAGAL {len(fails)}: " + "; ".join(fails))
    sys.exit(1)
print("SEMUA CEK T8 LULUS")
