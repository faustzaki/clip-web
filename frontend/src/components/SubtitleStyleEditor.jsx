import React from 'react';

const DEFAULT_FONTS = [
  "Arial Black", "Arial", "Impact", "Verdana", "Tahoma",
  "Trebuchet MS", "Georgia", "Courier New", "Segoe UI", "Calibri"
];

const DEFAULT_POSITIONS = [
  { id: "top", label: "Atas" },
  { id: "middle", label: "Tengah" },
  { id: "bottom", label: "Bawah" }
];

export default function SubtitleStyleEditor({ value, onChange, fonts, positions }) {
  const current = value || {};
  const fontList = fonts && fonts.length > 0 ? fonts : DEFAULT_FONTS;
  const positionList = positions && positions.length > 0 ? positions : DEFAULT_POSITIONS;

  const update = (patch) => {
    onChange?.({ ...current, ...patch });
  };

  return (
    <div className="flex flex-col gap-3 text-xs text-[var(--vz-text)]">
      {/* Font & Size */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block mb-1 text-[11px] font-medium text-[var(--vz-text-muted)]">Font</label>
          <select
            value={current.font || 'Arial Black'}
            onChange={(e) => update({ font: e.target.value })}
            className="w-full bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--vz-text)] focus:outline-none focus:border-[var(--vz-accent)]"
          >
            {fontList.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--vz-text-muted)]">
            <span>Ukuran</span>
            <span className="text-[var(--vz-accent)] font-mono">{current.font_size ?? 43}px</span>
          </div>
          <input
            type="range"
            min="24"
            max="180"
            value={current.font_size ?? 43}
            onChange={(e) => update({ font_size: Number(e.target.value) })}
            className="w-full accent-[var(--vz-accent)] cursor-pointer"
          />
        </div>
      </div>

      {/* Position Pills */}
      <div>
        <label className="block mb-1.5 text-[11px] font-medium text-[var(--vz-text-muted)]">Posisi</label>
        <div className="grid grid-cols-3 gap-1.5">
          {positionList.map((p) => {
            const active = (current.position || 'bottom') === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ position: p.id })}
                className={`py-1 rounded-md text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[var(--vz-accent)] hover:bg-[var(--vz-accent-hover)] text-white shadow-sm'
                    : 'bg-[var(--vz-surface)] border border-[var(--vz-border)] text-[var(--vz-text-muted)] hover:text-[var(--vz-text)]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Margin V */}
      <div>
        <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--vz-text-muted)]">
          <span>Jarak dari Tepi</span>
          <span className="text-[var(--vz-accent)] font-mono">{current.margin_v ?? 300}px</span>
        </div>
        <input
          type="range"
          min="0"
          max="900"
          value={current.margin_v ?? 300}
          onChange={(e) => update({ margin_v: Number(e.target.value) })}
          className="w-full accent-[var(--vz-accent)] cursor-pointer"
        />
      </div>

      {/* Rotation Angle */}
      <div>
        <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--vz-text-muted)]">
          <span>Sudut Rotasi (Angle)</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--vz-accent)] font-mono">{current.angle ?? 0}°</span>
            {Number(current.angle ?? 0) !== 0 && (
              <button
                type="button"
                onClick={() => update({ angle: 0 })}
                className="text-[10px] text-[var(--vz-text-muted)] hover:text-[var(--vz-text)] px-1.5 py-0.5 rounded bg-[var(--vz-surface)] border border-[var(--vz-border)]"
                title="Reset ke 0°"
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <input
          type="range"
          min="-180"
          max="180"
          value={current.angle ?? 0}
          onChange={(e) => update({ angle: Number(e.target.value) })}
          className="w-full accent-[var(--vz-accent)] cursor-pointer"
        />
      </div>

      {/* Colors */}
      <div>
        <label className="block mb-1.5 text-[11px] font-medium text-[var(--vz-text-muted)]">Warna</label>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col items-center gap-1 p-1.5 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-lg cursor-pointer hover:border-[var(--vz-border-strong)]">
            <span className="text-[10px] text-[var(--vz-text-muted)]">Teks</span>
            <input
              type="color"
              value={current.primary_color || '#FFFFFF'}
              onChange={(e) => update({ primary_color: e.target.value })}
              className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex flex-col items-center gap-1 p-1.5 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-lg cursor-pointer hover:border-[var(--vz-border-strong)]">
            <span className="text-[10px] text-[var(--vz-text-muted)]">Highlight</span>
            <input
              type="color"
              value={current.highlight_color || '#FFE100'}
              onChange={(e) => update({ highlight_color: e.target.value })}
              className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer"
            />
          </label>
          <label className="flex flex-col items-center gap-1 p-1.5 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-lg cursor-pointer hover:border-[var(--vz-border-strong)]">
            <span className="text-[10px] text-[var(--vz-text-muted)]">Outline</span>
            <input
              type="color"
              value={current.outline_color || '#000000'}
              onChange={(e) => update({ outline_color: e.target.value })}
              className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Outline width & Shadow */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--vz-text-muted)]">
            <span>Tebal Outline</span>
            <span className="text-[var(--vz-accent)] font-mono">{current.outline_width ?? 5}</span>
          </div>
          <input
            type="range"
            min="0"
            max="20"
            value={current.outline_width ?? 5}
            onChange={(e) => update({ outline_width: Number(e.target.value) })}
            className="w-full accent-[var(--vz-accent)] cursor-pointer"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--vz-text-muted)]">
            <span>Bayangan</span>
            <span className="text-[var(--vz-accent)] font-mono">{current.shadow ?? 2}</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            value={current.shadow ?? 2}
            onChange={(e) => update({ shadow: Number(e.target.value) })}
            className="w-full accent-[var(--vz-accent)] cursor-pointer"
          />
        </div>
      </div>

      {/* Words per line */}
      <div>
        <div className="flex justify-between items-center mb-1 text-[11px] text-[var(--vz-text-muted)]">
          <span>Kata per Baris</span>
          <span className="text-[var(--vz-accent)] font-mono">{current.words_per_line ?? 3}</span>
        </div>
        <input
          type="range"
          min="1"
          max="8"
          value={current.words_per_line ?? 3}
          onChange={(e) => update({ words_per_line: Number(e.target.value) })}
          className="w-full accent-[var(--vz-accent)] cursor-pointer"
        />
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-4 pt-1 border-t border-[var(--vz-border-strong)]">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={current.bold !== false}
            onChange={(e) => update({ bold: e.target.checked })}
            className="accent-[var(--vz-accent)] w-3.5 h-3.5 rounded"
          />
          <span className="text-[11px] text-[var(--vz-text)]">Tebal (Bold)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={current.uppercase !== false}
            onChange={(e) => update({ uppercase: e.target.checked })}
            className="accent-[var(--vz-accent)] w-3.5 h-3.5 rounded"
          />
          <span className="text-[11px] text-[var(--vz-text)]">HURUF BESAR</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(current.box)}
            onChange={(e) => update({ box: e.target.checked })}
            className="accent-[var(--vz-accent)] w-3.5 h-3.5 rounded"
          />
          <span className="text-[11px] text-[var(--vz-text)]">Kotak Latar</span>
        </label>
      </div>

      {/* Box Color (if box enabled) */}
      {current.box && (
        <div className="flex items-center justify-between p-2 bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-lg">
          <span className="text-[11px] text-[var(--vz-text-muted)]">Warna Kotak Latar</span>
          <input
            type="color"
            value={current.box_color || '#000000'}
            onChange={(e) => update({ box_color: e.target.value })}
            className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}
