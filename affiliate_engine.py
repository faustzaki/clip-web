"""
Affiliate Engine: Generates TikTok Shop UGC review videos from product info & photos.
- Script generation via 9Router local LLM (Rp0 token)
- Natural Indonesian voiceover via edge-tts (Rp0)
- 9:16 vertical slideshow assembly & burnt subtitles via FFmpeg
"""
import os
import sys
import json
import re
import urllib.request
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
NINEROUTER_API = "http://127.0.0.1:20128/v1/chat/completions"


def get_9router_key() -> str:
    key = os.environ.get("NINEROUTER_API_KEY", "")
    if key:
        return key
    omp_models = Path.home() / ".omp" / "agent" / "models.yml"
    if omp_models.exists():
        try:
            import yaml
            with open(omp_models, encoding="utf-8") as f:
                d = yaml.safe_load(f)
            return d.get("providers", {}).get("ninerouter", {}).get("apiKey", "")
        except Exception:
            pass
    return ""


def generate_script(product_name: str, price_info: str, key_points: str,
                    model_name: str = "ag/gemini-3.8-flash") -> dict:
    """Generate UGC TikTok script via 9Router local endpoint."""
    prompt = f"""Kamu adalah copywriter konten kreator TikTok Shop affiliate profesional.
Buat script video review produk singkat (durasi 20-30 detik, sekitar 50-70 kata) gaya UGC (User Generated Content) yang santai, meyakinkan, tidak kaku, dan langsung to-the-point.

Data Produk:
- Nama Produk: {product_name}
- Harga / Promo: {price_info}
- Keunggulan / Detail: {key_points}

Aturan script:
1. Hook 3 detik pertama harus kuat agar penonton berhenti scroll.
2. Body menjelaskan fitur utama dan kenapa harga ini worth it.
3. Call-to-action (CTA) ajak klik keranjang kuning sebelum kehabisan.
4. Output HANYA format JSON valid tanpa markdown pembuka/penutup:
{{
  "hook": "teks hook 3 detik",
  "body": "teks review poin utama",
  "cta": "teks cta keranjang kuning",
  "full_script": "teks lengkap hook + body + cta tanpa embel-embel judul",
  "caption": "caption menarik untuk postingan TikTok lengkap dengan 5 hashtag relevan"
}}"""

    payload = {
        "model": model_name,
        "temperature": 0.3,
        "stream": False,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    headers = {"Content-Type": "application/json"}
    token = get_9router_key()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(
        NINEROUTER_API,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers
    )

    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        m = re.search(r"\{.*\}", content, re.DOTALL)
        if m:
            return json.loads(m.group(0))
    except Exception as e:
        print(f"9Router error in script generator: {e}, using fallback template", flush=True)

    # Fallback template if offline
    return {
        "hook": f"Kalian wajib tahu produk satu ini!",
        "body": f"{product_name} ini beneran bagus banget. {key_points}. Harganya cuma {price_info}!",
        "cta": "Yuk langsung amankan di keranjang kuning sekarang!",
        "full_script": f"Kalian wajib tahu produk satu ini! {product_name} ini beneran bagus banget. {key_points}. Harganya cuma {price_info}! Yuk langsung amankan di keranjang kuning sekarang sebelum kehabisan!",
        "caption": f"Rekomendasi {product_name} terbaik cuma {price_info}! Cek keranjang kuning sekarang ✨ #racuntiktok #tiktokaffiliate #affiliate #fyp #racunshopee"
    }


def generate_audio_and_vtt(text: str, voice: str, out_audio: Path, out_vtt: Path) -> bool:
    """Generate voiceover audio & vtt subtitle using edge-tts CLI."""
    edge_bin = HERE / ".venv" / "Scripts" / "edge-tts.exe"
    cmd = [
        str(edge_bin) if edge_bin.exists() else "edge-tts",
        "--voice", voice,
        "--text", text,
        "--write-media", str(out_audio),
        "--write-subtitles", str(out_vtt)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode == 0 and out_audio.exists()


def get_audio_duration(audio_path: Path) -> float:
    """Get exact duration in seconds from audio file via ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())


def build_video(image_paths: list, audio_path: Path, vtt_path: Path, out_video: Path) -> Path:
    """
    Assemble 9:16 vertical video (1080x1920) from images + audio + subtitles.
    """
    total_dur = get_audio_duration(audio_path)
    num_imgs = len(image_paths)
    dur_per_img = max(2.0, total_dur / num_imgs)

    # Build concat file for images
    concat_txt = out_video.parent / "_concat.txt"
    lines = []
    for p in image_paths:
        clean_p = str(Path(p).resolve()).replace("\\", "/")
        lines.append(f"file '{clean_p}'")
        lines.append(f"duration {dur_per_img:.3f}")
    # Last image entry needs one more repetition for ffmpeg concat bug
    lines.append(f"file '{str(Path(image_paths[-1]).resolve()).replace(chr(92), '/')}'")
    concat_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Subtitle filter string (windows path escape)
    sub_arg = ""
    if vtt_path and vtt_path.exists():
        sub_escaped = str(vtt_path.resolve()).replace("\\", "/").replace(":", "\\:")
        sub_arg = f",subtitles='{sub_escaped}':force_style='FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=120'"

    # FFmpeg filter: scale to 1080x1920 crop centered vertical
    vf = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        f"fps=30{sub_arg}"
    )

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_txt),
        "-i", str(audio_path),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_video)
    ]

    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        concat_txt.unlink()
    except OSError:
        pass

    return out_video
