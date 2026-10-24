/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vz: {
          bg: '#F2F4F7', bgAlt: '#EEF0F4', surface: '#FFFFFF', muted: '#F8F9FB',
          text: '#2E3038', strong: '#141C29', soft: '#3C4659', dim: '#5C667E'   /* 4.43 -> 5.7 di atas #FFF/#F2F4F7 (WCAG AA) */,
          accent: '#4822A5', accentHover: '#3A1A87', accentSoft: '#8061DF', tint: '#E8DEFF',
          border: '#E3E6EC', borderStrong: '#D3D8E1',
        },
      },
      borderRadius: { vz: { xs: '4px', sm: '6px', md: '8px', lg: '10px', xl: '12px', '2xl': '16px' } },
      spacing: { vz1: '4px', vz2: '8px', vz3: '12px', vz4: '16px', vz5: '20px', vz6: '24px', vz8: '32px' },
      fontFamily: { sans: ['Inter', 'Noto Sans', 'system-ui', 'sans-serif'] },
      fontSize: {
        meta: ['12px', '16px'], ui: ['13px', '18px'], base: ['14px', '20px'],
        body: ['16px', '24px'], h: ['20px', '28px'], display: ['32px', '40px'],
      },
      height: { header: '56px', btn: '40px' },
      width: { sidebar: '232px' },
      maxWidth: { content: '1280px' },
      boxShadow: {
        'vz-sm': '0 0 1px rgba(0,0,0,.25), 0 1px 2px rgba(10,13,18,.05)',
        'vz-md': '0 6px 10px rgba(21,40,68,.08)',
        'vz-lg': '0 0 1px rgba(0,0,0,.25), 0 16px 16px rgba(18,27,57,.13), 0 4px 16px rgba(17,27,62,.35)',
      },
    },
  },
  plugins: [],
}
