import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { mockBridge } from './mockBridge.js';

export const bridge = window.deskHealth || mockBridge;

const EngineContext = createContext(null);

export function EngineProvider({ children }) {
  const [status, setStatus] = useState({ state: 'Starting' });
  const [settings, setSettings] = useState(null);
  const [frame, setFrame] = useState(null);
  const [toast, setToast] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [call, setCall] = useState(null);
  const sessionStart = useRef(Date.now());

  useEffect(() => {
    const offs = [
      bridge.onStatus((s) => {
        setStatus((prev) => {
          if (prev.state === 'Paused' && s.state !== 'Paused') sessionStart.current = Date.now();
          return s;
        });
      }),
      bridge.onFrame((jpeg) => setFrame(jpeg)),
      bridge.onAlert((a) => setToast({ ...a, at: Date.now() })),
      bridge.onFatal((m) => setFatal(m)),
      bridge.onCall((c) => setCall(c)),
      bridge.onReady((m) => m?.settings && setSettings(m.settings)),
    ];
    const load = () => bridge.getSettings().then(setSettings).catch(() => setTimeout(load, 1000));
    load();
    return () => offs.forEach((off) => off && off());
  }, []);

  const value = {
    status, settings, setSettings, frame, setFrame, toast, setToast, fatal, call,
    sessionStart, bridge,
  };
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export const useEngine = () => useContext(EngineContext);

// Re-fetch the SQLite statistics every `ms` milliseconds
export function useStats(ms = 15000) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => bridge.getPostureStats('weekly').then((s) => alive && setStats(s)).catch(() => {});
    load();
    const iv = setInterval(load, ms);
    return () => { alive = false; clearInterval(iv); };
  }, [ms]);
  return stats;
}
