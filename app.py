"""
AutoClip Studio - Web UI (Streamlit)
Mode 1: YouTube & Long-Form Video Clipper (Face-Tracking + Word-by-Word Subtitles)
Mode 2: TikTok Affiliate UGC Generator (Product Review + Voiceover + 9:16 Slideshow)
"""
import os
import sys
import json
import time
from pathlib import Path
import streamlit as st

HERE = Path(__file__).resolve().parent
CHOPIFY_DIR = HERE / "chopify"
if str(CHOPIFY_DIR) not in sys.path:
    sys.path.insert(0, str(CHOPIFY_DIR))

import core_engine
import render_clips
import affiliate_engine

st.set_page_config(
    page_title="AutoClip & Affiliate Studio",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .main-header { font-size: 2.2rem; font-weight: 700; margin-bottom: 0.2rem; }
    .sub-header { color: #888888; margin-bottom: 1.5rem; font-size: 1rem; }
    .score-badge { background: #ff4b4b; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; }
</style>
""", unsafe_allow_html=True)

# Session state init
for k, v in {
    "source_video": None,
    "transcript": None,
    "candidates": [],
    "rendered_clips": [],
    "affiliate_result": None,
    "workdir": str(HERE / "work"),
    "out_dir": str(HERE / "clips")
}.items():
    if k not in st.session_state:
        st.session_state[k] = v

workdir = Path(st.session_state.workdir)
out_dir = Path(st.session_state.out_dir)
workdir.mkdir(parents=True, exist_ok=True)
out_dir.mkdir(parents=True, exist_ok=True)

# Sidebar
with st.sidebar:
    st.header("⚙️ Konfigurasi Sistem")
    
    scoring_model = st.selectbox(
        "Model AI (9Router):",
        ["ag/gemini-3.8-flash", "clean/gemini-3.7-flash", "clean/claude-sonnet-5"],
        index=0,
        help="Model yang di-route lewat 9Router lokal (127.0.0.1:20128) - Biaya Rp0"
    )
    
    st.markdown("---")
    st.subheader("Pengaturan Clipper")
    aspect_choice = st.selectbox("Format Output Clipper:", ["9:16", "16:9", "1:1"], index=0)
    caption_style = st.selectbox("Style Subtitle Clipper:", ["hormozi", "mrbeast", "default", "podcast"], index=0)
    
    col_d1, col_d2 = st.columns(2)
    with col_d1:
        min_dur = st.number_input("Min Durasi (s):", min_value=10, max_value=60, value=15)
    with col_d2:
        max_dur = st.number_input("Max Durasi (s):", min_value=20, max_value=120, value=60)
    tighten_cuts = st.checkbox("Buang jeda hening / filler words", value=True)
    
    st.markdown("---")
    if st.button("🗑️ Reset Cache & Data", use_container_width=True):
        st.session_state.source_video = None
        st.session_state.transcript = None
        st.session_state.candidates = []
        st.session_state.rendered_clips = []
        st.session_state.affiliate_result = None
        st.rerun()

st.markdown('<div class="main-header">🎬 AutoClip & Affiliate Studio</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-header">Platform otomasi konten video vertikal 9:16 • Zero Cost • Didukung 9Router & FFmpeg Lokal.</div>', unsafe_allow_html=True)

# Main Studio Tabs
tab_clipper, tab_affiliate = st.tabs([
    "✂️ Mode 1: AutoClip (YouTube/Long-Form)",
    "🛍️ Mode 2: TikTok Affiliate (Produk/Aksesoris UGC)"
])

# =========================================================================
# TAB 1: AutoClip (YouTube / Long Videos)
# =========================================================================
with tab_clipper:
    sub_yt, sub_upload = st.tabs(["🔗 Link YouTube", "📁 Upload File Video"])
    with sub_yt:
        yt_input = st.text_input("Link YouTube Video:", placeholder="https://www.youtube.com/watch?v=...", key="yt_input_box")
    with sub_upload:
        uploaded_video = st.file_uploader("File Video MP4:", type=["mp4", "mkv", "mov"], key="video_uploader_box")

    start_scan = st.button("🚀 1. Analisis & Cari Momen Viral", type="primary", use_container_width=True, key="scan_btn")

    if start_scan:
        target = yt_input.strip() if yt_input.strip() else None
        if not target and uploaded_video:
            temp_path = workdir / uploaded_video.name
            temp_path.write_bytes(uploaded_video.getbuffer())
            target = str(temp_path)
            
        if not target:
            st.error("Masukkan link YouTube atau upload file video terlebih dahulu.")
        else:
            with st.status("Sedang memproses video...", expanded=True) as status:
                st.write("📥 Menyiapkan video sumber...")
                source_path = core_engine.download_source(target, workdir)
                st.session_state.source_video = str(source_path)
                
                st.write("🎙️ Menyiapkan transkrip...")
                transcript = core_engine.get_transcript(
                    source_path, workdir,
                    yt_url=target if target.startswith("http") else None
                )
                st.session_state.transcript = transcript
                
                st.write("🧠 Menilai momen viral via 9Router...")
                cands = core_engine.ninerouter_score(
                    transcript, model_name=scoring_model,
                    min_score=5.5, max_clips=8,
                    min_len=min_dur, max_len=max_dur
                )
                st.session_state.candidates = cands
                status.update(label="Selesai! Kandidat klip siap dipilih.", state="complete", expanded=False)
            st.rerun()

    if st.session_state.candidates:
        st.markdown("---")
        st.subheader(f"📋 Pilih Klip ({len(st.session_state.candidates)} Momen Ditemukan)")
        selected_indices = []
        
        for i, cand in enumerate(st.session_state.candidates):
            dur = round(cand["end"] - cand["start"], 1)
            start_min = f"{int(cand['start']//60):02d}:{int(cand['start']%60):02d}"
            end_min = f"{int(cand['end']//60):02d}:{int(cand['end']%60):02d}"
            
            c1, c2 = st.columns([1, 11])
            with c1:
                checked = st.checkbox("Pilih", value=True, key=f"cand_chk_{i}")
                if checked:
                    selected_indices.append(i)
            with c2:
                st.markdown(f"**#{i+1} {cand.get('hook', 'Untitled')}** &nbsp; <span class='score-badge'>Skor: {cand.get('overall', 7.0)}/10</span>", unsafe_allow_html=True)
                st.caption(f"⏱️ `{start_min}` ➔ `{end_min}` ({dur}s)")
                words = st.session_state.transcript.get("words", [])
                snippet = [w["word"] for w in words if cand["start"] <= w["start"] <= cand["end"]]
                if snippet:
                    st.text(" ".join(snippet[:35]) + "...")

        if st.button(f"🎬 2. Render {len(selected_indices)} Klip (9:16 Face-Tracking)", type="primary", disabled=len(selected_indices) == 0):
            st.session_state.rendered_clips = []
            source_p = Path(st.session_state.source_video)
            W, H = render_clips.ffprobe_dims(source_p)
            words = st.session_state.transcript["words"]
            
            with st.status("Rendering klip vertikal...", expanded=True) as r_status:
                for idx in selected_indices:
                    seg = st.session_state.candidates[idx]
                    st.write(f"⚙️ Memproses: {seg.get('hook', '')}...")
                    try:
                        res_p = render_clips.render(
                            seg=seg, words=words, source=source_p, W=W, H=H,
                            workdir=workdir, aspect=aspect_choice, out_dir=out_dir,
                            style=caption_style, do_tighten=tighten_cuts
                        )
                        st.session_state.rendered_clips.append(str(res_p))
                    except Exception as e:
                        st.error(f"Error klip #{idx+1}: {e}")
                r_status.update(label="Render selesai!", state="complete", expanded=False)
            st.rerun()

    if st.session_state.rendered_clips:
        st.markdown("---")
        st.subheader("🎉 Video Siap Di-Publish")
        for p_str in st.session_state.rendered_clips:
            p = Path(p_str)
            meta_p = p.with_suffix(".meta.json")
            meta = json.loads(meta_p.read_text(encoding="utf-8")) if meta_p.exists() else {}
            
            c1, c2 = st.columns([1, 2])
            with c1:
                st.video(str(p))
            with c2:
                st.markdown(f"#### {meta.get('title', p.stem)}")
                st.code(meta.get("description", ""))
                with open(p, "rb") as f:
                    st.download_button(f"⬇️ Download {p.name}", f, file_name=p.name, mime="video/mp4", key=f"dl_clip_{p.stem}")

# =========================================================================
# TAB 2: TikTok Affiliate (Produk / Aksesoris UGC)
# =========================================================================
with tab_affiliate:
    st.subheader("🛍️ Generator Video Review Produk (Keranjang Kuning)")
    st.caption("Masukkan detail produk dan upload foto untuk membuat video UGC 9:16 siap posting lengkap dengan voiceover dan subtitle.")

    col_in1, col_in2 = st.columns(2)
    with col_in1:
        prod_name = st.text_input("Nama Produk:", placeholder="Contoh: Cincin Titanium Hitam Minimalist Anti Karat")
        prod_price = st.text_input("Harga & Promo:", placeholder="Contoh: Diskon 50% tinggal Rp 29.000")
        voice_choice = st.selectbox(
            "Pilihan Suara Voiceover (edge-tts):",
            ["id-ID-GadisNeural (Cewek Kasual / Friendly)", "id-ID-ArdiNeural (Cowok Santai / Natural)"],
            index=0
        )
    with col_in2:
        prod_points = st.text_area(
            "Keunggulan / Detail Produk:",
            placeholder="Contoh: Bahan titanium asli, kena air gak hitam, gak bikin alergi, unisex cocok cowok cewek.",
            height=125
        )

    uploaded_photos = st.file_uploader(
        "Upload 2-6 Foto Produk (Katalog / Review Buyer):",
        type=["jpg", "jpeg", "png", "webp"],
        accept_multiple_files=True,
        key="affiliate_photos"
    )

    gen_affiliate_btn = st.button("🚀 Buat Video Review Affiliate (9:16)", type="primary", use_container_width=True)

    if gen_affiliate_btn:
        if not prod_name.strip() or not prod_price.strip() or not uploaded_photos:
            st.error("Wajib mengisi nama produk, harga, dan mengunggah minimal 2 foto produk.")
        else:
            with st.status("Memproses video review affiliate...", expanded=True) as a_status:
                st.write("🧠 1. Membuat script UGC via 9Router...")
                script_data = affiliate_engine.generate_script(
                    prod_name, prod_price, prod_points, model_name=scoring_model
                )
                
                # Save photos locally
                img_paths = []
                aff_dir = workdir / f"aff_{int(time.time())}"
                aff_dir.mkdir(parents=True, exist_ok=True)
                for idx, ph in enumerate(uploaded_photos):
                    img_file = aff_dir / f"img_{idx:02d}{Path(ph.name).suffix}"
                    img_file.write_bytes(ph.getbuffer())
                    img_paths.append(str(img_file))
                
                st.write("🎙️ 2. Merekam voiceover natural (edge-tts)...")
                voice_id = "id-ID-GadisNeural" if "Gadis" in voice_choice else "id-ID-ArdiNeural"
                audio_file = aff_dir / "voice.mp3"
                vtt_file = aff_dir / "sub.vtt"
                affiliate_engine.generate_audio_and_vtt(script_data["full_script"], voice_id, audio_file, vtt_file)
                
                st.write("🎬 3. Me-render video 9:16 vertikal + subtitle terbakar...")
                out_aff_video = out_dir / f"affiliate_{int(time.time())}.mp4"
                affiliate_engine.build_video(img_paths, audio_file, vtt_file, out_aff_video)
                
                # Save metadata
                meta_data = {
                    "product": prod_name,
                    "price": prod_price,
                    "script": script_data,
                    "caption": script_data.get("caption", "")
                }
                out_aff_video.with_suffix(".meta.json").write_text(
                    json.dumps(meta_data, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                
                st.session_state.affiliate_result = {
                    "video": str(out_aff_video),
                    "meta": meta_data
                }
                a_status.update(label="Video affiliate berhasil dibuat!", state="complete", expanded=False)
            st.rerun()

    if st.session_state.affiliate_result:
        st.markdown("---")
        st.subheader("🎉 Video Review Affiliate Siap Di-Upload ke TikTok")
        aff_res = st.session_state.affiliate_result
        res_video_p = Path(aff_res["video"])
        res_meta = aff_res["meta"]
        
        c_v1, c_v2 = st.columns([1, 2])
        with c_v1:
            if res_video_p.exists():
                st.video(str(res_video_p))
        with c_v2:
            st.markdown(f"#### {res_meta.get('product', 'Video Review Produk')}")
            st.markdown("**Naskah Voiceover yang Dibacakan:**")
            st.info(res_meta.get("script", {}).get("full_script", ""))
            st.markdown("**Caption Siap Copy (TikTok Keranjang Kuning):**")
            st.code(res_meta.get("caption", ""))
            
            with open(res_video_p, "rb") as f:
                st.download_button(
                    label=f"⬇️ Download Video ({res_video_p.name})",
                    data=f,
                    file_name=res_video_p.name,
                    mime="video/mp4",
                    key="dl_affiliate_btn"
                )
