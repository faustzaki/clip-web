import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Pencil,
  FileVideo,
  Crop,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { scoreMoments } from '../api';
import SubtitlePreview from './SubtitlePreview';
import SubtitleStyleEditor from './SubtitleStyleEditor';
import TranscriptPanel from './TranscriptPanel';

const FRAMING_OPTIONS = [
  {
    id: 'speaker-tracked',
    label: 'Auto Face Tracking (Ekspresi & Reaksi Wajah Seru)',
    desc: 'Fokus melacak wajah pembicara secara dinamis saat bereaksi atau berekspresi heboh.',
  },
  {
    id: 'topic-hook',
    label: 'Topik Pembicaraan Seru & Viral Hook (Fokus Dialog)',
    desc: 'Mencari percakapan paling menarik, punchline, atau hook dialog yang memicu rasa penasaran penonton.',
  },
  {
    id: 'center',
    label: 'Center Crop (Fokus Tengah)',
    desc: 'Framing vertikal statis di posisi tengah frame video 16:9.',
  },
  {
    id: 'split',
    label: 'Split Gaming (Reaksi Wajah + Gameplay)',
    desc: 'Tata letak split atas-bawah: kamera reaksi wajah di atas (45%) dan gameplay aksi di bawah (55%).',
  },
  {
    id: 'blur',
    label: 'Blurred Background (Sinematik Blur)',
    desc: 'Video 16:9 utuh di tengah dengan padding latar belakang blur vertikal sinematik.',
  },
];

/**
 * Panel kiri studio: form Generate Clip (model AI, durasi, framing), pengaturan Edit Clip
 * (komponen video, gaya subtitle per-project, filler cuts, kualitas render) + panel transkrip.
 */
