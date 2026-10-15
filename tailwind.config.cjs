/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#070b10', 900: '#0b1016', 850: '#0e141b', 800: '#111922', 700: '#18222d', 600: '#223040', 500: '#2e3d4e' },
        mute: { 400: '#7d8a99', 300: '#9aa6b4', 200: '#c3ccd6' },
        good: '#12e2a3',
        bad: '#ff3d5e',
        warn: '#ffb020',
        info: '#4f9dff',
      },
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
