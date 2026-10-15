import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Light is the default; the choice is remembered on this computer.
const KEY = 'deskhealth-theme';

function readSaved() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
applyTheme(readSaved()); // before the first paint, avoids a flash of the wrong theme

// Colour of a CSS token as an rgb()/rgba() string, for SVG/Recharts props.
export function tokenColor(name, alpha = 1) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const [r, g, b] = raw.split(/\s+/).map(Number);
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readSaved);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
  }, [theme]);
  // `c` is recreated per theme so charts re-render with the new colours
  const value = useMemo(() => ({ theme, setTheme: setThemeState, c: (n, a) => tokenColor(n, a) }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
