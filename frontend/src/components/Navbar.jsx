import React, { useEffect, useRef, useState } from 'react';
import { Scissors, Film, Settings, Menu, X, Layers } from 'lucide-react';
import GlitchHorseIcon from './GlitchHorseIcon';

export default function Navbar({ projectId, projectTitle, activeTab, setActiveTab, onBackToProjects, onOpenSettings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="h-header shrink-0 border-b border-vz-border bg-vz-surface sticky top-0 z-40 px-5 flex items-center justify-between">
      {/* Brand Logo & Name — clickable back to Projects */}
      <button type="button" onClick={onBackToProjects} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <GlitchHorseIcon className="w-8 h-8 rounded-vz-lg shrink-0" />
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight text-vz-strong text-base md:text-ui">
            clip<span className="text-vz-accent">-web</span>
          </span>
          {projectTitle && (
            <span className="hidden md:block text-meta text-vz-dim whitespace-normal">▸ {projectTitle}</span>
          )}
        </div>
      </button>

      {/* Center Navigation Tabs — only when inside a project */}
      {projectId && (
        <div className="flex items-center bg-vz-muted p-1 rounded-vz-lg border border-vz-border">
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-vz-md text-meta font-medium transition-colors ${
              activeTab === 'studio'
                ? 'bg-vz-accent text-white font-semibold'
                : 'text-vz-soft hover:text-vz-strong hover:bg-vz-surface'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Studio Clipper</span>
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-vz-md text-meta font-medium transition-colors ${
              activeTab === 'gallery'
                ? 'bg-vz-accent text-white font-semibold'
                : 'text-vz-soft hover:text-vz-strong hover:bg-vz-surface'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Galeri Klip</span>
          </button>
        </div>
      )}

      {/* Right Actions: Hamburger Menu (Settings lives inside it) */}
      <div className="flex items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={menuOpen}
            className="p-2 text-vz-soft hover:text-vz-accent hover:bg-vz-muted rounded-vz-lg border border-transparent transition-colors"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-vz-xl border border-vz-border bg-vz-surface shadow-vz-lg overflow-hidden z-50">
              {projectId && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onBackToProjects(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-meta font-medium text-vz-soft hover:bg-vz-muted hover:text-vz-accent transition-colors"
                >
                  <Layers className="w-4 h-4" />
                  <span>Lihat Project</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onOpenSettings(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-meta font-medium text-vz-soft hover:bg-vz-muted hover:text-vz-accent transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Pengaturan</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
