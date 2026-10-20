import React, { useState } from 'react';
import { Plus, Video, Upload, Pencil, Trash2, Film } from 'lucide-react';
import { renameProject, deleteProject } from '../api';

export default function ProjectsView({ projects, isLoading, onOpen, onNew, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');

  const startRename = (e, p) => {
    e.stopPropagation();
    setEditingId(p.id);
    setDraftTitle(p.title || '');
  };

  const commitRename = async (id) => {
    const trimmed = draftTitle.trim();
    if (!trimmed) { setEditingId(null); return; }
    try {
      await renameProject(id, trimmed);
      onRefresh();
    } catch (err) {
      alert('Gagal rename: ' + err.message);
    }
    setEditingId(null);
  };

  const handleDelete = async (e, p) => {
    e.stopPropagation();
    if (!window.confirm(`Hapus project "${p.title || p.id}" beserta video source dan semua klipnya?`)) return;
    try {
      await deleteProject(p.id);
      onRefresh();
    } catch (err) {
      alert('Gagal hapus project: ' + err.message);
    }
  };

  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDuration = (s) => { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

  const statusBadge = (p) => {
    if (!p.has_source) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-400">Belum ada video</span>;
    const badges = [];
    if (p.clip_count > 0) badges.push(<span key="clips" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neon/10 border border-neon/30 text-neon">{p.clip_count} klip</span>);
    if (p.candidate_count > 0) badges.push(<span key="cands" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neon/10 border border-neon/30 text-neon">{p.candidate_count} kandidat</span>);
    if (badges.length === 0) badges.push(<span key="ready" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neon/10 border border-neon/30 text-neon">Siap di-clip</span>);
    return <>{badges}</>;
  };

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-dark-border pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white flex items-center gap-2">
            <Film className="w-6 h-6 text-neon" />
            <span>Projects</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Pilih project untuk lanjut clipping, atau buat project baru.
          </p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon hover:bg-neon-400 text-dark-bg text-xs font-extrabold shadow-[0_0_15px_rgba(187,244,81,0.25)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Project Baru</span>
        </button>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-xs">
          Memuat projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-center border-2 border-dashed border-dark-border rounded-2xl p-6 space-y-3">
          <Film className="w-12 h-12 text-gray-600" />
          <p className="text-sm font-semibold text-gray-400">Belum ada project.</p>
          <p className="text-xs text-gray-600">Buat project dari link YouTube atau upload video untuk mulai clipping.</p>
          <button
            onClick={onNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neon hover:bg-neon-400 text-dark-bg text-xs font-extrabold shadow-sm transition-all mt-2"
          >
            <Plus className="w-4 h-4" />
            <span>Project Baru</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden hover:border-neon/50 transition-all group cursor-pointer"
            >
              {/* Cover */}
              <div className="relative aspect-video bg-dark-bg">
                {p.cover_url ? (
                  <img src={p.cover_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-dark-surface to-dark-bg text-gray-600">
                    {p.source_type === 'youtube' ? <Video className="w-10 h-10" /> : <Upload className="w-10 h-10" />}
                  </div>
                )}
                {/* Status badges */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {statusBadge(p)}
                </div>
                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(e, p)}
                    className="p-1.5 rounded-lg bg-dark-surface/90 border border-dark-border text-gray-300 hover:text-white transition-colors"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, p)}
                    className="p-1.5 rounded-lg bg-dark-surface/90 border border-dark-border text-gray-300 hover:text-red-400 transition-colors"
                    title="Hapus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-3 space-y-1">
                {editingId === p.id ? (
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(p.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => commitRename(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-dark-bg border border-neon/50 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none"
                  />
                ) : (
                  <h3 className="text-xs font-extrabold text-white truncate">{p.title || `Project ${p.id}`}</h3>
                )}
                <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
                  <span>{fmtDate(p.created_at)}</span>
                  {p.duration != null && <span>{fmtDuration(p.duration)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
