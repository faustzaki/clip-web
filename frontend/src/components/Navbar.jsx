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
    <header className="h-16 border-b border-dark-border bg-dark-surface/90 backdrop-blur sticky top-0 z-40 px-4 md:px-6 flex items-center justify-between">
      {/* Brand Logo & Name — clickable back to Projects */}
      <button type="button" onClick={onBackToProjects} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <GlitchHorseIcon className="w-9 h-9 rounded-xl shadow-[0_0_15px_rgba(193,30,56,0.35)] shrink-0" />
        <div className="flex items-center gap-2">
          <span className="font-extrabold tracking-tight text-white text-base md:text-lg">
            clip<span className="text-neon">-web</span>
          </span>
          {projectTitle && (
            <span className="hidden md:block text-xs text-gray-300 whitespace-normal">▸ {projectTitle}</span>
          )}
        </div>
      </button>

      {/* Center Navigation Tabs — only when inside a project */}
      {projectId && (
        <div className="flex items-center bg-dark-bg p-1 rounded-xl border border-dark-border">
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'studio'
                ? 'bg-gradient-to-r from-[#c11e38] to-[#220b34] text-white shadow-sm font-bold'
                : 'text-gray-300 hover:text-white hover:bg-dark-surface'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Studio Clipper</span>
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'gallery'
                ? 'bg-gradient-to-r from-[#c11e38] to-[#220b34] text-white shadow-sm font-bold'
                : 'text-gray-300 hover:text-white hover:bg-dark-surface'
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
            className="p-2 text-gray-300 hover:text-white hover:bg-dark-card rounded-xl border border-transparent hover:border-dark-border transition-all"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-dark-border bg-dark-surface shadow-2xl overflow-hidden z-50">
              {projectId && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onBackToProjects(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-200 hover:bg-dark-card hover:text-neon transition-colors"
                >
                  <Layers className="w-4 h-4" />
                  <span>Lihat Project</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onOpenSettings(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-200 hover:bg-dark-card hover:text-neon transition-colors"
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
