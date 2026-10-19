import React, { useState, useRef } from 'react';
import { Play, Pause, X, Scissors, Type, Sparkles, Check, Trash2, Eye } from 'lucide-react';

export default function CaptionEditorModal({ candidate, videoUrl, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('words'); // 'style' | 'words' | 'titles'
  const [selectedWordIdx, setSelectedWordIdx] = useState(0);
  const [highlightedIndices, setHighlightedIndices] = useState(new Set([1, 4]));
  const [hookTitle, setHookTitle] = useState(candidate?.hook || '');
  const [captionPreset, setCaptionPreset] = useState('hormozi');

  // Words list extracted from candidate preview
  const rawWords = candidate?.text_preview ? candidate.text_preview.split(' ') : ['Halo', 'semua', 'video', 'keren'];
  const [words, setWords] = useState(rawWords);

  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(candidate?.start || 0);

  const toggleWordHighlight = (idx) => {
    const next = new Set(highlightedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setHighlightedIndices(next);
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

  const handleApply = () => {
    if (onSave) {
      onSave({
        hookTitle,
        captionPreset,
        highlightedIndices: Array.from(highlightedIndices),
        words
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-[1250px] h-[92vh] bg-dark-surface rounded-2xl border border-dark-border shadow-2xl flex flex-col overflow-hidden">
        {/* 1. TOP HEADER */}
      <div className="h-14 border-b border-dark-border px-6 flex items-center justify-between bg-dark-surface">
        <div className="flex items-center gap-3">
          <span className="text-xs font-extrabold text-cyber uppercase tracking-wider">
            CAPTION EDITOR
          </span>
          <span className="text-gray-500">•</span>
          <span className="text-xs font-semibold text-gray-300 max-w-[400px] truncate">
            {words.join(' ')}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-card rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 2. MAIN CENTER CONTENT */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Left Panel: Video Player & Subtitle Overlay */}
        <div className="col-span-7 p-6 flex flex-col items-center justify-center bg-dark-bg space-y-4">
          <div className="relative w-[300px] h-[530px] bg-black rounded-3xl border-4 border-dark-border overflow-hidden shadow-2xl flex flex-col justify-between">
            {/* Top Hook Banner */}
            <div className="absolute top-4 left-0 right-0 z-20 flex justify-center px-4">
              <div className="bg-black/90 border border-black px-3 py-1.5 rounded-lg text-center">
                <span className="text-yellow-300 font-extrabold text-xs uppercase">
                  {hookTitle || 'HOOK BANNER'}
                </span>
              </div>
            </div>

            {/* Video */}
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                className="w-full h-full object-cover pointer-events-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                Preview Player
              </div>
            )}

            {/* Subtitle Karaoke Display */}
            <div className="absolute bottom-12 left-0 right-0 z-20 flex justify-center px-3 text-center">
              <div className="bg-black/80 px-4 py-2 rounded-xl border border-white/10 max-w-[95%]">
                <p className="text-xs md:text-sm font-extrabold uppercase tracking-wide leading-relaxed">
                  {words.map((w, i) => {
                    const isHl = highlightedIndices.has(i);
                    return (
                      <span
                        key={i}
                        className={`inline-block mr-1.5 px-1 py-0.5 rounded transition-all ${
                          isHl
                            ? 'text-yellow-400 bg-yellow-400/20 font-black scale-105'
                            : 'text-white'
                        }`}
                      >
                        {w}
                      </span>
                    );
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Simple Playback Bar */}
          <div className="flex items-center gap-3 bg-dark-surface px-4 py-2 rounded-xl border border-dark-border">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-full bg-cyber text-dark-bg font-bold hover:bg-cyber-400 transition-all"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <span className="text-xs font-mono text-gray-300">
              {currentTime.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Right Panel: Word Styling Inspector & Tabs */}
        <div className="md:col-span-5 border-l border-dark-border bg-dark-surface p-6 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-5">
            {/* Inspector Navigation Tabs */}
            <div className="flex items-center border-b border-dark-border">
              {[
                { id: 'style', label: 'Style' },
                { id: 'words', label: 'Words' },
                { id: 'titles', label: 'Titles' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2 text-xs font-extrabold uppercase border-b-2 transition-all ${
                    activeTab === t.id
                      ? 'border-cyber text-cyber'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB: WORDS STYLING (Matching dashboard.webp) */}
            {activeTab === 'words' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-extrabold text-white uppercase tracking-wider mb-1">
                    PER WORD STYLING
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Klik kata di bawah untuk mengaktifkan highlight karaoke warna emas/kuning.
                  </p>
                </div>

                {/* Word Chips Grid */}
                <div className="flex flex-wrap gap-2 p-3 bg-dark-bg rounded-xl border border-dark-border">
                  {words.map((w, idx) => {
                    const isHl = highlightedIndices.has(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWordHighlight(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          isHl
                            ? 'bg-cyber text-dark-bg border-cyber shadow-[0_0_10px_rgba(250,204,21,0.3)] scale-105'
                            : 'bg-dark-surface border-dark-border text-gray-300 hover:text-white hover:border-gray-500'
                        }`}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>

                {/* Subtitle Presets */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-[11px] font-bold text-gray-400">Gaya Format Subtitle</label>
                  <select
                    value={captionPreset}
                    onChange={(e) => setCaptionPreset(e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyber"
                  >
                    <option value="hormozi">Hormozi (Yellow Highlight)</option>
                    <option value="mrbeast">MrBeast (Green Box Highlight)</option>
                    <option value="default">Default Bold Cyan</option>
                    <option value="podcast">Podcast Clean</option>
                  </select>
                </div>
              </div>
            )}

            {/* TAB: TITLES */}
            {activeTab === 'titles' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-extrabold text-white uppercase tracking-wider mb-1">
                    HEADER HOOK TITLE
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Banner judul hook yang menarik perhatian 3 detik pertama.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400">Teks Judul</label>
                  <input
                    type="text"
                    value={hookTitle}
                    onChange={(e) => setHookTitle(e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-xs font-bold text-yellow-300 focus:outline-none focus:border-cyber"
                    placeholder="Contoh: RAHASIA MENABUNG KAYA"
                  />
                </div>
              </div>
            )}

            {/* TAB: STYLE */}
            {activeTab === 'style' && (
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  GLOBAL CAPTION SETTINGS
                </h3>
                <p className="text-[11px] text-gray-400">
                  Font default: Arial Black. Posisi otomatis di sepertiga bawah vertikal.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Action CTA */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-dark-border">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white"
            >
              Batal
            </button>

            <button
              onClick={handleApply}
              className="px-5 py-2.5 rounded-xl bg-cyber hover:bg-cyber-400 text-dark-bg font-extrabold text-xs shadow-lg flex items-center gap-1.5 transition-all"
            >
              <Check className="w-4 h-4 text-dark-bg" />
              <span>Simpan & Terapkan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
