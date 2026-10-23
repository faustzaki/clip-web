import React, { useState } from 'react';
import { ArrowLeft, Video, Upload, Loader2, Sparkles, Gauge, MonitorPlay, Crown } from 'lucide-react';
import { createProject, ingestUrl, uploadVideoFile, deleteProject } from '../api';

const QUALITY_OPTIONS = [
  { id: 'proxy', label: 'Hemat', hint: '360p · ±63 MB · paling cepat', Icon: Gauge },
  { id: 'hd', label: 'HD', hint: '1080p · ±509 MB · direkomendasikan', Icon: MonitorPlay },
  { id: 'best', label: 'Terbaik', hint: '4K · ±1.2 GB · perlu waktu & kuota besar', Icon: Crown },
];

export default function NewProjectView({ options, onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('youtube');
  const [ytUrl, setYtUrl] = useState('');
  const [file, setFile] = useState(null);
  const [downloadQuality, setDownloadQuality] = useState('proxy');
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
      if (sourceType === 'youtube') await ingestUrl(pid, ytUrl.trim(), 'base', null, downloadQuality);
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
      <button onClick={handleCancel} className="flex items-center gap-2 text-xs text-[var(--vz-text-muted)] hover:text-[var(--vz-text)] transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span>Projects</span>
      </button>

      <div>
        <h1 className="text-xl md:text-2xl font-extrabold text-[var(--vz-text-strong)]">Project Baru</h1>
        <p className="text-xs text-[var(--vz-text-muted)] mt-1">
          Tempel link YouTube atau upload video. Video disiapkan dulu, clipping dilakukan di Studio.
        </p>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-[var(--vz-text-muted)]">Nama Project (opsional)</label>
        <input
          type="text"
          placeholder="Otomatis dari judul video"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isWorking}
          className="w-full bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl px-3 py-2 text-xs text-[var(--vz-text)] placeholder-[var(--vz-text-faint)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
        />
      </div>

      {/* Source Type Toggle */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--vz-surface)] rounded-xl border border-[var(--vz-border)]">
        <button
          onClick={() => setSourceType('youtube')}
          disabled={isWorking}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
            sourceType === 'youtube'
              ? 'bg-[var(--vz-accent-tint)] text-[var(--vz-accent)] border border-[var(--vz-accent)] font-bold'
              : 'text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-[var(--vz-accent)]" />
          <span>YouTube Link</span>
        </button>
        <button
          onClick={() => setSourceType('upload')}
          disabled={isWorking}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
            sourceType === 'upload'
              ? 'bg-[var(--vz-accent-tint)] text-[var(--vz-accent)] border border-[var(--vz-accent)] font-bold'
              : 'text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
          }`}
        >
          <Upload className="w-3.5 h-3.5 text-[var(--vz-accent)]" />
          <span>Upload Video</span>
        </button>
      </div>

      {/* URL or File Input */}
      {sourceType === 'youtube' ? (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--vz-text-muted)]">URL Video YouTube</label>
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=..."
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            disabled={isWorking}
            className="w-full bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl px-3 py-2 text-xs text-[var(--vz-text)] placeholder-[var(--vz-text-faint)] focus:outline-none focus:border-[var(--vz-accent)] transition-colors"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--vz-text-muted)]">File Video Lokal</label>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--vz-border)] hover:border-[var(--vz-accent)] bg-[var(--vz-surface)] rounded-xl p-4 cursor-pointer transition-all">
            <Upload className="w-6 h-6 text-[var(--vz-text-muted)] mb-1" />
            <span className="text-xs font-medium text-[var(--vz-text)]">
              {file ? file.name : 'Pilih MP4, MOV, atau MKV'}
            </span>
            <span className="text-[10px] text-[var(--vz-text-faint)] mt-1">Maksimal 2GB</span>
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

      {/* Download Quality */}
      {sourceType === 'youtube' ? (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--vz-text-muted)]">Kualitas Download</label>
          <div className="grid grid-cols-3 gap-1.5">
            {QUALITY_OPTIONS.map((q) => {
              const active = downloadQuality === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => setDownloadQuality(q.id)}
                  disabled={isWorking}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-[var(--vz-accent-tint)] text-[var(--vz-accent)] border-[var(--vz-accent)] font-bold'
                      : 'bg-[var(--vz-surface)] border-[var(--vz-border)] text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
                  }`}
                >
                  <q.Icon className={`w-4 h-4 ${active ? 'text-[var(--vz-accent)]' : 'text-[var(--vz-text-muted)]'}`} />
                  <span className="text-xs">{q.label}</span>
                  <span className={`text-[9px] font-medium text-center leading-tight ${active ? 'text-[var(--vz-accent)]' : 'text-[var(--vz-text-muted)]'}`}>
                    {q.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-[var(--vz-text-faint)]">Kualitas download hanya berlaku untuk link YouTube.</p>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-[var(--vz-danger-fg)] bg-[var(--vz-danger-bg)] border border-[var(--vz-danger-fg)] rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isWorking}
        className="w-full py-3.5 px-4 rounded-xl bg-[var(--vz-accent)] hover:bg-[var(--vz-accent-hover)] text-white font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isWorking ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span>{statusMessage || 'Memproses...'}</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-white" />
            <span>BUAT PROJECT</span>
          </>
        )}
      </button>
    </div>
  );
}
