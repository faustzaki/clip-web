import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Scissors, Loader2, RotateCcw, X } from 'lucide-react';

const GAP_MS = 600;
const LINE_WORDS = 7;

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
  loading = false,
  error = null,
  onRetry,
}) {
  const [mode, setMode] = useState('transcript');
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState(null);
  const [range, setRange] = useState(null);
  const [cutting, setCutting] = useState(false);
  const [cutError, setCutError] = useState(null);
  const listRef = useRef(null);
  const userScrolledRef = useRef(false);
  const draggingRef = useRef(false);
  const programmaticRef = useRef(false);

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

  const renderWord = (i) => {
    const w = words[i];
    const isActive = i === activeIdx;
    const isMatch = q && String(w.word || '').toLowerCase().includes(q);
    const inRange = range && i >= range.from && i <= range.to;
    return (
      <button
        key={w.idx ?? i}
        type="button"
        data-idx={i}
        onPointerDown={(e) => startSel(i, e)}
        onPointerEnter={() => extendSel(i)}
        onClick={() => onSeek?.(w.start_ms)}
        title={`${sec(w.start_ms)} – ${sec(w.end_ms)}`}
        className={[
          'inline-flex items-baseline gap-1 px-0.5 rounded-[6px] cursor-pointer align-baseline text-left transition-colors',
          isActive ? 'bg-vz-tint text-vz-accent' : 'text-vz-text hover:bg-vz-muted',
          isMatch ? 'underline decoration-vz-accent decoration-2 underline-offset-2' : '',
          inRange ? 'ring-1 ring-vz-accent' : '',
          w.deleted ? 'line-through opacity-45' : '',
        ].filter(Boolean).join(' ')}
      >
        <span className="text-body">{w.word}</span>
        <span className="text-meta italic text-vz-dim">[{sec(w.start_ms)}]</span>
      </button>
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

      <div data-region="transcript-count" className="flex items-center justify-between text-[11px] text-vz-dim">
        <span>{q ? `${matchIdxs.length} hasil` : `${words.length} kata`}</span>
        <span className="font-mono tabular-nums">Total {mmss(totalMs)}</span>
      </div>

      {cutError && <p className="text-[11px] text-[var(--vz-danger-fg)]">{cutError}</p>}

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
          <div className="text-body leading-[1.6]">{words.map((_, i) => renderWord(i))}</div>
        )}

        {!loading && !error && words.length > 0 && mode === 'subtitle' && (
          <div className="space-y-2">
            {segments.map((seg, si) => (
              <div key={si} className="rounded-vz-lg border border-vz-border bg-vz-surface p-2">
                <span className="text-[11px] font-mono text-vz-dim">
                  {sec(words[seg.idxs[0]].start_ms)} – {sec(words[seg.idxs[seg.idxs.length - 1]].end_ms)}
                </span>
                <div className="text-body leading-[1.6] mt-0.5">{seg.idxs.map(renderWord)}</div>
              </div>
            ))}
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
