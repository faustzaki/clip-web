import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Ratio,
  RectangleVertical,
  RectangleHorizontal,
  Expand,
  Type,
  Captions,
  Scissors,
  Square,
  Volume2,
  VolumeX,
  FileVideo,
  Layers,
  Crop,
  Loader2,
  Download,
  Check,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Move,
  Maximize2,
  Play,
  Pause,
} from 'lucide-react';
import { renderClip, putPrefs, publishClip, computeZoomKeyframes, fetchBrand } from '../api';

const SUBTITLE_SAMPLE = ['CONTOH', 'TEKS', 'SUBTITLE', 'KARAOKE'];

// T11: margin logo brand = 24 px pada frame 1080x1920 (1.25%), ukuran = logo_size_pct% tinggi frame
const BRAND_LOGO_MARGIN = '1.25%';
const BRAND_LOGO_POS = {
  tl: { top: BRAND_LOGO_MARGIN, left: BRAND_LOGO_MARGIN },
  tr: { top: BRAND_LOGO_MARGIN, right: BRAND_LOGO_MARGIN },
  bl: { bottom: BRAND_LOGO_MARGIN, left: BRAND_LOGO_MARGIN },
  br: { bottom: BRAND_LOGO_MARGIN, right: BRAND_LOGO_MARGIN },
};

/**
 * Panggung preview 9:16 milik studio: viewport video (satu elemen <video> — ref diteruskan via props),
 * overlay subtitle/judul/watermark, kontrol transform, scrubber, dan toolbar aksi klip aktif.
 */
