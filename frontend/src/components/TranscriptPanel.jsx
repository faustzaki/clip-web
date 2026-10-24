import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Scissors, Loader2, RotateCcw, X, AlertTriangle, Users, Sparkles, Pencil, Check } from 'lucide-react';

const GAP_MS = 600;
const LINE_WORDS = 7;
const CHECK_UNDERLINE = '#E0A800';   // underline kata ragu (T7)
const SPEAKER_COLORS = ['#4822A5', '#0E7C86', '#B45309', '#9D174D'];  // T8: 4 warna speaker
const ESTIMATE_TAG = '(perkiraan)';  // jalur B: hasil heuristic, bukan model

const sec = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)}s`;
const mmss = (ms) => {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const normalize = (a, b) => (a <= b ? { from: a, to: b } : { from: b, to: a });

export default function TranscriptPanel({
  words = [],
  current = 0,
  onSeek,
  onCut,
  onEditWord,
  loading = false,
  error = null,
  onRetry,
  speakers = [],
  diarizeModel = null,
  speakerCaption = false,
  onDiarize,
  onRenameSpeaker,
  onToggleSpeakerCaption,
}) {
  const [mode, setMode] = useState('transcript');
  const [query, setQuery] = useState('');
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [range, setRange] = useState(null);
  const [cutting, setCutting] = useState(false);
  const [cutError, setCutError] = useState(null);
  const [filterSpeaker, setFilterSpeaker] = useState('all');
  const [speakerJob, setSpeakerJob] = useState(null);      // null | 'heuristic' | 'model'
  const [speakerMsg, setSpeakerMsg] = useState(null);      // {kind:'info'|'error', text}
  const [renaming, setRenaming] = useState(null);          // {id, value}
  const [savingRename, setSavingRename] = useState(false);
  const listRef = useRef(null);
  const editRef = useRef(null);
  const renameRef = useRef(null);
  const userScrolledRef = useRef(false);
  const draggingRef = useRef(false);
  const programmaticRef = useRef(false);

  const speakerById = useMemo(() => {
    const map = new Map();
    speakers.forEach((s) => map.set(s.id, s));
    return map;
  }, [speakers]);
  const speakerColor = (id) => SPEAKER_COLORS[(speakerById.get(id)?.color_idx ?? 0) % SPEAKER_COLORS.length];
  const speakerName = (id) => speakerById.get(id)?.label || `Speaker ${id}`;
  const isEstimate = (id) => (speakerById.get(id)?.confidence || 'estimate') === 'estimate';

  // Kata dengan keyakinan ASR rendah (T7) — dasar filter "Hanya perlu dicek"
  const checkIdxs = useMemo(
    () => words.reduce((acc, w, i) => (w.needs_check ? (acc.push(i), acc) : acc), []),
    [words],
  );

  // Filter panel: "Hanya perlu dicek" (T7) + speaker (T8)
  const visibleIdxs = useMemo(() => {
    let idxs = words.map((_, i) => i);
    if (onlyCheck) idxs = idxs.filter((i) => checkIdxs.includes(i));
    if (filterSpeaker !== 'all') idxs = idxs.filter((i) => words[i].speaker === filterSpeaker);
    return idxs;
  }, [onlyCheck, checkIdxs, filterSpeaker, words]);
  const visibleSet = useMemo(() => new Set(visibleIdxs), [visibleIdxs]);

  useEffect(() => {
    if (editing && editRef.current) editRef.current.select();
  }, [editing]);

  useEffect(() => {
    if (renaming && renameRef.current) renameRef.current.select();
  }, [renaming]);

  useEffect(() => {
    if (filterSpeaker !== 'all' && !speakers.some((s) => s.id === filterSpeaker)) setFilterSpeaker('all');
  }, [speakers, filterSpeaker]);

  const q = query.trim().toLowerCase();
  const matchIdxs = useMemo(() => {
    if (!q) return [];
    const out = [];
    words.forEach((w, i) => { if (String(w.word || '').toLowerCase().includes(q)) out.push(i); });
    return out;
  }, [words, q]);

  const activeIdx = useMemo(
    () => words.findIndex((w) => current >= w.start_ms && current < w.end_ms),
    [words, current],
  );

  const totalMs = useMemo(
    () => words.reduce((sum, w) => sum + (w.deleted ? 0 : Math.max(0, w.end_ms - w.start_ms)), 0),
    [words],
  );

  const segments = useMemo(() => {
    const out = [];
    words.forEach((w, i) => {
      const last = out[out.length - 1];
      const prev = words[i - 1];
      if (!last || (prev && w.start_ms - prev.end_ms > GAP_MS) || last.idxs.length >= LINE_WORDS) {
        out.push({ idxs: [i] });
      } else {
        last.idxs.push(i);
      }
    });
    return out;
  }, [words]);

  // Ikuti kata aktif; berhenti kalau user scroll manual (flag di-reset saat klik kata)
  useEffect(() => {
    if (activeIdx < 0 || userScrolledRef.current || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
    if (!el) return;
    programmaticRef.current = true;
    el.scrollIntoView({ block: 'nearest' });
    const t = setTimeout(() => { programmaticRef.current = false; }, 150);
    return () => clearTimeout(t);
  }, [activeIdx]);

  // Pencarian: lompat ke hasil pertama
  useEffect(() => {
    if (!q || !matchIdxs.length || !listRef.current) return;
    programmaticRef.current = true;
    listRef.current.querySelector(`[data-idx="${matchIdxs[0]}"]`)?.scrollIntoView({ block: 'nearest' });
    const t = setTimeout(() => { programmaticRef.current = false; }, 150);
    return () => clearTimeout(t);
  }, [q, matchIdxs]);

  useEffect(() => {
    const up = () => { draggingRef.current = false; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const onScroll = () => { if (!programmaticRef.current) userScrolledRef.current = true; };

  const startSel = (i, e) => {
    userScrolledRef.current = false;
    draggingRef.current = true;
    if (e.shiftKey && anchor != null) setRange(normalize(anchor, i));
    else {
      setAnchor(i);
      setRange({ from: i, to: i });
    }
  };

  const extendSel = (i) => { if (draggingRef.current && anchor != null) setRange(normalize(anchor, i)); };

  const clearSel = () => { setRange(null); setAnchor(null); setCutError(null); };

  const applyCut = async () => {
    if (!range || cutting || !onCut) return;
    setCutting(true);
    setCutError(null);
    try {
      await onCut(words[range.from].idx, words[range.to].idx);
      clearSel();
    } catch (err) {
      setCutError(err?.message || 'Gagal memotong bagian ini.');
    } finally {
      setCutting(false);
    }
  };

  const commitEdit = async () => {
    if (!editing || !onEditWord) return;
    const { idx, value } = editing;
    const text = value.trim();
    if (!text || text === (words[idx]?.word || '').trim()) {
      setEditing(null);
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await onEditWord(idx, text);
      setEditing(null);
    } catch (err) {
      setEditError(err?.message || 'Gagal menyimpan kata.');
    } finally {
      setSavingEdit(false);
    }
  };

  /** Jalankan diarisasi (T8). Hasil {ok:false,reason,hint} = state jujur, bukan error keras. */
  const runDiarize = async (engine) => {
    if (!onDiarize || speakerJob) return;
    setSpeakerJob(engine);
    setSpeakerMsg(null);
    try {
      const res = await onDiarize(engine);
      if (res?.ok) {
        const tag = res.confidence === 'estimate' ? ` ${ESTIMATE_TAG}` : '';
        setSpeakerMsg({ kind: 'info', text: `Diarisasi selesai: ${res.speakers?.length || 0} speaker${tag}.` });
      } else {
        setSpeakerMsg({ kind: 'error', text: res?.reason || 'Diarisasi tidak bisa dijalankan di mesin ini.' });
      }
    } catch (err) {
      setSpeakerMsg({ kind: 'error', text: err?.message || 'Gagal menjalankan diarisasi.' });
    } finally {
      setSpeakerJob(null);
    }
  };

  const commitRename = async () => {
    if (!renaming || !onRenameSpeaker) return;
    const value = renaming.value.trim();
    if (!value || value === (speakerById.get(renaming.id)?.label || '')) {
      setRenaming(null);
      return;
    }
    setSavingRename(true);
    try {
      await onRenameSpeaker(renaming.id, value);
      setRenaming(null);
    } catch (err) {
      setSpeakerMsg({ kind: 'error', text: err?.message || 'Gagal mengganti nama speaker.' });
    } finally {
      setSavingRename(false);
    }
  };

  /** Badge nama speaker di kiri paragraf (muncul saat speaker berganti). */
  const renderSpeakerBadge = (id) => {
    const color = speakerColor(id);
    return (
      <span
        className="inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold align-middle select-none"
        style={{ color, backgroundColor: `${color}1F` }}
        title={isEstimate(id) ? 'Speaker hasil perkiraan (pitch + jeda bicara)' : 'Speaker hasil model diarisasi'}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {speakerName(id)}{isEstimate(id) ? ` ${ESTIMATE_TAG}` : ''}
      </span>
    );
  };

  const renderWord = (i) => {
    const w = words[i];
    const isActive = i === activeIdx;
    const isMatch = q && String(w.word || '').toLowerCase().includes(q);
    const inRange = range && i >= range.from && i <= range.to;
    const badge = w.speaker != null && words[i - 1]?.speaker !== w.speaker ? renderSpeakerBadge(w.speaker) : null;

    if (editing && editing.idx === i) {
      return (
        <input
          key={`edit-${w.idx ?? i}`}
          ref={editRef}
          value={editing.value}
          disabled={savingEdit}
          aria-label={`Perbaiki kata ${w.word}`}
          onChange={(e) => setEditing({ idx: i, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
            else if (e.key === 'Escape') { setEditing(null); }
          }}
          onBlur={() => setEditing(null)}
          className="vz-input inline-block align-baseline"
          style={{ width: `${Math.max(6, (editing.value.length || 1) + 2)}ch`, padding: '0 6px' }}
        />
      );
    }

    return (
      <React.Fragment key={w.idx ?? i}>
        {badge}
        <button
          type="button"
          data-idx={i}
          onPointerDown={(e) => startSel(i, e)}
          onPointerEnter={() => extendSel(i)}
          onClick={() => onSeek?.(w.start_ms)}
          onDoubleClick={() => { if (onEditWord) setEditing({ idx: i, value: w.word }); }}
          title={[
            `${sec(w.start_ms)} – ${sec(w.end_ms)}`,
            w.speaker != null ? `Speaker: ${speakerName(w.speaker)}${isEstimate(w.speaker) ? ` ${ESTIMATE_TAG}` : ''}` : '',
            w.needs_check ? 'Perlu dicek: keyakinan ASR rendah' : '',
            w.edited ? 'Sudah diperbaiki manual' : '',
            onEditWord ? 'Klik dua kali untuk memperbaiki kata' : '',
          ].filter(Boolean).join(' · ')}
          className={[
            'inline-flex items-baseline gap-1 px-0.5 rounded-[6px] cursor-pointer align-baseline text-left transition-colors',
            isActive ? 'bg-vz-tint text-vz-accent' : 'text-vz-text hover:bg-vz-muted',
            isMatch ? 'underline decoration-vz-accent decoration-2 underline-offset-2' : '',
            inRange ? 'ring-1 ring-vz-accent' : '',
            w.deleted ? 'line-through opacity-45' : '',
          ].filter(Boolean).join(' ')}
          style={w.needs_check ? { borderBottom: `2px solid ${CHECK_UNDERLINE}` } : undefined}
        >
          <span className="text-body">{w.word}</span>
          <span className="text-meta italic text-vz-dim">[{sec(w.start_ms)}]</span>
        </button>
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1 p-1 rounded-full bg-vz-muted border border-vz-border">
        {[{ id: 'transcript', label: 'Transkrip' }, { id: 'subtitle', label: 'Edit subtitle' }].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            aria-pressed={mode === t.id}
            className={`flex-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              mode === t.id ? 'bg-vz-accent text-white' : 'text-vz-dim hover:text-vz-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-vz-dim pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari kata di transkrip"
          aria-label="Cari kata di transkrip"
          className="vz-input w-full"
          style={{ paddingLeft: 32, paddingRight: 32 }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            title="Bersihkan pencarian"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-vz-dim hover:text-vz-accent"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div data-region="transcript-count" className="flex items-center justify-between gap-2 text-[11px] text-vz-dim">
        <span>{q ? `${matchIdxs.length} hasil` : `${visibleIdxs.length} kata${onlyCheck ? ' perlu dicek' : ''}${filterSpeaker !== 'all' ? ` · ${speakerName(filterSpeaker)}` : ''}`}</span>
        <div className="flex items-center gap-2">
          {checkIdxs.length > 0 && (
            <button
              type="button"
              onClick={() => setOnlyCheck((v) => !v)}
              aria-pressed={onlyCheck}
              title="Tampilkan hanya kata yang perlu dicek"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold transition-colors ${
                onlyCheck
                  ? 'border-vz-accent text-vz-accent bg-vz-tint'
                  : 'border-vz-border text-vz-dim hover:text-vz-accent'
              }`}
            >
              <AlertTriangle className="w-3 h-3" style={{ color: CHECK_UNDERLINE }} />
              Hanya perlu dicek ({checkIdxs.length})
            </button>
          )}
          <span className="font-mono tabular-nums">Total {mmss(totalMs)}</span>
        </div>
      </div>

      {!loading && !error && words.length > 0 && (
        <div data-region="speaker-panel" className="rounded-vz-lg border border-vz-border bg-vz-surface p-2 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => runDiarize('heuristic')}
              disabled={!onDiarize || !!speakerJob}
              title="Pisahkan speaker dari jeda bicara + tinggi nada (tanpa model)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-vz-lg border border-vz-border text-xs font-bold text-vz-dim hover:text-vz-accent hover:border-vz-accent transition-colors disabled:opacity-50"
            >
              {speakerJob === 'heuristic' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
              Diarisasi (perkiraan)
            </button>
            <button
              type="button"
              onClick={() => runDiarize('model')}
              disabled={!onDiarize || !!speakerJob || !diarizeModel?.ok}
              title={diarizeModel?.ok ? 'Pisahkan speaker dengan model pyannote' : (diarizeModel?.reason || 'Model diarisasi belum tersedia')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-vz-lg border border-vz-border text-xs font-bold text-vz-dim hover:text-vz-accent hover:border-vz-accent transition-colors disabled:opacity-50"
            >
              {speakerJob === 'model' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Diarisasi (model)
            </button>
            {speakers.length > 0 && (
              <button
                type="button"
                onClick={onToggleSpeakerCaption}
                disabled={!onToggleSpeakerCaption}
                aria-pressed={speakerCaption}
                title="Sisipkan prefix nama speaker di caption hasil export"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-bold transition-colors ${
                  speakerCaption ? 'border-vz-accent text-vz-accent bg-vz-tint' : 'border-vz-border text-vz-dim hover:text-vz-accent'
                }`}
              >
                {speakerCaption && <Check className="w-3 h-3" />}
                Tampilkan nama di caption
              </button>
            )}
          </div>

          {diarizeModel && !diarizeModel.ok && (
            <p className="text-[11px] text-vz-dim">
              Diarisasi (model) nonaktif: {diarizeModel.reason}.
            </p>
          )}

          {speakerMsg && (
            <p className={`text-[11px] ${speakerMsg.kind === 'error' ? 'text-[var(--vz-danger-fg)]' : 'text-vz-dim'}`}>
              {speakerMsg.text}
            </p>
          )}

          {speakers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] font-bold text-vz-dim">Speaker</span>
              <button
                type="button"
                onClick={() => setFilterSpeaker('all')}
                aria-pressed={filterSpeaker === 'all'}
                className={`px-2 py-0.5 rounded-full border text-[11px] font-bold transition-colors ${
                  filterSpeaker === 'all' ? 'border-vz-accent text-vz-accent bg-vz-tint' : 'border-vz-border text-vz-dim hover:text-vz-accent'
                }`}
              >
                Semua
              </button>
              {speakers.map((sp) => (
                <span key={sp.id} className="inline-flex items-center rounded-full border border-vz-border overflow-hidden">
                  {renaming && renaming.id === sp.id ? (
                    <input
                      ref={renameRef}
                      value={renaming.value}
                      disabled={savingRename}
                      aria-label={`Ganti nama ${sp.label}`}
                      onChange={(e) => setRenaming({ id: sp.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                        else if (e.key === 'Escape') { setRenaming(null); }
                      }}
                      onBlur={() => setRenaming(null)}
                      className="vz-input text-[11px] font-bold"
                      style={{ width: '12ch', padding: '1px 6px', color: speakerColor(sp.id) }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFilterSpeaker(sp.id)}
                      aria-pressed={filterSpeaker === sp.id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold transition-colors ${
                        filterSpeaker === sp.id ? 'bg-vz-tint text-vz-accent' : 'text-vz-dim hover:text-vz-accent'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: speakerColor(sp.id) }} />
                      {sp.label}{isEstimate(sp.id) ? ` ${ESTIMATE_TAG}` : ''}
                    </button>
                  )}
                  {onRenameSpeaker && !(renaming && renaming.id === sp.id) && (
                    <button
                      type="button"
                      onClick={() => setRenaming({ id: sp.id, value: sp.label })}
                      title={`Ganti nama ${sp.label}`}
                      className="px-1 py-0.5 text-vz-dim hover:text-vz-accent"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {cutError && <p className="text-[11px] text-[var(--vz-danger-fg)]">{cutError}</p>}
      {editError && <p className="text-[11px] text-[var(--vz-danger-fg)]">{editError}</p>}

      <div ref={listRef} onScroll={onScroll} className="max-h-[320px] overflow-y-auto pr-1">
        {loading && (
          <div className="space-y-2 py-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-4 rounded-vz-sm bg-vz-muted animate-pulse"
                style={{ width: `${[100, 82, 64][i]}%` }}
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="py-2 space-y-2">
            <p className="text-xs text-[var(--vz-danger-fg)]">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-vz-lg border border-vz-border text-xs font-bold text-vz-dim hover:text-vz-accent hover:border-vz-accent transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Coba lagi
              </button>
            )}
          </div>
        )}

        {!loading && !error && words.length === 0 && (
          <p className="text-xs text-vz-dim py-2">Transkrip belum siap. Jalankan analisis dulu.</p>
        )}

        {!loading && !error && words.length > 0 && mode === 'transcript' && (
          visibleIdxs.length === 0 ? (
            <p className="text-xs text-vz-dim py-2">Tidak ada kata yang perlu dicek.</p>
          ) : (
            <div className="text-body leading-[1.6]">{visibleIdxs.map(renderWord)}</div>
          )
        )}

        {!loading && !error && words.length > 0 && mode === 'subtitle' && (
          <div className="space-y-2">
            {segments.map((seg, si) => {
              const idxs = seg.idxs.filter((i) => visibleSet.has(i));
              if (!idxs.length) return null;
              return (
                <div key={si} className="rounded-vz-lg border border-vz-border bg-vz-surface p-2">
                  <span className="text-[11px] font-mono text-vz-dim">
                    {sec(words[idxs[0]].start_ms)} – {sec(words[idxs[idxs.length - 1]].end_ms)}
                  </span>
                  <div className="text-body leading-[1.6] mt-0.5">{idxs.map(renderWord)}</div>
                </div>
              );
            })}
          </div>
        )}

        {range && range.to > range.from && (
          <div className="sticky bottom-1 z-10 mt-2 flex items-center justify-between gap-2 rounded-full border border-vz-border bg-vz-surface px-3 py-1.5 shadow-vz-md">
            <span className="text-[11px] text-vz-dim">
              {range.to - range.from + 1} kata · {sec(words[range.from].start_ms)} – {sec(words[range.to].end_ms)}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearSel}
                className="px-2 py-1 rounded-full text-[11px] font-bold text-vz-dim hover:text-vz-strong transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={applyCut}
                disabled={cutting}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-vz-accent text-white text-[11px] font-bold disabled:opacity-50"
              >
                {cutting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
                Potong bagian ini
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
