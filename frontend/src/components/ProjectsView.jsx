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

  const badgeBase = 'vz-badge';

  const statusBadge = (p) => {
    if (!p.has_source) return <span className={`${badgeBase} vz-badge--warn`}>Belum ada video</span>;
    const badges = [];
    if (p.clip_count > 0) badges.push(<span key="clips" className={`${badgeBase} vz-badge--success`}>{p.clip_count} klip</span>);
    if (p.candidate_count > 0) badges.push(<span key="cands" className={`${badgeBase} vz-badge--info`}>{p.candidate_count} kandidat</span>);
    if (badges.length === 0) badges.push(<span key="ready" className={`${badgeBase} vz-badge--info`}>Siap di-clip</span>);
    return <>{badges}</>;
  };

  return (
    <div className="max-w-content mx-auto px-5 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-vz-border pb-4">
        <div>
          <h1 className="text-h font-semibold text-vz-strong flex items-center gap-2">
            <Film className="w-5 h-5 text-vz-accent" />
            <span>Project</span>
          </h1>
          <p className="text-meta text-vz-dim mt-1">
            Pilih project untuk lanjut clipping, atau buat project baru.
          </p>
        </div>
        <button
          onClick={onNew}
          className="vz-btn vz-btn--primary"
        >
          <Plus className="w-4 h-4" />
          <span>Project Baru</span>
        </button>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-vz-dim text-ui">
          Memuat projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-center border-2 border-dashed border-vz-border rounded-vz-2xl p-6 space-y-3">
          <Film className="w-12 h-12 text-vz-faint" />
          <p className="text-base font-medium text-vz-soft">Belum ada project.</p>
          <p className="text-meta text-vz-dim">Buat project dari link YouTube atau upload video untuk mulai clipping.</p>
          <button
            onClick={onNew}
            className="vz-btn vz-btn--primary mt-2"
          >
            <Plus className="w-4 h-4" />
            <span>Project Baru</span>
          </button>
        </div>
      ) : (
        <div className="vz-grid">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="vz-card overflow-hidden cursor-pointer group"
            >
              {/* Cover */}
              <div className="relative aspect-video bg-vz-muted">
                {p.cover_url ? (
                  <img
                    src={p.cover_url}
                    className="w-full h-full object-cover"
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-vz-muted text-vz-faint">
                    {p.source_type === 'youtube' ? <Video className="w-10 h-10" /> : <Upload className="w-10 h-10" />}
                  </div>
                )}
                {/* Status badges */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {statusBadge(p)}
                </div>
                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(e, p)}
                    aria-label={`Ubah nama ${p.title || p.id}`}
                    title="Ubah nama"
                    className="p-1.5 rounded-vz-md bg-vz-surface border border-vz-border text-vz-soft hover:text-vz-accent transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, p)}
                    aria-label={`Hapus ${p.title || p.id}`}
                    title="Hapus"
                    className="p-1.5 rounded-vz-md bg-vz-surface border border-vz-border text-vz-soft hover:text-vz-accent transition-colors"
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
                    aria-label="Judul project"
                    className="w-full bg-vz-surface border border-vz-accent rounded-vz-md px-2 py-1 text-ui font-medium text-vz-strong focus:outline-none focus:shadow-[0_0_0_3px_var(--vz-accent-ring)]"
                  />
                ) : (
                  <h3 className="text-ui font-medium text-vz-strong truncate">{p.title || `Project ${p.id}`}</h3>
                )}
                <div className="flex items-center gap-3 text-meta text-vz-dim font-mono">
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
