import React from 'react';
import { Scissors, Film, RefreshCw, Settings } from 'lucide-react';
import GlitchHorseIcon from './GlitchHorseIcon';

export default function Navbar({ projectId, projectTitle, activeTab, setActiveTab, onBackToProjects, onReset, isResetting, onOpenSettings }) {
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
            <span className="hidden md:block text-xs text-gray-400 max-w-[220px] truncate">▸ {projectTitle}</span>
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
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'library'
                ? 'bg-gradient-to-r from-[#c11e38] to-[#220b34] text-white shadow-sm font-bold'
                : 'text-gray-300 hover:text-white hover:bg-dark-surface'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Galeri Klip</span>
          </button>
        </div>
      )}

      {/* Right System Diagnostics & Actions */}
      {/* Right Actions & Global Settings */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          title="Pengaturan Global"
          className="p-2 text-gray-300 hover:text-white hover:bg-dark-card rounded-xl border border-transparent hover:border-dark-border transition-all flex items-center gap-1.5 text-xs font-semibold"
        >
          <Settings className="w-4 h-4 text-neon" />
          <span className="hidden sm:inline">Pengaturan</span>
        </button>

        {/* Reset Workspace Button — only when inside a project */}
        {projectId && (
          <button
            onClick={onReset}
            disabled={isResetting}
            title="Reset Workspace & Cache"
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-card rounded-lg border border-transparent hover:border-dark-border transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin text-red-400' : ''}`} />
          </button>
        )}
      </div>
    </header>
  );
}
