import React, { useState, useEffect, useRef } from 'react';
import { transcribeClip, applySubtitles } from '../api';
import SubtitleStyleEditor from './SubtitleStyleEditor';
import { X, Sparkles, RefreshCw, CheckCircle, AlertCircle, Play, Pause, Film } from 'lucide-react';

export default function SubtitleApplyModal({
  projectId,
  clip,
  candidate,
  prefs,
  onPrefsChange,
  fonts,
  positions,
  onClose,
  onApplied,
  onGoToGallery,
}) {
  const [activeTab, setActiveTab] = useState('words'); // 'words' | 'style'
  const [loadingTranscribe, setLoadingTranscribe] = useState(true);
  const [transcribeError, setTranscribeError] = useState(null);
  const [words, setWords] = useState([]);
  const [language, setLanguage] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingWordIdx, setEditingWordIdx] = useState(null);

  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState(null);

  const videoRef = useRef(null);

  const style = prefs?.subtitle_style || {};

  const loadTranscript = async (force = false) => {
    setLoadingTranscribe(true);
    setTranscribeError(null);
    try {
      const data = await transcribeClip(projectId, clip.slug, force);
      setWords(data.words || []);
      setLanguage(data.language);
    } catch (err) {
      setTranscribeError(err.message || 'Transkripsi gagal');
    } finally {
      setLoadingTranscribe(false);
    }
  };

  useEffect(() => {
    if (clip?.slug) {
      loadTranscript(false);
    }
  }, [projectId, clip?.slug]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleWordTextChange = (idx, newText) => {
    setWords((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], word: newText };
      return copy;
    });
  };

  const handleRemoveWord = (idx) => {
    setWords((prev) => prev.filter((_, i) => i !== idx));
    if (editingWordIdx === idx) setEditingWordIdx(null);
  };

  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      await applySubtitles(projectId, clip.slug, {
        words,
        model_size: 'base',
      });
      setApplySuccess(true);
      onApplied?.();
    } catch (err) {
      setApplyError(err.message || 'Gagal menerapkan subtitle');
    } finally {
      setApplying(false);
    }
  };

  // Preview scaling for 530px height box
  const previewH = 530;
  const px = (v) => Math.max(2, Math.round((Number(v) || 0) * previewH / 1920));
  const align = style.position === 'top' ? 'flex-start' : style.position === 'middle' ? 'center' : 'flex-end';

  // Find active group of words based on currentTime
  const wordsPerLine = Math.max(1, Number(style.words_per_line) || 3);
  let activeGroup = [];
  let activeIndexInGroup = -1;

  for (let i = 0; i < words.length; i += wordsPerLine) {
    const grp = words.slice(i, i + wordsPerLine);
    const gStart = grp[0]?.start ?? 0;
    const gEnd = grp[grp.length - 1]?.end ?? (gStart + 1);
    if (currentTime >= gStart && currentTime <= gEnd + 0.1) {
      activeGroup = grp;
      activeIndexInGroup = grp.findIndex((w) => currentTime >= w.start && currentTime <= w.end);
      break;
    }
  }

  const videoSrc = clip?.raw_url || clip?.url;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--vz-overlay)] backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-[var(--vz-border)] flex justify-between items-center bg-[var(--vz-surface-muted)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--vz-accent)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--vz-text-strong)] flex items-center gap-2">
                Terapkan Subtitle Akurat (CapCut-style)
                {language && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--vz-accent-tint)] text-[var(--vz-accent)] border border-[var(--vz-accent)]">
                    {language.toUpperCase()}
                  </span>
                )}
              </h2>
              <p className="text-xs text-[var(--vz-text-muted)]">
                {clip?.slug || 'Clip'} • Transkripsi langsung dari audio clip
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
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left: 9:16 Video Player with Karaoke Overlay */}
          <div className="w-full md:w-[340px] shrink-0 bg-black p-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-[var(--vz-border)] select-none">
            <div
              className="relative w-[298px] h-[530px] rounded-xl overflow-hidden border border-[var(--vz-border)] bg-[var(--vz-bg)] flex items-center justify-center shadow-lg group cursor-pointer"
              onClick={togglePlay}
            >
              <video
                ref={videoRef}
                src={videoSrc}
                className="w-full h-full object-cover"
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                playsInline
                loop
              />

              {/* Karaoke Subtitle Overlay */}
              {activeGroup.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: align,
                    paddingTop: px(style.margin_v ?? 300),
                    paddingBottom: px(style.margin_v ?? 300),
                  }}
                >
                  <div
                    style={{
                      fontFamily: style.font || 'Arial Black',
                      fontSize: px(style.font_size || 43),
                      fontWeight: style.bold ? 900 : 400,
                      color: style.primary_color || '#FFFFFF',
                      WebkitTextStroke: `${px(style.outline_width ?? 5)}px ${style.outline_color || '#000000'}`,
                      paintOrder: 'stroke fill',
                      textShadow: `0 ${px(style.shadow ?? 2)}px ${px((style.shadow ?? 2) * 2)}px ${style.outline_color || '#000000'}`,
                      background: style.box ? (style.box_color || '#000000') : 'transparent',
                      padding: style.box ? `${px(6)}px ${px(12)}px` : 0,
                      borderRadius: style.box ? px(8) : 0,
                      textTransform: style.uppercase ? 'uppercase' : 'none',
                      lineHeight: 1.15,
                      textAlign: 'center',
                    }}
                    className="max-w-[90%]"
                  >
                    {activeGroup.map((w, idx) => {
                      const isHighlighted = idx === activeIndexInGroup;
                      return (
                        <span
                          key={idx}
                          style={{
                            color: isHighlighted ? (style.highlight_color || '#FFE100') : (style.primary_color || '#FFFFFF'),
                            marginRight: px(10),
                          }}
                        >
                          {w.word}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Play / Pause Floating Overlay */}
              <div
                className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity ${
                  isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[var(--vz-surface)] backdrop-blur border border-[var(--vz-border)] flex items-center justify-center text-[var(--vz-text)] shadow-xl">
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </div>
              </div>
            </div>

            <div className="w-[298px] flex justify-between items-center mt-2 text-[11px] font-mono text-white/70">
              <span>{currentTime.toFixed(2)}s</span>
              <span>{words.length} kata</span>
            </div>
          </div>

          {/* Right: Tabs (Kata | Gaya) */}
          <div className="flex-1 flex flex-col min-w-0 bg-[var(--vz-surface-muted)]">
            {/* Tab Header */}
            <div className="flex border-b border-[var(--vz-border)] px-4 pt-3 bg-[var(--vz-surface-muted)]">
              <button
                type="button"
                onClick={() => setActiveTab('words')}
                className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors ${
                  activeTab === 'words'
                    ? 'border-[var(--vz-accent)] text-[var(--vz-accent)]'
                    : 'border-transparent text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
                }`}
              >
                Kata ({words.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('style')}
                className={`px-4 py-2 font-semibold text-xs border-b-2 transition-colors ${
                  activeTab === 'style'
                    ? 'border-[var(--vz-accent)] text-[var(--vz-accent)]'
                    : 'border-transparent text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
                }`}
              >
                Gaya Subtitle
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 p-4 overflow-y-auto">
              {activeTab === 'words' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--vz-text-muted)]">
                      Klik kata untuk mengedit ejaan kata hasil Whisper.
                    </p>
                    <button
                      type="button"
                      onClick={() => loadTranscript(true)}
                      disabled={loadingTranscribe}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text-muted)] hover:text-[var(--vz-text)] hover:border-[var(--vz-accent)] transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingTranscribe ? 'animate-spin' : ''}`} />
                      Putar ulang transkrip
                    </button>
                  </div>

                  {loadingTranscribe ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-8 h-8 text-[var(--vz-accent)] animate-spin" />
                      <p className="text-xs text-[var(--vz-text)]">Mentranskrip audio clip (Whisper)...</p>
                      <p className="text-[11px] text-[var(--vz-text-faint)]">Mengekstrak kata per kata 0-based langsung dari clip mentah</p>
                    </div>
                  ) : transcribeError ? (
                    <div className="p-4 bg-[var(--vz-danger-bg)] border border-[var(--vz-danger-fg)] rounded-xl flex items-start gap-2.5 text-xs text-[var(--vz-danger-fg)]">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--vz-danger-fg)]" />
                      <div>
                        <p className="font-semibold">Transkripsi Gagal</p>
                        <p className="mt-0.5">{transcribeError}</p>
                      </div>
                    </div>
                  ) : words.length === 0 ? (
                    <p className="text-xs text-[var(--vz-text-faint)] text-center py-6">Tidak ada kata terdeteksi dalam klip.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-[380px] overflow-y-auto p-1 bg-[var(--vz-surface-muted)] rounded-xl border border-[var(--vz-border)]">
                      {words.map((w, idx) => {
                        const isEditing = editingWordIdx === idx;
                        const isCurrent = currentTime >= w.start && currentTime <= w.end;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-all ${
                              isCurrent
                                ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] text-[var(--vz-accent)] font-semibold'
                                : 'bg-[var(--vz-surface)] border-[var(--vz-border)] text-[var(--vz-text)] hover:border-[var(--vz-border-strong)]'
                            }`}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                value={w.word}
                                onChange={(e) => handleWordTextChange(idx, e.target.value)}
                                onBlur={() => setEditingWordIdx(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setEditingWordIdx(null);
                                }}
                                className="bg-[var(--vz-bg)] text-[var(--vz-text)] px-1 py-0.5 rounded text-xs border border-[var(--vz-accent)] focus:outline-none w-20 font-sans"
                              />
                            ) : (
                              <span
                                onClick={() => setEditingWordIdx(idx)}
                                className="cursor-text select-none"
                                title={`Start: ${w.start}s, End: ${w.end}s`}
                              >
                                {w.word}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveWord(idx);
                              }}
                              className="text-[var(--vz-text-faint)] hover:text-[var(--vz-danger-fg)] p-0.5 rounded transition-colors"
                              title="Hapus kata"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'style' && (
                <div className="py-1">
                  <SubtitleStyleEditor
                    value={style}
                    onChange={(newStyle) => onPrefsChange?.({ ...prefs, subtitle_style: newStyle })}
                    fonts={fonts}
                    positions={positions}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--vz-border)] bg-[var(--vz-surface-muted)] flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[11px] text-[var(--vz-text-faint)] text-center sm:text-left">
            Judul & watermark sudah dibakar saat pemotongan — ubah di Pengaturan lalu potong ulang.
          </p>

          <div className="flex items-center gap-2">
            {applyError && (
              <span className="text-xs text-[var(--vz-danger-fg)] font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {applyError}
              </span>
            )}

            {applySuccess ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--vz-success-fg)] font-medium flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Subtitle diterapkan!
                </span>
                {onGoToGallery && (
                  <button
                    type="button"
                    onClick={() => {
                      onGoToGallery();
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--vz-accent)] text-white font-bold text-xs flex items-center gap-1.5 hover:bg-[var(--vz-accent-hover)] shadow-md"
                  >
                    <Film className="w-3.5 h-3.5" />
                    Lihat di Galeri
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text-muted)] text-xs font-semibold hover:text-[var(--vz-text)]"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text-muted)] text-xs font-semibold hover:text-[var(--vz-text)]"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying || loadingTranscribe || words.length === 0}
                  className="px-4 py-2 rounded-lg bg-[var(--vz-accent)] text-white font-bold text-xs flex items-center gap-1.5 hover:bg-[var(--vz-accent-hover)] disabled:opacity-50 shadow-md transition-all"
                >
                  {applying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Membakar Subtitle...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Terapkan Subtitle
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
