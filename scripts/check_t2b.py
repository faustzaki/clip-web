"""scripts/check_t2b.py — cek T2b (panel transcript di sidebar + seek + cari). Exit 0 kalau lulus.

Butuh: build `frontend/dist` terbaru, server FastAPI (default 127.0.0.1:8005, override `T2B_BASE`),
minimal satu project ber-transkrip, dan node + playwright (sudah ada di `frontend/node_modules`).

Jalankan dari root repo: py -3.13 scripts/check_t2b.py
"""
import os
import json
import pathlib
import shutil
import subprocess
import sys

import requests

BASE = os.environ.get("T2B_BASE", "http://127.0.0.1:8000")
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
PANEL = SRC / "components" / "TranscriptPanel.jsx"
STUDIO = SRC / "components" / "StudioView.jsx"
API = SRC / "api.js"
TOOLS = ROOT / "frontend" / "tools"
fails = []

# Probe UI (playwright): render kata, klik kata → seek, cari kata → n hasil. Read-only, tanpa potong.
UI_PROBE = """
import { chromium } from "playwright";
const [BASE, PID, TITLE] = process.argv.slice(2);
const tr = await (await fetch(`${BASE}/api/projects/${PID}/transcript?word=1`)).json();
const needle = (tr.words[20]?.word || "dan").replace(/[^\\p{L}\\p{N}]/gu, "") || "dan";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.getByText(TITLE, { exact: false }).first().click();
await page.locator('[data-region="sidebar"]').waitFor({ timeout: 15000 });
await page.locator('input[type="search"]').first().waitFor({ timeout: 15000 });
await page.waitForSelector('[data-idx="0"]', { timeout: 20000 });
console.log("WORDS " + (await page.locator("[data-idx]").count()));
await page.locator('[data-idx="6"]').click();
await page.waitForTimeout(400);
console.log("SEEK " + (await page.evaluate(() => document.querySelector("video")?.currentTime ?? -1)));
await page.locator('input[type="search"]').fill(needle);
await page.waitForTimeout(300);
const hasil = await page.locator('[data-region="transcript-count"] span').first().innerText();
console.log("HASIL " + hasil.trim().split(" ")[0]);
const deco = await page.locator('[data-idx="20"]').evaluate((el) => getComputedStyle(el).textDecorationLine);
console.log("UNDERLINE " + (deco.includes("underline") ? "yes" : "no"));
console.log("ERRORS " + errs.length);
await browser.close();
"""


def ck(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(name)


# 1. file baru ada + disambung (bukan komponen yatim)
panel = PANEL.read_text(encoding="utf-8") if PANEL.exists() else ""
studio = STUDIO.read_text(encoding="utf-8")
api = API.read_text(encoding="utf-8")
ck("TranscriptPanel.jsx ada", bool(panel), str(PANEL.relative_to(ROOT)))
ck("props wajib panel lengkap",
   all(p in panel for p in ["words", "current", "onSeek", "onCut", "loading", "error"]),
   "words/current/onSeek/onCut/loading/error")
src_all = "".join(f.read_text(encoding="utf-8", errors="ignore") for f in (ROOT/"frontend/src").rglob("*.jsx"))
ck("TranscriptPanel dipakai di UI (komponen mana pun)",
   "<TranscriptPanel" in src_all)
ck("panel dapat words/onSeek/onCut",
   all(k in src_all for k in ["words=", "onSeek=", "onCut="]))
# sidebar kini pakai lebar state (leftW, default 360) — cek keberadaan + default
ck("sidebar 360px tetap ada", 'data-region="sidebar"' in src_all and ("leftW" in src_all or "w-[360px]" in src_all) and "360" in src_all)
ck("api.js punya fetchTranscript + cutTranscript",
   "export async function fetchTranscript" in api and "export async function cutTranscript" in api)
ck("cut kirim from_idx/to_idx (kontrak server)",
   "from_idx: fromIdx" in api and "to_idx: toIdx" in api)

# 2. aturan keras: tanpa console.log, light theme, tanpa dependency baru
ck("tanpa console.log di file baru", "console.log" not in panel)
forbidden = [t for t in ["dark:", "bg-black", "bg-dark-", "neon", "gradient"] if t in panel]
ck("tanpa dark/glow/gradien di panel", not forbidden, ",".join(forbidden) or "bersih")
pkg = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
ck("tanpa dependency baru",
   sorted(pkg.get("dependencies", {})) == ["lucide-react", "react", "react-dom"],
   ",".join(sorted(pkg.get("dependencies", {}))))

# 3. build memuat panel (bukan cuma ada di src)
dist_assets = (ROOT / "frontend" / "dist" / "assets")
js = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in dist_assets.glob("*.js")) if dist_assets.exists() else ""
ck("build memuat panel transcript",
   all(s in js for s in ["Transkrip belum siap. Jalankan analisis dulu.", "Potong bagian ini", "Coba lagi"]),
   f"{len(js)} byte js")

