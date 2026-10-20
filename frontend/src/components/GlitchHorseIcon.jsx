import React from 'react';

export default function GlitchHorseIcon({ className = 'w-9 h-9' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 45 45"
      className={className}
      aria-label="clip-web glitch horse logo"
    >
      <rect width="45" height="45" rx="10" fill="#15151b" />
      <defs>
        <clipPath id="gh-slice1">
          <rect x="0" y="0" width="45" height="15" />
        </clipPath>
        <clipPath id="gh-slice2">
          <rect x="0" y="15" width="45" height="12" />
        </clipPath>
        <clipPath id="gh-slice3">
          <rect x="0" y="27" width="45" height="18" />
        </clipPath>
      </defs>

      {/* Cyan Glitch Shift (Left) */}
      <g fill="#00f0ff" opacity="0.85" transform="translate(-1.8, 0.4)">
        <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18 Z" />
        <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10 Z" />
      </g>

      {/* Crimson Glitch Shift (Right) */}
      <g fill="#c11e38" opacity="0.95" transform="translate(1.8, -0.4)">
        <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18 Z" />
        <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10 Z" />
      </g>

      {/* Main White Body */}
      <g fill="#f3f4f6">
        {/* Top slice */}
        <g clipPath="url(#gh-slice1)">
          <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18 Z" />
          <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10 Z" />
        </g>
        {/* Middle slice (shifted +1.5px) */}
        <g clipPath="url(#gh-slice2)" transform="translate(1.5, 0)">
          <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18 Z" />
          <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10 Z" />
          <circle cx="15" cy="13" r="1.5" fill="#15151b" />
        </g>
        {/* Bottom slice (shifted -1px) */}
        <g clipPath="url(#gh-slice3)" transform="translate(-1, 0)">
          <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18 Z" />
          <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10 Z" />
        </g>
      </g>

      {/* Cyber digital glitch slices */}
      <rect x="3" y="14.5" width="10" height="1.5" fill="#00f0ff" opacity="0.9" />
      <rect x="23" y="26.5" width="10" height="1.5" fill="#c11e38" opacity="0.9" />
      <rect x="30" y="8" width="4" height="1" fill="#ffffff" opacity="0.8" />
      <rect x="8" y="32" width="6" height="1" fill="#00f0ff" opacity="0.7" />
      <line x1="0" y1="15" x2="45" y2="15" stroke="#15151b" strokeWidth="0.8" />
      <line x1="0" y1="27" x2="45" y2="27" stroke="#15151b" strokeWidth="0.8" />
    </svg>
  );
}
