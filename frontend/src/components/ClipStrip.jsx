import React from 'react';
import { Download } from 'lucide-react';

const mmss = (s) => {
  const sec = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

const clipDuration = (clip) => {
  const meta = clip.meta || {};
  if (typeof clip.duration === 'number') return clip.duration;
  if (typeof meta.duration === 'number') return meta.duration;
  if (typeof meta.start === 'number' && typeof meta.end === 'number') return meta.end - meta.start;
  return null;
};

export default function ClipStrip({ clips = [], selected, onSelect, onDownload }) {
  return (
    <section
      aria-label="Klip"
      data-region="strip"
      className="h-[96px] shrink-0 border-t border-vz-border bg-vz-surface px-3 py-2 flex items-center gap-3 overflow-x-auto"
    >
      {clips.length === 0 ? (
        <p className="text-ui text-vz-dim">Belum ada klip. Klik Temukan Momen Viral untuk mulai.</p>
      ) : (
        clips.map((clip) => {
          const isSelected = selected != null && selected === clip.slug;
          const duration = clipDuration(clip);
          const title = clip.title || clip.meta?.title || clip.slug;
          return (
            <div
              key={clip.slug}
              onClick={() => onSelect?.(clip)}
              className={`relative w-[160px] h-[80px] shrink-0 rounded-vz-lg border bg-vz-surface overflow-hidden cursor-pointer transition-colors ${
                isSelected ? 'border-vz-accent ring-2 ring-vz-accent/25' : 'border-vz-border hover:border-vz-border-strong'
              }`}
            >
              <div className="relative h-[52px] w-full bg-vz-muted flex items-center justify-center">
                {clip.poster_url ? (
                  <img
                    src={clip.poster_url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : (
                  <span className="text-[11px] text-vz-dim">Tanpa poster</span>
                )}

                {clip.score != null && (
                  <span className="vz-badge vz-badge--success absolute top-1 left-1">{clip.score}</span>
                )}

                {duration != null && (
                  <span className="absolute bottom-1 right-1 px-1 rounded-vz-xs bg-vz-surface/90 text-[10px] font-medium text-vz-strong tabular-nums">
                    {mmss(duration)}
                  </span>
                )}
              </div>

              <p className="px-1.5 pt-1 text-[11px] font-medium text-vz-strong truncate">{title}</p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload?.(clip, e.currentTarget);
                }}
                aria-label={`Unduh klip ${title}`}
                title="Unduh klip"
                className="absolute top-1 right-1 p-1.5 rounded-vz-sm border border-vz-border bg-vz-surface/90 text-vz-dim hover:text-vz-accent hover:border-vz-accent transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })
      )}
    </section>
  );
}
