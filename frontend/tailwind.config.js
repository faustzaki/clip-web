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
          400: '#c5f95d',
          DEFAULT: '#bbf451',
          500: '#a3e635',
          600: '#84cc16'
        },
        cyber: {
          DEFAULT: '#facc15',
          400: '#fde047'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
