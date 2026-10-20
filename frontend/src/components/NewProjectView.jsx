import React, { useState } from 'react';
import { ArrowLeft, Video, Upload, Loader2, Sparkles } from 'lucide-react';
import { createProject, ingestUrl, uploadVideoFile, deleteProject } from '../api';

export default function NewProjectView({ options, onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('youtube');
  const [ytUrl, setYtUrl] = useState('');
  const [file, setFile] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [draftPid, setDraftPid] = useState(null);

  const handleSubmit = async () => {
    if (sourceType === 'youtube' && !ytUrl.trim()) { setError('Masukkan URL YouTube'); return; }
    if (sourceType === 'upload' && !file) { setError('Pilih file video MP4/MOV/MKV'); return; }
    setError(null);
    setIsWorking(true);
    try {
      let pid = draftPid;
      if (!pid) {
        const r = await createProject(title.trim() || null);
        pid = r.project.id;
        setDraftPid(pid);
      }
      setStatusMessage('Menyiapkan project...');
      if (sourceType === 'youtube') await ingestUrl(pid, ytUrl.trim(), 'base');
      else await uploadVideoFile(pid, file, 'base');
      onCreated(pid);
    } catch (e) {
      setError(e.message);
      setIsWorking(false);
      setStatusMessage('');
    }
  };

  const handleCancel = async () => {
    if (draftPid) await deleteProject(draftPid).catch(() => {});
    onCancel();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">
      <button onClick={handleCancel} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span>Projects</span>
      </button>

      <div>
        <h1 className="text-xl md:text-2xl font-extrabold text-white">Project Baru</h1>
        <p className="text-xs text-gray-400 mt-1">
          Tempel link YouTube atau upload video. Video disiapkan dulu, clipping dilakukan di Studio.
        </p>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-gray-400">Nama Project (opsional)</label>
        <input
          type="text"
          placeholder="Otomatis dari judul video"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isWorking}
          className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-neon transition-colors"
        />
      </div>

      {/* Source Type Toggle */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-dark-bg rounded-xl border border-dark-border">
        <button
          onClick={() => setSourceType('youtube')}
          disabled={isWorking}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
            sourceType === 'youtube'
              ? 'bg-red-500/10 text-red-400 border border-red-500/30 font-bold'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-red-500" />
          <span>YouTube Link</span>
        </button>
        <button
          onClick={() => setSourceType('upload')}
          disabled={isWorking}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
            sourceType === 'upload'
              ? 'bg-neon/10 text-neon border border-neon/30 font-bold'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Upload className="w-3.5 h-3.5 text-neon" />
          <span>Upload Video</span>
        </button>
      </div>

      {/* URL or File Input */}
      {sourceType === 'youtube' ? (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-400">URL Video YouTube</label>
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=..."
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            disabled={isWorking}
            className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-neon transition-colors"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-gray-400">File Video Lokal</label>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-dark-border hover:border-neon/50 bg-dark-bg/60 rounded-xl p-4 cursor-pointer transition-all">
            <Upload className="w-6 h-6 text-gray-400 mb-1" />
            <span className="text-xs font-medium text-gray-300">
              {file ? file.name : 'Pilih MP4, MOV, atau MKV'}
            </span>
            <span className="text-[10px] text-gray-500 mt-1">Maksimal 2GB</span>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files[0])}
              disabled={isWorking}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-950/40 border border-red-500/40 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isWorking}
        className="w-full py-3.5 px-4 rounded-xl bg-neon hover:bg-neon-400 text-dark-bg font-extrabold text-sm tracking-wide shadow-[0_0_20px_rgba(187,244,81,0.25)] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isWorking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-dark-bg" />
            <span>{statusMessage || 'Memproses...'}</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-dark-bg" />
            <span>BUAT PROJECT</span>
          </>
        )}
      </button>
    </div>
  );
}
