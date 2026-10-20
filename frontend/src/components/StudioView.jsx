import React, { useState, useRef } from 'react';
import {
  Play,
  Pause,
  Sparkles,
  Sliders,
  Scissors,
  Subtitles,
  CheckSquare,
  Square,
  Clock,
  Flame,
  Volume2,
  VolumeX,
  FileVideo,
  Layers,
  Crop,
  Loader2
} from 'lucide-react';
import { scoreMoments, renderClip } from '../api';

export default function StudioView({
  projectId,
  state,
  options,
  onRefreshState,
  onBackToProjects,
  onOpenCropStudio,
  onOpenCaptionEditor,
  onClipRendered
}) {
  const [selectedModel, setSelectedModel] = useState('ag/gemini-3.8-flash');
  const [minDur, setMinDur] = useState(15);
  const [maxDur, setMaxDur] = useState(60);
  const [captionStyle, setCaptionStyle] = useState('hormozi');
  const [cropMode, setCropMode] = useState('speaker-tracked');
  const [aspect, setAspect] = useState('9:16');
  const [watermark, setWatermark] = useState('@faustzaki');
  const [tightenCuts, setTightenCuts] = useState(true);
  const [renderQuality, setRenderQuality] = useState('hd');
  const [isScoring, setIsScoring] = useState(false);
  const [renderingIndices, setRenderingIndices] = useState(new Set());
  const [statusMessage, setStatusMessage] = useState('');

  const [activeCandidateIdx, setActiveCandidateIdx] = useState(0);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState(new Set([0]));

  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const candidates = state?.candidates || [];
  const currentVideo = state?.video;
  const transcript = state?.transcript;
  const activeCandidate = candidates[activeCandidateIdx] || null;

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

  const toggleCandidateSelect = (idx) => {
    const next = new Set(selectedCandidateIds);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedCandidateIds(next);
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
        setSelectedCandidateIds(new Set([0]));
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
      setRenderingIndices(prev => new Set(prev).add(idx));
      const res = await renderClip(projectId, {
        candidate_index: idx,
        aspect: aspect,
        style: captionStyle,
        crop_mode: cropMode,
        do_tighten: tightenCuts,
        custom_hook: cand.hook,
        watermark: watermark,
        quality: renderQuality && state?.project?.source_url ? renderQuality : 'original'
      });

      setRenderingIndices(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });

      if (onClipRendered) onClipRendered(res.clip);
      alert(`✅ Berhasil render: ${cand.hook}`);
    } catch (err) {
      setRenderingIndices(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
      alert(`Render gagal: ${err.message}`);
    }
  };

  const handleBatchRender = async () => {
    const list = Array.from(selectedCandidateIds);
    if (list.length === 0) return;

    for (const idx of list) {
      await handleRenderSingle(idx);
    }
  };

  const activeWords = () => {
    if (!activeCandidate) return [];
    const words = activeCandidate.text_preview ? activeCandidate.text_preview.split(' ') : [];
    return words;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 md:p-6 max-w-[1700px] mx-auto min-h-[calc(100vh-4rem)]">
      {/* COLUMN 1: Settings */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-dark-card border border-dark-border rounded-2xl p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-dark-border/60 pb-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-neon" />
              <span>Pengaturan</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neon/10 text-neon border border-neon/20">
              V2.1 PRO
            </span>
          </div>

          {/* Ingest Status Banner */}
          {state?.ingest && !['idle', 'done'].includes(state.ingest.status) && (
            state.ingest.status === 'error' ? (
              <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/40 text-red-400 text-xs">
                <p className="font-bold">Gagal memproses video</p>
                <p className="text-[11px] mt-0.5">{state.ingest.error || state.ingest.message}</p>
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-dark-border bg-dark-bg/80 space-y-2">
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

          {/* No-source panel */}
          {!state?.video ? (
            <div className="rounded-xl border border-dashed border-dark-border bg-dark-bg/60 p-4 text-center space-y-2">
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
              {/* AI Model Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400">Model AI Scorer (9Router / Heuristic)</label>
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
              <div className="grid grid-cols-2 gap-3 pt-1">
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
              <div className="space-y-1.5 pt-1">
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

              {/* Subtitle Caption Style */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400">Preset Gaya Subtitle</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'hormozi', name: 'Hormozi', color: 'border-yellow-500/40 text-yellow-400' },
                    { id: 'mrbeast', name: 'MrBeast', color: 'border-green-500/40 text-green-400' },
                    { id: 'default', name: 'Default Cyan', color: 'border-cyan-500/40 text-cyan-400' },
                    { id: 'podcast', name: 'Podcast Clean', color: 'border-gray-500/40 text-gray-300' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setCaptionStyle(st.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center ${
                        captionStyle === st.id
                          ? `bg-dark-surface ${st.color} border-2 shadow-sm`
                          : 'border-dark-border text-gray-400 hover:text-white bg-dark-bg'
                      }`}
                    >
                      {st.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Watermark & Filler Cut Toggles */}
              <div className="space-y-2 pt-1 border-t border-dark-border/60">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-400">Watermark Handle</label>
                  <input
                    type="text"
                    value={watermark}
                    onChange={(e) => setWatermark(e.target.value)}
                    placeholder="@username"
                    className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-neon"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={tightenCuts}
                    onChange={(e) => setTightenCuts(e.target.checked)}
                    className="accent-neon rounded"
                  />
                  <span className="text-xs text-gray-300">Buang jeda hening / filler cuts</span>
                </label>
              </div>
            </>
          )}


          {/* Render Quality Selector */}
          {state?.project?.source_url && (
            <div className="space-y-1.5">
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

          {/* Primary Action Button */}
          <button
            onClick={handleFindMoments}
            disabled={isScoring || !state?.video}
            className="w-full py-3.5 px-4 rounded-xl bg-neon hover:bg-neon-400 text-dark-bg font-extrabold text-sm tracking-wide shadow-[0_0_20px_rgba(187,244,81,0.25)] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      </div>

      {/* COLUMN 2: Center Live Player & Preview */}
      <div className="lg:col-span-5 flex flex-col items-center justify-start space-y-4">
        {/* Aspect Ratio Pills */}
        <div className="flex items-center gap-1.5 bg-dark-card p-1 rounded-xl border border-dark-border shadow-md">
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

        {/* Vertical Mobile Phone Viewport */}
        <div className="relative w-[310px] md:w-[340px] h-[550px] md:h-[600px] bg-black rounded-[32px] border-4 border-dark-border overflow-hidden shadow-2xl flex flex-col justify-between group">
          {/* Top Hook Banner Overlay */}
          <div className="absolute top-6 left-0 right-0 z-20 flex justify-center px-4">
            <div className="bg-black/90 backdrop-blur-sm border border-black/80 px-4 py-2 rounded-lg shadow-xl max-w-[90%] text-center">
              <span className="text-yellow-300 font-extrabold text-xs md:text-sm tracking-wide uppercase line-clamp-2">
                {activeCandidate?.hook || 'HOOK TITLE PREVIEW'}
              </span>
            </div>
          </div>

          {/* Top Right Watermark */}
          {watermark && (
            <div className="absolute top-4 right-4 z-20 text-[10px] text-white/60 font-semibold tracking-wider bg-black/40 px-2 py-0.5 rounded-full">
              {watermark}
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
              <p className="text-[11px] text-gray-600">Buat project baru dari link YouTube atau upload MP4, lalu kembali ke sini.</p>
            </div>
          )}

          {/* Bottom Subtitle Karaoke Overlay */}
          <div className="absolute bottom-16 left-0 right-0 z-20 flex justify-center px-4 text-center pointer-events-none">
            <div className="bg-black/75 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-white/10 max-w-[95%]">
              <div className="text-xs md:text-sm font-extrabold tracking-wide uppercase leading-snug">
                {activeWords().map((word, i) => (
                  <span
                    key={i}
                    className={`inline-block mr-1.5 transition-colors ${
                      i % 3 === 1
                        ? 'text-yellow-400 bg-yellow-400/20 px-1 rounded'
                        : 'text-white'
                    }`}
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Minimal Floating Player Controls */}
          <div className="absolute bottom-3 left-3 right-3 z-30 flex items-center justify-between bg-dark-surface/90 backdrop-blur px-3 py-2 rounded-2xl border border-dark-border">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-full bg-neon text-dark-bg font-bold hover:bg-neon-400 transition-all"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <span className="text-[11px] font-mono text-gray-300">
              {currentTime.toFixed(1)}s / {activeCandidate ? activeCandidate.duration.toFixed(1) + 's' : duration.toFixed(1) + 's'}
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

        {/* Quick Modal Launcher Buttons */}
        {activeCandidate && (
          <div className="flex items-center gap-3 w-full justify-center">
            <button
              onClick={() => onOpenCropStudio(activeCandidate)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dark-card border border-dark-border text-xs font-bold text-gray-200 hover:border-neon hover:text-neon transition-all"
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Crop Studio</span>
            </button>

            <button
              onClick={() => onOpenCaptionEditor(activeCandidate)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dark-card border border-dark-border text-xs font-bold text-gray-200 hover:border-cyber hover:text-cyber transition-all"
            >
              <Subtitles className="w-3.5 h-3.5" />
              <span>Edit Caption</span>
            </button>
          </div>
        )}
      </div>

      {/* COLUMN 3: Pipeline Results & Viral Gallery */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-dark-card border border-dark-border rounded-2xl p-4 shadow-xl flex flex-col h-full max-h-[calc(100vh-6rem)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-dark-border/60 pb-3 mb-3">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-neon" />
                <span>Hasil Pipeline AI ({candidates.length})</span>
              </h2>
              <p className="text-[11px] text-gray-400">Top momen terdeteksi oleh 9Router</p>
            </div>

            {candidates.length > 0 && (
              <button
                onClick={() => {
                  if (selectedCandidateIds.size === candidates.length) {
                    setSelectedCandidateIds(new Set());
                  } else {
                    setSelectedCandidateIds(new Set(candidates.map((_, i) => i)));
                  }
                }}
                className="text-xs text-neon hover:underline font-semibold"
              >
                {selectedCandidateIds.size === candidates.length ? 'Batal Semua' : 'Pilih Semua'}
              </button>
            )}
          </div>

          {/* Cards List */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {candidates.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-gray-500 space-y-2">
                <Layers className="w-10 h-10 text-gray-600" />
                <p className="text-xs">Belum ada klip yang terdeteksi.</p>
                <p className="text-[11px] text-gray-600">Klik "Temukan Momen Viral" di panel kiri.</p>
              </div>
            ) : (
              candidates.map((c, idx) => {
                const isActive = activeCandidateIdx === idx;
                const isSelected = selectedCandidateIds.has(idx);
                const isRendering = renderingIndices.has(idx);

                return (
                  <div
                    key={idx}
                    onClick={() => jumpToCandidate(idx)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-dark-surface border-neon shadow-[0_0_15px_rgba(187,244,81,0.15)]'
                        : 'bg-dark-bg/80 border-dark-border hover:border-gray-500'
                    }`}
                  >
                    {/* Top row: Checkbox, Score Badge, Duration */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCandidateSelect(idx);
                          }}
                          className="text-gray-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-neon" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                        <span className="text-xs font-bold text-gray-200">
                          Klip #{idx + 1}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {c.duration}s
                        </span>

                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                            c.overall >= 7
                              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400'
                              : 'bg-yellow-950/80 border-yellow-500/50 text-yellow-400'
                          }`}
                        >
                          ★ {c.overall}/10
                        </span>
                      </div>
                    </div>

                    {/* Hook Title (Editable inline) */}
                    <div className="mb-2">
                      <input
                        type="text"
                        value={c.hook}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          c.hook = e.target.value;
                          onRefreshState();
                        }}
                        className="w-full bg-dark-bg border border-dark-border/80 rounded-lg px-2.5 py-1 text-xs font-bold text-yellow-300 focus:outline-none focus:border-neon"
                      />
                    </div>

                    {/* Text Preview */}
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed mb-3">
                      "{c.text_preview}"
                    </p>

                    {/* Bottom Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-dark-border/50">
                      <span className="text-[10px] font-mono text-gray-500">
                        {c.start}s – {c.end}s
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenderSingle(idx);
                          }}
                          disabled={isRendering}
                          className="px-3 py-1.5 rounded-lg bg-neon/10 hover:bg-neon text-neon hover:text-dark-bg border border-neon/30 text-xs font-extrabold flex items-center gap-1 transition-all disabled:opacity-50"
                        >
                          {isRendering ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Rendering...</span>
                            </>
                          ) : (
                            <>
                              <Scissors className="w-3 h-3" />
                              <span>Render</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sticky Bottom Action: Batch Render */}
          {candidates.length > 0 && (
            <div className="pt-3 border-t border-dark-border/60 mt-3">
              <button
                onClick={handleBatchRender}
                disabled={selectedCandidateIds.size === 0}
                className="w-full py-3 rounded-xl bg-neon hover:bg-neon-400 text-dark-bg font-extrabold text-xs tracking-wide shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Scissors className="w-3.5 h-3.5 text-dark-bg" />
                <span>RENDER ({selectedCandidateIds.size}) KLIP TERPILIH</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
