import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react';

const TRACKS = [
  { track: 1, label: 'Video' },
  { track: 2, label: 'Teks' },
  { track: 3, label: 'Audio' },
];
const ZOOMS = [25, 50, 100, 200];
const RULER_H = 24;
const TRACK_H = 40;
const GAP = 8;
const BLOCK_CLASS = {
  video: 'bg-vz-tint border-vz-accent text-vz-strong',
  caption: 'bg-vz-muted border-vz-border text-vz-soft',
  audio: 'bg-[var(--vz-success-bg)] border-vz-border text-vz-soft',
  broll: 'bg-[var(--vz-accent-tint)] border-vz-accent text-vz-accent',
};

const mmss = (ms) => {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Timeline({
  items = [],
  duration = 0,
  current = 0,
  zoom = 100,
  collapsed = false,
  onSeek,
  onZoom,
  onToggleCollapse,
  onTrim,
  onBrollMove,
  onBrollRemove,
  error = null,
}) {
  const laneRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [laneW, setLaneW] = useState(0);

  const dur = Math.max(0, Number(duration) || 0);
  const cur = Math.max(0, Number(current) || 0);
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  const seekFromX = (clientX) => {
    const el = laneRef.current;
    if (!el || !dur) return;
    const b = el.getBoundingClientRect();
    if (b.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - b.left) / b.width));
    onSeek?.(Math.round(ratio * dur));
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => seekFromX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging, dur]);

  useEffect(() => {
    const el = laneRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setLaneW(el.clientWidth));
    ro.observe(el);
    setLaneW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const tickStep = dur > 1_200_000 ? 60_000 : 5_000; // >20 menit: tick jarang biar DOM tetap ringan
  // label m:ss tiap 15s; melebar otomatis kalau jarak antar label < 46px (video panjang)
  const contentW = Math.max(1, laneW * (zoom / 100));
  const labelStep = dur > 0
    ? [15_000, 30_000, 60_000, 120_000, 300_000, 600_000].find((s) => (s / dur) * contentW >= 46) || 600_000
    : 15_000;
  const ticks = [];
  for (let t = 0; t <= dur; t += tickStep) ticks.push(t);

  return (
    <section
      data-region="timeline"
      className="shrink-0 flex flex-col border-t border-vz-border bg-vz-surface"
      style={{ height: collapsed ? 200 : 320 }}
    >
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-vz-border">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Buka timeline' : 'Ringkas timeline'}
          title={collapsed ? 'Buka timeline' : 'Ringkas timeline'}
          data-region="timeline-collapse"
          className="p-1.5 rounded-vz-md text-vz-dim hover:bg-vz-muted hover:text-vz-soft transition-colors"
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <span className="text-[11px] font-medium text-vz-soft">Timeline</span>
        {error ? (
          <span className="text-[11px] text-vz-dim truncate">Timeline belum bisa dimuat: {error}</span>
        ) : (
          <span data-region="timeline-time" className="text-[11px] text-vz-dim tabular-nums">
            {mmss(cur)} / {mmss(dur)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => onZoom?.(z)}
              aria-label={`Zoom timeline ${z} persen`}
              title={`Zoom ${z}%`}
              data-zoom={z}
              className={`px-2 py-0.5 rounded-vz-sm text-[11px] tabular-nums transition-colors ${
                z === zoom ? 'bg-vz-accent text-white' : 'text-vz-dim hover:bg-vz-muted'
              }`}
            >
              {z}%
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="w-14 shrink-0 flex flex-col gap-2" style={{ marginTop: RULER_H + GAP }}>
          {TRACKS.map(({ track, label }) => (
            <div
              key={track}
              className="flex items-center pl-3 text-[11px] font-medium text-vz-dim"
              style={{ height: TRACK_H }}
            >
              {label}
            </div>
          ))}
        </div>

        <div ref={laneRef} data-region="timeline-lanes" className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden">
          <div className="relative flex flex-col gap-2" style={{ width: `${zoom}%` }}>
            <div
              data-region="timeline-ruler"
              className="relative cursor-pointer border-b border-vz-border"
              style={{ height: RULER_H }}
              aria-label="Ruler timeline, klik untuk memindahkan posisi video"
              onMouseDown={(e) => {
                setDragging(true);
                seekFromX(e.clientX);
              }}
            >
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute top-0 bottom-0 border-l border-vz-border"
                  style={{ left: `${dur ? (t / dur) * 100 : 0}%` }}
                >
                  {t % labelStep === 0 && (
                    <span className="absolute top-1 left-1 text-[10px] text-vz-dim tabular-nums">{mmss(t)}</span>
                  )}
                </span>
              ))}
            </div>

            {TRACKS.map(({ track }) => {
              const trackItems = items.filter((it) => Number(it.track) === track);
              return (
                <div
                  key={track}
                  data-track={track}
                  className="relative rounded-vz-sm bg-vz-bg"
                  style={{ height: TRACK_H }}
                >
                  {trackItems.length === 0 ? (
                    <p className="pl-2 text-[11px] text-vz-dim leading-10">Belum ada item di track ini.</p>
                  ) : (
                    trackItems.map((it) => {
                      const start = Number(it.start_ms) || 0;
                      const end = Number(it.end_ms) || 0;
                      const widthPct = dur ? Math.max(0.4, ((end - start) / dur) * 100) : 0;
                      const label = it.payload?.text || it.payload?.name || it.kind;
                      const zoomIdx = Object.entries(it.payload?.zoom_keyframes || {})
                        .filter(([, kfs]) => Array.isArray(kfs) && kfs.length)
                        .map(([k]) => `#${Number(k) + 1}`);
                      const wide = (widthPct / 100) * contentW >= 44;
                      if (it.kind === 'broll') {
                        // T10: item b-roll digeser/dihapus lewat tombol (bukan drag).
                        // Tombol ditaruh di sisi kanan blok supaya blok pendek tetap terbaca.
                        return (
                          <div
                            key={it.id ?? `broll-${start}`}
                            data-region="timeline-broll"
                            className="absolute top-0 h-10"
                            style={{
                              left: `${dur ? (start / dur) * 100 : 0}%`,
                              width: `${widthPct}%`,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => onSeek?.(start)}
                              title={`${label} ${mmss(start)}–${mmss(end)}`}
                              className={`absolute inset-0 rounded-vz-md border text-left text-[11px] overflow-hidden ${wide ? 'px-2 truncate' : 'px-0'} ${BLOCK_CLASS.broll}`}
                            >
                              {wide ? label : null}
                            </button>
                            <span className="absolute left-full top-1.5 z-10 flex items-center gap-0.5 pl-1">
                              <button
                                type="button"
                                data-testid="t10-broll-earlier"
                                aria-label="Geser b-roll lebih awal"
                                title="Geser 0,5 detik lebih awal"
                                onClick={() => onBrollMove?.(it.id, -500)}
                                className="w-7 h-7 flex items-center justify-center rounded-vz-md border border-[var(--vz-border)] bg-vz-surface text-vz-accent hover:border-[var(--vz-accent)]"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                data-testid="t10-broll-later"
                                aria-label="Geser b-roll lebih lambat"
                                title="Geser 0,5 detik lebih lambat"
                                onClick={() => onBrollMove?.(it.id, 500)}
                                className="w-7 h-7 flex items-center justify-center rounded-vz-md border border-[var(--vz-border)] bg-vz-surface text-vz-accent hover:border-[var(--vz-accent)]"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                data-testid="t10-broll-remove"
                                aria-label="Hapus b-roll dari timeline"
                                title="Hapus dari timeline"
                                onClick={() => onBrollRemove?.(it.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-vz-md border border-[var(--vz-border)] bg-vz-surface text-[var(--vz-danger-fg)] hover:border-[var(--vz-danger-fg)]"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={it.id ?? `${it.kind}-${start}`}
                          type="button"
                          onClick={() => onSeek?.(start)}
                          onDoubleClick={() => onTrim?.(it)}
                          title={`${label} ${mmss(start)}–${mmss(end)}`}
                          className={`absolute top-0 h-10 rounded-vz-md border text-left text-[11px] overflow-hidden ${wide ? 'px-2 truncate' : 'px-0'} ${
                            BLOCK_CLASS[it.kind] || BLOCK_CLASS.caption
                          }`}
                          style={{
                            left: `${dur ? (start / dur) * 100 : 0}%`,
                            width: `${widthPct}%`,
                          }}
                        >
                          {wide ? label : null}
                          {zoomIdx.length > 0 && (
                            <span
                              data-region="timeline-zoom-badge"
                              title={`Auto zoom: klip ${zoomIdx.join(', ')}`}
                              className="absolute top-0.5 right-0.5 px-1.5 rounded-full text-[9px] font-bold bg-vz-accent text-white"
                            >
                              Zoom {zoomIdx.length}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })}

            {/* ponytail: playhead cuma geser (seek), drag-resize blok ditunda ke T3c */}
            <div
              data-region="timeline-playhead"
              className="absolute top-0 bottom-0 w-[2px] bg-vz-accent"
              style={{ left: `${pct}%` }}
            >
              <div
                role="slider"
                tabIndex={0}
                aria-label="Playhead timeline"
                aria-valuemin={0}
                aria-valuemax={dur}
                aria-valuenow={Math.round(cur)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                className="absolute -left-2 top-0 h-full w-[18px] cursor-ew-resize"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
