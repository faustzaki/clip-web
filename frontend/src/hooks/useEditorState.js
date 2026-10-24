import { useCallback, useEffect, useState } from 'react';
import { fetchTranscript, cutTranscript, fetchTimeline, saveTimeline } from '../api';

/**
 * State inti editor studio: transkrip (kata), timeline, klip/kandidat, posisi putar (detik),
 * plus aksi seek / potong rentang / muat ulang.
 * Kontrak lama dipertahankan: `currentTime` dalam DETIK, konsumen mengalikan 1000 untuk ms.
 */
export default function useEditorState({ projectId, state, videoRef }) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [timeline, setTimeline] = useState(null);
  const [timelineError, setTimelineError] = useState(null);

  // Panel transkrip (kata + potong rentang)
  const [transcript, setTranscript] = useState(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState(null);

  const loadTranscript = useCallback(async () => {
    if (!projectId) return;
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      setTranscript(await fetchTranscript(projectId));
    } catch (err) {
      setTranscriptError(err?.message || 'Gagal memuat transkrip.');
    } finally {
      setTranscriptLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setTranscript(null);
    loadTranscript();
  }, [projectId, loadTranscript]);

  useEffect(() => {
    let alive = true;
    setTimeline(null);
    setTimelineError(null);
    fetchTimeline(projectId)
      .then((data) => { if (alive) setTimeline(data); })
      .catch((err) => { if (alive) setTimelineError(err?.message || 'Gagal memuat timeline'); });
    return () => { alive = false; };
  }, [projectId]);

  const timelineItems = (timeline?.tracks || []).flatMap((t) => (t.items || []).map((it) => ({ ...it, track: t.track })));
  const timelineDuration = timeline?.duration_ms || Math.round(duration * 1000);

  const seekToMs = (ms) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, (Number(ms) || 0) / 1000);
    setCurrentTime(v.currentTime);
  };

  const handleTranscriptCut = async (fromIdx, toIdx) => {
    await cutTranscript(projectId, fromIdx, toIdx);
    await loadTranscript();
  };

  /** Tulis kotak zoom (T6) ke payload item track 1, kunci per candidate_index. */
  const saveZoomKeyframes = async (candidateIndex, keyframes) => {
    const tracks = timeline?.tracks || [];
    if (!tracks.length) return false;
    let touched = false;
    const items = tracks.flatMap((t) => (t.items || []).map((it) => {
      if (t.track !== 1) return { ...it, track: t.track };
      touched = true;
      return {
        ...it,
        track: t.track,
        payload: {
          ...(it.payload || {}),
          zoom_keyframes: {
            ...((it.payload || {}).zoom_keyframes || {}),
            [String(candidateIndex)]: keyframes,
          },
        },
      };
    }));
    if (!touched) return false;
    await saveTimeline(projectId, items);
    setTimeline(await fetchTimeline(projectId));
    return true;
  };

  const clips = state?.clips || [];
  const candidates = state?.candidates || [];

  return {
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    timeline,
    timelineError,
    timelineItems,
    timelineDuration,
    transcript,
    transcriptLoading,
    transcriptError,
    loadTranscript,
    seekToMs,
    handleTranscriptCut,
    saveZoomKeyframes,
    clips,
    candidates,
  };
}
