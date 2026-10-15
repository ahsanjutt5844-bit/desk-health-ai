/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (RGB triplets) defined in src/index.css so the
// whole UI can switch between the light (default) and dark themes.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: v('ink-950'), 900: v('ink-900'), 850: v('ink-850'), 800: v('ink-800'), 700: v('ink-700'), 600: v('ink-600'), 500: v('ink-500') },
        mute: { 400: v('mute-400'), 300: v('mute-300'), 200: v('mute-200') },
        head: v('head'),
        good: v('good'),
        bad: v('bad'),
        warn: v('warn'),
        info: v('info'),
        scrim: v('scrim'),
      },
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.06), 0 4px 16px rgb(var(--shadow) / 0.05)',
      },
    },
  },
  plugins: [],
};
