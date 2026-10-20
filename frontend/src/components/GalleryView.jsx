import React, { useState, useEffect } from 'react';
import { Film, Download, Copy, Check, Play, Clock, HardDrive, RefreshCw } from 'lucide-react';
import { fetchClips } from '../api';

export default function GalleryView({ projectId }) {
  const [clips, setClips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);

  const loadClips = async () => {
    try {
      setIsLoading(true);
      const res = await fetchClips(projectId);
      setClips(res.clips || []);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClips();
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
      <div className="flex items-center justify-between border-b border-dark-border pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white flex items-center gap-2">
            <Film className="w-6 h-6 text-neon" />
            <span>Galeri Klip Siap Upload ({clips.length})</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Klip vertikal 9:16 dengan subtitle burned-in & siap dibagikan ke TikTok, Reels, dan Shorts.
          </p>
        </div>

        <button
          onClick={loadClips}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-dark-card border border-dark-border text-xs font-bold text-gray-300 hover:text-neon hover:border-neon transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-neon' : ''}`} />
          <span>Refresh Galeri</span>
        </button>
      </div>

      {/* Clips Grid */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-xs">
          Memuat daftar klip...
        </div>
      ) : clips.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-center text-gray-500 space-y-3 bg-dark-card border border-dark-border rounded-2xl p-6">
          <Film className="w-12 h-12 text-gray-600" />
          <p className="text-sm font-semibold text-gray-400">Belum ada klip untuk project ini.</p>
          <p className="text-xs text-gray-600">
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
                className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden shadow-xl hover:border-neon/50 transition-all flex flex-col justify-between group"
              >
                {/* Video / Thumbnail Container */}
                <div className="relative aspect-[9/16] bg-black overflow-hidden flex items-center justify-center">
                  <video
                    src={c.url}
                    poster={c.poster_url}
                    controls
                    className="w-full h-full object-cover"
                  />
                  {/* Score badge if available */}
                  {meta.score && (
                    <div className="absolute top-3 left-3 bg-emerald-950/90 border border-emerald-500/50 text-emerald-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
                      ★ {meta.score}/10
                    </div>
                  )}
                </div>

                {/* Card Meta & Details */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold text-white line-clamp-2 uppercase tracking-wide">
                      {title}
                    </h3>

                    {/* Stats pills */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 font-mono">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-neon" />
                        {c.size_mb} MB
                      </span>
                      {meta.start !== undefined && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyber" />
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
                            className="text-[10px] text-gray-500 bg-dark-bg px-1.5 py-0.5 rounded border border-dark-border"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dark-border/60">
                    <button
                      type="button"
                      onClick={() => copyMetadata(c, idx)}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-dark-surface border border-dark-border text-xs font-bold text-gray-300 hover:text-white hover:border-gray-500 transition-all"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-neon" />
                          <span className="text-neon text-[11px]">Disalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-[11px]">Copy Teks</span>
                        </>
                      )}
                    </button>

                    <a
                      href={c.url}
                      download={c.name}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-neon text-dark-bg text-xs font-extrabold hover:bg-neon-400 transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-dark-bg" />
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
