#!/usr/bin/env python3
"""PM probe: uji model hasil farm josjis — tool-call + koding nyata.
Tulis hasil ke docs/evidence/PM-models.json supaya tidak hilang saat timeout.
Pakai: py -3.13 docs/scripts/pm_model_probe.py
"""
import json
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
CFG = Path.home() / "AppData/Local/hermes/profiles/josjis/config.yaml"
OUT = ROOT / "docs/evidence/PM-models.json"

key = re.search(r"api_key:\s*(sk-[A-Za-z0-9_\-]+)", CFG.read_text(encoding="utf-8", errors="ignore")).group(1)
H = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
URL = "http://127.0.0.1:20128/v1/chat/completions"

TOOLS = [{"type": "function", "function": {"name": "write_file", "description": "Write text to file",
    "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                   "required": ["path", "content"]}}}]
TASK = ("Tulis React JSX pendek Timeline.jsx: props items,duration_ms,current,onSeek; ruler tick 5000ms; "
        "3 track tinggi 40px gap 8px; playhead 2px var(--vz-accent) posisi current/duration_ms; "
        "klik ruler panggil onSeek(ms). Balas HANYA kode.")

CANDS = ["moc/deepseek-v4.1-flash", "moc/deepseek-ai/DeepSeek-V4-Flash-0731", "moc/Atria-Dawn-Preview",
         "moc/LongCat-2.5-Preview", "moc/gemini/gemini-3.6-flash", "moc/grok-4.7", "moc/gemini-4-argon",
         "xkiro/qwen/qwen3.8-max:free", "xkiro/mistralai/codestral-2508", "xkiro/cohere/command-a",
         "g24/minimax-m2.7", "cbai/kimi-k2.6", "ocf/flint-40b-free", "river/deepseek-ai/DeepSeek-V4.1-Flash"]


def post(body, timeout):
    try:
        r = requests.post(URL, headers=H, json=body, timeout=timeout)
        return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {})
    except Exception as e:
        return "ERR:" + type(e).__name__, {}


results = {}
if OUT.exists():
    try:
        results = json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        results = {}

for m in CANDS:
    row = results.get(m, {})
    if not row:
        code, data = post({"model": m, "tools": TOOLS, "tool_choice": "auto", "max_tokens": 80,
                           "temperature": 0,
                           "messages": [{"role": "user", "content": "Create file notes.txt containing hello. Use the tool."}]}, 60)
        row["toolcall_code"] = code
        row["toolcall"] = bool((data.get("choices") or [{}])[0].get("message", {}).get("tool_calls")) if code == 200 else False
        t0 = time.time()
        code2, data2 = post({"model": m, "messages": [{"role": "user", "content": TASK}],
                             "max_tokens": 900, "temperature": 0.2}, 150)
        row["code_code"] = code2
        row["code_s"] = round(time.time() - t0, 1)
        if code2 == 200:
            txt = (data2.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
            row["len"] = len(txt)
            row["score"] = sum([("export" in txt), ("duration_ms" in txt and "onSeek" in txt),
                                ("5000" in txt), ("40" in txt), ("--vz-accent" in txt)])
        results[m] = row
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"{m:44} tool={row['toolcall']} code={row['code_code']} {row.get('code_s')}s skor={row.get('score')}", flush=True)

print("\n=== RINGKASAN ===")
for m, r in sorted(results.items(), key=lambda kv: (not kv[1].get("toolcall"), kv[1].get("code_s") or 999)):
    print(f"{'TOOL' if r.get('toolcall') else 'NO  '} {str(r.get('score','-'))+'/5':4} {str(r.get('code_s','?')):>6}s  {m}")
