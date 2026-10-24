import React, { useEffect, useState } from 'react';
import { Captions, Film, Loader2, Languages, Plus, RefreshCw, X } from 'lucide-react';
import { applyTighten, fetchBrollIndex, refreshBrollIndex, translateClip } from '../api';
import SubtitlePreview from './SubtitlePreview';

const TOOL_LABELS = { subtitles: 'Subtitles', audio: 'Audio', broll: 'B-roll', text: 'Text' };
const SAMPLE_WORDS = ['CONTOH', 'TEKS', 'CAPTION'];

const seconds = (ms) => (Math.max(0, Number(ms) || 0) / 1000).toFixed(1).replace('.', ',');
const brollDuration = (ms) => (ms > 0 ? `${seconds(ms)} detik` : 'gambar');

/**
 * Panel kolom kanan 320px untuk tool aktif di ToolRail.
 * T5: tool `Subtitles` = pemotong jeda/kata pengisi + 5 preset caption per project.
 * T10: tool `B-roll` = index folder lokal + saran tag + sisipkan di playhead.
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
  clips,
  selectedClip,
  playheadMs = 0,
  onInsertBroll,
}) {
  const [cutSilence, setCutSilence] = useState(true);
  const [silenceMs, setSilenceMs] = useState(400);
  const [cutFiller, setCutFiller] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [trResult, setTrResult] = useState(null);

  // T10: index b-roll lokal + saran tag
  const [broll, setBroll] = useState(null);
  const [brollBusy, setBrollBusy] = useState(false);
  const [brollResult, setBrollResult] = useState(null);
  const candidateIndex = selectedClip?.candidate_index ?? 0;
  const isBroll = tool === 'broll';

  const loadBroll = React.useCallback(async (refresh = false) => {
    setBrollBusy(true);
    try {
      const data = refresh
        ? await refreshBrollIndex(projectId, candidateIndex)
        : await fetchBrollIndex(projectId, candidateIndex);
      setBroll(data);
      setBrollResult(null);
    } catch (err) {
      setBrollResult({ error: err?.message || 'Gagal memuat index b-roll', hint: '' });
    } finally {
      setBrollBusy(false);
    }
  }, [projectId, candidateIndex]);

  useEffect(() => {
    if (isBroll) loadBroll(false);
  }, [isBroll, loadBroll]);

  const brollItems = broll?.items || [];
  const suggestions = broll?.suggestions || [];
  const suggestedPaths = new Set(suggestions.map((s) => s.path));
  // 5 kandidat saran dulu, sisanya menyusul — satu grid 2 kolom
  const brollGrid = [...suggestions, ...brollItems.filter((it) => !suggestedPaths.has(it.path))];

  const presets = options?.caption_presets || [];
  const activePreset = prefs?.caption_preset || null;
  const hasWords = (transcript?.words || []).some((w) => !w.deleted);
  const canApply = hasWords && !applying && (cutSilence || cutFiller);

  // T9: terjemahan subtitle
  const translateOpts = options?.translate || {};
  const trLangs = translateOpts.langs || [];
  const targetLang = prefs?.subtitle_lang || '';
  const dualLang = Boolean(prefs?.subtitle_dual);
  const clipForTranslate = selectedClip || (clips || [])[0] || null;
  const routerOk = translateOpts.ok !== false;
  const canTranslate = Boolean(clipForTranslate) && Boolean(targetLang) && routerOk && !translating;

  const chooseLang = (code) => {
    savePrefs({ ...(prefs || {}), subtitle_lang: code, ...(code ? {} : { subtitle_dual: false }) });
    setTrResult(null);
  };

  const runTranslate = async () => {
    if (!clipForTranslate || !targetLang) return;
    setTranslating(true);
    setTrResult(null);
    try {
      const res = await translateClip(clipForTranslate.slug, targetLang);
      if (res?.ok === false) {
        setTrResult({ error: res.reason || 'Terjemahan gagal', hint: res.hint || '' });
      } else {
        setTrResult({
          count: (res.lines || []).length,
          flagged: (res.flagged || []).length,
          cached: Boolean(res.cached),
        });
      }
    } catch (err) {
      setTrResult({ error: err?.message || 'Terjemahan gagal', hint: '' });
    } finally {
      setTranslating(false);
    }
  };

  /** Sisipkan b-roll di posisi playhead (T10) lewat timeline project. */
  const insertBroll = async (item) => {
    const res = await onInsertBroll?.(item, playheadMs);
    setBrollResult(res === false
      ? { error: 'Timeline belum siap. Muat ulang project lalu coba lagi.', hint: '' }
      : { inserted: item.name, at: playheadMs });
  };

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
          {isBroll ? (
            <Film className="w-4 h-4 text-vz-accent" />
          ) : (
            <Captions className="w-4 h-4 text-vz-accent" />
          )}
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

      {tool !== 'subtitles' && !isBroll ? (
        <p className="px-4 py-6 text-xs text-[var(--vz-text-muted)]">
          Panel {TOOL_LABELS[tool] || tool} belum tersedia.
        </p>
      ) : isBroll ? (
        <div className="flex flex-col gap-5 p-4" data-region="broll-panel">
          <p className="text-[10px] text-[var(--vz-text-faint)]">
            Disisipkan di posisi playhead ({seconds(playheadMs)} detik), durasi 2,5 detik.
          </p>

          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold text-[var(--vz-text)] uppercase tracking-wider">
              B-roll ({broll?.count ?? 0})
            </h3>
            <button
              type="button"
              data-testid="t10-refresh"
              onClick={() => loadBroll(true)}
              disabled={brollBusy}
              title="Pindai ulang folder data/broll"
              className="inline-flex items-center gap-1 h-8 px-2 rounded-vz-lg border border-[var(--vz-border)] text-[11px] font-medium text-[var(--vz-text)] hover:border-[var(--vz-border-strong)] disabled:opacity-40 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Muat ulang index
            </button>
          </div>

          {brollBusy && !broll && (
            <p role="status" className="flex items-center gap-2 text-[11px] text-[var(--vz-text-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memindai folder b-roll…
            </p>
          )}

          {broll?.count === 0 && (
            <p role="status" data-testid="t10-empty" className="text-[11px] text-[var(--vz-text-muted)]">
              {broll.hint || 'Folder b-roll masih kosong. Taruh video di data/broll.'}
            </p>
          )}

          {brollGrid.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {brollGrid.map((it, i) => {
                const suggested = suggestedPaths.has(it.path);
                return (
                  <button
                    key={it.path}
                    type="button"
                    data-testid={`t10-insert-${i}`}
                    data-broll-name={it.name}
                    title={`Sisipkan ${it.name}`}
                    onClick={() => insertBroll(it)}
                    className="flex flex-col text-left bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] rounded-vz-xl overflow-hidden hover:border-[var(--vz-accent)] transition-colors"
                  >
                    <span className="block aspect-video bg-[var(--vz-overlay)] overflow-hidden">
                      {it.thumb ? (
                        <img
                          src={`/broll/${it.thumb}`}
                          alt={`Pratinjau ${it.name}`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="flex flex-col gap-1 p-2">
                      <span className="text-[11px] font-medium text-[var(--vz-text)] truncate">{it.name}</span>
                      <span className="text-[10px] text-[var(--vz-text-faint)]">{brollDuration(it.dur_ms)}</span>
                      {(it.tags || []).length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {(it.tags || []).slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded-vz-sm bg-[var(--vz-accent-tint)] text-[var(--vz-accent)] text-[10px]"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                      {suggested && (
                        <span className="text-[10px] text-[var(--vz-accent)]">
                          Saran
                          {(it.matched_tags || []).length > 0
                            ? ` · cocok: ${(it.matched_tags || []).join(', ')}`
                            : ''}
                        </span>
                      )}
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--vz-accent)]">
                        <Plus className="w-3.5 h-3.5" /> Sisipkan
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {broll?.count > 0 && suggestions.length === 0 && (
            <p className="text-[10px] text-[var(--vz-text-faint)]">
              Belum ada kata kunci yang cocok dengan tag b-roll. Semua file tetap bisa disisipkan.
            </p>
          )}

          {brollResult?.error && (
            <p role="status" data-testid="t10-error" className="text-[11px] text-[var(--vz-danger-fg)]">
              {brollResult.error}
              {brollResult.hint ? ` — ${brollResult.hint}` : ''}
            </p>
          )}

          {brollResult?.inserted && (
            <p role="status" data-testid="t10-inserted" className="text-[11px] text-[var(--vz-success-fg)]">
              {brollResult.inserted} disisipkan di {seconds(brollResult.at)} detik.
            </p>
          )}

          <p className="text-[10px] text-[var(--vz-text-faint)]">
            Tag dari nama file dan data/broll/tags.json. Geser atau hapus item di track Teks timeline.
          </p>
        </div>
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

          {/* T9: terjemahan subtitle */}
          <section className="space-y-3" data-region="translate-panel">
            <h3 className="text-[11px] font-bold text-[var(--vz-text)] uppercase tracking-wider flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-vz-accent" />
              Terjemahan subtitle
            </h3>

            <div className="space-y-1.5">
              <label htmlFor="t9-lang" className="text-[11px] text-[var(--vz-text-muted)]">
                Bahasa target
              </label>
              <select
                id="t9-lang"
                data-testid="t9-lang"
                value={targetLang}
                onChange={(e) => chooseLang(e.target.value)}
                className="w-full h-9 px-2 rounded-vz-lg border border-[var(--vz-border)] bg-vz-surface text-xs text-[var(--vz-text)] focus:outline-none focus:ring-1 focus:ring-[var(--vz-accent-ring)]"
              >
                <option value="">Tanpa terjemahan</option>
                {trLangs.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] p-3 rounded-vz-xl">
              <span className="min-w-0">
                <span className="text-xs font-medium text-[var(--vz-text)] block">Dua bahasa</span>
                <span className="text-[10px] text-[var(--vz-text-faint)] block">
                  Baris 2 = terjemahan, 80% ukuran baris utama
                </span>
              </span>
              <input
                type="checkbox"
                data-testid="t9-dual"
                checked={dualLang}
                disabled={!targetLang}
                onChange={() => savePrefs({ ...(prefs || {}), subtitle_dual: !dualLang })}
                className="accent-[var(--vz-accent)] w-4 h-4 rounded cursor-pointer shrink-0 disabled:cursor-not-allowed"
              />
            </label>

            {clipForTranslate && (
              <p className="text-[10px] text-[var(--vz-text-faint)]">
                Klip: {clipForTranslate.name || `${clipForTranslate.slug}.mp4`}
              </p>
            )}

            {!routerOk && (
              <p role="status" data-testid="t9-router-down" className="text-[11px] text-[var(--vz-danger-fg)]">
                {translateOpts.reason || '9Router tidak merespons'}
                {translateOpts.hint ? ` — ${translateOpts.hint}` : ''}
              </p>
            )}

            {!clipForTranslate && (
              <p className="text-[11px] text-[var(--vz-text-muted)]">
                Belum ada klip. Render klip dulu supaya captionnya bisa diterjemahkan.
              </p>
            )}

            <button
              type="button"
              data-testid="t9-translate"
              onClick={runTranslate}
              disabled={!canTranslate}
              className="vz-btn vz-btn--primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {translating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menerjemahkan…
                </>
              ) : (
                'Terjemahkan klip'
              )}
            </button>

            {!targetLang && (
              <p className="text-[10px] text-[var(--vz-text-faint)]">Pilih bahasa target dulu.</p>
            )}

            {trResult?.error && (
              <p role="status" className="text-[11px] text-[var(--vz-danger-fg)]">
                {trResult.error}
                {trResult.hint ? ` — ${trResult.hint}` : ''}
              </p>
            )}

            {trResult && !trResult.error && (
              <p role="status" data-testid="t9-translate-result" className="text-[11px] text-[var(--vz-success-fg)]">
                {trResult.count} baris siap · {trResult.cached ? 'dari cache' : 'baru diterjemahkan'}
                {trResult.flagged > 0 ? ` · ${trResult.flagged} baris masih panjang (ditandai)` : ''}
              </p>
            )}

            {translateOpts.model && (
              <p className="text-[10px] text-[var(--vz-text-faint)]">Model: {translateOpts.model}</p>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
