#!/usr/bin/env python3
"""QA runner: jalankan semua verifier, kumpulkan hasil nyata ke JSON.

Tidak memanipulasi hasil: setiap test case mencatat perintah, exit code, dan output mentah.
Pakai: py -3.13 scripts/qa_run.py
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FE = ROOT / "frontend"
OUT = ROOT / "docs/evidence/QA/qa_results.json"
BACKEND = "http://127.0.0.1:8000/api/health"
FRONTEND = "http://127.0.0.1:5173"

TESTS = [
    # id, nama, cwd, perintah, kelompok
    ("QA-LAYOUT", "Layout & kerangka (16 assert, 2 viewport)", FE, ["node", "tools/qa-layout.mjs"], "A"),
    ("QA-T2B", "Transcript: render/seek/cari", FE, ["node", "tools/verify-t2b.mjs"], "B"),
    ("QA-T7", "Akurasi ASR: ragu/glossary/WER", ROOT, ["py", "-3.13", "scripts/check_t7.py"], "B"),
    ("QA-T8", "Diarisasi speaker", ROOT, ["py", "-3.13", "scripts/check_t8.py"], "B"),
    ("QA-T3B", "Timeline: ruler/zoom/collapse", FE, ["node", "tools/verify-t3b.mjs"], "C"),
    ("QA-T10", "B-roll: index/sisip/overlay", FE, ["node", "tools/verify-t10.mjs"], "C"),
    ("QA-T4A", "Export backend: job/resolusi/sha", ROOT, ["py", "-3.13", "scripts/check_t4a.py"], "D"),
    ("QA-T4B", "Export modal: unduh/Esc/fokus", FE, ["node", "tools/verify-t4b.mjs"], "D"),
    ("QA-T5", "Filler + 5 preset caption", ROOT, ["py", "-3.13", "scripts/check_t5.py"], "E"),
    ("QA-T6", "Safe zone + ratio + auto zoom", ROOT, ["py", "-3.13", "scripts/check_t6.py"], "F"),
    ("QA-T9", "Translasi subtitle (butuh 9Router)", ROOT, ["py", "-3.13", "scripts/check_t9.py"], "G"),
    ("QA-T11", "Brand kit: logo/warna/intro-outro", ROOT, ["py", "-3.13", "scripts/check_t11.py"], "H"),
    ("QA-T12", "Background + layout reframe", ROOT, ["py", "-3.13", "scripts/check_t12.py"], "I"),
    ("QA-T13", "Posting queue + analitik jujur", ROOT, ["py", "-3.13", "scripts/check_t13.py"], "J"),
    ("QA-T2A", "Backend transcript + cut", ROOT, ["py", "-3.13", "scripts/check_t2a.py"], "SYS"),
    ("QA-T3A", "Backend timeline", ROOT, ["py", "-3.13", "scripts/check_t3a.py"], "SYS"),
]


def port_open(url: str) -> bool:
    import urllib.request
    try:
        with urllib.request.urlopen(url, timeout=4) as r:
            return r.status == 200
    except Exception:
        return False


def main():
    env = dict(os.environ)
    results = []
    be = port_open(BACKEND)
    fe = port_open(FRONTEND)
    print(f"backend :8000 = {be} | frontend :5173 = {fe}\n")

    for tid, name, cwd, cmd, group in TESTS:
        t0 = time.time()
        try:
            p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=900, env=env)
            out = (p.stdout or "") + (p.stderr or "")
            code = p.returncode
        except subprocess.TimeoutExpired:
            out, code = "TIMEOUT setelah 900s", 124
        except Exception as e:
            out, code = f"ERROR: {e}", 99
        dt = round(time.time() - t0, 1)

        # hitung PASS/FAIL dari output apa adanya
        npass = len(re.findall(r"^PASS", out, re.M))
        nfail = len(re.findall(r"^FAIL", out, re.M))
        m = re.search(r"(\d+)\s+lulus,\s*(\d+)\s+gagal", out)
        if m:
            npass, nfail = int(m.group(1)), int(m.group(2))
        if "SEMUA CEK" in out and "LULUS" in out:
            nfail = nfail or 0
        status = "PASS" if code == 0 and nfail == 0 else ("BLOCKED" if code == 2 else "FAIL")
        fails = [l.strip() for l in out.splitlines() if l.startswith("FAIL")][:12]
        results.append({
            "id": tid, "name": name, "group": group, "cmd": " ".join(cmd), "cwd": str(cwd),
            "exit": code, "seconds": dt, "pass": npass, "fail": nfail,
            "status": status, "fail_lines": fails, "output_tail": out[-4000:],
        })
        print(f"[{status:7}] {tid:10} {npass:3} pass / {nfail} fail  {dt:>6}s  {name}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "backend_up": be, "frontend_up": fe, "results": results,
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    total_fail = sum(r["fail"] for r in results)
    print(f"\ntotal: {sum(r['pass'] for r in results)} pass, {total_fail} fail, "
          f"{sum(1 for r in results if r['status']=='BLOCKED')} blocked")
    print("hasil mentah:", OUT)


if __name__ == "__main__":
    main()