export default function PreviewStage({
  projectId,
  project,
  prefs,
  prefsRef,
  savePrefs,
  options,
  aspect,
  currentVideo,
  videoRef,
  candidates,
  clips,
  activeCandidate,
  activeCandidateIdx,
  setActiveCandidateIdx,
  currentTime,
  setCurrentTime,
  duration,
  jumpToCandidate,
  cropMode,
  tightenCuts,
  renderQuality,
  onRefreshState,
  onClipRendered,
  onOpenCropStudio,
  onOpenSubtitleApply,
  saveZoomKeyframes,
}) {
  const frameBoxRef = useRef(null);
  const frameRef = useRef(null);
  const trackRef = useRef(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });

  const st = prefs?.subtitle_style || {};
  const subPx = (v) => Math.max(2, Math.round((Number(v) || 0) * (frameSize.h || 800) / 1920));
  const subAlign = st.position === 'top' ? 'flex-start' : st.position === 'middle' ? 'center' : 'flex-end';
  const padTop = st.position === 'top' ? subPx(st.margin_v ?? 300) : 0;
  const padBottom = st.position === 'bottom' ? subPx(st.margin_v ?? 300) : 0;

  // Subtitle interactive transform state
  const [isSubSelected, setIsSubSelected] = useState(false);
  const [subOffsetX, setSubOffsetX] = useState(0);
  const [subDragInfo, setSubDragInfo] = useState({ isDragging: false, isCenterSnapped: false, snapZone: null });
  const [activeBadge, setActiveBadge] = useState(null);
  const subBoxRef = useRef(null);

  // Video view mode & freeform state
  const [videoViewMode, setVideoViewMode] = useState('fit'); // 'fit' | 'cover' | 'freeform'
  const [videoPos, setVideoPos] = useState({ x: 0, y: 0 });
  const [videoScale, setVideoScale] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playIndicator, setPlayIndicator] = useState(null); // { type: 'play' | 'pause', key: number }
  const playAnimTimeoutRef = useRef(null);

  useEffect(() => {
    setVideoViewMode('fit');
    setVideoPos({ x: 0, y: 0 });
    setVideoScale(1);
  }, [projectId]);

  useEffect(() => {
    const el = frameBoxRef.current;
    if (!el) return;
    const ratio = aspect === '1:1' ? 1 : aspect === '16:9' ? 16 / 9 : aspect === '4:5' ? 4 / 5 : 9 / 16;
    const measure = () => {
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return;
      const w = Math.min(b.width, b.height * ratio);
      setFrameSize({ w: Math.round(w), h: Math.round(w / ratio) });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [aspect]);

  const [brand, setBrand] = useState(null);

  useEffect(() => {
    let alive = true;
    const loadBrand = async () => {
      try {
        const data = await fetchBrand();
        if (alive) setBrand(data.ok === false ? null : data.brand || null);
      } catch {
        if (alive) setBrand(null);
      }
    };
    loadBrand();
    window.addEventListener('vz:brand-updated', loadBrand);
    return () => {
      alive = false;
      window.removeEventListener('vz:brand-updated', loadBrand);
    };
  }, []);

  const [isMuted, setIsMuted] = useState(false);
  const [renderingIndices, setRenderingIndices] = useState(new Set());

  const mmss = (s) => {
    const sec = Math.max(0, Number(s) || 0);
    const m = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };
  const pct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  // Pill toolbar (Ratio/Background/Layout) + panel Layout (safe zone, auto zoom)
  const [openMenu, setOpenMenu] = useState(null);
  const [zoomBusy, setZoomBusy] = useState(false);
  const [zoomNote, setZoomNote] = useState('');
  const [zoomDraft, setZoomDraft] = useState(null);
  const menuRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const zoomManual = zoomDraft ?? Number(prefs?.zoom_manual || 100);
  // Merge dari prefsRef, bukan dari prop `prefs` yang bisa basi di tick yang sama
  // (dua PUT berurutan: yang kedua menimpa nilai yang baru saja ditulis).
  const patchPrefs = (patch) => {
    const next = { ...(prefsRef.current || {}), ...patch };
    prefsRef.current = next;
    return savePrefs(next);
  };
  // Drag subtitle/rotate/scale memakai updater fungsional; samakan kontraknya ke patchPrefs.
  const setPrefs = (updater) => savePrefs(
    typeof updater === 'function' ? updater(prefsRef.current || {}) : updater);

  // T12: latar + susunan ulang. `offset_y` bergeser mengikuti tinggi frame (px pratinjau).
  const layoutMode = prefs?.layout || 'off';
  const bgFill = prefs?.bg_fill || 'blur';
  const bgColor = prefs?.bg_color || '#4822A5';
  const blurOk = options?.capabilities?.blur !== false;
  const layoutActive = layoutMode !== 'off' && videoViewMode !== 'freeform';
  const [offsetDraft, setOffsetDraft] = useState(null);
  const bgVideoRef = useRef(null);
  const liveOffsetY = offsetDraft ?? Number(prefs?.offset_y || 0);
  const offPx = Math.round((liveOffsetY / 100) * (frameSize.h || 0));
  // Color picker mengirim event bertubi-tubi saat digeser; tampilkan langsung, simpan setelah diam.
  const [colorDraft, setColorDraft] = useState(null);
  const colorTimerRef = useRef(null);
  const liveBgColor = colorDraft ?? bgColor;
  const onPickColor = (hex) => {
    const val = hex.toUpperCase();
    setColorDraft(val);
    clearTimeout(colorTimerRef.current);
    colorTimerRef.current = setTimeout(() => {
      setColorDraft(null);
      patchPrefs({ bg_color: val });
    }, 350);
  };
  useEffect(() => () => clearTimeout(colorTimerRef.current), []);
  // Sama dengan render ffmpeg: radius blur 24 px & sudut 32 px pada frame 1080x1920.
  const pxAt1080 = (v) => Math.max(1, Math.round(v * (frameSize.h || 800) / 1920));

  // Latar blur = duplikat video yang mengikuti frame waktu klip utama.
  useEffect(() => {
    const bg = bgVideoRef.current;
    if (bg && Math.abs(bg.currentTime - currentTime) > 0.2) bg.currentTime = currentTime;
  }, [currentTime, bgFill, layoutMode]);

  const runAutoZoom = async (on, zoomValue) => {
    patchPrefs({ zoom_auto: on });
    setZoomNote('');
    if (!on || activeCandidateIdx == null) return;
    setZoomBusy(true);
    try {
      const res = await computeZoomKeyframes(projectId, {
        candidate_index: activeCandidateIdx,
        zoom_manual: Number(zoomValue ?? prefsRef.current?.zoom_manual ?? 100),
        aspect,
      });
      if (!res?.ok) {
        setZoomNote(res?.reason || 'Zoom otomatis tidak tersedia.');
        return;
      }
      await saveZoomKeyframes?.(activeCandidateIdx, res.keyframes);
      setZoomNote(`${res.keyframes.length} titik zoom siap · rasio ${res.aspect}.`);
    } catch (err) {
      setZoomNote(`Zoom otomatis gagal: ${err.message}`);
    } finally {
      setZoomBusy(false);
    }
  };

  const commitZoomManual = (value) => {
    setZoomDraft(null);
    patchPrefs({ zoom_manual: value });
    if (prefs?.zoom_auto) runAutoZoom(true, value);
  };

  const enterFullscreen = () => {
    const el = frameBoxRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  const RATIO_ITEMS = [
    { id: '9:16', label: '9:16 (Reels/TikTok)', icon: RectangleVertical },
    { id: '1:1', label: '1:1 (Feed persegi)', icon: Square },
    { id: '4:5', label: '4:5 (Feed portrait)', icon: RectangleVertical },
    { id: '16:9', label: '16:9 (Landscape)', icon: RectangleHorizontal },
  ];
  // T12: susunan ulang + isi latar. "off" = framing lama (pill Background) tetap dipakai.
  const LAYOUT_ITEMS = [
    { id: 'off', label: 'Tanpa' },
    { id: 'center', label: 'Tengah' },
    { id: 'stack', label: 'Atas-bawah' },
    { id: 'box', label: 'Kotak' },
  ];
  const BG_FILL_ITEMS = [
    { id: 'blur', label: 'Blur' },
    { id: 'color', label: 'Warna' },
    { id: 'black', label: 'Hitam' },
  ];
  const BACKGROUND_ITEMS = [
    { id: 'speaker-tracked', label: 'Wajah pembicara' },
    { id: 'center', label: 'Tengah (statis)' },
    { id: 'blur', label: 'Blur latar' },
    { id: 'split', label: 'Split reaksi + gameplay' },
  ];
  const PILL_CLASS = 'flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors';
  const pillTone = (open) => (open
    ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)]'
    : 'bg-[var(--vz-surface)] border-[var(--vz-border)] text-[var(--vz-text)] hover:border-[var(--vz-accent)] hover:text-[var(--vz-accent)]');

  const triggerPlayOverlay = (type) => {
    clearTimeout(playAnimTimeoutRef.current);
    setPlayIndicator({ type, key: Date.now() });
    playAnimTimeoutRef.current = setTimeout(() => {
      setPlayIndicator(null);
    }, 650);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !currentVideo?.url) return;
    if (v.paused) {
      v.play().catch(() => {});
      triggerPlayOverlay('play');
    } else {
      v.pause();
      triggerPlayOverlay('pause');
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const seekToClientX = (clientX) => {
    const el = trackRef.current;
    const v = videoRef.current;
    if (!el || !v || !duration) return;
    const b = el.getBoundingClientRect();
    if (b.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - b.left) / b.width));
    const t = ratio * duration;
    v.currentTime = t;
    setCurrentTime(t);
    const hit = candidates.findIndex((c) => t >= c.start && t <= c.end);
    if (hit !== activeCandidateIdx) setActiveCandidateIdx(hit === -1 ? null : hit);
  };

  const startSeek = (e) => {
    e.preventDefault();
    seekToClientX(e.clientX);
    const move = (ev) => seekToClientX(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  // Subtitle interactive handlers: Drag & Drop with sticky snap & center guidelines
  const startSubtitleDrag = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsSubSelected(true);
    const frameEl = frameRef.current;
    if (!frameEl) return;
    const frameRect = frameEl.getBoundingClientRect();
    if (frameRect.height <= 0) return;
    const frameCenterX = frameRect.left + frameRect.width / 2;

    const move = (ev) => {
      const dx = ev.clientX - frameCenterX;
      const isCenterSnapped = Math.abs(dx) <= 8;
      const offX = isCenterSnapped ? 0 : Math.round(dx);

      const r = Math.min(1, Math.max(0, (ev.clientY - frameRect.top) / frameRect.height));
      let patch;
      let snapZone = null;

      if (r < 0.08) {
        snapZone = 'top';
        patch = { position: 'top', margin_v: 120 };
      } else if (Math.abs(r - 0.5) <= 0.03) {
        snapZone = 'middle';
        patch = { position: 'middle', margin_v: 0 };
      } else if (r > 0.92) {
        snapZone = 'bottom';
        patch = { position: 'bottom', margin_v: 200 };
      } else if (r < 0.5) {
        patch = { position: 'top', margin_v: Math.round(Math.min(900, Math.max(0, r * 1920))) };
      } else {
        patch = { position: 'bottom', margin_v: Math.round(Math.min(900, Math.max(0, (1 - r) * 1920))) };
      }

      setSubDragInfo({ isDragging: true, isCenterSnapped, snapZone });
      setSubOffsetX(offX);
      setPrefs((cur) => ({
        ...(cur || {}),
        subtitle_style: { ...(cur?.subtitle_style || {}), ...patch },
      }));
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSubDragInfo({ isDragging: false, isCenterSnapped: false, snapZone: null });
      setSubOffsetX(0);
      putPrefs(projectId, prefsRef.current).catch((err) => console.error('Failed to save prefs:', err));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  // Subtitle interactive handlers: Rotate with angle badge & ±5° snapping
  const startSubtitleRotate = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsSubSelected(true);
    const boxEl = subBoxRef.current;
    if (!boxEl) return;
    const boxRect = boxEl.getBoundingClientRect();
    const centerX = boxRect.left + boxRect.width / 2;
    const centerY = boxRect.top + boxRect.height / 2;

    const move = (ev) => {
      let angle = Math.round(Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180 / Math.PI) + 90;
      while (angle > 180) angle -= 360;
      while (angle < -180) angle += 360;

      // Snap to 0° and ±90° when within ±5°
      if (Math.abs(angle) <= 5) angle = 0;
      else if (Math.abs(angle - 90) <= 5) angle = 90;
      else if (Math.abs(angle + 90) <= 5) angle = -90;

      setActiveBadge({ type: 'angle', text: `${angle}°` });
      setPrefs((cur) => ({
        ...(cur || {}),
        subtitle_style: { ...(cur?.subtitle_style || {}), angle },
      }));
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setActiveBadge(null);
      putPrefs(projectId, prefsRef.current).catch((err) => console.error('Failed to save prefs:', err));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  // Subtitle interactive handlers: Scale with corner handle & size badge
  const startSubtitleScale = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsSubSelected(true);
    const boxEl = subBoxRef.current;
    if (!boxEl) return;
    const boxRect = boxEl.getBoundingClientRect();
    const centerX = boxRect.left + boxRect.width / 2;
    const centerY = boxRect.top + boxRect.height / 2;
    const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const startFontSize = Number(prefsRef.current?.subtitle_style?.font_size || 43);

    const move = (ev) => {
      const curDist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
      const ratio = startDist > 0 ? curDist / startDist : 1;
      const newSize = Math.round(Math.min(180, Math.max(24, startFontSize * ratio)));

      setActiveBadge({ type: 'size', text: `${newSize}px` });
      setPrefs((cur) => ({
        ...(cur || {}),
        subtitle_style: { ...(cur?.subtitle_style || {}), font_size: newSize },
      }));
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setActiveBadge(null);
      putPrefs(projectId, prefsRef.current).catch((err) => console.error('Failed to save prefs:', err));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  // Freeform video handlers: Pan & Zoom beyond canvas bounds
  const startVideoDrag = (e) => {
    if (videoViewMode !== 'freeform' || e.button !== 0) return;
    if (e.target.closest?.('[data-subtitle-interactive]')) return;

    e.preventDefault();
    setIsSubSelected(false);
    const startX = e.clientX;
    const startY = e.clientY;
    const origPos = { ...videoPos };
    let hasMoved = false;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      setVideoPos({
        x: Math.round(origPos.x + dx),
        y: Math.round(origPos.y + dy),
      });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!hasMoved) {
        togglePlay();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  // T12: tarik video naik/turun di pratinjau -> offset_y (-30..30 %), disimpan saat dilepas.
  const startOffsetDrag = (e) => {
    if (!layoutActive || e.button !== 0) return;
    if (e.target.closest?.('[data-subtitle-interactive]')) return;
    e.preventDefault();
    setIsSubSelected(false);
    const startY = e.clientY;
    const startOffset = Number(prefsRef.current?.offset_y || 0);
    const h = frameSize.h || 1;
    let draft = startOffset;
    let moved = false;

    const move = (ev) => {
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > 3) moved = true;
      draft = Math.max(-30, Math.min(30, Math.round(startOffset + (dy / h) * 100)));
      setOffsetDraft(draft);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setOffsetDraft(null);
      if (moved) patchPrefs({ offset_y: draft });
      else togglePlay();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const handleVideoWheel = (e) => {
    if (videoViewMode !== 'freeform') return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.08 : -0.08;
    setVideoScale((prev) => Math.min(3.0, Math.max(0.3, Math.round((prev + step) * 100) / 100)));
  };

  const startVideoCornerScale = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startScale = videoScale;
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect) return;
    const centerX = frameRect.left + frameRect.width / 2;
    const centerY = frameRect.top + frameRect.height / 2;
    const startDist = Math.hypot(startX - centerX, startY - centerY);

    const move = (ev) => {
      const curDist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
      const ratio = startDist > 0 ? curDist / startDist : 1;
      const nextScale = Math.min(3.0, Math.max(0.3, Math.round(startScale * ratio * 100) / 100));
      setVideoScale(nextScale);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const handleRenderSingle = async (idx) => {
    const cand = candidates[idx];
    if (!cand) return;

    try {
      setRenderingIndices((prev) => new Set(prev).add(idx));
      const res = await renderClip(projectId, {
        candidate_index: idx,
        aspect: aspect,
        crop_mode: cropMode === 'topic-hook' ? 'center' : cropMode,
        crop_rect: (project?.crops || {})[String(idx)] || null,
        do_tighten: tightenCuts,
        custom_hook: cand.hook,
        quality: renderQuality && project?.source_url ? renderQuality : 'original'
      });

      setRenderingIndices((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });

      await onRefreshState();
      if (onClipRendered) onClipRendered(res.clip);
      alert('✅ Clip dipotong. Lanjut "Terapkan Subtitle".');
    } catch (err) {
      setRenderingIndices((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
      alert(`Render gagal: ${err.message}`);
    }
  };

  const handlePublish = async (slug) => {
    try {
      await publishClip(projectId, slug);
      await onRefreshState();
      alert('✅ Klip berhasil dijadikan final.');
    } catch (err) {
      alert(`Gagal publish: ${err.message}`);
    }
  };

  return (
    <main className="relative flex-1 min-w-0 flex flex-col items-center justify-between overflow-hidden gap-1.5 py-1">
      {/* Vertical Mobile Phone Viewport (auto-scales cleanly to available height) */}
      <div ref={frameBoxRef} className="w-full flex-1 min-h-0 flex items-center justify-center">
        <div
          ref={frameRef}
          data-region="preview-frame"
          onClick={() => setIsSubSelected(false)}
          style={{
            width: frameSize.w ? `${frameSize.w}px` : undefined,
            height: frameSize.h ? `${frameSize.h}px` : undefined,
            aspectRatio: aspect === '1:1' ? '1 / 1' : aspect === '16:9' ? '16 / 9' : aspect === '4:5' ? '4 / 5' : '9 / 16',
            maxHeight: '100%',
            maxWidth: '100%',
          }}
          className="relative bg-black rounded-[24px] border-4 border-[var(--vz-border)] overflow-hidden shadow-2xl select-none"
        >
          {/* Play/Pause Animated Click Indicator */}
          {playIndicator && (
            <div
              key={playIndicator.key}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-play-pulse"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/60 backdrop-blur-sm border border-[var(--vz-border)] flex items-center justify-center text-white shadow-2xl">
                {playIndicator.type === 'play' ? (
                  <Play className="w-8 h-8 md:w-10 md:h-10 fill-white translate-x-0.5" />
                ) : (
                  <Pause className="w-8 h-8 md:w-10 md:h-10 fill-white" />
                )}
              </div>
            </div>
          )}
          {Boolean(prefs?.title_enabled) && (
            <div className="absolute top-6 left-0 right-0 z-20 flex justify-center px-4">
              <div className="bg-black/90 backdrop-blur-sm border border-[var(--vz-text-strong)] px-4 py-2 rounded-lg shadow-xl max-w-[90%] text-center">
                <span className="text-white font-extrabold text-xs md:text-sm tracking-wide uppercase line-clamp-2">
                  {activeCandidate?.hook || 'HOOK TITLE PREVIEW'}
                </span>
              </div>
            </div>
          )}

          {/* Top Right Watermark (only if enabled) */}
          {prefs?.watermark_enabled && (prefs?.watermark || '').trim() && (
            <div className="absolute top-4 right-4 z-20 text-[10px] text-white/60 font-semibold tracking-wider bg-black/40 px-2 py-0.5 rounded-full">
              {prefs.watermark}
            </div>
          )}

          {/* Logo brand kit (T11): sudut & ukuran mengikuti Settings → Brand Kit */}
          {brand?.logo_url && (
            <img
              src={brand.logo_url}
              alt="Logo brand"
              data-region="brand-logo"
              className="absolute z-20 pointer-events-none select-none"
              style={{
                height: `${brand.logo_size_pct || 8}%`,
                ...(BRAND_LOGO_POS[brand.logo_corner] || BRAND_LOGO_POS.br),
              }}
            />
          )}

          {/* Safe zone TikTok/Reels: 88% lebar x 80% tinggi, overlay (tanpa geser layout) */}
          {Boolean(prefs?.safe_zone) && (
            <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
              <div data-region="safe-zone" className="relative w-[88%] h-[80%] border border-dashed border-[var(--vz-text-muted)]">
                <span className="absolute -top-4 left-0 text-[10px] font-semibold text-[var(--vz-text-muted)]">
                  Area aman
                </span>
              </div>
            </div>
          )}

          {/* Vertical Center Guideline */}
          {subDragInfo.isDragging && (
            <div
              className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all ${
                subDragInfo.isCenterSnapped
                  ? 'w-1 bg-[var(--vz-accent)] opacity-100'
                  : 'w-0.5 bg-[var(--vz-accent)] opacity-70'
              }`}
            />
          )}

          {/* Horizontal Snap Guidelines */}
          {subDragInfo.isDragging && subDragInfo.snapZone === 'top' && (
            <div className="absolute left-0 right-0 top-[6%] h-0.5 bg-[var(--vz-accent)] pointer-events-none z-30 flex items-center justify-center">
              <span className="bg-[var(--vz-surface)] text-[10px] text-[var(--vz-accent)] font-bold font-mono px-2 py-0.5 rounded-full border border-[var(--vz-accent)] uppercase shadow-md">
                Atas (Top)
              </span>
            </div>
          )}
          {subDragInfo.isDragging && subDragInfo.snapZone === 'middle' && (
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-[var(--vz-accent)] pointer-events-none z-30 flex items-center justify-center">
              <span className="bg-[var(--vz-surface)] text-[10px] text-[var(--vz-accent)] font-bold font-mono px-2 py-0.5 rounded-full border border-[var(--vz-accent)] uppercase shadow-md">
                Tengah (Middle)
              </span>
            </div>
          )}
          {subDragInfo.isDragging && subDragInfo.snapZone === 'bottom' && (
            <div className="absolute left-0 right-0 bottom-[6%] h-0.5 bg-[var(--vz-accent)] pointer-events-none z-30 flex items-center justify-center">
              <span className="bg-[var(--vz-surface)] text-[10px] text-[var(--vz-accent)] font-bold font-mono px-2 py-0.5 rounded-full border border-[var(--vz-accent)] uppercase shadow-md">
                Bawah (Bottom)
              </span>
            </div>
          )}

          {/* Freeform Video Frame Guides & Corner Handles */}
          {videoViewMode === 'freeform' && (
            <>
              <div className="absolute inset-0 border border-[var(--vz-accent)] pointer-events-none rounded-[20px] z-10" />
              {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((c) => (
                <div
                  key={c}
                  onPointerDown={startVideoCornerScale}
                  className={`absolute z-30 w-3.5 h-3.5 bg-[var(--vz-accent)] border border-[var(--vz-text-strong)] rounded-sm shadow hover:scale-125 transition-transform ${
                    c === 'top-left'
                      ? 'top-2 left-2 cursor-nwse-resize'
                      : c === 'top-right'
                      ? 'top-2 right-2 cursor-nesw-resize'
                      : c === 'bottom-left'
                      ? 'bottom-2 left-2 cursor-nesw-resize'
                      : 'bottom-2 right-2 cursor-nwse-resize'
                  }`}
                  title="Tarik untuk zoom video"
                />
              ))}
            </>
          )}

          {/* Subtitle Drag & Transform Overlay */}
          {currentVideo?.url && Boolean(prefs?.subtitles_enabled) && (
            <div
              className="absolute inset-0 z-20 flex justify-center pointer-events-none"
              style={{
                alignItems: subAlign,
                paddingTop: padTop,
                paddingBottom: padBottom,
              }}
            >
              <div
                ref={subBoxRef}
                data-subtitle-interactive="true"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSubSelected(true);
                }}
                onPointerDown={startSubtitleDrag}
                title="Tarik untuk atur posisi subtitle"
                className={`relative pointer-events-auto cursor-grab active:cursor-grabbing select-none max-w-[92%] transition-shadow ${
                  isSubSelected ? 'ring-2 ring-[var(--vz-accent)] ring-dashed ring-offset-2 ring-offset-[var(--vz-bg)] rounded-lg p-1' : ''
                }`}
                style={{
                  fontFamily: st.font || 'Arial Black',
                  fontSize: subPx(st.font_size || 43),
                  fontWeight: st.bold ? 900 : 400,
                  color: st.primary_color || '#FFFFFF',
                  WebkitTextStroke: `${subPx(st.outline_width ?? 5)}px ${st.outline_color || '#000000'}`,
                  paintOrder: 'stroke fill',
                  textShadow: `0 ${subPx(st.shadow ?? 2)}px ${subPx((st.shadow ?? 2) * 2)}px ${st.outline_color || '#000000'}`,
                  background: st.box ? (st.box_color || '#000000') : 'transparent',
                  padding: st.box ? `${subPx(6)}px ${subPx(12)}px` : 0,
                  borderRadius: st.box ? subPx(8) : 0,
                  textTransform: st.uppercase ? 'uppercase' : 'none',
                  lineHeight: 1.15,
                  textAlign: 'center',
                  transform: `translate3d(${subOffsetX}px, 0, 0) rotate(${st.angle || 0}deg)`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Subtitle Words */}
                {SUBTITLE_SAMPLE.map((w, i) => (
                  <span
                    key={i}
                    style={{
                      color: i === 1 ? (st.highlight_color || '#FFE100') : (st.primary_color || '#FFFFFF'),
                      marginRight: subPx(12),
                    }}
                  >
                    {w}
                  </span>
                ))}

                {/* Floating Active Badge (angle / size) */}
                {activeBadge && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[var(--vz-accent)] text-white font-mono font-black text-xs px-2.5 py-0.5 rounded-full shadow-lg pointer-events-none z-50 whitespace-nowrap animate-pulse">
                    {activeBadge.text}
                  </div>
                )}

                {/* Transform Controls when Selected */}
                {isSubSelected && (
                  <>
                    {/* Rotate Handle */}
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-40">
                      <div
                        onPointerDown={startSubtitleRotate}
                        className="w-5 h-5 rounded-full bg-[var(--vz-accent)] text-white flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-125 transition-transform shadow-md"
                        title="Putar subtitle (Drag to rotate)"
                      >
                        <RotateCw className="w-3 h-3 text-white" />
                      </div>
                      <div className="w-0.5 h-2 bg-[var(--vz-accent)]" />
                    </div>

                    {/* Corner Resize Handles */}
                    <div
                      onPointerDown={startSubtitleScale}
                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--vz-surface)] border-2 border-[var(--vz-accent)] rounded-sm cursor-nwse-resize hover:scale-125 transition-transform shadow z-40 pointer-events-auto"
                      title="Tarik untuk ubah ukuran (Drag to resize)"
                    />
                    <div
                      onPointerDown={startSubtitleScale}
                      className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--vz-surface)] border-2 border-[var(--vz-accent)] rounded-sm cursor-nesw-resize hover:scale-125 transition-transform shadow z-40 pointer-events-auto"
                      title="Tarik untuk ubah ukuran (Drag to resize)"
                    />

                    {/* Quick Action Buttons */}
                    <div
                      className={`absolute ${
                        st.position === 'bottom' && (st.margin_v ?? 300) < 180
                          ? '-top-14'
                          : '-bottom-9'
                      } left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[var(--vz-surface)] backdrop-blur-md px-2 py-0.5 rounded-full border border-[var(--vz-border)] shadow-2xl pointer-events-auto text-[10px] whitespace-nowrap z-40`}
                    >
                      <span className="text-[var(--vz-accent)] font-mono font-bold">{st.font_size || 43}px</span>
                      <span className="text-[var(--vz-text-faint)]">•</span>
                      <span className="text-[var(--vz-accent)] font-mono font-bold">{st.angle || 0}°</span>
                      {(st.angle || 0) !== 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            savePrefs({ ...(prefs || {}), subtitle_style: { ...(prefs?.subtitle_style || {}), angle: 0 } });
                          }}
                          className="ml-1 px-1.5 py-0.5 rounded bg-[var(--vz-surface-muted)] hover:bg-[var(--vz-accent-hover)] hover:text-white text-[var(--vz-text)] font-semibold border border-[var(--vz-border)] transition-colors"
                          title="Reset rotasi ke 0°"
                        >
                          Reset 0°
                        </button>
                      )}
                      {Number(st.font_size || 43) !== 43 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            savePrefs({ ...(prefs || {}), subtitle_style: { ...(prefs?.subtitle_style || {}), font_size: 43 } });
                          }}
                          className="px-1.5 py-0.5 rounded bg-[var(--vz-surface-muted)] hover:bg-[var(--vz-accent-hover)] hover:text-white text-[var(--vz-text)] font-semibold border border-[var(--vz-border)] transition-colors"
                          title="Reset ukuran font ke 43px"
                        >
                          Reset 43px
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Latar susunan (T12): blur dari duplikat video, warna solid, atau hitam */}
          {currentVideo?.url && layoutActive && (
            bgFill === 'blur' ? (
              <video
                ref={bgVideoRef}
                src={currentVideo.url}
                data-region="layout-bg"
                muted
                playsInline
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ filter: `blur(${pxAt1080(24)}px)`, transform: 'scale(1.12)' }}
              />
            ) : (
              <div
                data-region="layout-bg"
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{ background: bgFill === 'color' ? liveBgColor : '#000000' }}
              />
            )
          )}

          {/* Video Player */}
          {currentVideo?.url ? (
            <video
              ref={videoRef}
              src={currentVideo.url}
              onPointerDown={videoViewMode === 'freeform' ? startVideoDrag : layoutActive ? startOffsetDrag : undefined}
              onClick={videoViewMode !== 'freeform' && !layoutActive ? togglePlay : undefined}
              onWheel={videoViewMode === 'freeform' ? handleVideoWheel : undefined}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              data-region="layout-foreground"
              className={`select-none ${
                layoutActive
                  ? 'absolute left-1/2 object-contain cursor-ns-resize'
                  : `w-full h-full ${
                      videoViewMode === 'fit'
                        ? 'object-contain bg-black cursor-pointer'
                        : videoViewMode === 'cover'
                        ? 'object-cover cursor-pointer'
                        : 'object-contain cursor-grab active:cursor-grabbing'
                    }`
              }`}
              style={
                layoutActive
                  ? {
                      top: layoutMode === 'stack' ? 0 : '50%',
                      width: layoutMode === 'box' ? '90%' : '100%',
                      height: layoutMode === 'box' ? '90%' : 'auto',
                      maxHeight: '100%',
                      transform: layoutMode === 'stack'
                        ? `translateX(-50%) translateY(${offPx}px)`
                        : `translate(-50%, calc(-50% + ${offPx}px))`,
                      borderRadius: layoutMode === 'box' ? `${pxAt1080(32)}px` : 0,
                      overflow: 'hidden',
                    }
                  : videoViewMode === 'freeform'
                  ? {
                      transform: `translate(${videoPos.x}px, ${videoPos.y}px) scale(${videoScale})`,
                      transformOrigin: 'center center',
                    }
                  : undefined
              }
              playsInline
              loop={!activeCandidate}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-[var(--vz-text-faint)] space-y-2">
              <FileVideo className="w-12 h-12 text-[var(--vz-text-faint)]" />
              <p className="text-xs">Project ini belum punya video source.</p>
              <p className="text-[11px] text-[var(--vz-text-faint)]">
                Buat project baru dari link YouTube atau upload MP4, lalu kembali ke sini.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pill toolbar di bawah preview: Ratio · Background · Layout · Layar penuh */}
      <div ref={menuRef} className="relative w-full flex flex-nowrap items-center justify-center gap-1.5 shrink-0 overflow-x-auto px-1">
        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'ratio' ? null : 'ratio')}
          data-region="pill-ratio"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'ratio'}
          title="Ubah rasio keluaran"
          className={`${PILL_CLASS} ${pillTone(openMenu === 'ratio')}`}
        >
          <Ratio className="w-3.5 h-3.5" />
          <span>Ratio ({aspect})</span>
        </button>

        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'background' ? null : 'background')}
          data-region="pill-background"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'background'}
          title="Ubah perlakuan latar / framing"
          className={`${PILL_CLASS} ${pillTone(openMenu === 'background')}`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Background</span>
        </button>

        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'layout' ? null : 'layout')}
          data-region="pill-layout"
          aria-haspopup="dialog"
          aria-expanded={openMenu === 'layout'}
          title="Panel Layout: area aman, zoom"
          className={`${PILL_CLASS} ${pillTone(openMenu === 'layout')}`}
        >
          <Crop className="w-3.5 h-3.5" />
          <span>Layout</span>
        </button>

        <button
          type="button"
          onClick={enterFullscreen}
          data-region="pill-fullscreen"
          title="Layar penuh"
          className={`${PILL_CLASS} ${pillTone(false)}`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Layar penuh</span>
        </button>

      </div>

      {/* Panel mengapung (kanan, di samping rail): menu Ratio/Background + Layout */}
      {(openMenu === 'ratio' || openMenu === 'background' || openMenu === 'layout') && (
        <div
          ref={popRef}
          className="fixed top-[64px] right-[88px] z-50 max-h-[80vh] overflow-y-auto"
        >
          {openMenu === 'ratio' && (
            <div role="menu" className="w-56 py-1 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl shadow-2xl">
              {RATIO_ITEMS.map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={aspect === it.id}
                    onClick={() => { patchPrefs({ aspect: it.id }); setOpenMenu(null); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--vz-surface-muted)] ${
                      aspect === it.id ? 'text-[var(--vz-accent)]' : 'text-[var(--vz-text-soft)]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">{it.label}</span>
                    {aspect === it.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          )}

          {openMenu === 'background' && (
            <div role="menu" className="w-64 py-1 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl shadow-2xl">
              {BACKGROUND_ITEMS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={cropMode === it.id}
                  onClick={() => { setCropMode(it.id); setOpenMenu(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--vz-surface-muted)] ${
                    cropMode === it.id ? 'text-[var(--vz-accent)]' : 'text-[var(--vz-text-soft)]'
                  }`}
                >
                  <span className="flex-1 text-left">{it.label}</span>
                  {cropMode === it.id && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}

          {openMenu === 'layout' && (
            <div
              role="dialog"
              data-region="layout-panel"
              aria-label="Panel Layout"
              className="w-[276px] p-3 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl shadow-2xl space-y-3"
            >
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-[var(--vz-text-muted)]">Isi latar</p>
                <div className="flex gap-1.5">
                  {BG_FILL_ITEMS.map((it) => {
                    const off = it.id === 'blur' && !blurOk;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        disabled={off}
                        onClick={() => patchPrefs({ bg_fill: it.id })}
                        aria-pressed={bgFill === it.id}
                        title={off ? 'Filter ffmpeg boxblur tidak tersedia di mesin ini' : `Isi latar ${it.label}`}
                        className={`flex-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          bgFill === it.id
                            ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)]'
                            : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-soft)]'
                        }`}
                      >
                        {it.label}
                      </button>
                    );
                  })}
                </div>
                {bgFill === 'color' && (
                  <label className="flex items-center gap-2 text-[10px] font-semibold text-[var(--vz-text-soft)]">
                    <span>Warna latar</span>
                    <input
                      type="color"
                      value={liveBgColor}
                      onChange={(e) => onPickColor(e.target.value)}
                      data-region="bg-color"
                      className="h-6 w-10 rounded border border-[var(--vz-border)] bg-[var(--vz-surface)] cursor-pointer"
                    />
                    <span className="font-mono text-[var(--vz-text-muted)]">{liveBgColor}</span>
                  </label>
                )}
                {!blurOk && (
                  <p data-region="blur-unavailable" className="text-[10px] text-[var(--vz-text-muted)]">
                    Isi latar Blur tidak tersedia: filter ffmpeg <span className="font-mono">boxblur</span> tidak ada.
                    Pakai Warna atau Hitam.
                  </p>
                )}
              </div>

              <div className="border-t border-[var(--vz-border)] pt-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-[var(--vz-text-muted)]">Susunan</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {LAYOUT_ITEMS.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => patchPrefs({ layout: it.id })}
                      aria-pressed={layoutMode === it.id}
                      title={it.id === 'off' ? 'Framing mengikuti pill Background' : `Susunan ${it.label}`}
                      data-region={`layout-${it.id}`}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                        layoutMode === it.id
                          ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)]'
                          : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-soft)]'
                      }`}
                    >
                      {it.label}
                    </button>
                  ))}
                </div>
                <p data-region="layout-hint" className="text-[10px] text-[var(--vz-text-muted)]">
                  {layoutMode === 'off'
                    ? 'Tanpa susunan: framing mengikuti pilihan Background.'
                    : 'Tarik video di pratinjau naik/turun untuk menggeser subjek.'}
                </p>
                {layoutMode !== 'off' && (
                  <div className="flex items-center justify-between gap-2">
                    <span data-region="offset-readout" className="text-[10px] font-semibold text-[var(--vz-text-soft)]">
                      Geser vertikal {liveOffsetY}%
                    </span>
                    <button
                      type="button"
                      onClick={() => patchPrefs({ offset_y: 0 })}
                      className="px-2 py-0.5 rounded bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] text-[10px] font-semibold text-[var(--vz-text)] hover:text-[var(--vz-accent)] transition-colors"
                    >
                      Reset 0%
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--vz-text)]">Area aman</p>
                  <p className="text-[10px] text-[var(--vz-text-muted)]">Batas aman TikTok/Reels (88% x 80%)</p>
                </div>
                <button
                  type="button"
                  onClick={() => patchPrefs({ safe_zone: !prefs?.safe_zone })}
                  aria-pressed={Boolean(prefs?.safe_zone)}
                  aria-label="Area aman"
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                    prefs?.safe_zone
                      ? 'bg-[var(--vz-accent)] border-[var(--vz-accent)] text-white'
                      : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-soft)]'
                  }`}
                >
                  {prefs?.safe_zone ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="border-t border-[var(--vz-border)] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--vz-text)]">Auto zoom</p>
                    <p className="text-[10px] text-[var(--vz-text-muted)]">Ikuti wajah, punch-in per detik</p>
                  </div>
                  <button
                    type="button"
                    disabled={zoomBusy || activeCandidateIdx == null}
                    onClick={() => runAutoZoom(!prefs?.zoom_auto)}
                    aria-pressed={Boolean(prefs?.zoom_auto)}
                    aria-label="Auto zoom"
                    title={activeCandidateIdx == null ? 'Pilih klip dulu di clip strip' : 'Auto zoom ikuti wajah'}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-50 ${
                      prefs?.zoom_auto
                        ? 'bg-[var(--vz-accent)] border-[var(--vz-accent)] text-white'
                        : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-soft)]'
                    }`}
                  >
                    {zoomBusy ? 'Menghitung…' : prefs?.zoom_auto ? 'ON' : 'OFF'}
                  </button>
                </div>
                {zoomNote && (
                  <p data-region="zoom-note" className="mt-1.5 text-[10px] text-[var(--vz-text-muted)]">{zoomNote}</p>
                )}
                <label className="mt-2 block text-[10px] font-semibold text-[var(--vz-text-soft)]" htmlFor="zoom-manual">
                  Zoom manual {zoomManual}%
                </label>
                <input
                  id="zoom-manual"
                  type="range"
                  min="100"
                  max="160"
                  step="5"
                  value={zoomManual}
                  onChange={(e) => setZoomDraft(Number(e.target.value))}
                  onPointerUp={() => commitZoomManual(zoomManual)}
                  onKeyUp={() => commitZoomManual(zoomManual)}
                  onBlur={() => zoomDraft != null && commitZoomManual(zoomManual)}
                  className="w-full accent-[var(--vz-accent)] cursor-pointer"
                />
              </div>

              <div className="border-t border-[var(--vz-border)] pt-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-[var(--vz-text-muted)]">Tampilan video</p>
                <div className="flex gap-1.5">
                  {[
                    { id: 'fit', label: 'Fit', icon: Maximize2 },
                    { id: 'cover', label: 'Isi', icon: Expand },
                    { id: 'freeform', label: 'Bebas', icon: Move },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setVideoViewMode(m.id);
                          if (m.id !== 'freeform') {
                            setVideoPos({ x: 0, y: 0 });
                            setVideoScale(1);
                          }
                        }}
                        aria-pressed={videoViewMode === m.id}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                          videoViewMode === m.id
                            ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)]'
                            : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-soft)]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-[var(--vz-border)] pt-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-[var(--vz-text-muted)]">Overlay</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => patchPrefs({ title_enabled: !prefs?.title_enabled })}
                    aria-pressed={Boolean(prefs?.title_enabled)}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                      prefs?.title_enabled
                        ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)]'
                        : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-soft)]'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>Judul</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => patchPrefs({ subtitles_enabled: !prefs?.subtitles_enabled })}
                    aria-pressed={Boolean(prefs?.subtitles_enabled)}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                      prefs?.subtitles_enabled
                        ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)]'
                        : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] text-[var(--vz-text-soft)]'
                    }`}
                  >
                    <Captions className="w-3.5 h-3.5" />
                    <span>Subtitle</span>
                  </button>
                </div>
              </div>
            </div>
          )}        
        </div>
      )}

      {/* Freeform Mini-Dock Toolbar */}
      {videoViewMode === 'freeform' && (
        <div className="flex items-center gap-2 bg-[var(--vz-surface)] backdrop-blur-md px-3 py-1.5 rounded-xl border border-[var(--vz-border)] shadow-xl shrink-0 text-xs">
          <div className="flex items-center gap-1 text-[var(--vz-text-muted)]">
            <Move className="w-3.5 h-3.5 text-[var(--vz-accent)]" />
            <span className="text-[11px] font-bold text-[var(--vz-text)]">Bebas Transform:</span>
          </div>

          {/* Zoom Out Button */}
          <button
            type="button"
            onClick={() => setVideoScale((s) => Math.max(0.3, Math.round((s - 0.1) * 100) / 100))}
            className="p-1 rounded-md bg-[var(--vz-surface-muted)] hover:bg-[var(--vz-bg)] text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] transition-colors"
            title="Zoom Out (-10%)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Slider */}
          <input
            type="range"
            min="0.3"
            max="3.0"
            step="0.05"
            value={videoScale}
            onChange={(e) => setVideoScale(Number(e.target.value))}
            className="w-20 accent-[var(--vz-accent)] cursor-pointer h-1.5 bg-[var(--vz-surface-muted)] rounded-lg appearance-none"
            title="Atur Zoom"
          />

          {/* Zoom In Button */}
          <button
            type="button"
            onClick={() => setVideoScale((s) => Math.min(3.0, Math.round((s + 0.1) * 100) / 100))}
            className="p-1 rounded-md bg-[var(--vz-surface-muted)] hover:bg-[var(--vz-bg)] text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] transition-colors"
            title="Zoom In (+10%)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Scale Badge */}
          <span className="text-[var(--vz-accent)] font-mono font-bold text-[11px] w-10 text-right">
            {Math.round(videoScale * 100)}%
          </span>

          <div className="w-px h-3 bg-[var(--vz-border)]" />

          {/* Pan Offset Info */}
          <span className="text-[10px] font-mono text-[var(--vz-text-muted)]">
            X:{videoPos.x} Y:{videoPos.y}
          </span>

          {/* Reset Transform Button */}
          <button
            type="button"
            onClick={() => {
              setVideoPos({ x: 0, y: 0 });
              setVideoScale(1);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--vz-accent-tint)] hover:bg-[var(--vz-accent-hover)] text-[var(--vz-accent)] hover:text-white text-[11px] font-bold transition-all ml-1"
            title="Reset posisi & zoom video ke tengah"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset (1x)</span>
          </button>
        </div>
      )}

      {/* Full Video Timeline Scrubber */}
      {currentVideo?.url && (
        <div className="w-full max-w-3xl px-4 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={togglePlay}
            className="p-1 text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] transition-colors"
            title={isPlaying ? 'Jeda video' : 'Putar video'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>
          <span className="text-[11px] font-mono text-[var(--vz-text)] tabular-nums">{mmss(currentTime)}</span>
          <div
            ref={trackRef}
            onPointerDown={startSeek}
            className="relative flex-1 h-6 flex items-center cursor-pointer group/track select-none"
            title="Klik atau tarik untuk pindah posisi video"
          >
            {/* Track background & current playback progress */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[var(--vz-border)] overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-[var(--vz-accent)]" style={{ width: `${pct}%` }} />
            </div>

            {/* Red markers for all generated candidates */}
            {candidates.length > 0 && duration > 0 && candidates.map((c, idx) => {
              const isActive = activeCandidateIdx === idx;
              const leftPct = Math.max(0, Math.min(100, (c.start / duration) * 100));
              const rawWidth = ((c.end - c.start) / duration) * 100;
              const widthPct = Math.max(1, Math.min(100 - leftPct, rawWidth));

              return (
                <div
                  key={idx}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    jumpToCandidate(idx);
                  }}
                  className={`group/marker absolute top-1/2 -translate-y-1/2 rounded-full cursor-pointer transition-all z-10 ${
                    isActive
                      ? 'h-3 bg-[var(--vz-accent)] ring-2 ring-[var(--vz-accent-ring)] z-20'
                      : 'h-2 bg-[var(--vz-accent)] hover:h-2.5 hover:bg-[var(--vz-accent-hover)]'
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                >
                  {/* Floating tooltip */}
                  <div className="opacity-0 group-hover/marker:opacity-100 pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg bg-[var(--vz-surface)] border border-[var(--vz-accent)] text-[11px] font-bold text-[var(--vz-text)] whitespace-nowrap shadow-xl transition-opacity z-30 flex items-center gap-1.5 backdrop-blur-sm">
                    <span className="w-2 h-2 rounded-full bg-[var(--vz-accent)] animate-pulse" />
                    <span>Klip #{idx + 1} {mmss(c.start)}-{mmss(c.end)}</span>
                  </div>
                </div>
              );
            })}

            {/* Playhead thumb */}
            <div
              className="absolute top-1/2 w-3 h-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-[var(--vz-surface)] border border-[var(--vz-accent)] z-30 pointer-events-none group-hover/track:scale-125 transition-transform shadow"
              style={{ left: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-[var(--vz-text-muted)] tabular-nums">{mmss(duration)}</span>
          <button
            type="button"
            onClick={toggleMute}
            className="p-1 text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)]"
            title={isMuted ? 'Nyalakan suara' : 'Bisukan'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* Active Candidate Action Toolbar (Crop, Potong, Subtitle, Unduh) */}
      {activeCandidate && (() => {
        const activeExistingClip = clips.find((cl) => cl.candidate_index === activeCandidateIdx);
        const isRendering = renderingIndices.has(activeCandidateIdx);

        return (
          <div className="flex flex-wrap items-center gap-2 justify-center shrink-0 max-w-full">
            {/* Crop Studio */}
            <button
              type="button"
              onClick={() => onOpenCropStudio({ ...activeCandidate, idx: activeCandidateIdx })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] text-xs font-bold text-[var(--vz-text)] hover:border-[var(--vz-accent)] hover:text-[var(--vz-accent)] transition-all shadow-sm"
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Crop Studio</span>
            </button>

            {/* Potong / Potong Ulang */}
            <button
              type="button"
              onClick={() => handleRenderSingle(activeCandidateIdx)}
              disabled={isRendering}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 ${
                activeExistingClip
                  ? 'bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] hover:border-[var(--vz-border-strong)]'
                  : 'bg-[var(--vz-accent)] text-white hover:bg-[var(--vz-accent-hover)]'
              }`}
            >
              {isRendering ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Scissors className="w-3.5 h-3.5" />
              )}
              <span>{activeExistingClip ? 'Potong Ulang' : 'Potong Klip'}</span>
            </button>

            {/* Terapkan Subtitle / Jadikan Final */}
            {activeExistingClip && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenSubtitleApply?.({ clip: activeExistingClip, candidate: activeCandidate })}
                  className="px-3 py-1.5 rounded-xl bg-[var(--vz-accent)] text-white font-extrabold text-xs flex items-center gap-1.5 hover:bg-[var(--vz-accent-hover)] shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Terapkan Subtitle</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePublish(activeExistingClip.slug)}
                  className="px-3 py-1.5 rounded-xl bg-[var(--vz-accent)] text-white font-extrabold text-xs flex items-center gap-1.5 hover:bg-[var(--vz-accent-hover)] shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Jadikan Final</span>
                </button>

                <a
                  href={activeExistingClip.raw_url || activeExistingClip.url}
                  download
                  className="p-1.5 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text)] hover:text-[var(--vz-accent)] hover:border-[var(--vz-accent)] transition-all"
                  title="Unduh klip"
                >
                  <Download className="w-4 h-4" />
                </a>
              </>
            )}
          </div>
        );
      })()}
    </main>
  );
}
