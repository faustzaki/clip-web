import React, { useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flame,
  Layers,
  PanelBottom,
  PanelRight,
  Pencil,
} from 'lucide-react';

  const mmss = (s) => {
    const sec = Math.max(0, Number(s) || 0);
    const m = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

/**
 * Daftar klip/kandidat studio dalam dua varian tata letak (tetap satu komponen agar isi kartu identik):
 * `variant="right"` kolom kanan, `variant="bottom"` filmstrip horizontal di bawah stage.
 */
export default function ClipsPanel({
  variant,
  pipelinePos,
  setPipelinePos,
  rightW,
  rightCollapsed,
  setRightCollapsed,
  bottomH,
  bottomCollapsed,
  setBottomCollapsed,
  startRightDrag,
  startBottomDrag,
  projectId,
  candidates,
  clips,
  activeCandidateIdx,
  setActiveCandidateIdx,
  setEditMode,
  jumpToCandidate,
}) {
  const bottomScrollRef = useRef(null);

  useEffect(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pipelinePos, bottomCollapsed]);

  const orderedCandidates = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.start || 0) - (b.c.start || 0));

  // Render individual candidate card: ONLY thumbnail, minute range, and title
  const renderCard = ({ c, i, isHorizontal = false }) => {
    const isActive = activeCandidateIdx === i;
    const existingClip = clips.find((cl) => cl.candidate_index === i);
    const thumbSrc = existingClip?.poster_url || `/api/projects/${projectId}/thumb/${i}`;

    if (isHorizontal) {
      // Horizontal Filmstrip Card: Thumbnail, mm:ss, and title only
      return (
        <div
          key={i}
          onClick={() => jumpToCandidate(i)}
          className={`p-2 rounded-xl border cursor-pointer relative flex flex-row items-center gap-2.5 shrink-0 w-[240px] h-full transition-colors ${
            isActive
              ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] ring-1 ring-[var(--vz-accent-ring)]'
              : 'bg-[var(--vz-surface)] border-[var(--vz-border)] hover:border-[var(--vz-border-strong)]'
          }`}
        >
          {/* Thumbnail Left */}
          <div className="relative w-24 h-full rounded-lg overflow-hidden bg-black border border-[var(--vz-border)] shrink-0">
            <img
              src={thumbSrc}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
          </div>

          {/* Details Right: Klip #N, Range, Title */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-0.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-[var(--vz-text-muted)]">
              <span className="font-bold text-[var(--vz-text-strong)]">#{i + 1}</span>
              <span className="text-[var(--vz-accent)] font-semibold">{mmss(c.start)}–{mmss(c.end)}</span>
            </div>
            <p className="text-xs font-bold text-[var(--vz-text)] line-clamp-2 leading-tight">
              {c.hook || `Klip #${i + 1}`}
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveCandidateIdx(i);
              setEditMode(true);
            }}
            title="Edit Clip"
            aria-label="Edit Clip"
            className="absolute top-1 right-1 z-10 p-1 rounded-lg bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text)] hover:text-[var(--vz-accent)] hover:border-[var(--vz-accent)] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    // Vertical Column Card: Thumbnail, mm:ss, and title only
    return (
      <div
        key={i}
        onClick={() => jumpToCandidate(i)}
        className={`p-2.5 rounded-xl border cursor-pointer relative flex flex-col gap-2 shrink-0 transition-colors ${
          isActive
            ? 'bg-[var(--vz-accent-tint)] border-[var(--vz-accent)] ring-1 ring-[var(--vz-accent-ring)]'
            : 'bg-[var(--vz-surface)] border-[var(--vz-border)] hover:border-[var(--vz-border-strong)]'
        }`}
      >
        {/* Thumbnail Image */}
        <div className="relative w-full h-28 rounded-lg overflow-hidden bg-black border border-[var(--vz-border)]">
          <img
            src={thumbSrc}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        </div>

        {/* Range and Title */}
        <div className="flex items-center justify-between text-xs font-mono text-[var(--vz-text-muted)]">
          <span className="font-bold text-[var(--vz-text-strong)]">Klip #{i + 1}</span>
          <span className="text-[var(--vz-accent)] font-semibold">{mmss(c.start)} – {mmss(c.end)}</span>
        </div>

        <p className="text-xs font-bold text-[var(--vz-text)] line-clamp-2 leading-snug">
          {c.hook || `Klip #${i + 1}`}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveCandidateIdx(i);
            setEditMode(true);
          }}
          title="Edit Clip"
          aria-label="Edit Clip"
          className="absolute top-1 right-1 z-10 p-1 rounded-lg bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text)] hover:text-[var(--vz-accent)] hover:border-[var(--vz-accent)] transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  if (variant === 'right') {
    return (
      <>
        {/* Resizer Handle: Center to Right */}
        <div
          onPointerDown={startRightDrag}
          className="hidden lg:block w-1.5 shrink-0 rounded-full bg-[var(--vz-border)] hover:bg-[var(--vz-accent-hover)] cursor-col-resize select-none transition-colors"
          title="Tarik untuk mengubah lebar panel Clips"
        />

        <aside data-region="clips-panel"
          style={{ width: rightCollapsed ? 48 : rightW }}
          className="lg:shrink-0 min-w-0 h-full flex flex-col overflow-hidden"
        >
          {rightCollapsed ? (
            /* Collapsed Rail Right */
            <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl p-2 flex flex-col items-center gap-4 h-full shadow-lg">
              <button
                type="button"
                onClick={() => setRightCollapsed(false)}
                className="p-1.5 rounded-lg bg-[var(--vz-surface-muted)] border border-[var(--vz-border)] text-[var(--vz-text-muted)] hover:text-[var(--vz-accent)] hover:border-[var(--vz-accent)] transition-colors"
                title="Buka Clips"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Flame className="w-4 h-4 text-[var(--vz-accent)]" />
              <div className="text-xs font-bold text-[var(--vz-text-muted)] uppercase tracking-widest [writing-mode:vertical-rl] py-4 select-none">
                Clips
              </div>
            </div>
          ) : (
            /* Expanded Right Column Panel */
            <section className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl shadow-xl flex-1 flex flex-col h-full min-h-0 overflow-hidden p-3">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--vz-border-strong)] pb-2 mb-2 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Flame className="w-4 h-4 text-[var(--vz-accent)] shrink-0" />
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--vz-text-strong)] truncate">
                    Clips ({candidates.length})
                  </h2>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle Position Buttons */}
                  <div className="flex items-center gap-0.5 bg-[var(--vz-surface-muted)] p-0.5 rounded-lg border border-[var(--vz-border)] mr-1">
                    <button
                      type="button"
                      onClick={() => setPipelinePos('bottom')}
                      className={`p-1 rounded text-xs transition-colors ${
                        pipelinePos === 'bottom' ? 'bg-[var(--vz-accent)] text-white font-bold shadow-sm' : 'text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)]'
                      }`}
                      title="Pindah ke Panel Bawah (Filmstrip)"
                    >
                      <PanelBottom className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPipelinePos('right')}
                      className={`p-1 rounded text-xs transition-colors ${
                        pipelinePos === 'right' ? 'bg-[var(--vz-accent)] text-white font-bold shadow-sm' : 'text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)]'
                      }`}
                      title="Mode Kolom Kanan"
                    >
                      <PanelRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setRightCollapsed(true)}
                    className="p-1 rounded text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)] hover:bg-[var(--vz-surface-muted)] transition-colors"
                    title="Minimize panel"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Cards Vertical List: Thumbnail, Range, Title only */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2.5">
                {candidates.length === 0 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center text-[var(--vz-text-faint)] space-y-2">
                    <Layers className="w-8 h-8 text-[var(--vz-text-faint)]" />
                    <p className="text-xs">Belum ada klip yang terdeteksi.</p>
                  </div>
                ) : (
                  orderedCandidates.map(({ c, i }) => renderCard({ c, i, isHorizontal: false }))
                )}
              </div>
            </section>
          )}
        </aside>
      </>
    );
  }

  return (
    <>
      {/* Resizer Handle: Top to Bottom */}
      <div
        onPointerDown={startBottomDrag}
        className="h-1.5 rounded-full bg-[var(--vz-border)] hover:bg-[var(--vz-accent-hover)] cursor-row-resize select-none transition-colors shrink-0"
        title="Tarik untuk mengubah tinggi panel Clips"
      />

      {/* BOTTOM SECTION: Horizontal Filmstrip Reel */}
      <section
        style={{ height: bottomCollapsed ? 'auto' : bottomH }}
        className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-vz-xl p-2.5 shadow-xl flex flex-col min-h-0 overflow-hidden shrink-0"
      >
        {/* Section Header */}
        <div className="flex items-center justify-between border-b border-[var(--vz-border-strong)] pb-1.5 mb-1.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="w-4 h-4 text-[var(--vz-accent)] shrink-0" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--vz-text-strong)] truncate">
              Clips ({candidates.length})
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle Position Buttons */}
            <div className="flex items-center gap-0.5 bg-[var(--vz-surface-muted)] p-0.5 rounded-lg border border-[var(--vz-border)] mr-1">
              <button
                type="button"
                onClick={() => setPipelinePos('bottom')}
                className={`p-1 rounded text-xs transition-colors ${
                  pipelinePos === 'bottom' ? 'bg-[var(--vz-accent)] text-white font-bold shadow-sm' : 'text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)]'
                }`}
                title="Mode Panel Bawah (Filmstrip)"
              >
                <PanelBottom className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPipelinePos('right')}
                className={`p-1 rounded text-xs transition-colors ${
                  pipelinePos === 'right' ? 'bg-[var(--vz-accent)] text-white font-bold shadow-sm' : 'text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)]'
                }`}
                title="Pindah ke Kolom Kanan (Video Full Height)"
              >
                <PanelRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setBottomCollapsed((v) => !v)}
              className="p-1 rounded text-[var(--vz-text-muted)] hover:text-[var(--vz-text-strong)] hover:bg-[var(--vz-surface-muted)] transition-colors flex items-center gap-1 text-xs"
              title={bottomCollapsed ? 'Buka panel' : 'Minimize panel'}
            >
              {bottomCollapsed ? (
                <>
                  <span className="text-[10px] text-[var(--vz-text-muted)]">Buka Panel</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span className="text-[10px] text-[var(--vz-text-muted)]">Minimize</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Candidate Cards: Horizontal Filmstrip Reel (Thumbnail, Range, Title only) */}
        {!bottomCollapsed && (
          <div ref={bottomScrollRef} className="flex flex-row overflow-x-auto gap-2.5 flex-1 min-h-0 py-0.5 pr-1 items-stretch">
            {candidates.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center text-[var(--vz-text-faint)] py-3">
                <p className="text-xs">Belum ada klip yang terdeteksi. Klik "Temukan Momen Viral" di panel Pengaturan.</p>
              </div>
            ) : (
              orderedCandidates.map(({ c, i }) => renderCard({ c, i, isHorizontal: true }))
            )}
          </div>
        )}
      </section>
    </>
  );
}