# 4. perilaku UI: kata render, klik → seek, cari → n hasil (playwright, read-only)
ui = None
try:
    projects = requests.get(f"{BASE}/api/projects", timeout=10).json().get("projects", [])
except Exception as e:
    print(f"FAIL server tidak jalan di {BASE}: {e}")
    sys.exit(1)
with_tr = [p for p in projects if p.get("has_transcript")]
if not with_tr:
    print("FAIL tidak ada project dengan transcript — jalankan analisis dulu")
    sys.exit(1)
pid = with_tr[0]["id"]
title = with_tr[0].get("title") or "a"
tr = requests.get(f"{BASE}/api/projects/{pid}/transcript", params={"word": 1}, timeout=30).json()
ck("kontrak transcript 200 + words>0", bool(tr.get("words")), f"{len(tr.get('words', []))} kata")

node = shutil.which("node")
if not node:
    ck("node tersedia untuk cek UI", False, "node tidak di PATH")
else:
    ui_path = ROOT / "frontend" / "tools" / "_check_t2b_ui.mjs"
    ui_path.write_text(UI_PROBE, encoding="utf-8")
    try:
        proc = subprocess.run([node, str(ui_path), BASE, pid, title], cwd=str(ROOT / "frontend"),
                              capture_output=True, text=True, timeout=180)
        ui = proc.stdout.strip()
        print(ui)
        ck("probe UI exit 0", proc.returncode == 0, f"code={proc.returncode}")
        if proc.returncode != 0 and proc.stderr.strip():
            print(proc.stderr.strip()[:400])
    finally:
        ui_path.unlink(missing_ok=True)

if ui is not None:
    expect_ms = tr["words"][6]["start_ms"] / 1000
    for line in ui.splitlines():
        if line.startswith("SEEK "):
            got = float(line.split()[1])
            ck("klik kata → video.currentTime = start kata",
               abs(got - expect_ms) < 0.35, f"got {got} expect {expect_ms}")
        elif line.startswith("HASIL "):
            n = int(line.split()[1])
            ck("cari kata → jumlah hasil muncul", n > 0, f"{n} hasil")
        elif line.startswith("UNDERLINE "):
            ck("kata cocok tersorot", line.split()[1] == "yes", line)
        elif line.startswith("WORDS "):
            ck("daftar kata render di sidebar", int(line.split()[1]) > 0, f"{line.split()[1]} kata")
        elif line.startswith("ERRORS "):
            ck("tanpa pageerror / console.error", line.split()[1] == "0", line)
    if not any(l.startswith("SEEK ") for l in ui.splitlines()):
        ck("probe UI selesai", False, f"output: {ui[:200]}")
    markers = ("WORDS", "SEEK", "HASIL", "UNDERLINE", "ERRORS")
    missing = [m for m in markers if not any(l.startswith(m + " ") for l in ui.splitlines())]
    ck("probe UI lengkap (5 penanda)", not missing, ",".join(missing) or "lengkap")

print(f"\n{len(fails)} gagal")
sys.exit(1 if fails else 0)
