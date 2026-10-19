import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, X, Plus, Trash2, RotateCcw, Check, Sliders } from 'lucide-react';

export default function CropStudioModal({ candidate, videoUrl, onClose, onApply }) {
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [zoom, setZoom] = useState(100);
  const [cropX, setCropX] = useState(50); // percentage 0 - 100
  const [keyframes, setKeyframes] = useState([
    { time: 0, x: 50 },
    { time: (candidate?.duration || 10) * 0.5, x: 50 }
  ]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(candidate?.start || 0);

  const videoRef = useRef(null);
  const start = candidate?.start || 0;
  const end = candidate?.end || 30;
  const duration = end - start;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = start;
    }
  }, [candidate]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    if (t >= end) {
      videoRef.current.currentTime = start;
    }
  };

  const addKeyframe = () => {
    const relTime = currentTime - start;
    const newKfs = [...keyframes.filter(k => Math.abs(k.time - relTime) > 0.5), { time: relTime, x: cropX }];
    newKfs.sort((a, b) => a.time - b.time);
    setKeyframes(newKfs);
  };

  const removeKeyframe = () => {
    const relTime = currentTime - start;
    setKeyframes(keyframes.filter(k => Math.abs(k.time - relTime) > 0.8));
  };

  const resetToCenter = () => {
    setCropX(50);
    setZoom(100);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-[1350px] h-[92vh] bg-dark-surface rounded-2xl border border-dark-border shadow-2xl flex flex-col overflow-hidden">
        {/* 1. TOP NAVBAR */}
      <div className="h-14 border-b border-dark-border px-6 flex items-center justify-between bg-dark-surface">
        {/* Left: Breadcrumb & Title */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-extrabold text-neon uppercase tracking-wider">
            CROP STUDIO • KEYFRAME FRAMING
          </span>
          <span className="text-gray-500">•</span>
          <span className="text-xs font-bold text-white max-w-[300px] truncate">
            {candidate?.hook || 'UNTITLED CLIP'}
          </span>
        </div>

        {/* Center: Brand Smiley */}
        <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-neon/10 text-neon font-bold text-lg">
          ツ
        </div>

        {/* Right: Aspect pills & Action buttons */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-dark-bg p-0.5 rounded-lg border border-dark-border">
            {['9:16', '1:1', '16:9', 'Free'].map((r) => (
              <button
                key={r}
                onClick={() => setAspectRatio(r)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  aspectRatio === r
                    ? 'bg-neon text-dark-bg shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              if (onApply) onApply({ cropX, zoom, aspectRatio, keyframes });
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-neon text-dark-bg font-extrabold text-xs shadow-[0_0_15px_rgba(187,244,81,0.3)] hover:bg-neon-400 transition-all"
          >
            <Check className="w-3.5 h-3.5 text-dark-bg" />
            <span>Apply crop</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-card rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. MAIN CENTER WORKSPACE */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Main 16:9 Canvas with 9:16 Bounding Box */}
        <div className="col-span-8 p-6 flex flex-col items-center justify-center relative bg-dark-bg select-none">
          <div className="relative w-full max-w-[850px] aspect-video bg-black rounded-xl overflow-hidden border border-dark-border shadow-2xl">
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                onTimeUpdate={handleTimeUpdate}
                className="w-full h-full object-cover pointer-events-none"
              />
            )}

            {/* Draggable 9:16 Framing Bounding Box */}
            <div
              style={{
                left: `calc(${cropX}% - 14%)`,
                width: '28%',
                height: '100%'
              }}
              className="absolute top-0 bottom-0 border-2 border-neon bg-neon/10 backdrop-blur-[1px] shadow-[0_0_20px_rgba(187,244,81,0.25)] cursor-ew-resize flex flex-col justify-between p-2"
            >
              {/* 9:16 Tag */}
              <div className="flex justify-between items-start">
                <span className="bg-neon text-dark-bg font-extrabold text-[10px] px-1.5 py-0.5 rounded shadow">
                  {aspectRatio}
                </span>
              </div>

              {/* Rule of thirds grid lines */}
              <div className="w-full h-full absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-30">
                <div className="border-r border-b border-neon"></div>
                <div className="border-r border-b border-neon"></div>
                <div className="border-b border-neon"></div>
                <div className="border-r border-b border-neon"></div>
                <div className="border-r border-b border-neon"></div>
                <div className="border-b border-neon"></div>
                <div className="border-r border-neon"></div>
                <div className="border-r border-neon"></div>
                <div></div>
              </div>

              <div className="text-center text-[10px] font-mono text-neon font-bold">
                X: {cropX}%
              </div>
            </div>
          </div>

          {/* Interactive Bounding Box Slider */}
          <div className="w-full max-w-[850px] mt-4 flex items-center gap-3">
            <span className="text-[11px] font-bold text-gray-400">POSISI CROP:</span>
            <input
              type="range"
              min="14"
              max="86"
              value={cropX}
              onChange={(e) => setCropX(Number(e.target.value))}
              className="flex-1 accent-neon h-2 bg-dark-border rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-neon">{cropX}%</span>
          </div>
        </div>

        {/* 3. RIGHT SIDEBAR: Live Output & Keyframe Inspector */}
        <div className="col-span-4 border-l border-dark-border bg-dark-surface p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-dark-border pb-3">
              <span className="text-xs font-extrabold text-neon uppercase tracking-wider">
                LIVE OUTPUT • 9:16
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon/10 text-neon font-bold">
                RENDER SIMULASI
              </span>
            </div>

            {/* Live Vertical Viewport */}
            <div className="flex justify-center">
              <div className="w-[180px] h-[320px] bg-black rounded-2xl border-2 border-dark-border overflow-hidden relative shadow-lg">
                {videoUrl && (
                  <video
                    src={videoUrl}
                    currentTime={currentTime}
                    style={{
                      transform: `scale(${zoom / 100}) translateX(-${(cropX - 50) * 1.5}%)`,
                      transformOrigin: 'center center'
                    }}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                )}
                <div className="absolute top-2 right-2 text-[9px] bg-black/60 px-1.5 py-0.5 rounded text-white font-mono">
                  {(currentTime - start).toFixed(1)}s
                </div>
              </div>
            </div>

            {/* Zoom / Resize Crop */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-gray-300">ZOOM / RESIZE CROP</span>
                <span className="font-mono text-neon font-bold">{zoom}%</span>
              </div>
              <input
                type="range"
                min="100"
                max="180"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-neon h-1.5 bg-dark-border rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-gray-500">
                Tarik zoom lebih dari 100% untuk memotong tepi hitam footage.
              </p>
            </div>

            {/* Keyframes status */}
            <div className="space-y-2 pt-2 border-t border-dark-border">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-300">KEYFRAMES</span>
                <span className="px-2 py-0.5 bg-dark-bg rounded text-neon font-mono text-[11px]">
                  {keyframes.length} titik
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Framing akan terkunci di titik keyframe tanpa drift hening.
              </p>
            </div>
          </div>

          {/* Reset button */}
          <button
            onClick={resetToCenter}
            className="w-full py-2.5 px-4 rounded-xl border border-dark-border text-xs font-bold text-gray-300 hover:border-neon hover:text-neon flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to center</span>
          </button>
        </div>
      </div>

      {/* 4. BOTTOM PLAYBACK & TIMELINE CONTROLS */}
      <div className="h-16 border-t border-dark-border px-6 bg-dark-surface flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-neon text-dark-bg flex items-center justify-center font-bold hover:bg-neon-400 transition-all shadow-md"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <span className="text-xs font-mono text-gray-300">
            {(currentTime - start).toFixed(1)}s / {duration.toFixed(1)}s
          </span>
        </div>

        {/* Action Keyframe Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={addKeyframe}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-neon/50 text-neon hover:bg-neon/10 text-xs font-bold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Keyframe</span>
          </button>

          <button
            onClick={removeKeyframe}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs font-bold transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>✕ Keyframe</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  );
}
