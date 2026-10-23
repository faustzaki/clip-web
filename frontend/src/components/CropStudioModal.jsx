import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, X, Check, RotateCcw, Crop as CropIcon } from 'lucide-react';

export default function CropStudioModal({
  candidate,
  videoUrl,
  videoWidth = 1920,
  videoHeight = 1080,
  cropRect,
  onClose,
  onApply,
}) {
  const vW = Number(videoWidth) || 1920;
  const vH = Number(videoHeight) || 1080;
  const videoAspect = vW / vH;

  const getCenteredRect = useCallback(
    (targetRatio) => {
      if (!targetRatio || targetRatio === 'free') {
        return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
      }
      const targetAspect = targetRatio === '9:16' ? 9 / 16 : targetRatio === '1:1' ? 1 : 16 / 9;
      const normAspect = targetAspect / videoAspect;
      if (normAspect <= 1) {
        const w = Math.min(1, Math.max(0.05, normAspect));
        const h = 1.0;
        return { x: (1.0 - w) / 2.0, y: 0, w, h };
      } else {
        const h = Math.min(1, Math.max(0.05, 1.0 / normAspect));
        const w = 1.0;
        return { x: 0, y: (1.0 - h) / 2.0, w, h };
      }
    },
    [videoAspect]
  );

  const initialRect = (() => {
    if (cropRect && typeof cropRect.w === 'number') {
      return {
        x: Math.max(0, Math.min(1, cropRect.x || 0)),
        y: Math.max(0, Math.min(1, cropRect.y || 0)),
        w: Math.max(0.05, Math.min(1, cropRect.w || 0.5)),
        h: Math.max(0.05, Math.min(1, cropRect.h || 0.5)),
      };
    }
    return getCenteredRect('9:16');
  })();

  const [ratio, setRatio] = useState(() => {
    const a = (initialRect.w * vW) / Math.max(0.0001, initialRect.h * vH);
    const near = (t) => Math.abs(a - t) < 0.02;
    return near(9 / 16) ? '9:16' : near(1) ? '1:1' : near(16 / 9) ? '16:9' : 'free';
  });
  const [rect, setRect] = useState(initialRect);

  const [draft, setDraft] = useState({});

  const normAspectOf = (r) => (r.w * vW) / Math.max(0.0001, r.h * vH);
  const outAspect = normAspectOf(rect);
  const boxW = outAspect >= 1 ? 320 : Math.round(320 * outAspect);
  const boxH = outAspect >= 1 ? Math.round(320 / outAspect) : 320;

  const display = (field) => draft[field] ?? String(Math.round(rect[field] * 100));

  const lockAspect = (r) => {
    const t = r === '9:16' ? 9 / 16 : r === '1:1' ? 1 : r === '16:9' ? 16 / 9 : null;
    return t ? t / videoAspect : null;
  };

  const resizeRect = (r, field, val, normAspect) => {
    const next = { ...r };
    if (field === 'x') {
      next.x = Math.min(Math.max(0, val), 1 - r.w);
    } else if (field === 'y') {
      next.y = Math.min(Math.max(0, val), 1 - r.h);
    } else if (field === 'w') {
      next.w = Math.min(Math.max(0.05, val), 1 - r.x);
      if (normAspect) {
        next.h = Math.min(next.w / normAspect, 1 - r.y);
        next.w = next.h * normAspect;
      }
    } else if (field === 'h') {
      next.h = Math.min(Math.max(0.05, val), 1 - r.y);
      if (normAspect) {
        next.w = Math.min(next.h * normAspect, 1 - r.x);
        next.h = next.w / normAspect;
      }
    }
    return next;
  };

  const commitNumber = (field, raw) => {
    setDraft((d) => {
      const n = { ...d };
      delete n[field];
      return n;
    });
    const s = String(raw).trim();
    if (s === '') return;
    const num = Number(s.replace(',', '.'));
    if (!Number.isFinite(num)) return;
    const val = Math.min(100, Math.max(0, num)) / 100;
    setRect((prev) => resizeRect(prev, field, val, lockAspect(ratio)));
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(candidate?.start || 0);

  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null); // { mode, x0, y0, r0 }

  const start = candidate?.start || 0;
  const end = candidate?.end || 30;

  useEffect(() => {
    if (videoRef.current) videoRef.current.currentTime = start;
    if (previewVideoRef.current) previewVideoRef.current.currentTime = start;
  }, [candidate, start]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      if (previewVideoRef.current) previewVideoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        if (previewVideoRef.current) previewVideoRef.current.play().catch(() => {});
      }).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    if (previewVideoRef.current && Math.abs(previewVideoRef.current.currentTime - t) > 0.3) {
      previewVideoRef.current.currentTime = t;
    }
    if (t >= end) {
      videoRef.current.currentTime = start;
      if (previewVideoRef.current) previewVideoRef.current.currentTime = start;
    }
  };

  const handleRatioChange = (newRatio) => {
    setRatio(newRatio);
    if (newRatio !== 'free') {
      setRect(getCenteredRect(newRatio));
    }
  };

  const handleReset = () => {
    setRect(getCenteredRect(ratio));
  };

  // Pointer drag handling (move & resize handles)
  const startDrag = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      mode,
      x0: e.clientX,
      y0: e.clientY,
      r0: { ...rect },
    };

    const handlePointerMove = (ev) => {
      if (!dragRef.current || !frameRef.current) return;
      const b = frameRef.current.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return;

      const dx = (ev.clientX - dragRef.current.x0) / b.width;
      const dy = (ev.clientY - dragRef.current.y0) / b.height;
      const r0 = dragRef.current.r0;
      const mode = dragRef.current.mode;

      if (mode === 'move') {
        const x = Math.max(0, Math.min(1 - r0.w, r0.x + dx));
        const y = Math.max(0, Math.min(1 - r0.h, r0.y + dy));
        setRect((prev) => ({ ...prev, x, y }));
        return;
      }

      // Resizing
      const normAspect = lockAspect(ratio);

      let nextX = r0.x;
      let nextY = r0.y;
      let nextW = r0.w;
      let nextH = r0.h;

      if (!normAspect) {
        // Free ratio resize
        if (mode.includes('e')) nextW = Math.max(0.05, Math.min(1 - r0.x, r0.w + dx));
        if (mode.includes('w')) {
          const clampedDx = Math.min(r0.w - 0.05, Math.max(-r0.x, dx));
          nextX = r0.x + clampedDx;
          nextW = r0.w - clampedDx;
        }
        if (mode.includes('s')) nextH = Math.max(0.05, Math.min(1 - r0.y, r0.h + dy));
        if (mode.includes('n')) {
          const clampedDy = Math.min(r0.h - 0.05, Math.max(-r0.y, dy));
          nextY = r0.y + clampedDy;
          nextH = r0.h - clampedDy;
        }
      } else {
        // Locked aspect ratio resize: preserve normAspect = w / h
        if (mode === 'se') {
          let w = Math.max(0.05, r0.w + dx);
          let h = w / normAspect;
          if (r0.x + w > 1) {
            w = 1 - r0.x;
            h = w / normAspect;
          }
          if (r0.y + h > 1) {
            h = 1 - r0.y;
            w = h * normAspect;
          }
          nextW = Math.max(0.05, w);
          nextH = Math.max(0.05, h);
        } else if (mode === 'sw') {
          let w = Math.max(0.05, r0.w - dx);
          let h = w / normAspect;
          if (r0.x + r0.w - w < 0) {
            w = r0.x + r0.w;
            h = w / normAspect;
          }
          if (r0.y + h > 1) {
            h = 1 - r0.y;
            w = h * normAspect;
          }
          nextW = Math.max(0.05, w);
          nextH = Math.max(0.05, h);
          nextX = r0.x + r0.w - nextW;
        } else if (mode === 'ne') {
          let w = Math.max(0.05, r0.w + dx);
          let h = w / normAspect;
          if (r0.x + w > 1) {
            w = 1 - r0.x;
            h = w / normAspect;
          }
          if (r0.y + r0.h - h < 0) {
            h = r0.y + r0.h;
            w = h * normAspect;
          }
          nextW = Math.max(0.05, w);
          nextH = Math.max(0.05, h);
          nextY = r0.y + r0.h - nextH;
        } else if (mode === 'nw') {
          let w = Math.max(0.05, r0.w - dx);
          let h = w / normAspect;
          if (r0.x + r0.w - w < 0) {
            w = r0.x + r0.w;
            h = w / normAspect;
          }
          if (r0.y + r0.h - h < 0) {
            h = r0.y + r0.h;
            w = h * normAspect;
          }
          nextW = Math.max(0.05, w);
          nextH = Math.max(0.05, h);
          nextX = r0.x + r0.w - nextW;
          nextY = r0.y + r0.h - nextH;
        } else if (mode === 'e' || mode === 'w') {
          let w = mode === 'e' ? Math.max(0.05, r0.w + dx) : Math.max(0.05, r0.w - dx);
          let h = w / normAspect;
          if (mode === 'e' && r0.x + w > 1) w = 1 - r0.x;
          if (mode === 'w' && r0.x + r0.w - w < 0) w = r0.x + r0.w;
          h = w / normAspect;
          if (h > 1) {
            h = 1;
            w = h * normAspect;
          }
          nextW = w;
          nextH = h;
          if (mode === 'w') nextX = r0.x + r0.w - nextW;
          nextY = Math.max(0, Math.min(1 - nextH, r0.y + (r0.h - nextH) / 2));
        } else if (mode === 's' || mode === 'n') {
          let h = mode === 's' ? Math.max(0.05, r0.h + dy) : Math.max(0.05, r0.h - dy);
          let w = h * normAspect;
          if (mode === 's' && r0.y + h > 1) h = 1 - r0.y;
          if (mode === 'n' && r0.y + r0.h - h < 0) h = r0.y + r0.h;
          w = h * normAspect;
          if (w > 1) {
            w = 1;
            h = w / normAspect;
          }
          nextW = w;
          nextH = h;
          if (mode === 'n') nextY = r0.y + r0.h - nextH;
          nextX = Math.max(0, Math.min(1 - nextW, r0.x + (r0.w - nextW) / 2));
        }
      }

      setRect({
        x: Math.max(0, Math.min(1 - nextW, nextX)),
        y: Math.max(0, Math.min(1 - nextH, nextY)),
        w: Math.max(0.05, Math.min(1, nextW)),
        h: Math.max(0.05, Math.min(1, nextH)),
      });
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };


  const handleApply = () => {
    onApply?.({ rect });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--vz-overlay)] backdrop-blur-md flex items-center justify-center p-3 md:p-6 select-none">
      <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-[var(--vz-border)] flex justify-between items-center bg-[var(--vz-bg)]">
          <div className="flex items-center gap-2">
            <CropIcon className="w-5 h-5 text-[var(--vz-accent)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--vz-text-strong)] flex items-center gap-2">
                Crop Studio Manual
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--vz-accent-tint)] text-[var(--vz-accent)] border border-[var(--vz-accent)]">
                  {vW}x{vH}
                </span>
              </h2>
              <p className="text-xs text-[var(--vz-text-muted)]">
                Geser dan ubah ukuran kotak crop secara visual. Berlaku presisi pada frame sumber.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--vz-text-muted)] hover:text-[var(--vz-text)] hover:bg-[var(--vz-surface-muted)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Main Visual Canvas Area */}
          <div className="flex-1 bg-black p-4 flex flex-col items-center justify-center overflow-hidden border-b lg:border-b-0 lg:border-r border-[var(--vz-border)]">
            {/* Aspect Pills Bar */}
            <div className="flex items-center gap-2 mb-3 self-start">
              <span className="text-xs font-semibold text-white/80 mr-1">Rasio Target:</span>
              {['9:16', '1:1', '16:9', 'free'].map((r) => {
                const active = ratio === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRatioChange(r)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      active
                        ? 'bg-[var(--vz-accent)] text-white shadow-sm'
                        : 'bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text-soft)] hover:text-[var(--vz-text)]'
                    }`}
                  >
                    {r === 'free' ? 'Bebas (Free)' : r}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleReset}
                className="ml-auto text-xs text-white/70 hover:text-white flex items-center gap-1 transition-colors px-2 py-1"
                title="Reset kotak crop ke tengah"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>

            {/* Video Frame Canvas */}
            <div className="relative max-w-full max-h-[58vh] flex items-center justify-center overflow-hidden rounded-xl border border-[var(--vz-border)] bg-black">
              {/* Exact-ratio aspect box based on video dimensions */}
              <div
                ref={frameRef}
                style={{ aspectRatio: `${vW} / ${vH}` }}
                className="relative max-h-[58vh] max-w-full flex items-center justify-center overflow-hidden"
              >
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain pointer-events-none"
                  onTimeUpdate={handleTimeUpdate}
                  playsInline
                />

                {/* Crop Box with Drag and Resize Handles */}
                <div
                  onPointerDown={(e) => startDrag(e, 'move')}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.w * 100}%`,
                    height: `${rect.h * 100}%`,
                  }}
                  className="absolute border-2 border-[var(--vz-accent)] bg-[var(--vz-accent-ring)] cursor-move shadow-[0_0_0_9999px_var(--vz-overlay)] select-none"
                >
                  {/* Rule-of-Thirds Grid */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute left-1/3 top-0 bottom-0 w-px bg-[var(--vz-accent)]" />
                    <div className="absolute left-2/3 top-0 bottom-0 w-px bg-[var(--vz-accent)]" />
                    <div className="absolute top-1/3 left-0 right-0 h-px bg-[var(--vz-accent)]" />
                    <div className="absolute top-2/3 left-0 right-0 h-px bg-[var(--vz-accent)]" />
                  </div>

                  {/* Ratio Badge */}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[var(--vz-danger-bg)] text-[var(--vz-danger-fg)] text-[10px] font-bold pointer-events-none uppercase">
                    {ratio}
                  </div>

                  {/* 8 Resize Handles */}
                  {/* Corners */}
                  <div
                    onPointerDown={(e) => startDrag(e, 'nw')}
                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--vz-surface)] border-2 border-[var(--vz-accent)] rounded-full cursor-nwse-resize z-20 hover:scale-125"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'ne')}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--vz-surface)] border-2 border-[var(--vz-accent)] rounded-full cursor-nesw-resize z-20 hover:scale-125"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'se')}
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--vz-surface)] border-2 border-[var(--vz-accent)] rounded-full cursor-nwse-resize z-20 hover:scale-125"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'sw')}
                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--vz-surface)] border-2 border-[var(--vz-accent)] rounded-full cursor-nesw-resize z-20 hover:scale-125"
                  />

                  {/* Edges */}
                  <div
                    onPointerDown={(e) => startDrag(e, 'n')}
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-2 bg-[var(--vz-surface)] border border-[var(--vz-accent)] rounded-full cursor-ns-resize z-20 hover:scale-125"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 's')}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-2 bg-[var(--vz-surface)] border border-[var(--vz-accent)] rounded-full cursor-ns-resize z-20 hover:scale-125"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'w')}
                    className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-5 bg-[var(--vz-surface)] border border-[var(--vz-accent)] rounded-full cursor-ew-resize z-20 hover:scale-125"
                  />
                  <div
                    onPointerDown={(e) => startDrag(e, 'e')}
                    className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-5 bg-[var(--vz-surface)] border border-[var(--vz-accent)] rounded-full cursor-ew-resize z-20 hover:scale-125"
                  />
                </div>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-[var(--vz-accent)] text-white flex items-center justify-center hover:bg-[var(--vz-accent-hover)] transition-opacity shadow-md"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="text-xs font-mono text-white/80">
                <span>{currentTime.toFixed(2)}s</span>
                <span className="text-white/50"> / {end.toFixed(2)}s</span>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Preview & Exact Dimensions */}
          <div className="w-full lg:w-[320px] shrink-0 p-4 bg-[var(--vz-surface-muted)] flex flex-col gap-4 overflow-y-auto">
            {/* Live Crop Preview Box (9:16 Mockup) */}
            <div>
              <label className="block text-xs font-semibold text-[var(--vz-text-muted)] mb-2">
                Preview Hasil Crop ({ratio === 'free' ? `${outAspect.toFixed(2)}:1` : ratio})
              </label>
              <div
                style={{ width: boxW, height: boxH }}
                className="mx-auto rounded-xl overflow-hidden border-2 border-[var(--vz-border)] bg-black relative shadow-xl"
              >
                <video
                  ref={previewVideoRef}
                  src={videoUrl}
                  style={{
                    width: `${100 / Math.max(0.05, rect.w)}%`,
                    height: `${100 / Math.max(0.05, rect.h)}%`,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    position: 'absolute',
                    left: `${(-rect.x / Math.max(0.05, rect.w)) * 100}%`,
                    top: `${(-rect.y / Math.max(0.05, rect.h)) * 100}%`,
                    objectFit: 'cover',
                  }}
                  className="pointer-events-none"
                  playsInline
                  muted
                />
              </div>
            </div>

            {/* Exact Normalized Dimension Inputs */}
            <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl p-3 flex flex-col gap-2.5">
              <span className="text-xs font-semibold text-[var(--vz-text-strong)]">Koordinat Kotak (%)</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-[var(--vz-text-muted)] block mb-1">Posisi X (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={display('x')}
                    onChange={(e) => setDraft((d) => ({ ...d, x: e.target.value }))}
                    onBlur={(e) => commitNumber('x', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="w-full bg-[var(--vz-bg)] border border-[var(--vz-border)] rounded-lg px-2 py-1 text-[var(--vz-text)] font-mono text-xs focus:border-[var(--vz-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--vz-text-muted)] block mb-1">Posisi Y (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={display('y')}
                    onChange={(e) => setDraft((d) => ({ ...d, y: e.target.value }))}
                    onBlur={(e) => commitNumber('y', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="w-full bg-[var(--vz-bg)] border border-[var(--vz-border)] rounded-lg px-2 py-1 text-[var(--vz-text)] font-mono text-xs focus:border-[var(--vz-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--vz-text-muted)] block mb-1">Lebar (%)</label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    step="1"
                    value={display('w')}
                    onChange={(e) => setDraft((d) => ({ ...d, w: e.target.value }))}
                    onBlur={(e) => commitNumber('w', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="w-full bg-[var(--vz-bg)] border border-[var(--vz-border)] rounded-lg px-2 py-1 text-[var(--vz-text)] font-mono text-xs focus:border-[var(--vz-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--vz-text-muted)] block mb-1">Tinggi (%)</label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    step="1"
                    value={display('h')}
                    onChange={(e) => setDraft((d) => ({ ...d, h: e.target.value }))}
                    onBlur={(e) => commitNumber('h', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="w-full bg-[var(--vz-bg)] border border-[var(--vz-border)] rounded-lg px-2 py-1 text-[var(--vz-text)] font-mono text-xs focus:border-[var(--vz-accent)] focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--vz-text-faint)] mt-1">
                Pixel target: {Math.round(rect.w * vW)} x {Math.round(rect.h * vH)} px
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--vz-border)] bg-[var(--vz-bg)] flex justify-between items-center">
          <span className="text-xs text-[var(--vz-text-muted)] hidden sm:inline">
            Crop manual akan langsung dipakai saat klip ini dipotong.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text-soft)] text-xs font-semibold hover:text-[var(--vz-text-strong)]"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded-lg bg-[var(--vz-accent)] text-white font-bold text-xs flex items-center gap-1.5 hover:bg-[var(--vz-accent-hover)] shadow-md transition-all"
            >
              <Check className="w-4 h-4" />
              Terapkan Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
