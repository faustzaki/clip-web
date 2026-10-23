"""scripts/check_t1.py — cek T1 (token + shell). Exit 0 kalau semua lulus.

Jalankan dari root repo: py -3.13 scripts/check_t1.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
fails = []


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


TOUCHED = [
    "frontend/src/index.css",
    "frontend/src/App.jsx",
    "frontend/src/components/Navbar.jsx",
    "frontend/src/components/ProjectsView.jsx",
    "frontend/src/components/StudioView.jsx",
    "frontend/src/components/EditorHeader.jsx",
    "frontend/src/components/ToolRail.jsx",
    "frontend/src/components/ClipStrip.jsx",
]
FORBIDDEN = re.compile(r"dark:|bg-dark|bg-black|neon|gradient")
# StudioView interior masih kelas gelap -> restyle = tugas T2/T3 (prompt T1: "jangan refactor isi StudioView").
SCAN = [p for p in TOUCHED if p != "frontend/src/components/StudioView.jsx"]

files = {p: (ROOT / p).read_text(encoding="utf-8") for p in TOUCHED if (ROOT / p).exists()}

ck("file wajib ada", len(files) == len(TOUCHED), f"{len(files)}/{len(TOUCHED)}")

ck("token accent di index.css", "--vz-accent: #4822A5" in files["frontend/src/index.css"])

hits = [f"{p}:{m}" for p, t in files.items() if p in SCAN for m in [FORBIDDEN.search(t)] if m]
ck("tanpa kelas gelap/neon/gradient di file T1", not hits, "; ".join(hits[:5]))

cfg = (ROOT / "frontend/tailwind.config.js").read_text(encoding="utf-8")
ck(
    "tailwind extend vz + Inter + tanpa darkMode",
    "accent: '#4822A5'" in cfg and "'Inter'" in cfg and "darkMode" not in cfg,
)

html = (ROOT / "frontend/index.html").read_text(encoding="utf-8")
ck("index.html Inter + lang id", 'lang="id"' in html and "family=Inter" in html and 'class="dark"' not in html)

comps = " ".join(files.get(p, "") for p in TOUCHED if p.endswith(("ToolRail.jsx", "ClipStrip.jsx")))
ck("rail 72px + strip 96px", "w-[72px]" in comps and "h-[96px]" in comps)

ck(
    "tanpa TODO/console.log di file T1",
    not [p for p, t in files.items() if "TODO" in t or "console.log" in t],
)

css = sorted((ROOT / "frontend/dist/assets").glob("*.css"))
ck("build CSS memuat token + h-header", bool(css) and "--vz-accent" in css[-1].read_text(encoding="utf-8") and ".h-header" in css[-1].read_text(encoding="utf-8"))

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
