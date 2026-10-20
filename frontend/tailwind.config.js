/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0d0d11',
          surface: '#15151b',
          card: '#1b1b23',
          border: '#2a2a36',
          hover: '#262632'
        },
        neon: {
          300: '#ff5c77',
          400: '#ec3253',
          DEFAULT: '#c11e38',
          500: '#c11e38',
          600: '#9b142a',
          dark: '#220b34'
        },
        cyber: {
          DEFAULT: '#c11e38',
          400: '#ec3253'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
