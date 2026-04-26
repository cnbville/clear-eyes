/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      },
      colors: {
        iron: {
          950: '#050507',
          900: '#09090b',
          800: '#131316',
          700: '#1c1c21',
          600: '#27272a',
          500: '#3f3f46',
        },
        gold: {
          DEFAULT: '#c9a227',
          light: '#e3c65c',
          dark: '#9a7b1a',
          dim: 'rgba(201,162,39,0.12)',
        },
        mint: '#4ade80',
        coral: '#f87171',
        sky: '#60a5fa',
      },
    },
  },
  plugins: [],
}
