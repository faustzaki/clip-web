"""T9 — terjemahan subtitle: potongan caption -> LLM 9Router, QA panjang, glosarium tetap.

Satu potongan caption = satu baris yang tampil di video (lihat `subtitle_burn.chunk_words`),
jadi jumlah baris terjemahan selalu sama dengan jumlah baris caption. Timing kata tidak
pernah disentuh: modul ini hanya memetakan teks per indeks potongan.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import subtitle_burn

BATCH = 40                     # baris per request ke 9Router
MAX_CHARS = 42                 # batas panjang satu baris caption
MAX_LINES = 2                  # batas jumlah baris per potongan
RETRY = 2                      # ulangan kalau JSON balasan tidak valid
DENSE = "lebih padat"          # instruksi QA untuk baris yang masih kepanjangan
DEFAULT_MODEL = "ninerouter/T-SOTA/claude-sonnet-5"
TIMEOUT = 90
PROMPT_FILE = Path(__file__).resolve().parent / "docs" / "prompts" / "translate.md"

LANGS = [
    {"code": "id", "label": "Indonesia"},
    {"code": "en", "label": "Inggris"},
    {"code": "zh", "label": "Mandarin"},
    {"code": "ja", "label": "Jepang"},
    {"code": "ar", "label": "Arab"},
    {"code": "es", "label": "Spanyol"},
]

ROUTER_DOWN = {
    "ok": False,
    "reason": "9Router tidak merespons",
    "hint": "Jalankan 9Router di http://127.0.0.1:20128 lalu muat ulang halaman",
}
NO_WORDS = {
    "ok": False,
    "reason": "Belum ada kata untuk diterjemahkan",
    "hint": "Transkripsi klip dulu supaya caption punya teks",
}


def lang_codes() -> list[str]:
    return [l["code"] for l in LANGS]


def lang_label(code: str) -> str:
    for l in LANGS:
        if l["code"] == str(code or "").strip():
            return l["label"]
    return str(code or "")


def system_prompt() -> str:
    """Prompt terjemahan = isi docs/prompts/translate.md (satu sumber)."""
    try:
        return PROMPT_FILE.read_text(encoding="utf-8")
    except OSError:
        return "Terjemahkan potongan caption ke bahasa target. Balas hanya JSON array [{i,text}]."


def chunk_texts(words: list[dict[str, Any]], per_line: int = 3) -> list[str]:
    """Teks tiap potongan caption; urutan & jumlah sama dengan yang dibakar subtitle_burn."""
    return [" ".join(str(w.get("word") or "").strip() for w in grp).strip()
            for grp in subtitle_burn.chunk_words(words, per_line)]


def too_long(text: str) -> bool:
    """Baris > 42 karakter atau > 2 baris = gagal QA."""
    body = str(text or "")
    return len(body) > MAX_CHARS or len([l for l in body.splitlines() if l.strip()]) > MAX_LINES


def mask_terms(text: str, terms: list[str]) -> tuple[str, dict[str, str]]:
    """Ganti istilah glosarium dengan token `[[n]]` supaya model tidak menerjemahkannya."""
    out = str(text or "")
    mapping: dict[str, str] = {}
    for term in terms or []:
        term = str(term or "").strip()
        if not term:
            continue
        pat = re.compile(re.escape(term), re.IGNORECASE)
        if not pat.search(out):
            continue
        token = f"[[{len(mapping) + 1}]]"
        out = pat.sub(token, out)
        mapping[token] = term
    return out, mapping


def unmask_terms(text: str, mapping: dict[str, str]) -> str:
    """Kembalikan token jadi istilah asli; token yang hilang ditempel di akhir."""
    out = str(text or "")
    missing = []
    for token, term in (mapping or {}).items():
        if token in out:
            out = out.replace(token, term)
        else:
            missing.append(term)
    out = out.strip()
    if missing:
        out = f"{out} {' '.join(missing)}".strip()
    return out


def _chat(messages: list[dict[str, str]], *, model: str, endpoint: str, api_key: str,
          timeout: int = TIMEOUT) -> str:
    """Panggilan chat/completions yang kompatibel OpenAI (9Router)."""
    base = (endpoint or "").strip().rstrip("/")
    url = base if base.endswith("/chat/completions") else f"{base}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {"model": model, "temperature": 0.2, "stream": False, "messages": messages}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        data = json.loads(res.read().decode("utf-8"))
    return str(data["choices"][0]["message"]["content"] or "")


def _parse_items(raw: str, wanted: set[int]) -> list[dict[str, Any]] | None:
    """Ambil JSON array dari balasan; None kalau tidak valid / indeks tidak lengkap."""
    m = re.search(r"\[.*\]", str(raw or ""), re.DOTALL)
    if not m:
        return None
    try:
        items = json.loads(m.group(0))
    except (ValueError, TypeError):
        return None
    if not isinstance(items, list):
        return None
    out = []
    for it in items:
        if not isinstance(it, dict) or "i" not in it:
            return None
        try:
            i = int(it["i"])
        except (TypeError, ValueError):
            return None
        out.append({"i": i, "text": str(it.get("text") or "").strip()})
    if {it["i"] for it in out} != wanted:
        return None
    return out


def translate_items(items: list[dict[str, Any]], target_lang: str, *, model: str, endpoint: str,
                    api_key: str, extra: str = "", timeout: int = TIMEOUT) -> list[dict[str, Any]]:
    """Satu batch (maks 40 baris) ke 9Router; retry RETRY kali kalau JSON tidak valid."""
    wanted = {int(it["i"]) for it in items}
    user = (f"Bahasa target: {lang_label(target_lang)} ({target_lang}).\n"
            f"{extra}"
            f"Terjemahkan {len(items)} potongan berikut. Balas hanya JSON array.\n"
            f"{json.dumps(items, ensure_ascii=False)}")
    messages = [{"role": "system", "content": system_prompt()},
                {"role": "user", "content": user}]
    last = ""
    for _ in range(RETRY + 1):
        last = _chat(messages, model=model, endpoint=endpoint, api_key=api_key, timeout=timeout)
        parsed = _parse_items(last, wanted)
        if parsed is not None:
            return parsed
    raise ValueError(f"Balasan model bukan JSON [{'{i,text}'}] yang valid: {last[:120]}")


def translate_words(words: list[dict[str, Any]], target_lang: str, *, per_line: int = 3,
                    glossary: list[str] | None = None, model: str = DEFAULT_MODEL,
                    endpoint: str = "", api_key: str = "", timeout: int = TIMEOUT) -> dict[str, Any]:
    """Terjemahkan caption satu klip. Hasil: {ok, lang, model, lines:[{i,source,text,flagged}], flagged}."""
    chunks = chunk_texts(words, per_line)
    if not chunks:
        return dict(NO_WORDS)

    masked, maps = [], []
    for i, text in enumerate(chunks):
        m_text, mapping = mask_terms(text, glossary or [])
        masked.append(m_text)
        maps.append(mapping)

    translated: list[str] = [""] * len(chunks)
    try:
        for start in range(0, len(masked), BATCH):
            batch = [{"i": i, "text": masked[i]} for i in range(start, min(start + BATCH, len(masked)))]
            for it in translate_items(batch, target_lang, model=model, endpoint=endpoint,
                                      api_key=api_key, timeout=timeout):
                translated[it["i"]] = it["text"]
    except urllib.error.URLError as e:
        return {**ROUTER_DOWN, "hint": f"{ROUTER_DOWN['hint']} ({e})"}
    except (ValueError, KeyError, TypeError, OSError) as e:
        return {"ok": False, "reason": "Model tidak mengembalikan JSON valid",
                "hint": f"Coba model lain di Settings ({e})"}

    lines = [unmask_terms(t, maps[i]) for i, t in enumerate(translated)]

    # QA: baris > 42 karakter / > 2 baris dikirim ulang dengan instruksi "lebih padat".
    dense = [i for i, text in enumerate(lines) if too_long(text)]
    if dense:
        try:
            batch = [{"i": i, "text": masked[i]} for i in dense]
            for it in translate_items(
                batch, target_lang, model=model, endpoint=endpoint, api_key=api_key,
                extra=f"Baris-baris ini kepanjangan. Tulis ulang {DENSE}: maksimal "
                      f"{MAX_CHARS} karakter, maksimal {MAX_LINES} baris.\n",
                timeout=timeout,
            ):
                lines[it["i"]] = unmask_terms(it["text"], maps[it["i"]])
        except (urllib.error.URLError, ValueError, KeyError, TypeError, OSError):
            pass  # baris tetap ditandai di bawah, tidak menggagalkan hasil pertama

    flagged = [i for i, text in enumerate(lines) if too_long(text)]
    return {
        "ok": True,
        "lang": target_lang,
        "model": model,
        "per_line": int(per_line),
        "lines": [{"i": i, "source": chunks[i], "text": lines[i], "flagged": i in flagged}
                  for i in range(len(chunks))],
        "flagged": flagged,
    }
