import React from 'react';

export default function SubtitlePreview({ style, height = 260, words }) {
  if (!style) return null;
  const sampleWords = Array.isArray(words) && words.length > 0 ? words : "CONTOH TEKS SUBTITLE KARAOKE".split(' ');
  const px = (v) => Math.max(2, Math.round((Number(v) || 0) * height / 1920));
  const align = style.position === 'top' ? 'flex-start' : style.position === 'middle' ? 'center' : 'flex-end';
  const width = Math.round(height * 9 / 16);

  return (
    <div
      style={{
        height,
        width,
        alignItems: align,
        paddingTop: style.position === 'top' ? px(style.margin_v ?? 300) : 0,
        paddingBottom: style.position === 'bottom' ? px(style.margin_v ?? 300) : 0,
      }}
      className="bg-black rounded-xl border border-dark-border flex justify-center overflow-hidden shrink-0 mx-auto select-none"
    >
      <div
        style={{
          fontFamily: style.font || 'Arial Black',
          fontSize: px(style.font_size || 96),
          fontWeight: style.bold ? 900 : 400,
          color: style.primary_color || '#FFFFFF',
          WebkitTextStroke: `${px(style.outline_width ?? 5)}px ${style.outline_color || '#000000'}`,
          paintOrder: 'stroke fill',
          textShadow: `0 ${px(style.shadow ?? 2)}px ${px((style.shadow ?? 2) * 2)}px ${style.outline_color || '#000000'}`,
          background: style.box ? (style.box_color || '#000000') : 'transparent',
          padding: style.box ? `${px(6)}px ${px(12)}px` : 0,
          borderRadius: style.box ? px(8) : 0,
          textTransform: style.uppercase ? 'uppercase' : 'none',
          lineHeight: 1.15,
          textAlign: 'center',
          transform: style.angle ? `rotate(${style.angle}deg)` : undefined,
          transformOrigin: 'center center',
        }}
        className="max-w-[92%]"
      >
        {sampleWords.map((w, i) => (
          <span
            key={i}
            style={{
              color: i === 1 ? (style.highlight_color || '#FFE100') : (style.primary_color || '#FFFFFF'),
              marginRight: px(12),
            }}
          >
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}
