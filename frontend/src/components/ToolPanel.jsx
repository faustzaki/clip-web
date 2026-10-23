import React, { useState } from 'react';
import { Captions, Loader2, X } from 'lucide-react';
import { applyTighten } from '../api';
import SubtitlePreview from './SubtitlePreview';

const TOOL_LABELS = { subtitles: 'Subtitles', audio: 'Audio', broll: 'B-roll', text: 'Text' };
const SAMPLE_WORDS = ['CONTOH', 'TEKS', 'CAPTION'];

const seconds = (ms) => (Math.max(0, Number(ms) || 0) / 1000).toFixed(1).replace('.', ',');

/**
 * Panel kolom kanan 320px untuk tool aktif di ToolRail.
 * T5: tool `Subtitles` = pemotong jeda/kata pengisi + 5 preset caption per project.
 */
export default function ToolPanel({
  tool,
  onClose,
  projectId,
  options,
  prefs,
  savePrefs,
  transcript,
  loadTranscript,
}) {
  const [cutSilence, setCutSilence] = useState(true);
  const [silenceMs, setSilenceMs] = useState(400);
  const [cutFiller, setCutFiller] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  const presets = options?.caption_presets || [];
  const activePreset = prefs?.caption_preset || null;
  const hasWords = (transcript?.words || []).some((w) => !w.deleted);
  const canApply = hasWords && !applying && (cutSilence || cutFiller);

  const choosePreset = (preset) => {
    savePrefs({
      ...(prefs || {}),
      subtitles_enabled: true,
      caption_preset: preset.id,
      subtitle_style: { ...preset.style },
    });
    setResult(null);
  };

  const runTighten = async () => {
    setApplying(true);
    setResult(null);
    try {
      const res = await applyTighten(projectId, { silence_ms: silenceMs, filler: cutFiller });
      if (res?.ok === false) {
        setResult({ error: res.reason || 'Belum bisa dijalankan', hint: res.hint || '' });
      } else {
        setResult({ saved: res?.saved_ms || 0, deleted: res?.deleted || 0 });
        await loadTranscript?.();
      }
    } catch (err) {
      setResult({ error: err?.message || 'Gagal menerapkan pemotongan jeda', hint: '' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <aside
      data-region="tool-panel"
      aria-label={`Panel ${TOOL_LABELS[tool] || tool}`}
      className="hidden lg:flex w-[320px] shrink-0 flex-col h-full border-l border-vz-border bg-vz-surface overflow-y-auto"
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-vz-border sticky top-0 bg-vz-surface z-10">
        <span className="flex items-center gap-2 text-xs font-bold text-vz-strong uppercase tracking-wide">
          <Captions className="w-4 h-4 text-vz-accent" />
          {TOOL_LABELS[tool] || tool}
        </span>
        <button
          type="button"
          onClick={() => onClose?.()}
          aria-label="Tutup panel"
          className="w-7 h-7 flex items-center justify-center rounded-vz-md text-[var(--vz-text-muted)] hover:bg-[var(--vz-surface-muted)] hover:text-[var(--vz-text-strong)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {tool !== 'subtitles' ? (
        <p className="px-4 py-6 text-xs text-[var(--vz-text-muted)]">
          Panel {TOOL_LABELS[tool] || tool} belum tersedia.
        </p>
      ) : (
        <div className="flex flex-col gap-5 p-4">
          {/* Jeda sunyi + kata pengisi */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold text-[var(--vz-text)] uppercase tracking-wider">
              Jeda & kata pengisi
            </h3>

            <label className="flex items-center justify-between gap-3 cursor-pointer bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-3 rounded-vz-xl">
              <span className="min-w-0">
                <span className="text-xs font-medium text-[var(--vz-text)] block">Hapus jeda</span>
                <span className="text-[10px] text-[var(--vz-text-faint)] block">
                  Sunyi lebih lama dari batas dipotong
                </span>
              </span>
              <input
                type="checkbox"
                data-testid="t5-cut-silence"
                checked={cutSilence}
                onChange={(e) => setCutSilence(e.target.checked)}
                className="accent-[var(--vz-accent)] w-4 h-4 rounded cursor-pointer shrink-0"
              />
            </label>

            <div className={cutSilence ? 'space-y-1.5' : 'space-y-1.5 opacity-45'}>
              <div className="flex items-center justify-between text-[11px] text-[var(--vz-text-muted)]">
                <label htmlFor="t5-silence-ms">Durasi sunyi</label>
                <span className="font-mono font-semibold text-[var(--vz-accent)]">{silenceMs} ms</span>
              </div>
              <input
                id="t5-silence-ms"
                type="range"
                data-testid="t5-silence-slider"
                min={200}
                max={1200}
                step={50}
                value={silenceMs}
                disabled={!cutSilence}
                onChange={(e) => setSilenceMs(Number(e.target.value))}
                className="w-full accent-[var(--vz-accent)] h-1.5 bg-[var(--vz-border)] rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
              />
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-3 rounded-vz-xl">
              <span className="min-w-0">
                <span className="text-xs font-medium text-[var(--vz-text)] block">Hapus kata pengisi</span>
                <span className="text-[10px] text-[var(--vz-text-faint)] block">
                  “eee” · “apa ya” · “gitu” · “anu”
                </span>
              </span>
              <input
                type="checkbox"
                data-testid="t5-cut-filler"
                checked={cutFiller}
                onChange={(e) => setCutFiller(e.target.checked)}
                className="accent-[var(--vz-accent)] w-4 h-4 rounded cursor-pointer shrink-0"
              />
            </label>

            <button
              type="button"
              data-testid="t5-apply"
              onClick={runTighten}
              disabled={!canApply}
              className="vz-btn vz-btn--primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Memproses…
                </>
              ) : (
                'Terapkan'
              )}
            </button>

            {!hasWords && (
              <p className="text-[11px] text-[var(--vz-text-muted)]">
                Transkrip belum siap. Jalankan analisis dulu supaya jeda dan kata pengisi bisa dipotong.
              </p>
            )}

            {result?.error && (
              <p role="status" className="text-[11px] text-[var(--vz-danger-fg)]">
                {result.error}
                {result.hint ? ` — ${result.hint}` : ''}
              </p>
            )}

            {result && !result.error && (
              <p role="status" data-testid="t5-tighten-result" className="text-[11px] text-[var(--vz-success-fg)]">
                Menghemat {seconds(result.saved)} detik · {result.deleted} kata dihapus
              </p>
            )}
          </section>

          {/* 5 preset caption */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold text-[var(--vz-text)] uppercase tracking-wider">
              Preset caption
            </h3>

            {presets.length === 0 ? (
              <p className="text-[11px] text-[var(--vz-text-muted)]">
                Preset caption belum tersedia dari server.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => {
                  const isActive = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`t5-preset-${preset.id}`}
                      aria-pressed={isActive}
                      title={preset.id}
                      onClick={() => choosePreset(preset)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-vz-xl border transition-colors ${
                        isActive
                          ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] ring-1 ring-[var(--vz-accent-ring)]'
                          : 'bg-[var(--vz-surface-muted)] border-[var(--vz-border)] hover:border-[var(--vz-border-strong)]'
                      }`}
                    >
                      <span className="w-full flex justify-center bg-[var(--vz-overlay)] rounded-vz-lg p-1 overflow-hidden">
                        <SubtitlePreview style={preset.style} height={130} words={SAMPLE_WORDS} fontScale={6} />
                      </span>
                      <span
                        className={`text-[11px] font-semibold text-center leading-tight ${
                          isActive ? 'text-[var(--vz-accent)]' : 'text-[var(--vz-text)]'
                        }`}
                      >
                        {preset.label || preset.id}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {activePreset && (
              <p className="text-[10px] text-[var(--vz-text-faint)]">
                Tersimpan untuk project ini dan dipakai saat export.
              </p>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
