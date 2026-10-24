import React, { useState, useRef, useEffect } from 'react';
import { putPrefs, renameProject } from '../api';
import useEditorState from '../hooks/useEditorState';
import useVideoSync from '../hooks/useVideoSync';
import ClipsPanel from './ClipsPanel';
import GeneratePanel from './GeneratePanel';
import PreviewStage from './PreviewStage';
import EditorHeader from './EditorHeader';
import ToolRail from './ToolRail';
import ToolPanel from './ToolPanel';
import ClipStrip from './ClipStrip';
import ExportModal from './ExportModal';
import Timeline from './Timeline';

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
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem('studio.leftW')) || 360);
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem('studio.leftCollapsed') === '1');
  const [bottomH, setBottomH] = useState(() => {
    const saved = Number(localStorage.getItem('studio.bottomH'));
    return (saved && saved <= 220 && saved >= 110) ? saved : 135;
  });
  const [bottomCollapsed, setBottomCollapsed] = useState(() => localStorage.getItem('studio.bottomCollapsed') === '1');
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem('studio.rightW')) || 340);
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('studio.rightCollapsed') === '1');
  const [activeTool, setActiveTool] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [timelineZoom, setTimelineZoom] = useState(() => Number(localStorage.getItem('vz.timeline.zoom')) || 100);
  const [timelineCollapsed, setTimelineCollapsed] = useState(() => localStorage.getItem('vz.timeline.collapsed') === '1');

  const handleTitle = async (nextTitle) => {
    const current = state?.project?.title || '';
    if (!nextTitle || nextTitle === current) return;
    setSaveState('saving');
    try {
      await renameProject(projectId, nextTitle);
      await onRefreshState();
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const [exportClip, setExportClip] = useState(null);
  const exportTriggerRef = useRef(null);

  const handleOpenExport = (clip, triggerEl) => {
    exportTriggerRef.current = triggerEl || null;
    setExportClip(clip);
  };

  const handleCloseExport = () => {
    setExportClip(null);
    exportTriggerRef.current?.focus();
    exportTriggerRef.current = null;
  };

  // Sync boolean collapse/mode states to localStorage (NOT high-frequency pixel dimensions)
  useEffect(() => {
    localStorage.setItem('studio.pipelinePos', pipelinePos);
    localStorage.setItem('studio.leftCollapsed', leftCollapsed ? '1' : '0');
    localStorage.setItem('studio.bottomCollapsed', bottomCollapsed ? '1' : '0');
    localStorage.setItem('studio.rightCollapsed', rightCollapsed ? '1' : '0');
  }, [pipelinePos, leftCollapsed, bottomCollapsed, rightCollapsed]);

  // High-performance direct drag handlers (RAF + no transition lag + save on release)
  const isDraggingRef = useRef(false);

  const startDrag = (e, { axis, sign, min, max, from, setValue, storeKey }) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const start = axis === 'x' ? e.clientX : e.clientY;
    let rafId = null;

    const move = (ev) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const delta = (axis === 'x' ? ev.clientX : ev.clientY) - start;
        setValue(Math.min(max, Math.max(min, from + sign * delta)));
      });
    };

    const up = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setValue((cur) => {
        localStorage.setItem(storeKey, String(cur));
        return cur;
      });
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up, { once: true });
  };

  const startLeftDrag = (e) => startDrag(e, { axis: 'x', sign: 1, min: 220, max: 560, from: leftW, setValue: setLeftW, storeKey: 'studio.leftW' });
  const startRightDrag = (e) => startDrag(e, { axis: 'x', sign: -1, min: 240, max: 520, from: rightW, setValue: setRightW, storeKey: 'studio.rightW' });
  const startBottomDrag = (e) => startDrag(e, { axis: 'y', sign: -1, min: 110, max: 320, from: bottomH, setValue: setBottomH, storeKey: 'studio.bottomH' });

  // Prefs sync
  const [prefs, setPrefs] = useState(null);
  const [prefsPid, setPrefsPid] = useState(null);

  useEffect(() => {
    const p = state?.project;
    if (p && p.id !== prefsPid) {
      setPrefs({
        ...p.render_prefs,
        subtitles_enabled: Boolean(p.render_prefs?.subtitles_enabled),
        title_enabled: Boolean(p.render_prefs?.title_enabled),
        watermark_enabled: Boolean(p.render_prefs?.watermark_enabled),
        watermark: p.render_prefs?.watermark ?? '',
        subtitle_style: { ...(p.render_prefs?.subtitle_style || {}) }
      });
      setPrefsPid(p.id);
    }
  }, [state?.project?.id, state?.project?.render_prefs, prefsPid]);

  const savePrefs = async (next) => {
    prefsRef.current = next;
    setPrefs(next);
    try {
      await putPrefs(projectId, next);
    } catch (err) {
      console.error('Failed to save prefs:', err);
    }
  };

  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  // Clipper settings state
  const [cropMode, setCropMode] = useState('speaker-tracked');
  const [tightenCuts, setTightenCuts] = useState(true);
  const [renderQuality, setRenderQuality] = useState('hd');

  const [activeCandidateIdx, setActiveCandidateIdx] = useState(0);
  const [editMode, setEditMode] = useState(false);

  const videoRef = useRef(null);
  const {
    currentTime, setCurrentTime, duration, setDuration,
    transcript, transcriptLoading, transcriptError, loadTranscript,
    timelineError, timelineItems, timelineDuration, seekToMs, handleTranscriptCut,
    handleWordEdit,
    saveZoomKeyframes,
    clips, candidates,
  } = useEditorState({ projectId, state, videoRef });
  const currentVideo = state?.video;
  const selectedClip = clips.find((cl) => cl.candidate_index === activeCandidateIdx) || null;
  const panelTitle = editMode ? 'Edit Clip' : 'Generate Clip';
  const activeCandidate = candidates[activeCandidateIdx] || null;
  const aspect = prefs?.aspect || '9:16';

  useEffect(() => {
    localStorage.setItem('vz.timeline.zoom', String(timelineZoom));
    localStorage.setItem('vz.timeline.collapsed', timelineCollapsed ? '1' : '0');
  }, [timelineZoom, timelineCollapsed]);

  useVideoSync({ videoRef, videoUrl: currentVideo?.url, activeCandidate, setCurrentTime, setDuration });

  const jumpToCandidate = (idx) => {
    setActiveCandidateIdx(idx);
    const cand = candidates[idx];
    if (cand && videoRef.current) {
      videoRef.current.currentTime = cand.start;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="w-full h-full bg-vz-bg flex flex-col overflow-hidden select-none">
      <EditorHeader
        title={state?.project?.title || ''}
        onTitle={handleTitle}
        canUndo={false}
        canRedo={false}
        saveState={saveState}
        onSave={handleTitle}
        onBackToProjects={onBackToProjects}
      />

      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0 overflow-hidden p-2 md:p-2">
          {/* ROW 1: Settings + Center Player (+ Right Pipeline if active) */}
          <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0 overflow-hidden">
            {/* Left Settings Panel */}
            <GeneratePanel
              state={state}
              projectId={projectId}
              options={options}
              prefs={prefs}
              savePrefs={savePrefs}
              leftW={leftW}
              leftCollapsed={leftCollapsed}
              setLeftCollapsed={setLeftCollapsed}
              panelTitle={panelTitle}
              editMode={editMode}
              setEditMode={setEditMode}
              candidates={candidates}
              activeCandidate={activeCandidate}
              cropMode={cropMode}
              setCropMode={setCropMode}
              tightenCuts={tightenCuts}
              setTightenCuts={setTightenCuts}
              renderQuality={renderQuality}
              setRenderQuality={setRenderQuality}
              videoRef={videoRef}
              setActiveCandidateIdx={setActiveCandidateIdx}
              onRefreshState={onRefreshState}
              onBackToProjects={onBackToProjects}
              transcript={transcript}
              transcriptLoading={transcriptLoading}
              transcriptError={transcriptError}
              loadTranscript={loadTranscript}
              handleTranscriptCut={handleTranscriptCut}
              handleWordEdit={handleWordEdit}
              seekToMs={seekToMs}
              currentTime={currentTime}
            />

            {/* Resizer Handle: Left to Center */}
            <div
              onPointerDown={startLeftDrag}
              className="hidden lg:block w-1.5 shrink-0 rounded-full bg-[var(--vz-border)] hover:bg-[var(--vz-accent-hover)] cursor-col-resize select-none transition-colors"
              title={`Tarik untuk mengubah lebar panel ${panelTitle}`}
            />

            {/* Center Live Player & Preview */}
            <PreviewStage
              projectId={projectId}
              project={state?.project}
              prefs={prefs}
              prefsRef={prefsRef}
              savePrefs={savePrefs}
              aspect={aspect}
              currentVideo={currentVideo}
              videoRef={videoRef}
              candidates={candidates}
              clips={clips}
              activeCandidate={activeCandidate}
              activeCandidateIdx={activeCandidateIdx}
              setActiveCandidateIdx={setActiveCandidateIdx}
              currentTime={currentTime}
              setCurrentTime={setCurrentTime}
              duration={duration}
              jumpToCandidate={jumpToCandidate}
              cropMode={cropMode}
              tightenCuts={tightenCuts}
              renderQuality={renderQuality}
              onRefreshState={onRefreshState}
              onClipRendered={onClipRendered}
              onOpenCropStudio={onOpenCropStudio}
              onOpenSubtitleApply={onOpenSubtitleApply}
              saveZoomKeyframes={saveZoomKeyframes}
            />

            {/* RIGHT COLUMN MODE: If pipelinePos === 'right' */}
            {pipelinePos === 'right' && (
              <ClipsPanel
                variant="right"
                pipelinePos={pipelinePos}
                setPipelinePos={setPipelinePos}
                rightW={rightW}
                rightCollapsed={rightCollapsed}
                setRightCollapsed={setRightCollapsed}
                bottomH={bottomH}
                bottomCollapsed={bottomCollapsed}
                setBottomCollapsed={setBottomCollapsed}
                startRightDrag={startRightDrag}
                startBottomDrag={startBottomDrag}
                projectId={projectId}
                candidates={candidates}
                clips={clips}
                activeCandidateIdx={activeCandidateIdx}
                setActiveCandidateIdx={setActiveCandidateIdx}
                setEditMode={setEditMode}
                jumpToCandidate={jumpToCandidate}
              />
            )}
          </div>

        {/* BOTTOM PANEL MODE: If pipelinePos === 'bottom' */}
      {pipelinePos === 'bottom' && (
        <ClipsPanel
          variant="bottom"
          pipelinePos={pipelinePos}
          setPipelinePos={setPipelinePos}
          rightW={rightW}
          rightCollapsed={rightCollapsed}
          setRightCollapsed={setRightCollapsed}
          bottomH={bottomH}
          bottomCollapsed={bottomCollapsed}
          setBottomCollapsed={setBottomCollapsed}
          startRightDrag={startRightDrag}
          startBottomDrag={startBottomDrag}
          projectId={projectId}
          candidates={candidates}
          clips={clips}
          activeCandidateIdx={activeCandidateIdx}
          setActiveCandidateIdx={setActiveCandidateIdx}
          setEditMode={setEditMode}
          jumpToCandidate={jumpToCandidate}
        />
      )}
        </div>

        {activeTool && (
          <ToolPanel
            tool={activeTool}
            onClose={() => setActiveTool(null)}
            projectId={projectId}
            options={options}
            prefs={prefs}
            savePrefs={savePrefs}
            transcript={transcript}
            loadTranscript={loadTranscript}
          />
        )}

        <ToolRail active={activeTool} onSelect={setActiveTool} />
      </div>

      <Timeline
        items={timelineItems}
        duration={timelineDuration}
        current={Math.round(currentTime * 1000)}
        zoom={timelineZoom}
        collapsed={timelineCollapsed}
        onSeek={seekToMs}
        onZoom={setTimelineZoom}
        onToggleCollapse={() => setTimelineCollapsed((v) => !v)}
        error={timelineError}
      />

      <ClipStrip
        clips={clips}
        selected={selectedClip?.slug}
        onSelect={(clip) => setActiveCandidateIdx(clip.candidate_index ?? 0)}
        onDownload={handleOpenExport}
      />

      <ExportModal
        open={Boolean(exportClip)}
        clip={exportClip}
        onClose={handleCloseExport}
        onStart={onClipRendered}
      />
    </div>
  );
}