export default function GeneratePanel({
  state,
  projectId,
  options,
  prefs,
  savePrefs,
  leftW,
  leftCollapsed,
  setLeftCollapsed,
  panelTitle,
  editMode,
  setEditMode,
  candidates,
  activeCandidate,
  cropMode,
  setCropMode,
  tightenCuts,
  setTightenCuts,
  renderQuality,
  setRenderQuality,
  videoRef,
  setActiveCandidateIdx,
  onRefreshState,
  onBackToProjects,
  transcript,
  transcriptLoading,
  transcriptError,
  loadTranscript,
  handleTranscriptCut,
  handleWordEdit,
  seekToMs,
  currentTime,
  speakers = [],
  diarizeModel = null,
  speakerCaption = false,
  onDiarize,
  onRenameSpeaker,
  onToggleSpeakerCaption,
}) {
  // Clipper settings state
  const [selectedModel, setSelectedModel] = useState(options?.default_model || 'ag/gemini-3.8-flash-high');

  useEffect(() => {
    if (options?.default_model) {
      setSelectedModel(options.default_model);
    }
  }, [options?.default_model]);
  const [minDur, setMinDur] = useState(15);
  const [maxDur, setMaxDur] = useState(60);
  const selectedFraming = FRAMING_OPTIONS.find((f) => f.id === cropMode) || FRAMING_OPTIONS[0];
  const [subtitleSectionOpen, setSubtitleSectionOpen] = useState(true);
  const [isScoring, setIsScoring] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

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
        use_llm: selectedModel !== 'heuristic',
        search_logic: cropMode,
        crop_mode: cropMode
      });

      setIsScoring(false);
      setStatusMessage('');
      await onRefreshState();

      if (scoreRes.candidates && scoreRes.candidates.length > 0) {
        setActiveCandidateIdx(0);
        if (videoRef.current) {
          videoRef.current.currentTime = scoreRes.candidates[0].start;
          videoRef.current.play().catch(() => {});
        }
      }
    } catch (err) {
      setIsScoring(false);
      setStatusMessage('');
      alert(`Error: ${err.message}`);
    }
  };

  return (
        <aside data-region="sidebar"
          style={{ width: leftCollapsed ? 48 : leftW }}
          className="lg:shrink-0 min-w-0 h-full flex flex-col overflow-hidden"
        >
      {leftCollapsed ? (
        /* Collapsed Rail */
        <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl p-2 flex flex-col items-center gap-4 h-full shadow-lg">
          <button
            type="button"
            onClick={() => setLeftCollapsed(false)}
            className="p-1.5 rounded-lg bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] text-[var(--vz-text-muted)] hover:text-[var(--vz-accent)] hover:border-[var(--vz-accent)] transition-colors"
            title={`Buka ${panelTitle}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {editMode ? (
            <Pencil className="w-4 h-4 text-[var(--vz-accent)]" />
          ) : (
            <Sparkles className="w-4 h-4 text-[var(--vz-accent)]" />
          )}
          <div
            className="text-xs font-bold text-[var(--vz-text-muted)] uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 py-6 select-none"
          >
            {panelTitle}
          </div>
        </div>
      ) : (
        /* Expanded Full Settings Panel */
        <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl shadow-xl flex-1 flex flex-col h-full min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--vz-border-strong)] p-3 shrink-0">
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              aria-expanded={editMode}
              title={editMode ? 'Beralih ke Generate Clip' : 'Beralih ke Edit Clip'}
              className="text-sm font-extrabold uppercase tracking-wider text-[var(--vz-text-strong)] flex items-center gap-2 py-1.5 -my-1 hover:text-[var(--vz-accent)] transition-colors"
            >
              {editMode ? <Pencil className="w-4 h-4 text-[var(--vz-accent)]" /> : <Sparkles className="w-4 h-4 text-[var(--vz-accent)]" />}
              <span>{panelTitle}</span>
            </button>
            <div className="flex items-center gap-1.5">
              {editMode && (
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  title="Kembali ke Generate Clip"
                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-[var(--vz-text-muted)] hover:text-[var(--vz-accent)] hover:bg-[var(--vz-surface-muted)] transition-colors"
                >
                  Generate Clip
                </button>
              )}
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                className="p-1 rounded text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)] hover:bg-[var(--vz-surface-muted)] transition-colors"
                title={`Minimize panel ${panelTitle}`}
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
                <div className="p-3 rounded-xl border border-[var(--vz-danger-fg)] bg-[var(--vz-danger-bg)] text-[var(--vz-danger-fg)] text-xs shrink-0">
                  <p className="font-bold">Gagal memproses video</p>
                  <p className="text-[11px] mt-0.5">{state.ingest.error || state.ingest.message}</p>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-[var(--vz-border)] bg-[var(--vz-surface-muted)] space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--vz-text)] font-medium flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--vz-accent)]" />
                      {state.ingest.message || 'Memproses video...'}
                    </span>
                    <span className="text-[var(--vz-accent)] font-mono font-bold text-[11px]">
                      {Math.round(state.ingest.percent || 0)}%
                    </span>
                  </div>
                  <div className="w-full bg-[var(--vz-border)] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[var(--vz-accent)] h-full transition-all duration-300"
                      style={{ width: `${state.ingest.percent || 0}%` }}
                    />
                  </div>
                </div>
              )
            )}

            {/* No-source Warning */}
            {!state?.video ? (
              <div className="rounded-xl border border-dashed border-[var(--vz-border)] bg-[var(--vz-surface-muted)] p-4 text-center space-y-2 shrink-0">
                <FileVideo className="w-10 h-10 text-[var(--vz-text-faint)] mx-auto" />
                {state?.ingest?.status === 'running' || state?.ingest?.status === 'starting' ? (
                  <p className="text-xs text-[var(--vz-text)]">
                    {state.ingest.message || 'Sedang menyiapkan video source...'}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-[var(--vz-text-muted)]">Project ini belum punya video source.</p>
                    <button
                      onClick={onBackToProjects}
                      className="mt-2 px-4 py-2 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] text-xs font-bold text-[var(--vz-text)] hover:text-[var(--vz-accent)] hover:border-[var(--vz-accent)] transition-all"
                    >
                      Kembali ke Projects
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {!editMode && (
                  <>
                {/* 1. Pilih Model AI untuk Generate */}
                <div className="space-y-1.5 shrink-0">
                  <label className="text-[11px] font-bold text-[var(--vz-text)]">Pilih Model AI untuk Generate</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl px-3 py-2 text-xs text-[var(--vz-text)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
                  >
                    {(options?.ai_models || [
                      { id: 'ag/gemini-3.8-flash', label: 'Gemini 3.8 Flash (9Router)' }
                    ]).map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Min & Max durasi */}
                <div className="space-y-2 pt-1 shrink-0">
                  <span className="text-[11px] font-bold text-[var(--vz-text)]">Min & Max Durasi</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-2.5 rounded-xl">
                      <div className="flex justify-between text-[11px] text-[var(--vz-text-muted)]">
                        <span>Min:</span>
                        <span className="text-[var(--vz-accent)] font-bold font-mono">{minDur}s</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="45"
                        value={minDur}
                        onChange={(e) => setMinDur(Number(e.target.value))}
                        className="w-full accent-[var(--vz-accent)] h-1.5 bg-[var(--vz-border)] rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1 bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-2.5 rounded-xl">
                      <div className="flex justify-between text-[11px] text-[var(--vz-text-muted)]">
                        <span>Max:</span>
                        <span className="text-[var(--vz-accent)] font-bold font-mono">{maxDur}s</span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="90"
                        value={maxDur}
                        onChange={(e) => setMaxDur(Number(e.target.value))}
                        className="w-full accent-[var(--vz-accent)] h-1.5 bg-[var(--vz-border)] rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Mode Framing & Crop (AI Logic) */}
                <div className="space-y-2 pt-1 shrink-0">
                  <label className="text-[11px] font-bold text-[var(--vz-text)]">Mode Framing & Crop</label>
                  <select
                    value={cropMode}
                    onChange={(e) => setCropMode(e.target.value)}
                    className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-xl px-3 py-2 text-xs text-[var(--vz-text)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
                  >
                    {FRAMING_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>

                  {selectedFraming && (
                    <div className="p-2.5 rounded-xl bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] text-[11px] text-[var(--vz-text)] leading-relaxed">
                      {selectedFraming.desc}
                    </div>
                  )}

                  <p className="text-[10px] text-[var(--vz-text-faint)] leading-normal">
                    AI akan mendeteksi dan memotong momen viral berdasarkan logic framing yang dipilih di atas (misal ekspresi seru atau topik dialog menarik).
                  </p>
                </div>

                {/* 4. Primary Find Moments Button */}
                <button
                  onClick={handleFindMoments}
                  disabled={isScoring || !state?.video}
                  className="w-full py-3.5 px-4 rounded-xl bg-[var(--vz-accent)] hover:bg-[var(--vz-accent-hover)] text-white font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isScoring ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>{statusMessage || 'Mencari momen viral...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-white" />
                      <span>TEMUKAN MOMEN VIRAL</span>
                    </>
                  )}
                </button>
                  </>
                )}

                {editMode && candidates.length === 0 && (
                  <p className="text-xs text-[var(--vz-text-faint)] text-center py-2">Belum ada klip untuk diedit.</p>
                )}

                {/* Edit Clip settings (shown when clips have been generated) */}
                {editMode && candidates.length > 0 && (
                  <div className="space-y-3.5">
                    {/* Opsi Komponen Video */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-[var(--vz-text)]">
                        Opsi Komponen Video
                      </label>
                      <div className="space-y-2.5 bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-3 rounded-xl">
                        {/* Subtitle Otomatis */}
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-xs text-[var(--vz-text)] font-medium">Subtitle Otomatis</span>
                          <input
                            type="checkbox"
                             checked={Boolean(prefs?.subtitles_enabled)}
                            onChange={(e) => savePrefs({ ...(prefs || {}), subtitles_enabled: e.target.checked })}
                            className="accent-[var(--vz-accent)] w-4 h-4 rounded cursor-pointer"
                          />
                        </label>

                        {/* Judul Clip (Hook Banner) */}
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-xs text-[var(--vz-text)] font-medium">Judul Clip (Hook Banner)</span>
                          <input
                            type="checkbox"
                            checked={Boolean(prefs?.title_enabled)}
                            onChange={(e) => savePrefs({ ...(prefs || {}), title_enabled: e.target.checked })}
                            className="accent-[var(--vz-accent)] w-4 h-4 rounded cursor-pointer"
                          />
                        </label>

                        {/* Watermark Handle */}
                        <div className="space-y-2 pt-1 border-t border-[var(--vz-border-strong)]">
                          <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-xs text-[var(--vz-text)] font-medium">Watermark Handle</span>
                            <input
                              type="checkbox"
                              checked={Boolean(prefs?.watermark_enabled)}
                              onChange={(e) => savePrefs({ ...(prefs || {}), watermark_enabled: e.target.checked })}
                              className="accent-[var(--vz-accent)] w-4 h-4 rounded cursor-pointer"
                            />
                          </label>
                          <input
                            type="text"
                            value={prefs?.watermark ?? ''}
                            onChange={(e) => savePrefs({ ...(prefs || {}), watermark: e.target.value })}
                            placeholder="@username"
                            disabled={!prefs?.watermark_enabled}
                            className="w-full bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--vz-text)] placeholder-[var(--vz-text-faint)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Gaya Subtitle (Per-Project) Accordion */}
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSubtitleSectionOpen(!subtitleSectionOpen)}
                        className="w-full flex items-center justify-between text-[11px] font-bold text-[var(--vz-text)] hover:text-[var(--vz-text-strong)] transition-colors py-0.5"
                      >
                        <span className="flex items-center gap-1.5">
                          <span>Gaya Subtitle (Per-Project)</span>
                          {Boolean(prefs?.subtitles_enabled) && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--vz-accent-tint)] text-[var(--vz-accent)] font-semibold">ON</span>
                          )}
                        </span>
                        {subtitleSectionOpen ? (
                          <ChevronUp className="w-4 h-4 text-[var(--vz-text-muted)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--vz-text-muted)]" />
                        )}
                      </button>

                      {subtitleSectionOpen && (
                        <div className="space-y-3 bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-3 rounded-xl">
                          {/* Live Preview */}
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[10px] font-bold text-[var(--vz-text-muted)] uppercase tracking-wider">Preview Subtitle</span>
                            <div className="bg-black/60 border border-[var(--vz-border)] rounded-xl p-2 w-full flex justify-center">
                              <SubtitlePreview
                                style={prefs?.subtitle_style || {}}
                                height={150}
                                words={activeCandidate?.text_preview ? activeCandidate.text_preview.split(' ') : undefined}
                              />
                            </div>
                          </div>

                          {/* Subtitle Style Editor */}
                          <SubtitleStyleEditor
                            value={prefs?.subtitle_style || {}}
                            onChange={(newStyle) => savePrefs({ ...(prefs || {}), subtitle_style: newStyle })}
                            fonts={options?.subtitle_fonts}
                            positions={options?.subtitle_positions}
                          />
                        </div>
                      )}
                    </div>

                    {/* Buang jeda hening / filler cuts */}
                    <div className="space-y-1.5 pt-1">
                      <label className="flex items-center justify-between cursor-pointer bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-3 rounded-xl hover:border-[var(--vz-border-strong)] transition-colors">
                        <div>
                          <span className="text-xs text-[var(--vz-text)] font-medium block">Buang jeda hening / filler cuts</span>
                          <span className="text-[10px] text-[var(--vz-text-faint)] block">Tighten audio & visual cuts otomatis saat render</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={tightenCuts}
                          onChange={(e) => setTightenCuts(e.target.checked)}
                          className="accent-[var(--vz-accent)] w-4 h-4 rounded cursor-pointer shrink-0"
                        />
                      </label>
                    </div>

                    {/* Kualitas Render */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[11px] font-bold text-[var(--vz-text)] block">
                        Kualitas Render
                      </label>
                      <div className="flex items-center gap-1.5 bg-[var(--vz-surface-muted)] p-1 rounded-xl border border-[var(--vz-border)]">
                        {[
                          { id: 'proxy', label: 'Proxy 360p' },
                          { id: 'hd', label: '1080p' },
                          { id: 'best', label: 'Terbaik' }
                        ].map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => setRenderQuality(q.id)}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center ${
                              renderQuality === q.id
                                ? 'bg-[var(--vz-accent)] text-white shadow-sm'
                                : 'text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)]'
                            }`}
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Transcript Panel — di bawah panel Generate/Edit Clip, sidebar tetap scrollable */}
            <div className="pt-3 border-t border-[var(--vz-border-strong)] min-w-0">
              <TranscriptPanel
                words={transcript?.words || []}
                current={Math.round(currentTime * 1000)}
                onSeek={seekToMs}
                onCut={handleTranscriptCut}
                onEditWord={handleWordEdit}
                loading={transcriptLoading}
                error={transcriptError}
                onRetry={loadTranscript}
                speakers={speakers}
                diarizeModel={diarizeModel}
                speakerCaption={speakerCaption}
                onDiarize={onDiarize}
                onRenameSpeaker={onRenameSpeaker}
                onToggleSpeakerCaption={onToggleSpeakerCaption}
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
