import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

const TONE_CLASSES = {
  warn: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
  error: 'border-red-500/40 bg-red-950/40 text-red-300',
  info: 'border-dark-border bg-dark-bg/80 text-gray-300',
};

export default function NoticeBar({
  tone = 'warn',
  message,
  actionLabel,
  onAction,
  busy,
  onDismiss,
}) {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.warn;

  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${toneClass}`}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1 leading-relaxed break-words">{message}</div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          className="shrink-0 px-2 py-1 rounded-lg bg-dark-card border border-dark-border font-bold hover:border-neon hover:text-neon transition-all disabled:opacity-50"
        >
          {busy ? 'Memproses...' : actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-1 text-gray-400 hover:text-white transition-colors"
          title="Tutup"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
