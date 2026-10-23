#!/usr/bin/env python3
"""Cek model 9Router bisa tool-call (syarat kerja agentik di OMP).
Model yang balas tanpa tool_calls = plan-mode-only, jangan dipakai untuk tugas tulis file.
Pakai: py -3.13 docs/scripts/check_model_tools.py [model ...]
"""
import os, re, sys, json, requests
from pathlib import Path

def api_key() -> str:
    cfg = Path(os.path.expanduser("~"))/"AppData/Local/hermes/profiles/josjis/config.yaml"
    if cfg.exists():
        m = re.search(r"api_key:\s*(sk-[A-Za-z0-9_\-]+)", cfg.read_text(encoding="utf-8", errors="ignore"))
        if m: return m.group(1)
    return os.environ.get("NINE_ROUTER_API_KEY", "")

BASE = os.environ.get("NINE_ROUTER_URL", "http://127.0.0.1:20128/v1")

def to_router_id(model: str) -> str:
    """Nama OMP -> id 9Router. OMP menambah prefix provider, 9Router tidak menerimanya."""
    if model.startswith("ninerouter/"):
        return model[len("ninerouter/"):]
    if model.startswith("grok-cli/"):
        return "gcli/" + model[len("grok-cli/"):]
    return model
TOOLS = [{"type":"function","function":{"name":"write_file","description":"Write text to a file",
  "parameters":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},
  "required":["path","content"]}}}]

def probe(model: str) -> bool:
    try:
        r = requests.post(f"{BASE}/chat/completions", timeout=90,
            headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
            json={"model": to_router_id(model), "tools": TOOLS, "tool_choice": "auto", "max_tokens": 120, "temperature": 0,
                  "messages": [{"role": "user", "content": "Create file notes.txt containing hello. Use the tool."}]})
    except Exception as e:
        print(f"ERR   {model:46} {e}"); return False
    if r.status_code != 200:
        print(f"{r.status_code:<5} {model:46} {r.text[:60]}"); return False
    msg = r.json()["choices"][0]["message"]
    ok = bool(msg.get("tool_calls"))
    note = "" if ok else (msg.get("content") or "")[:50].replace("\n", " ")
    print(f"{'OK   ' if ok else 'PLAN '} {model:46} {note}")
    return ok

if __name__ == "__main__":
    models = sys.argv[1:] or ["ninerouter/river/deepseek-ai/DeepSeek-V4.1-Flash",
                              "ninerouter/cbai/deepseek-v4.1-flash",
                              "grok-cli/grok-4.5", "ocf/glm-5.3-flash-free"]
    bad = [m for m in models if not probe(m)]
    print(f"\n{len(models)-len(bad)}/{len(models)} bisa tool-call")
    sys.exit(1 if bad else 0)
