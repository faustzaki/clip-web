"""scripts/check_t3c.py — cek T3c (StudioView dipecah ke komponen + hook). Exit 0 kalau semua lulus.

Butuh: `npm run build` sudah jalan (frontend/dist) + backend hidup di 127.0.0.1:8000
untuk verifikasi fungsional `frontend/tools/verify-t2b.mjs`, `verify-t3b.mjs`, `verify-t3c.mjs`.

Jalankan dari root repo: py -3.13 scripts/check_t3c.py
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
COMP = SRC / "components"
HOOKS = SRC / "hooks"
CMP = COMP / "StudioView.jsx"
NEW_FILES = [
    COMP / "GeneratePanel.jsx",
    COMP / "PreviewStage.jsx",
    COMP / "ClipsPanel.jsx",
    HOOKS / "useEditorState.js",
    HOOKS / "useVideoSync.js",
]
VERIFIERS = ["verify-t2b.mjs", "verify-t3b.mjs", "verify-t3c.mjs"]
BASE_JS_KB = 335.50  # index-*.js sebelum refactor (precheck), batas naik 5%

fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


def run(args, cwd):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=600)


# 1) StudioView <= 400 baris
studio_lines = CMP.read_text(encoding="utf-8").splitlines()
ck("StudioView <= 400 baris", len(studio_lines) <= 400, f"{len(studio_lines)} baris")

# 2) 5 file baru ada
missing = [str(p.relative_to(ROOT)) for p in NEW_FILES if not p.exists()]
ck("5 file baru ada (3 komponen + 2 hook)", not missing, ", ".join(missing) or "5/5")

# 3) tidak ada state duplikat: useState transkrip/kata hanya di hook
sv = CMP.read_text(encoding="utf-8")
hook = (HOOKS / "useEditorState.js").read_text(encoding="utf-8")
declared_in_sv = re.findall(r"const \[\s*(?:transcript|words)\b[^\]]*\]\s*=\s*useState", sv)
ck("state kata/transkrip hanya di useEditorState",
   "const [transcript, setTranscript] = useState(null);" in hook and not declared_in_sv and "setTranscript" not in sv,
   f"hook={'const [transcript' in hook} StudioView deklarasi={declared_in_sv}")

# 4) satu elemen <video> saja di jalur studio (PreviewStage), tidak ada di komponen lain hasil pecahan
vid = {p.name: len(re.findall(r"<video\s", p.read_text(encoding="utf-8"))) for p in NEW_FILES + [CMP] if p.suffix == ".jsx"}
refs = len(re.findall(r"ref=\{videoRef\}", (COMP / "PreviewStage.jsx").read_text(encoding="utf-8")))
ck("tetap satu elemen <video> di PreviewStage",
   vid.get("PreviewStage.jsx") == 1 and refs == 1 and all(n == 0 for k, n in vid.items() if k != "PreviewStage.jsx"),
   ", ".join(f"{k}={n}" for k, n in vid.items()) + f" ref={{videoRef}}={refs}")

# 5) aturan keras pada file baru + StudioView: tanpa dark/neon/gradient/TODO/console.log
BAD = re.compile(r"dark:|bg-dark-|gradient|neon|TODO|console\.log")
bad = [f"{p.name}:{n}" for p in NEW_FILES + [CMP] for n, line in
       enumerate(p.read_text(encoding="utf-8").splitlines(), 1) if BAD.search(line)]
ck("tanpa dark/neon/gradient/TODO/console.log", not bad, "; ".join(bad[:6]))

# 6) bundle: ukuran total JS tidak naik > 5%
assets = sorted((ROOT / "frontend" / "dist" / "assets").glob("index-*.js"))
kb = round(max(a.stat().st_size for a in assets) / 1024, 2) if assets else 0
ck("bundle JS tidak naik > 5%", assets and kb <= BASE_JS_KB * 1.05, f"{kb} kB vs {BASE_JS_KB} kB")
css = sorted((ROOT / "frontend" / "dist" / "assets").glob("*.css"))
ck("build CSS memuat token aksen", bool(css) and "--vz-accent" in css[-1].read_text(encoding="utf-8"),
   css[-1].name if css else "dist/assets/*.css tidak ada")

# 7) screenshot bukti
shots = sorted((ROOT / "docs" / "evidence" / "T3c" / "after").glob("*.png"))
ck("screenshot studio 1440 & 1280 ada",
   any("1440" in s.name for s in shots) and any("1280" in s.name for s in shots),
   ", ".join(s.name for s in shots))

# 8) verifikasi fungsional + ukuran region
for v in VERIFIERS:
    r = run(["node", f"tools/{v}"], ROOT / "frontend")
    print(r.stdout.strip()[-700:])
    ck(f"{v} exit 0", r.returncode == 0, f"exit {r.returncode}")

m = run(["node", "tools/measure.mjs"], ROOT / "frontend")
print(m.stdout.strip()[-500:])
try:
    meas = json.loads(m.stdout[m.stdout.index("{"):m.stdout.rindex("}") + 1])
    ok = (meas["header"]["h"] == 56 and meas["rail"]["w"] == 72 and meas["strip"]["h"] == 96
          and meas["sidebar"]["w"] == 360)
except (ValueError, KeyError) as err:
    ok = False
    meas = {"err": str(err)}
ck("measure.mjs: header 56 / rail 72 / strip 96 / sidebar 360", ok, json.dumps(meas)[:160])

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
