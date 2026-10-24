"""Index b-roll lokal (T10).

Memindai `data/broll/**` (mp4/mov/webm/jpg/jpeg/png), menurunkan tag dari nama file
plus `data/broll/tags.json` opsional, lalu menyimpan hasilnya ke `data/broll/index.json`.
Thumbnail video dibuat sekali dengan ffmpeg (`data/broll/.thumbs/`).

Tanpa dependency baru: stdlib + ffmpeg/ffprobe. Struktur index mengikuti
`docs/DATA-MODEL.md` §6 (T10): `[{path,tags,dur_ms,thumb}]`.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BROLL_DIR = ROOT_DIR / "data" / "broll"
INDEX_FILE = BROLL_DIR / "index.json"
TAGS_FILE = BROLL_DIR / "tags.json"
THUMB_DIR = BROLL_DIR / ".thumbs"

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm"}
IMAGE_EXT = {".jpg", ".jpeg", ".png"}
MEDIA_EXT = VIDEO_EXT | IMAGE_EXT

DEFAULT_DUR_MS = 2500        # durasi default item yang disisipkan ke timeline
THUMB_W = 320
WORKERS = 4                  # index 50 file harus < 10 s → probe/thumb paralel

_SPLIT = re.compile(r"[^a-z0-9]+")
_NOISE = {"mp4", "mov", "m4v", "webm", "jpg", "jpeg", "png", "video", "clip",
          "final", "hd", "uhd", "copy", "export", "render"}

EMPTY_HINT = "Folder b-roll masih kosong. Taruh video di data/broll/."

# Prasyarat T10: folder selalu ada supaya endpoint, mount /broll, dan panel tidak crash
BROLL_DIR.mkdir(parents=True, exist_ok=True)


def empty_index() -> dict:
    return {"ok": True, "dir": "data/broll", "count": 0, "items": [],
            "scanned_at": 0, "scanned_ms": 0, "hint": EMPTY_HINT}


def tags_from_name(name: str) -> list:
    """`pantai-sunset.mp4` → `['pantai', 'sunset']`."""
    out = []
    for tok in _SPLIT.split(Path(name).stem.lower()):
        if len(tok) < 3 or tok in _NOISE or tok.isdigit() or tok in out:
            continue
        out.append(tok)
    return out


def load_tag_file() -> dict:
    if not TAGS_FILE.exists():
        return {}, {}
    try:
        raw = json.loads(TAGS_FILE.read_text(encoding="utf-8-sig"))
    except Exception:
        return {}, {}
    if not isinstance(raw, dict):
        return {}, {}
    # terima {"nama.mp4": ["tag"]} maupun {"tag": ["nama.mp4"]}
    forward, reverse = {}, {}
    for key, val in raw.items():
        if not isinstance(val, list):
            continue
        if Path(key).suffix.lower() in MEDIA_EXT:
            forward[str(key).lower()] = [str(v) for v in val]
        else:
            for fname in val:
                reverse.setdefault(str(fname).lower(), []).append(str(key))
    return forward, reverse


def _tags_for(path: Path, rel: str, maps: tuple) -> list:
    forward, reverse = maps
    key = path.name.lower()
    extra = (forward.get(key) or []) + (forward.get(Path(key).stem) or [])
    extra += reverse.get(rel.lower()) or []
    extra += reverse.get(key) or []
    tags = tags_from_name(path.name)
    for t in extra:
        t = str(t).strip().lower()
        if t and t not in tags:
            tags.append(t)
    return tags


def ffprobe_dur_ms(path: Path) -> int:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=30, check=True).stdout.strip()
        return max(0, int(round(float(out.splitlines()[0]) * 1000)))
    except Exception:
        return 0


def make_thumb(path: Path, rel: str) -> str:
    """Frame 1 detik → JPEG 320px; nama file = hash relatif (aman untuk subfolder)."""
    dest = THUMB_DIR / (hashlib.md5(rel.encode("utf-8")).hexdigest()[:12] + ".jpg")
    if dest.exists() and dest.stat().st_size > 0:
        return dest.name
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for seek in ("1", "0"):
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-ss", seek, "-i", str(path), "-frames:v", "1",
                 "-vf", f"scale={THUMB_W}:-2", "-q:v", "4", str(dest)],
                capture_output=True, timeout=60, check=True)
        except Exception:
            continue
        if dest.exists() and dest.stat().st_size > 0:
            return dest.name
    return ""


def _media_files(root: Path) -> list:
    if not root.is_dir():
        return []
    return sorted(
        p for p in root.rglob("*")
        if p.is_file() and p.suffix.lower() in MEDIA_EXT
        and THUMB_DIR not in p.parents and not p.name.startswith(".")
    )


def _one(path: Path, root: Path, maps: tuple) -> dict:
    rel = path.relative_to(root).as_posix()
    is_image = path.suffix.lower() in IMAGE_EXT
    thumb = rel if is_image else make_thumb(path, rel)
    return {
        "path": f"data/broll/{rel}",
        "rel": rel,
        "name": path.name,
        "kind": "image" if is_image else "video",
        "tags": _tags_for(path, rel, maps),
        "dur_ms": 0 if is_image else ffprobe_dur_ms(path),
        "thumb": rel if is_image else (f".thumbs/{thumb}" if thumb else ""),
        "size_mb": round(path.stat().st_size / 1048576, 2),
    }


def scan() -> dict:
    """Pindai ulang folder b-roll, tulis `index.json`, kembalikan index-nya."""
    t0 = time.time()
    BROLL_DIR.mkdir(parents=True, exist_ok=True)
    files = _media_files(BROLL_DIR)
    maps = load_tag_file()
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        items = list(pool.map(lambda p: _one(p, BROLL_DIR, maps), files))
    items.sort(key=lambda it: it["name"].lower())
    data = {"ok": True, "dir": "data/broll", "count": len(items), "items": items,
            "scanned_at": int(time.time()), "scanned_ms": int((time.time() - t0) * 1000)}
    if not items:
        data["hint"] = EMPTY_HINT
    tmp = INDEX_FILE.with_name("index.json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(INDEX_FILE)
    return data


def load_index() -> dict:
    """Index tersimpan; `scan()` kalau belum ada / rusak (folder tetap dibuat)."""
    BROLL_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        return scan()
    try:
        data = json.loads(INDEX_FILE.read_text(encoding="utf-8-sig"))
    except Exception:
        return scan()
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        return scan()
    data.setdefault("dir", "data/broll")
    data["count"] = len(data["items"])
    if not data["count"]:
        data["hint"] = EMPTY_HINT
    return data


def suggest(items: list, keywords: list, limit: int = 5) -> list:
    """Skor kecocokan tag vs kata kunci klip/transkrip; 5 teratas (stabil per nama)."""
    wanted = {k for k in (_norm(x) for x in (keywords or [])) if k}
    scored = []
    for it in items:
        tags = {_norm(t) for t in (it.get("tags") or [])}
        exact = tags & wanted
        partial = {t for t in tags if t not in exact and
                   any(t in w or w in t for w in wanted)}
        scored.append({**it, "matched_tags": sorted(exact | partial),
                       "score": len(exact) * 2 + len(partial)})
    scored.sort(key=lambda it: (-it["score"], it["name"].lower()))
    return scored[: max(1, int(limit))]


def _norm(text) -> str:
    return _SPLIT.sub("", str(text or "").strip().lower())


def main() -> None:
    data = scan()
    print(f"b-roll: {data['count']} file terindeks dalam {data['scanned_ms']} ms → "
          f"{INDEX_FILE.relative_to(ROOT_DIR).as_posix()}")
    for it in data["items"][:10]:
        print(f"  {it['name']} · {it['dur_ms']}ms · {','.join(it['tags']) or '-'}")


if __name__ == "__main__":
    main()
