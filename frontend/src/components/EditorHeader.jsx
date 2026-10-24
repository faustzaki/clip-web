import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, Redo2, Scissors, Undo2, User } from 'lucide-react';

const SAVE_LABEL = {
  saved: 'Tersimpan',
  saving: 'Menyimpan…',
  error: 'Gagal menyimpan',
};

export default function EditorHeader({
  title = '',
  onTitle,
  canUndo = false,
  canRedo = false,
  saveState = 'saved',
  onSave,
  onUndo,
  onRedo,
  onBackToProjects,
  onOpenPostQueue,
}) {
  const [draft, setDraft] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => setDraft(title), [title]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const dirty = draft.trim() !== title.trim();
  const commit = () => {
    if (dirty) onTitle?.(draft.trim());
  };

  return (
    <header data-region="header" className="h-header shrink-0 border-b border-vz-border bg-vz-surface px-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="w-8 h-8 rounded-vz-lg bg-vz-accent text-white flex items-center justify-center">
          <Scissors className="w-[18px] h-[18px]" />
        </span>
        <span className="font-semibold text-ui text-vz-strong">clip-web</span>
      </div>

      <div className="relative flex items-center gap-1 min-w-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu project"
          aria-expanded={menuOpen}
          className="p-2 rounded-vz-lg text-vz-dim hover:bg-vz-muted hover:text-vz-soft transition-colors"
          title="Menu project"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setDraft(title);
          }}
          aria-label="Judul project"
          className="min-w-0 w-[240px] bg-transparent text-base font-medium text-vz-strong rounded-vz-md px-2 py-1 focus:outline-none focus:bg-vz-muted"
        />

        {menuOpen && (
          <div className="absolute top-[52px] left-1/2 -translate-x-1/2 w-56 rounded-vz-xl border border-vz-border bg-vz-surface shadow-vz-lg overflow-hidden z-50">
            <button
              type="button"
              disabled={!dirty}
              onClick={() => {
                setMenuOpen(false);
                commit();
              }}
              className="w-full text-left px-4 py-2.5 text-ui font-medium text-vz-soft hover:bg-vz-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Simpan judul
            </button>
            {onBackToProjects && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onBackToProjects();
                }}
                className="w-full text-left px-4 py-2.5 text-ui font-medium text-vz-soft hover:bg-vz-muted transition-colors border-t border-vz-border"
              >
                Lihat daftar project
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Batalkan"
          title="Batalkan"
          className="p-2 rounded-vz-lg text-vz-dim hover:bg-vz-muted hover:text-vz-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Ulangi"
          title="Ulangi"
          className="p-2 rounded-vz-lg text-vz-dim hover:bg-vz-muted hover:text-vz-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <span
          className={`text-meta ${saveState === 'error' ? 'text-vz-accent' : 'text-vz-dim'}`}
          role="status"
          aria-live="polite"
        >
          {SAVE_LABEL[saveState] || SAVE_LABEL.saved}
        </span>

        <button
          type="button"
          onClick={onOpenPostQueue}
          data-testid="open-post-queue"
          title="Antrian posting"
          className="flex items-center gap-2 h-10 px-3 rounded-vz-lg text-meta font-medium text-vz-soft hover:bg-vz-muted hover:text-vz-strong transition-colors"
        >
          <CalendarClock className="w-4 h-4" />
          Posting
        </button>

        <button
          type="button"
          onClick={() => onSave?.(draft.trim())}
          disabled={!dirty || saveState === 'saving'}
          className="vz-btn vz-btn--primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Simpan
        </button>

        <span
          className="w-8 h-8 rounded-vz-pill bg-vz-tint text-vz-accent flex items-center justify-center"
          aria-label="Akun"
          title="Akun"
        >
          <User className="w-4 h-4" />
        </span>
      </div>
    </header>
  );
}
