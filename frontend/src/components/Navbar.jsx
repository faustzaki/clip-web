import React from 'react';
import { Scissors, Film, RefreshCw, Cpu, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

export default function Navbar({ projectId, projectTitle, activeTab, setActiveTab, health, onBackToProjects, onReset, isResetting }) {
  const ninerouterOk = health?.ninerouter;
  const ffmpegOk = health?.ffmpeg;
  const yunetOk = health?.yunet;

  return (
    <header className="h-16 border-b border-dark-border bg-dark-surface/90 backdrop-blur sticky top-0 z-40 px-4 md:px-6 flex items-center justify-between">
      {/* Brand Logo & Name — clickable back to Projects */}
      <button type="button" onClick={onBackToProjects} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <div className="w-9 h-9 rounded-xl bg-neon text-dark-bg font-extrabold flex items-center justify-center text-xl shadow-[0_0_15px_rgba(187,244,81,0.35)]">
          ツ
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-tight text-white text-base md:text-lg">
              AUTOCLIP <span className="text-neon">STUDIO</span>
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-dark-card border border-dark-border text-neon">
              SCL-VSL CORE
            </span>
          </div>
          <p className="text-[11px] text-gray-400 hidden sm:block text-left">
            AI Vertical Video Clipper • Local 9Router Engine
          </p>
        </div>
        {projectTitle && (
          <span className="hidden md:block text-xs text-gray-400 max-w-[220px] truncate">▸ {projectTitle}</span>
        )}
      </button>

      {/* Center Navigation Tabs — only when inside a project */}
      {projectId && (
        <div className="flex items-center bg-dark-bg p-1 rounded-xl border border-dark-border">
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'studio'
                ? 'bg-neon text-dark-bg shadow-sm font-bold'
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
                ? 'bg-neon text-dark-bg shadow-sm font-bold'
                : 'text-gray-300 hover:text-white hover:bg-dark-surface'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Galeri Klip</span>
          </button>
        </div>
      )}

      {/* Right System Diagnostics & Actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* 9Router Status */}
        <div
          title={ninerouterOk ? "9Router Terhubung (127.0.0.1:20128)" : "9Router Tidak Terdeteksi"}
          className={`hidden md:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${
            ninerouterOk
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
              : 'bg-amber-950/40 border-amber-500/40 text-amber-400'
          }`}
        >
          <Cpu className="w-3 h-3" />
          <span className="font-medium">9Router</span>
          <span className={`w-1.5 h-1.5 rounded-full ${ninerouterOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        </div>

        {/* FFmpeg & YuNet Indicators */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            {ffmpegOk ? <CheckCircle2 className="w-3 h-3 text-neon" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
            FFmpeg
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            {yunetOk ? <CheckCircle2 className="w-3 h-3 text-neon" /> : <AlertCircle className="w-3 h-3 text-red-400" />}
            YuNet ONNX
          </span>
        </div>

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
