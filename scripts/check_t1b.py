"""scripts/check_t1b.py — cek T1b (sapu tema gelap + aksen liar). Exit 0 kalau semua lulus.

Jalankan dari root repo: py -3.13 scripts/check_t1b.py
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


SRC = ROOT / "frontend" / "src"
TOUCHED = [
    "components/CropStudioModal.jsx",
    "components/GalleryView.jsx",
    "components/IconDropdown.jsx",
    "components/NewProjectView.jsx",
    "components/SettingsModal.jsx",
    "components/StudioView.jsx",
    "components/SubtitleApplyModal.jsx",
    "components/SubtitleStyleEditor.jsx",
]
FORBIDDEN = re.compile(
    r"dark:|bg-dark-|border-dark-|text-dark-|dark-hover|neon|gradient|cyber|"
    r"#c11e38|#220b34|#e6193c|#ff2b54|#00FFCC|text-gray-|text-slate-|"
    r"bg-green-|text-green-|bg-emerald|text-emerald|text-yellow-|bg-orange-"
)
VAR_OPACITY = re.compile(r"var\(--vz-[a-z-]+\)\]/\d")
# GlitchHorseIcon = logo brand (SVG fill hardcode), bukan tema.
SKIP = {"GlitchHorseIcon.jsx"}

# 1) kelas gelap/neon/gradien hilang di seluruh frontend/src
hits = []
for p in sorted(SRC.rglob("*")):
    if p.suffix not in {".jsx", ".js", ".css", ".html"} or p.name in SKIP:
        continue
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        if FORBIDDEN.search(line):
            hits.append(f"{p.relative_to(ROOT)}:{n}")
ck("tanpa dark/neon/gradient/aksen liar", not hits, "; ".join(hits[:6]))

# 2) opacity modifier di atas warna var() = CSS rusak
bad_op = [
    p.relative_to(ROOT).as_posix()
    for p in SRC.rglob("*.jsx")
    if VAR_OPACITY.search(p.read_text(encoding="utf-8"))
]
ck("tanpa bg-[var(--vz-*)]/<opacity>", not bad_op, ", ".join(bad_op))

# 3) radius panel sesuai token
rad = [
    f"{f}:{n}"
    for f in TOUCHED
    for n, line in enumerate((SRC / f).read_text(encoding="utf-8").splitlines(), 1)
    if "rounded-2xl" in line or "rounded-3xl" in line
]
ck("tanpa rounded-2xl/3xl di file T1b", not rad, "; ".join(rad[:6]))

# 4) tidak ada TODO/console.log baru
noisy = [f for f in TOUCHED if re.search(r"TODO|console\.log", (SRC / f).read_text(encoding="utf-8"))]
ck("tanpa TODO/console.log", not noisy, ", ".join(noisy))

# 5) token tetap utuh
css = (SRC / "index.css").read_text(encoding="utf-8")
ck(
    "token accent + overlay utuh",
    "--vz-accent: #4822A5" in css and "--vz-overlay" in css and "--vz-text-muted" in css,
)

# 6) tidak ada warna hex Vizard/maroon sisa di komponen
hexes = [
    f"{p.relative_to(ROOT)}:{n}"
    for p in (SRC / "components").rglob("*.jsx")
    if p.name not in SKIP
    for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
    if re.search(r"#c11e38|#220b34|#e6193c|#00FFCC|#ff2b54", line, re.I)
]
ck("tanpa hex maroon/neon sisa", not hexes, "; ".join(hexes[:6]))

# 7) build memuat token
dist = sorted((ROOT / "frontend" / "dist" / "assets").glob("*.css"))
ck("build CSS memuat token", bool(dist) and "--vz-accent" in dist[-1].read_text(encoding="utf-8"))

# 8) screenshot bukti ada
shots = sorted((ROOT / "docs" / "evidence" / "T1b" / "after").glob("*.png"))
ck("4 screenshot after", len(shots) >= 4, f"{len(shots)} png")

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
