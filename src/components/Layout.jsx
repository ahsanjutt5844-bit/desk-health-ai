import React, { useEffect, useState } from 'react';
import { useEngine } from '../lib/engine.jsx';
import { useAuth } from './Auth.jsx';
import { STATE_STYLE, clock } from '../lib/format.js';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '▣' },
  { id: 'analytics', label: 'Analytics', icon: '◈' },
  { id: 'alerts', label: 'Alerts', icon: '◎' },
  { id: 'settings', label: 'Settings', icon: '◉' },
];

export function Sidebar({ page, setPage }) {
  const { status, bridge } = useEngine();
  const auth = useAuth();
  const st = STATE_STYLE[status.state] || STATE_STYLE.Starting;
  const tracking = !['Paused', 'NoCamera', 'Starting'].includes(status.state);
  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-ink-700 bg-ink-900">
      <div className="px-6 pb-5 pt-7">
        <div className="whitespace-nowrap font-display text-[19px] font-extrabold tracking-tight">
          <span className="text-good">Desk</span><span className="text-head">Health</span>
          <span className="ml-1 font-sans text-base font-medium text-mute-400">AI</span>
        </div>
        <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-mute-400">Posture & eye strain monitor</div>
      </div>
      <div className="px-4">
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${tracking ? 'border-good/40 bg-good/10 text-good' : 'border-ink-600 bg-ink-800 text-mute-300'}`}>
          <span className={`h-2 w-2 rounded-full ${tracking ? 'bg-good pulse-dot' : st.bg}`} />
          {tracking ? 'Tracking Active' : st.label}
        </div>
      </div>
      <nav className="mt-6 flex-1 px-3">
        <div className="label mb-2 px-3">Menu</div>
        {NAV.map((n) => {
          const active = page === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`relative mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition ${active ? 'bg-good/10 font-semibold text-good' : 'text-mute-300 hover:bg-ink-800'}`}
            >
              {active && <span className="absolute -left-3 top-2 h-7 w-1 rounded-full bg-good" />}
              <span className="w-4 text-center text-xs opacity-80">{n.icon}</span>
              {n.label}
            </button>
          );
        })}
      </nav>
      <div className="flex items-end justify-between gap-2 border-t border-ink-700 px-6 py-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-mute-200" title="Signed-in profile">👤 {auth?.status?.profile_name || 'Main User'}</div>
          <button className="mt-0.5 text-xs font-semibold text-mute-400 hover:text-good" onClick={() => auth?.lock()} title="Lock the dashboard; tracking continues">🔒 Lock</button>
          <div className="mt-1 text-sm font-semibold text-mute-200">UCP — S26CS034</div>
          <div className="mt-0.5 font-mono text-[10px] text-mute-400">v0.6.1 · BSCS FYP{bridge.isMock ? ' · demo data' : ''}</div>
        </div>
        <button
          className="rounded-lg px-2 py-1 text-xs font-semibold text-mute-400 transition hover:bg-bad/10 hover:text-bad"
          title="Stop tracking and close DeskHealth AI completely"
          onClick={() => bridge.quit()}
        >
          ⏻ Quit
        </button>
      </div>
    </aside>
  );
}

export function TopBar({ title }) {
  const { status, bridge, sessionStart } = useEngine();
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const paused = status.state === 'Paused';
  const score = status.posture?.posture_score;
  const scoreTone = score == null ? 'text-mute-400' : score >= 70 ? 'text-good' : score >= 45 ? 'text-warn' : 'text-bad';
  const dist = status.distance_cm;
  const session = paused ? 0 : (Date.now() - sessionStart.current) / 1000;
  return (
    <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-ink-700 bg-ink-900/80 px-8 backdrop-blur">
      <h1 className="font-display text-[22px] font-extrabold text-head">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-6 rounded-xl border border-ink-700 bg-ink-850 px-5 py-2">
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-mute-400' : 'bg-bad pulse-dot'}`} />
          <Chip label="Posture" value={score != null ? `${score}%` : '—'} tone={scoreTone} />
          <Chip label="Eye dist" value={dist ? `${Math.round(dist)}cm` : '—'} tone={status.too_close ? 'text-bad' : 'text-good'} />
          <Chip label="Session" value={clock(session)} tone="text-info" />
        </div>
        <button className="btn" onClick={() => (paused ? bridge.resume() : bridge.pause('user'))}>
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
      </div>
    </header>
  );
}

function Chip({ label, value, tone }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-mute-400">{label}</div>
      <div className={`font-mono text-[15px] font-bold ${tone}`}>{value}</div>
    </div>
  );
}
