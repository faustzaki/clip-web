import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, X } from 'lucide-react';
import { getExport, startExport } from '../api';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 5 * 60 * 1000;

const clipSeconds = (clip) => {
  const meta = clip?.meta || {};
  if (typeof clip?.duration === 'number') return clip.duration;
  if (typeof meta.duration === 'number') return meta.duration;
  if (typeof meta.start === 'number' && typeof meta.end === 'number') return meta.end - meta.start;
  return 30;
};

// 1080p ≈ 6 Mbps, 720p ≈ 3 Mbps; fps 24 & caption sedikit menggeser angka
const sizeEstimate = (resolution, fps, burnCaption, seconds) => {
  const mbps = resolution === '720p' ? 3 : 6;
  const mb = (mbps * (Number(fps) === 24 ? 0.9 : 1) * (burnCaption ? 1.05 : 1) * seconds) / 8;
  return `≈ ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
};

const segCls = (active) =>
  `h-10 flex-1 rounded-vz-lg border text-ui font-medium transition-colors disabled:opacity-50 ${
    active
      ? 'border-vz-accent bg-vz-tint text-vz-accent'
      : 'border-vz-border bg-vz-surface text-vz-soft hover:border-vz-border-strong'
  }`;

export default function ExportModal({ open, clip, onClose, onStart }) {
  const [phase, setPhase] = useState('form'); // form | submitting | running | done | failed
  const [form, setForm] = useState({ name: '', resolution: '1080p', fps: 30, burnCaption: true });
  const [jobId, setJobId] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const nameRef = useRef(null);

  const slug = clip?.slug || null;

  // Reset tiap klip baru dibuka + fokus ke field pertama
  useEffect(() => {
    if (!open || !slug) return;
    setPhase('form');
    setForm({ name: clip?.title || clip?.meta?.title || slug, resolution: '1080p', fps: 30, burnCaption: true });
    setJobId(null);
    setResult(null);
    setProgress(0);
    setError(null);
    nameRef.current?.focus();
  }, [open, slug]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Polling tiap 2s, berhenti saat done/failed, batas 5 menit
  useEffect(() => {
    if (!open || phase !== 'running' || !jobId) return;
    const deadline = Date.now() + POLL_LIMIT_MS;
    let stopped = false;
    const tick = async () => {
      try {
        const data = await getExport(jobId);
        if (stopped) return;
        setProgress(Number(data.progress) || 0);
        if (data.status === 'done') {
          stopped = true;
          setResult(data);
          setPhase('done');
        } else if (data.status === 'failed') {
          stopped = true;
          setError(data.error || 'Export gagal');
          setPhase('failed');
        } else if (Date.now() > deadline) {
          stopped = true;
          setError('Terlalu lama, coba lagi');
          setPhase('failed');
        }
      } catch (err) {
        if (stopped) return;
        stopped = true;
        setError(err.message || 'Gagal memeriksa status export');
        setPhase('failed');
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [open, phase, jobId]);

  if (!open || !clip) return null;

  const busy = phase === 'submitting' || phase === 'running';
  const fileName = `${(form.name || slug).trim() || slug}.mp4`;

  const handleStart = async () => {
    setPhase('submitting');
    setError(null);
    setProgress(0);
    try {
      const data = await startExport(slug, {
        resolution: form.resolution,
        fps: Number(form.fps),
        burn_caption: form.burnCaption,
        name: form.name.trim() || slug,
      });
      setJobId(data.job_id);
      setPhase('running');
      onStart?.(data);
    } catch (err) {
      setError(err.message || 'Gagal memulai export');
      setPhase('failed');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--vz-overlay)] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        data-region="export-modal"
        className="w-[480px] max-w-full rounded-vz-xl border border-vz-border bg-vz-surface shadow-vz-lg flex flex-col"
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-vz-border">
          <div className="min-w-0">
            <h2 id="export-modal-title" className="text-base font-semibold text-vz-strong">
              Export klip
            </h2>
            <p className="text-meta text-vz-dim truncate">{clip.title || clip.meta?.title || clip.slug}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            title="Tutup"
            className="p-2 rounded-vz-sm text-vz-dim hover:text-vz-strong hover:bg-vz-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-4">
          {busy || phase === 'form' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-name" className="text-meta font-medium text-vz-soft">
                  Nama file
                </label>
                <input
                  id="export-name"
                  ref={nameRef}
                  type="text"
                  className="vz-input w-full"
                  value={form.name}
                  disabled={busy}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-vz-soft">Resolusi</span>
                <div className="flex gap-2">
                  {['1080p', '720p'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={busy}
                      aria-pressed={form.resolution === r}
                      onClick={() => setForm((f) => ({ ...f, resolution: r }))}
                      className={segCls(form.resolution === r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-vz-soft">FPS</span>
                <div className="flex gap-2">
                  {[30, 24].map((f) => (
                    <button
                      key={f}
                      type="button"
                      disabled={busy}
                      aria-pressed={form.fps === f}
                      onClick={() => setForm((prev) => ({ ...prev, fps: f }))}
                      className={segCls(form.fps === f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 h-10 text-ui text-vz-soft">
                <input
                  type="checkbox"
                  checked={form.burnCaption}
                  disabled={busy}
                  onChange={(e) => setForm((f) => ({ ...f, burnCaption: e.target.checked }))}
                  className="w-4 h-4 accent-[var(--vz-accent)]"
                />
                Bakar caption
              </label>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="export-format" className="text-meta font-medium text-vz-soft">
                  Format
                </label>
                <select id="export-format" className="vz-input w-full" defaultValue="mp4" disabled>
                  <option value="mp4">mp4</option>
                </select>
              </div>

              <p className="text-meta text-vz-dim">
                Perkiraan ukuran: {sizeEstimate(form.resolution, form.fps, form.burnCaption, clipSeconds(clip))}
              </p>
            </>
          ) : null}

          {phase === 'running' ? (
            <div className="flex flex-col gap-2">
              <div className="h-1.5 rounded-vz-pill bg-vz-muted overflow-hidden">
                <div
                  className="h-full rounded-vz-pill bg-vz-accent transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-meta text-vz-dim">Menyiapkan klip… {progress}%</p>
            </div>
          ) : null}

          {phase === 'done' ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-ui text-vz-soft">Klip siap. Unduh</p>
              <p className="text-meta text-vz-dim truncate">{fileName}</p>
            </div>
          ) : null}

          {phase === 'failed' ? (
            <div className="flex items-start gap-2.5 rounded-vz-lg border border-[var(--vz-danger-fg)] bg-[var(--vz-danger-bg)] px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--vz-danger-fg)]" />
              <div className="text-meta text-[var(--vz-danger-fg)] min-w-0">
                <p className="font-semibold">Export gagal</p>
                <p className="mt-0.5 break-words">{error}</p>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 px-5 py-4 border-t border-vz-border">
          <button type="button" className="vz-btn vz-btn--secondary" onClick={onClose} disabled={phase === 'submitting'}>
            {phase === 'form' || phase === 'submitting' ? 'Batal' : 'Tutup'}
          </button>

          {phase === 'form' || phase === 'submitting' ? (
            <button type="button" className="vz-btn vz-btn--primary" onClick={handleStart} disabled={phase === 'submitting'}>
              {phase === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memulai…
                </>
              ) : (
                'Export'
              )}
            </button>
          ) : null}

          {phase === 'running' ? (
            <button type="button" className="vz-btn vz-btn--primary" disabled>
              <Loader2 className="w-4 h-4 animate-spin" />
              Mengekspor…
            </button>
          ) : null}

          {phase === 'done' ? (
            <a href={result?.path} download={fileName} className="vz-btn vz-btn--primary">
              <Download className="w-4 h-4" />
              Unduh
            </a>
          ) : null}

          {phase === 'failed' ? (
            <button type="button" className="vz-btn vz-btn--primary" onClick={handleStart}>
              Coba lagi
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
