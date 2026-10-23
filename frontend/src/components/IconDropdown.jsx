import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

/**
 * Icon-only trigger button + popover panel.
 * items: [{ id, label, icon, active }]
 * Trigger shows the active item's icon when exactly one item is active,
 * otherwise the `icon` fallback (or `activeIcon` when explicitly given).
 */
export default function IconDropdown({ icon: Icon, activeIcon, title, items = [], onSelect, align = 'left', closeOnSelect = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const activeItems = items.filter((it) => it.active);
  const TriggerIcon = activeIcon || (activeItems.length === 1 ? activeItems[0].icon : null) || Icon;

  const handleSelect = (id) => {
    onSelect?.(id);
    if (closeOnSelect) setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-1.5 rounded-xl border shadow-md transition-all ${
          open
            ? 'bg-dark-card border-neon text-neon'
            : 'bg-dark-card border-dark-border text-gray-300 hover:text-white hover:border-neon'
        }`}
      >
        {TriggerIcon && <TriggerIcon className="w-4 h-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 mt-2 min-w-[168px] py-1 bg-dark-surface border border-dark-border rounded-xl shadow-2xl overflow-hidden ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((it) => {
            const ItemIcon = it.icon;
            return (
              <button
                key={it.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={Boolean(it.active)}
                onClick={() => handleSelect(it.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-colors hover:bg-dark-card ${
                  it.active ? 'text-neon' : 'text-gray-300 hover:text-white'
                }`}
              >
                {ItemIcon && <ItemIcon className="w-4 h-4 shrink-0" />}
                <span className="flex-1 text-left">{it.label}</span>
                {it.active && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
