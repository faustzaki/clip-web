import { useCallback, useEffect, useState } from 'react';
import { fetchTranscript, cutTranscript, editTranscriptWord, fetchTimeline, saveTimeline, diarizeProject, renameSpeaker } from '../api';

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

  /** Perbaiki teks satu kata (T7); timing dibagi proporsional di server. */
  const handleWordEdit = async (idx, text) => {
    await editTranscriptWord(projectId, idx, text);
    await loadTranscript();
  };

  /**
   * Diarisasi speaker (T8). `engine="model"` balas {ok:false,reason,hint} kalau
   * pyannote/HF_TOKEN absen — pemanggil menampilkan alasannya, tidak melempar error.
   */
  const handleDiarize = async (engine = 'heuristic') => {
    const res = await diarizeProject(projectId, engine);
    if (res?.ok) await loadTranscript();
    return res;
  };

  /** Ganti nama speaker (T8); label disimpan di project, caption export ikut berubah. */
  const handleSpeakerRename = async (speakerId, label) => {
    await renameSpeaker(speakerId, label);
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

  /**
   * Sisipkan b-roll (T10) di posisi playhead: track 2, kind='broll', 2500 ms, opacity 1.0.
   * `item` = entri index b-roll (`{path,name,tags}`) dari panel.
   */
  const insertBroll = async (item, atMs, durationMs = 2500) => {
    const tracks = timeline?.tracks || [];
    if (!tracks.length || !item?.path) return false;
    const items = tracks.flatMap((t) => (t.items || []).map((it) => ({ ...it, track: t.track })));
    const dur = timelineDuration || 0;
    const start = Math.max(0, Math.min(Math.round(Number(atMs) || 0), Math.max(0, dur - 500)));
    const end = Math.min(dur || start + durationMs, start + durationMs);
    items.push({
      id: `broll-${Date.now().toString(36)}`,
      track: 2,
      kind: 'broll',
      start_ms: start,
      end_ms: Math.max(start + 500, end),
      payload: { src: item.path, name: item.name, tags: item.tags || [], opacity: 1.0 },
    });
    await saveTimeline(projectId, items);
    setTimeline(await fetchTimeline(projectId));
    return true;
  };

  /** Geser item b-roll `deltaMs` di timeline (tombol ‹ › di kartu, bukan drag). */
  const moveBroll = async (itemId, deltaMs) => {
    const tracks = timeline?.tracks || [];
    const items = tracks.flatMap((t) => (t.items || []).map((it) => ({ ...it, track: t.track })));
    const dur = timelineDuration || 0;
    let touched = false;
    const next = items.map((it) => {
      if (String(it.id) !== String(itemId)) return it;
      touched = true;
      const len = Math.max(500, Number(it.end_ms) - Number(it.start_ms));
      const start = Math.max(0, Math.min(Number(it.start_ms) + deltaMs, Math.max(0, dur - len)));
      return { ...it, start_ms: Math.round(start), end_ms: Math.round(start + len) };
    });
    if (!touched) return false;
    await saveTimeline(projectId, next);
    setTimeline(await fetchTimeline(projectId));
    return true;
  };

  /** Hapus item b-roll dari timeline. */
  const removeBroll = async (itemId) => {
    const tracks = timeline?.tracks || [];
    const items = tracks.flatMap((t) => (t.items || []).map((it) => ({ ...it, track: t.track })));
    const next = items.filter((it) => String(it.id) !== String(itemId));
    if (next.length === items.length) return false;
    await saveTimeline(projectId, next);
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
    handleWordEdit,
    handleDiarize,
    handleSpeakerRename,
    speakers: transcript?.speakers || [],
    diarizeModel: transcript?.diarize_model || null,
    saveZoomKeyframes,
    insertBroll,
    moveBroll,
    removeBroll,
    clips,
    candidates,
  };
}
