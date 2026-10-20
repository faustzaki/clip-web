import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Sparkles,
  Sliders,
  Scissors,
  CheckSquare,
  Square,
  Clock,
  Flame,
  Volume2,
  VolumeX,
  FileVideo,
  Layers,
  Crop,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  Check,
  Film,
  PanelBottom,
  PanelRight,
} from 'lucide-react';
import { scoreMoments, renderClip, putPrefs, publishClip } from '../api';
import SubtitleStyleEditor from './SubtitleStyleEditor';
import SubtitlePreview from './SubtitlePreview';

export default function StudioView({
  projectId,
  state,
  options,
  onRefreshState,
  onBackToProjects,
  onOpenCropStudio,
  onOpenSubtitleApply,
  onGoToGallery,
  onClipRendered,
}) {
  // Layout mode: 'bottom' (horizontal filmstrip) vs 'right' (3-column vertical)
  const [pipelinePos, setPipelinePos] = useState(() => localStorage.getItem('studio.pipelinePos') || 'bottom');
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem('studio.leftW')) || 320);
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem('studio.leftCollapsed') === '1');
  const [bottomH, setBottomH] = useState(() => {
    const saved = Number(localStorage.getItem('studio.bottomH'));
    return (saved && saved <= 220 && saved >= 110) ? saved : 135;
  });
  const [bottomCollapsed, setBottomCollapsed] = useState(() => localStorage.getItem('studio.bottomCollapsed') === '1');
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem('studio.rightW')) || 340);
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('studio.rightCollapsed') === '1');

  // Sync boolean collapse/mode states to localStorage (NOT high-frequency pixel dimensions)
  useEffect(() => {
    localStorage.setItem('studio.pipelinePos', pipelinePos);
    localStorage.setItem('studio.leftCollapsed', leftCollapsed ? '1' : '0');
    localStorage.setItem('studio.bottomCollapsed', bottomCollapsed ? '1' : '0');
    localStorage.setItem('studio.rightCollapsed', rightCollapsed ? '1' : '0');
  }, [pipelinePos, leftCollapsed, bottomCollapsed, rightCollapsed]);

  // High-performance direct drag handlers (RAF + no transition lag + save on release)
  const isDraggingRef = useRef(false);

  const startLeftDrag = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const x0 = e.clientX;
    const w0 = leftW;
    let rafId = null;

    const move = (ev) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newW = Math.min(560, Math.max(220, w0 + ev.clientX - x0));
        setLeftW(newW);
      });
    };

    const up = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLeftW((cur) => {
        localStorage.setItem('studio.leftW', String(cur));
        return cur;
      });
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up, { once: true });
  };

  const startRightDrag = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const x0 = e.clientX;
    const w0 = rightW;
    let rafId = null;

    const move = (ev) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newW = Math.min(520, Math.max(240, w0 - (ev.clientX - x0)));
        setRightW(newW);
      });
    };

    const up = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRightW((cur) => {
        localStorage.setItem('studio.rightW', String(cur));
        return cur;
      });
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up, { once: true });
  };

  const startBottomDrag = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const y0 = e.clientY;
    const h0 = bottomH;
    let rafId = null;

    const move = (ev) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const newH = Math.min(320, Math.max(110, h0 - (ev.clientY - y0)));
        setBottomH(newH);
      });
    };

    const up = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBottomH((cur) => {
        localStorage.setItem('studio.bottomH', String(cur));
        return cur;
      });
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up, { once: true });
  };

  // Prefs sync
  const [prefs, setPrefs] = useState(null);
  const [prefsPid, setPrefsPid] = useState(null);

  useEffect(() => {
    const p = state?.project;
    if (p && p.id !== prefsPid) {
      setPrefs({
        ...p.render_prefs,
        subtitle_style: { ...(p.render_prefs?.subtitle_style || {}) }
      });
      setPrefsPid(p.id);
    }
  }, [state?.project?.id, state?.project?.render_prefs, prefsPid]);

  const savePrefs = async (next) => {
    setPrefs(next);
    try {
      await putPrefs(projectId, next);
    } catch (err) {
      console.error('Failed to save prefs:', err);
    }
  };

  // Clipper settings state
  const [selectedModel, setSelectedModel] = useState('ag/gemini-3.8-flash');
  const [minDur, setMinDur] = useState(15);
  const [maxDur, setMaxDur] = useState(60);
  const [cropMode, setCropMode] = useState('speaker-tracked');
  const [aspect, setAspect] = useState('9:16');
  const [tightenCuts, setTightenCuts] = useState(true);
  const [renderQuality, setRenderQuality] = useState('hd');
  const [isScoring, setIsScoring] = useState(false);
  const [renderingIndices, setRenderingIndices] = useState(new Set());
  const [statusMessage, setStatusMessage] = useState('');

  const [activeCandidateIdx, setActiveCandidateIdx] = useState(0);

  const videoRef = useRef(null);
  const bottomScrollRef = useRef(null);

  useEffect(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pipelinePos, bottomCollapsed]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const candidates = state?.candidates || [];
  const currentVideo = state?.video;
  const clips = state?.clips || [];
  const activeCandidate = candidates[activeCandidateIdx] || null;

  const mmss = (s) => {
    const sec = Math.max(0, Number(s) || 0);
    const m = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (activeCandidate && videoRef.current.currentTime >= activeCandidate.end) {
        videoRef.current.currentTime = activeCandidate.start;
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const jumpToCandidate = (idx) => {
    setActiveCandidateIdx(idx);
    const cand = candidates[idx];
    if (cand && videoRef.current) {
      videoRef.current.currentTime = cand.start;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleFindMoments = async () => {
    try {
      setIsScoring(true);
      setStatusMessage('9Router AI mencari momen viral & hook...');

      const scoreRes = await scoreMoments(projectId, {
        model_name: selectedModel,
        min_score: 5.0,
        max_clips: 8,
        min_len: minDur,
        max_len: maxDur,
        use_llm: selectedModel !== 'heuristic'
      });

      setIsScoring(false);
      setStatusMessage('');
      await onRefreshState();

      if (scoreRes.candidates && scoreRes.candidates.length > 0) {
        setActiveCandidateIdx(0);
        if (videoRef.current) {
          videoRef.current.currentTime = scoreRes.candidates[0].start;
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }
    } catch (err) {
      setIsScoring(false);
      setStatusMessage('');
      alert(`Error: ${err.message}`);
    }
  };

  const handleRenderSingle = async (idx) => {
    const cand = candidates[idx];
    if (!cand) return;

    try {
      setRenderingIndices((prev) => new Set(prev).add(idx));
      const res = await renderClip(projectId, {
        candidate_index: idx,
        aspect: aspect,
        crop_mode: cropMode,
        crop_rect: (state?.project?.crops || {})[String(idx)] || null,
        do_tighten: tightenCuts,
        custom_hook: cand.hook,
        quality: renderQuality && state?.project?.source_url ? renderQuality : 'original'
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

  // Candidates ordered by start time earliest-first, preserving original index
  const orderedCandidates = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.start - b.c.start);

  // Render individual candidate card: ONLY thumbnail, minute range, and title
  const renderCard = ({ c, i, isHorizontal = false }) => {
    const isActive = activeCandidateIdx === i;
    const existingClip = clips.find((cl) => cl.candidate_index === i);
    const thumbSrc = existingClip?.poster_url || `/api/projects/${projectId}/thumb/${i}`;

    if (isHorizontal) {
      // Horizontal Filmstrip Card: Thumbnail, mm:ss, and title only
      return (
        <div
          key={i}
          onClick={() => jumpToCandidate(i)}
          className={`p-2 rounded-xl border cursor-pointer relative flex flex-row items-center gap-2.5 shrink-0 w-[240px] h-full transition-colors ${
            isActive
              ? 'bg-dark-surface border-neon shadow-[0_0_12px_rgba(187,244,81,0.2)] ring-1 ring-neon/40'
              : 'bg-dark-bg/85 border-dark-border hover:border-gray-500'
          }`}
        >
          {/* Thumbnail Left */}
          <div className="relative w-24 h-full rounded-lg overflow-hidden bg-black border border-dark-border shrink-0">
            <img
              src={thumbSrc}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
          </div>

          {/* Details Right: Klip #N, Range, Title */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-0.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-gray-400">
              <span className="font-bold text-white">#{i + 1}</span>
              <span className="text-neon font-semibold">{mmss(c.start)}–{mmss(c.end)}</span>
            </div>
            <p className="text-xs font-bold text-yellow-300 line-clamp-2 leading-tight">
              {c.hook || `Klip #${i + 1}`}
            </p>
          </div>
        </div>
      );
    }

    // Vertical Column Card: Thumbnail, mm:ss, and title only
    return (
      <div
        key={i}
        onClick={() => jumpToCandidate(i)}
        className={`p-2.5 rounded-xl border cursor-pointer relative flex flex-col gap-2 shrink-0 transition-colors ${
          isActive
            ? 'bg-dark-surface border-neon shadow-[0_0_12px_rgba(187,244,81,0.2)] ring-1 ring-neon/40'
            : 'bg-dark-bg/85 border-dark-border hover:border-gray-500'
        }`}
      >
        {/* Thumbnail Image */}
        <div className="relative w-full h-28 rounded-lg overflow-hidden bg-black border border-dark-border">
          <img
            src={thumbSrc}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        </div>

        {/* Range and Title */}
        <div className="flex items-center justify-between text-xs font-mono text-gray-400">
          <span className="font-bold text-white">Klip #{i + 1}</span>
          <span className="text-neon font-semibold">{mmss(c.start)} – {mmss(c.end)}</span>
        </div>

        <p className="text-xs font-bold text-yellow-300 line-clamp-2 leading-snug">
          {c.hook || `Klip #${i + 1}`}
        </p>
      </div>
    );
  };

  return (
    <div className="p-2 md:p-3 w-full h-full max-w-[1750px] mx-auto flex flex-col gap-2 overflow-hidden select-none">
      {/* ROW 1: Settings + Center Player (+ Right Pipeline if active) */}
      <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0 overflow-hidden">
        {/* Left Settings Panel */}
        <aside
          style={{ width: leftCollapsed ? 48 : leftW }}
          className="lg:shrink-0 min-w-0 h-full flex flex-col overflow-hidden"
        >
          {leftCollapsed ? (
            /* Collapsed Rail */
            <div className="bg-dark-card border border-dark-border rounded-2xl p-2 flex flex-col items-center gap-4 h-full shadow-lg">
              <button
                type="button"
                onClick={() => setLeftCollapsed(false)}
                className="p-1.5 rounded-lg bg-dark-bg border border-dark-border text-gray-400 hover:text-neon hover:border-neon transition-colors"
                title="Buka Pengaturan"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <Sliders className="w-4 h-4 text-neon" />
              <div
                className="text-xs font-bold text-gray-400 uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 py-4 select-none"
              >
                Pengaturan
              </div>
            </div>
          ) : (
            /* Expanded Full Settings Panel */
            <div className="bg-dark-card border border-dark-border rounded-2xl shadow-xl flex-1 flex flex-col h-full min-h-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-dark-border/60 p-3 shrink-0">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-neon" />
                  <span>Pengaturan</span>
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neon/10 text-neon border border-neon/20">
                    V2.1 PRO
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeftCollapsed(true)}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
                    title="Minimize panel pengaturan"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content inside Settings */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3.5">
                {/* Ingest Status Banner */}
                {state?.ingest && !['idle', 'done'].includes(state.ingest.status) && (
                  state.ingest.status === 'error' ? (
                    <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/40 text-red-400 text-xs shrink-0">
                      <p className="font-bold">Gagal memproses video</p>
                      <p className="text-[11px] mt-0.5">{state.ingest.error || state.ingest.message}</p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dark-border bg-dark-bg/80 space-y-2 shrink-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-300 font-medium flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-neon" />
                          {state.ingest.message || 'Memproses video...'}
                        </span>
                        <span className="text-neon font-mono font-bold text-[11px]">
                          {Math.round(state.ingest.percent || 0)}%
                        </span>
                      </div>
                      <div className="w-full bg-dark-card rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-neon h-full transition-all duration-300"
                          style={{ width: `${state.ingest.percent || 0}%` }}
                        />
                      </div>
                    </div>
                  )
                )}

                {/* No-source Warning */}
                {!state?.video ? (
                  <div className="rounded-xl border border-dashed border-dark-border bg-dark-bg/60 p-4 text-center space-y-2 shrink-0">
                    <FileVideo className="w-10 h-10 text-gray-600 mx-auto" />
                    {state?.ingest?.status === 'running' || state?.ingest?.status === 'starting' ? (
                      <p className="text-xs text-gray-300">
                        {state.ingest.message || 'Sedang menyiapkan video source...'}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400">Project ini belum punya video source.</p>
                        <button
                          onClick={onBackToProjects}
                          className="mt-2 px-4 py-2 rounded-xl bg-dark-surface border border-dark-border text-xs font-bold text-gray-300 hover:text-neon hover:border-neon transition-all"
                        >
                          Kembali ke Projects
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Toggles: Subtitle, Judul Clip, Watermark */}
                    <div className="bg-dark-bg/60 border border-dark-border rounded-xl p-3 flex flex-col gap-2.5 shrink-0">
                      <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wide">
                        Opsi Komponen Video
                      </span>

                      {/* Subtitle toggle */}
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs text-gray-300">Subtitle Otomatis</span>
                        <input
                          type="checkbox"
                          checked={prefs?.subtitles_enabled !== false}
                          onChange={(e) => savePrefs({ ...(prefs || {}), subtitles_enabled: e.target.checked })}
                          className="accent-neon w-4 h-4 rounded cursor-pointer"
                        />
                      </label>

                      {/* Judul Clip (Hook banner) toggle */}
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs text-gray-300">Judul Clip (Hook Banner)</span>
                        <input
                          type="checkbox"
                          checked={prefs?.title_enabled !== false}
                          onChange={(e) => savePrefs({ ...(prefs || {}), title_enabled: e.target.checked })}
                          className="accent-neon w-4 h-4 rounded cursor-pointer"
                        />
                      </label>

                      {/* Watermark toggle */}
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs text-gray-300">Watermark Handle</span>
                        <input
                          type="checkbox"
                          checked={Boolean(prefs?.watermark_enabled)}
                          onChange={(e) => savePrefs({ ...(prefs || {}), watermark_enabled: e.target.checked })}
                          className="accent-neon w-4 h-4 rounded cursor-pointer"
                        />
                      </label>

                      {prefs?.watermark_enabled && (
                        <input
                          type="text"
                          value={prefs?.watermark || ''}
                          onChange={(e) => savePrefs({ ...(prefs || {}), watermark: e.target.value })}
                          placeholder="@username"
                          className="w-full bg-dark-bg border border-dark-border rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-neon mt-1"
                        />
                      )}
                    </div>

                    {/* Subtitle Style & Preview */}
                    <div className="border border-dark-border rounded-xl p-3 bg-dark-bg/40 flex flex-col gap-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wide">
                          Gaya Subtitle (Per-Project)
                        </span>
                        <span className="text-[10px] text-gray-500">Live Preview</span>
                      </div>

                      <SubtitlePreview
                        style={prefs?.subtitle_style}
                        height={180}
                      />

                      {prefs?.subtitles_enabled !== false && (
                        <div className="pt-2 border-t border-dark-border/60">
                          <SubtitleStyleEditor
                            value={prefs?.subtitle_style}
                            onChange={(newSt) => savePrefs({ ...(prefs || {}), subtitle_style: newSt })}
                            fonts={options?.subtitle_fonts}
                            positions={options?.subtitle_positions}
                          />
                        </div>
                      )}
                    </div>

                    {/* AI Model Selector */}
                    <div className="space-y-1.5 shrink-0">
                      <label className="text-[11px] font-bold text-gray-400">Model AI Scorer</label>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon transition-colors"
                      >
                        {(options?.ai_models || [
                          { id: 'ag/gemini-3.8-flash', label: 'Gemini 3.8 Flash (9Router)' }
                        ]).map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Duration Sliders */}
                    <div className="grid grid-cols-2 gap-3 pt-1 shrink-0">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-gray-400">
                          <span>Min:</span>
                          <span className="text-white font-bold">{minDur}s</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="45"
                          value={minDur}
                          onChange={(e) => setMinDur(Number(e.target.value))}
                          className="w-full accent-neon h-1.5 bg-dark-border rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-gray-400">
                          <span>Max:</span>
                          <span className="text-white font-bold">{maxDur}s</span>
                        </div>
                        <input
                          type="range"
                          min="30"
                          max="90"
                          value={maxDur}
                          onChange={(e) => setMaxDur(Number(e.target.value))}
                          className="w-full accent-neon h-1.5 bg-dark-border rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Framing / Crop Mode Selector */}
                    <div className="space-y-1.5 pt-1 shrink-0">
                      <label className="text-[11px] font-bold text-gray-400">Mode Framing & Crop</label>
                      <select
                        value={cropMode}
                        onChange={(e) => setCropMode(e.target.value)}
                        className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neon transition-colors"
                      >
                        {(options?.crop_modes || [
                          { id: 'speaker-tracked', label: 'Auto Face Tracking (YuNet)' },
                          { id: 'center', label: 'Center Crop' },
                          { id: 'blur', label: 'Blurred Background' },
                          { id: 'split', label: 'Split Gaming' }
                        ]).map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filler cuts toggle */}
                    <label className="flex items-center gap-2 cursor-pointer pt-1 shrink-0">
                      <input
                        type="checkbox"
                        checked={tightenCuts}
                        onChange={(e) => setTightenCuts(e.target.checked)}
                        className="accent-neon rounded"
                      />
                      <span className="text-xs text-gray-300">Buang jeda hening / filler cuts</span>
                    </label>

                    {/* Render Quality Selector */}
                    {state?.project?.source_url && (
                      <div className="space-y-1.5 shrink-0">
                        <label className="text-[11px] font-bold text-gray-400">Kualitas Render</label>
                        <div className="flex items-center gap-1.5 bg-dark-bg p-1 rounded-xl border border-dark-border">
                          {[
                            { id: 'proxy', label: 'Proxy 360p' },
                            { id: 'hd', label: '1080p' },
                            { id: 'best', label: 'Terbaik' }
                          ].map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => setRenderQuality(q.id)}
                              className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all text-center ${
                                renderQuality === q.id
                                  ? 'bg-neon text-dark-bg shadow-sm'
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Primary Find Moments Button */}
                    <button
                      onClick={handleFindMoments}
                      disabled={isScoring || !state?.video}
                      className="w-full py-3.5 px-4 rounded-xl bg-neon hover:bg-neon-400 text-dark-bg font-extrabold text-sm tracking-wide shadow-[0_0_20px_rgba(187,244,81,0.25)] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {isScoring ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-dark-bg" />
                          <span>{statusMessage || 'Mencari momen viral...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-dark-bg" />
                          <span>TEMUKAN MOMEN VIRAL</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Resizer Handle: Left to Center */}
        <div
          onPointerDown={startLeftDrag}
          className="hidden lg:block w-1.5 shrink-0 rounded-full bg-dark-border hover:bg-neon cursor-col-resize select-none transition-colors"
          title="Tarik untuk mengubah lebar panel Pengaturan"
        />

        {/* Center Live Player & Preview */}
        <main className="flex-1 min-w-0 flex flex-col items-center justify-between overflow-hidden gap-1.5 py-1">
          {/* Aspect Ratio Pills */}
          <div className="flex items-center gap-1.5 bg-dark-card p-1 rounded-xl border border-dark-border shadow-md shrink-0">
            {['9:16', '1:1', '16:9'].map((r) => (
              <button
                key={r}
                onClick={() => setAspect(r)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  aspect === r
                    ? 'bg-neon text-dark-bg shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Vertical Mobile Phone Viewport (auto-scales cleanly to available height) */}
          <div
            className={`relative aspect-[9/16] h-full ${
              pipelinePos === 'right' ? 'max-h-[calc(100%-4rem)] max-w-[420px]' : 'max-h-[calc(100%-4rem)] max-w-[340px]'
            } bg-black rounded-[24px] border-4 border-dark-border overflow-hidden shadow-2xl flex flex-col justify-between group min-h-0 shrink`}
          >
            {/* Top Hook Banner Overlay (only if enabled) */}
            {prefs?.title_enabled !== false && (
              <div className="absolute top-6 left-0 right-0 z-20 flex justify-center px-4">
                <div className="bg-black/90 backdrop-blur-sm border border-black/80 px-4 py-2 rounded-lg shadow-xl max-w-[90%] text-center">
                  <span className="text-yellow-300 font-extrabold text-xs md:text-sm tracking-wide uppercase line-clamp-2">
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

            {/* Video Player */}
            {currentVideo?.url ? (
              <video
                ref={videoRef}
                src={currentVideo.url}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                className={`w-full h-full object-cover ${
                  cropMode === 'blur' ? 'object-contain bg-black' : ''
                }`}
                playsInline
                loop={!activeCandidate}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-gray-500 space-y-2">
                <FileVideo className="w-12 h-12 text-gray-600" />
                <p className="text-xs">Project ini belum punya video source.</p>
                <p className="text-[11px] text-gray-600">
                  Buat project baru dari link YouTube atau upload MP4, lalu kembali ke sini.
                </p>
              </div>
            )}

            {/* Minimal Floating Player Controls */}
            <div className="absolute bottom-3 left-3 right-3 z-30 flex items-center justify-between bg-dark-surface/90 backdrop-blur px-3 py-2 rounded-2xl border border-dark-border">
              <button
                onClick={togglePlay}
                className="p-1.5 rounded-full bg-neon text-dark-bg font-bold hover:bg-neon-400 transition-all"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              <span className="text-[11px] font-mono text-gray-300">
                {currentTime.toFixed(1)}s /{' '}
                {activeCandidate ? activeCandidate.duration.toFixed(1) + 's' : duration.toFixed(1) + 's'}
              </span>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="p-1 text-gray-400 hover:text-white"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-card border border-dark-border text-xs font-bold text-gray-200 hover:border-neon hover:text-neon transition-all shadow-sm"
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
                      ? 'bg-dark-card border border-dark-border text-gray-300 hover:text-white hover:border-gray-400'
                      : 'bg-neon text-dark-bg hover:bg-neon-400'
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
                    {prefs?.subtitles_enabled !== false ? (
                      <button
                        type="button"
                        onClick={() => onOpenSubtitleApply?.({ clip: activeExistingClip, candidate: activeCandidate })}
                        className="px-3 py-1.5 rounded-xl bg-cyber text-dark-bg font-extrabold text-xs flex items-center gap-1.5 hover:opacity-90 shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Terapkan Subtitle</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePublish(activeExistingClip.slug)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 text-dark-bg font-extrabold text-xs flex items-center gap-1.5 hover:opacity-90 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Jadikan Final</span>
                      </button>
                    )}

                    <a
                      href={activeExistingClip.raw_url || activeExistingClip.url}
                      download
                      className="p-1.5 rounded-xl bg-dark-card border border-dark-border text-gray-300 hover:text-neon hover:border-neon transition-all"
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

        {/* RIGHT COLUMN MODE: If pipelinePos === 'right' */}
        {pipelinePos === 'right' && (
          <>
            {/* Resizer Handle: Center to Right */}
            <div
              onPointerDown={startRightDrag}
              className="hidden lg:block w-1.5 shrink-0 rounded-full bg-dark-border hover:bg-neon cursor-col-resize select-none transition-colors"
              title="Tarik untuk mengubah lebar panel Hasil Pipeline AI"
            />

            <aside
              style={{ width: rightCollapsed ? 48 : rightW }}
              className="lg:shrink-0 min-w-0 h-full flex flex-col overflow-hidden"
            >
              {rightCollapsed ? (
                /* Collapsed Rail Right */
                <div className="bg-dark-card border border-dark-border rounded-2xl p-2 flex flex-col items-center gap-4 h-full shadow-lg">
                  <button
                    type="button"
                    onClick={() => setRightCollapsed(false)}
                    className="p-1.5 rounded-lg bg-dark-bg border border-dark-border text-gray-400 hover:text-neon hover:border-neon transition-colors"
                    title="Buka Hasil Pipeline AI"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <Flame className="w-4 h-4 text-neon" />
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest [writing-mode:vertical-rl] py-4 select-none">
                    Hasil Pipeline AI
                  </div>
                </div>
              ) : (
                /* Expanded Right Column Panel */
                <section className="bg-dark-card border border-dark-border rounded-2xl shadow-xl flex-1 flex flex-col h-full min-h-0 overflow-hidden p-3">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-dark-border/60 pb-2 mb-2 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Flame className="w-4 h-4 text-neon shrink-0" />
                      <h2 className="text-xs font-extrabold uppercase tracking-wider text-white truncate">
                        Pipeline AI ({candidates.length})
                      </h2>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle Position Buttons */}
                      <div className="flex items-center gap-0.5 bg-dark-bg p-0.5 rounded-lg border border-dark-border mr-1">
                        <button
                          type="button"
                          onClick={() => setPipelinePos('bottom')}
                          className={`p-1 rounded text-xs transition-colors ${
                            pipelinePos === 'bottom' ? 'bg-neon text-dark-bg font-bold shadow-sm' : 'text-gray-400 hover:text-white'
                          }`}
                          title="Pindah ke Panel Bawah (Filmstrip)"
                        >
                          <PanelBottom className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPipelinePos('right')}
                          className={`p-1 rounded text-xs transition-colors ${
                            pipelinePos === 'right' ? 'bg-neon text-dark-bg font-bold shadow-sm' : 'text-gray-400 hover:text-white'
                          }`}
                          title="Mode Kolom Kanan"
                        >
                          <PanelRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRightCollapsed(true)}
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
                        title="Minimize panel"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Cards Vertical List: Thumbnail, Range, Title only */}
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2.5">
                    {candidates.length === 0 ? (
                      <div className="h-44 flex flex-col items-center justify-center text-center text-gray-500 space-y-2">
                        <Layers className="w-8 h-8 text-gray-600" />
                        <p className="text-xs">Belum ada klip yang terdeteksi.</p>
                      </div>
                    ) : (
                      orderedCandidates.map(({ c, i }) => renderCard({ c, i, isHorizontal: false }))
                    )}
                  </div>
                </section>
              )}
            </aside>
          </>
        )}
      </div>

      {/* BOTTOM PANEL MODE: If pipelinePos === 'bottom' */}
      {pipelinePos === 'bottom' && (
        <>
          {/* Resizer Handle: Top to Bottom */}
          <div
            onPointerDown={startBottomDrag}
            className="h-1.5 rounded-full bg-dark-border hover:bg-neon cursor-row-resize select-none transition-colors shrink-0"
            title="Tarik untuk mengubah tinggi panel Hasil Pipeline AI"
          />

          {/* BOTTOM SECTION: Horizontal Filmstrip Reel */}
          <section
            style={{ height: bottomCollapsed ? 'auto' : bottomH }}
            className="bg-dark-card border border-dark-border rounded-2xl p-2.5 shadow-xl flex flex-col min-h-0 overflow-hidden shrink-0"
          >
            {/* Section Header */}
            <div className="flex items-center justify-between border-b border-dark-border/60 pb-1.5 mb-1.5 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Flame className="w-4 h-4 text-neon shrink-0" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-white truncate">
                  Hasil Pipeline AI ({candidates.length})
                </h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Toggle Position Buttons */}
                <div className="flex items-center gap-0.5 bg-dark-bg p-0.5 rounded-lg border border-dark-border mr-1">
                  <button
                    type="button"
                    onClick={() => setPipelinePos('bottom')}
                    className={`p-1 rounded text-xs transition-colors ${
                      pipelinePos === 'bottom' ? 'bg-neon text-dark-bg font-bold shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Mode Panel Bawah (Filmstrip)"
                  >
                    <PanelBottom className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPipelinePos('right')}
                    className={`p-1 rounded text-xs transition-colors ${
                      pipelinePos === 'right' ? 'bg-neon text-dark-bg font-bold shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Pindah ke Kolom Kanan (Video Full Height)"
                  >
                    <PanelRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setBottomCollapsed((v) => !v)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-dark-hover transition-colors flex items-center gap-1 text-xs"
                  title={bottomCollapsed ? 'Buka panel' : 'Minimize panel'}
                >
                  {bottomCollapsed ? (
                    <>
                      <span className="text-[10px] text-gray-400">Buka Panel</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-gray-400">Minimize</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Candidate Cards: Horizontal Filmstrip Reel (Thumbnail, Range, Title only) */}
            {!bottomCollapsed && (
              <div ref={bottomScrollRef} className="flex flex-row overflow-x-auto gap-2.5 flex-1 min-h-0 py-0.5 pr-1 items-stretch">
                {candidates.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-center text-gray-500 py-3">
                    <p className="text-xs">Belum ada klip yang terdeteksi. Klik "Temukan Momen Viral" di panel Pengaturan.</p>
                  </div>
                ) : (
                  orderedCandidates.map(({ c, i }) => renderCard({ c, i, isHorizontal: true }))
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
