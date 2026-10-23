import React from 'react';
import { Captions, Film, Music, Type } from 'lucide-react';

const TOOLS = [
  { id: 'subtitles', label: 'Subtitles', Icon: Captions },
  { id: 'audio', label: 'Audio', Icon: Music },
  { id: 'broll', label: 'B-roll', Icon: Film },
  { id: 'text', label: 'Text', Icon: Type },
];

export default function ToolRail({ active, onSelect }) {
  return (
    <nav
      aria-label="Tool editor"
      className="w-[72px] shrink-0 h-full border-l border-vz-border bg-vz-surface flex flex-col items-center gap-1 py-3"
    >
      {TOOLS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(isActive ? null : id)}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            className={`w-14 h-14 flex flex-col items-center justify-center gap-1 rounded-vz-lg transition-colors ${
              isActive ? 'bg-vz-tint text-vz-accent' : 'text-vz-dim hover:bg-vz-muted hover:text-vz-soft'
            }`}
          >
            <Icon className="w-[22px] h-[22px]" />
            <span className="text-[11px] leading-none font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
