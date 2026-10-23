import React, { useState, useEffect } from 'react';
import { Film, Download, Copy, Check, Play, Clock, HardDrive } from 'lucide-react';
import { fetchClips } from '../api';

export default function GalleryView({ projectId }) {
  const [clips, setClips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    let isMounted = true;

    const load = async (isInitial = false) => {
      try {
        if (isInitial) setIsLoading(true);
        const res = await fetchClips(projectId);
        if (isMounted) {
          setClips(res.clips || []);
          if (isInitial) setIsLoading(false);
        }
      } catch (err) {
        if (isMounted && isInitial) setIsLoading(false);
      }
    };

    load(true);
    const interval = setInterval(() => {
      load(false);
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [projectId]);
  const copyMetadata = (c, idx) => {
    const meta = c.meta || {};
    const text = `${meta.title || c.name}\n\n${meta.description || ''}\n\n${(meta.hashtags || []).join(' ')}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--vz-border)] pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-[var(--vz-text-strong)] flex items-center gap-2">
            <Film className="w-6 h-6 text-[var(--vz-accent)]" />
            <span>Klip Siap Upload ({clips.length})</span>
          </h1>
          <p className="text-xs text-[var(--vz-text-muted)] mt-1">
            Klip vertikal siap dibagikan ke TikTok, Reels, dan Shorts. Klip raw dan bersubtitle dapat diunduh langsung.
          </p>
        </div>

      </div>

      {/* Clips Grid */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-[var(--vz-text-muted)] text-xs">
          Memuat daftar klip...
        </div>
      ) : clips.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-center text-[var(--vz-text-muted)] space-y-3 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl p-6">
          <Film className="w-12 h-12 text-[var(--vz-text-faint)]" />
          <p className="text-sm font-semibold text-[var(--vz-text-muted)]">Belum ada klip untuk project ini.</p>
          <p className="text-xs text-[var(--vz-text-faint)]">
            Buka Studio Clipper project ini, pilih momen viral, lalu klik Render.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {clips.map((c, idx) => {
            const meta = c.meta || {};
            const title = meta.title || c.name.replace('.mp4', '').replace(/-/g, ' ');

            return (
              <div
                key={c.name}
                className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl overflow-hidden shadow-xl hover:border-[var(--vz-accent)] transition-all flex flex-col justify-between group"
              >
                {/* Video / Thumbnail Container */}
                <div className="relative aspect-[9/16] bg-black overflow-hidden flex items-center justify-center">
                  <video
                    src={c.url}
                    poster={c.poster_url}
                    controls
                    className="w-full h-full object-cover"
                  />
                  {/* Score & Subtitle badges */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                    {meta.score && (
                      <div className="bg-[var(--vz-success-bg)] border border-[var(--vz-success-fg)] text-[var(--vz-success-fg)] text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
                        ★ {meta.score}/10
                      </div>
                    )}
                    {!c.subtitled && (
                      <div className="bg-[var(--vz-warn-bg)] border border-[var(--vz-warn-fg)] text-[var(--vz-warn-fg)] text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
                        RAW
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold text-[var(--vz-text)] line-clamp-2 uppercase tracking-wide">
                      {title}
                    </h3>

                    {/* Stats pills */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--vz-text-muted)] font-mono">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-[var(--vz-accent)]" />
                        {c.size_mb} MB
                      </span>
                      {meta.start !== undefined && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[var(--vz-accent)]" />
                          {(meta.end - meta.start).toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {/* Hashtags preview */}
                    {meta.hashtags && meta.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {meta.hashtags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] text-[var(--vz-text-faint)] bg-[var(--vz-bg-alt)] px-1.5 py-0.5 rounded border border-[var(--vz-border)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--vz-border-strong)]">
                    <button
                      type="button"
                      onClick={() => copyMetadata(c, idx)}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--vz-surface)] border border-[var(--vz-border)] text-xs font-bold text-[var(--vz-text-soft)] hover:text-[var(--vz-text)] hover:border-[var(--vz-border-strong)] transition-all"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[var(--vz-accent)]" />
                          <span className="text-[var(--vz-accent)] text-[11px]">Disalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[var(--vz-text-muted)]" />
                          <span className="text-[11px]">Copy Teks</span>
                        </>
                      )}
                    </button>

                    <a
                      href={c.url}
                      download={c.name}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[var(--vz-accent)] text-white text-xs font-extrabold hover:bg-[var(--vz-accent-hover)] transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span className="text-[11px]">Download</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
