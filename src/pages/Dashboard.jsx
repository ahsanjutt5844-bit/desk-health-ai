import React from 'react';
import { useEngine, useStats } from '../lib/engine.jsx';
import { dur } from '../lib/format.js';
import { Card, StatCard } from '../components/ui.jsx';
import { SplitDonut, WeeklyBars } from '../components/Charts.jsx';
import { DistancePanel, LivePosture, TooCloseBanner } from '../components/Live.jsx';

export default function Dashboard({ onCalibrate }) {
  const stats = useStats(10000);
  const { status, call, bridge } = useEngine();
  const today = stats?.today || {};
  // live totals from the engine (fall back to the saved summary)
  const live = status.today;
  const active = live ? live.active : today.total_active_seconds || 0;
  const slouch = live ? live.slouch : today.total_slouch_seconds || 0;
  const resting = live ? live.resting : today.total_resting_seconds || 0;
  const healthy = Math.max(0, active - slouch - resting);
  return (
    <div>
      {status.state === 'Paused' && status.paused_reasons?.includes('video_call') && (
        <div className="mb-6 rounded-2xl border border-info/40 bg-info/10 px-6 py-4 text-sm text-info">
          📹 Video call detected{call?.apps?.length ? ` (${call.apps.join(', ')})` : ''} — the camera was released. Tracking resumes automatically when the call ends.
        </div>
      )}
      {status.state === 'NoCamera' && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-bad/40 bg-bad/10 px-6 py-4 text-sm text-bad">
          <span>The camera can't be opened. DeskHealth keeps retrying every 2 seconds. If it doesn't recover, close other apps using the camera or pick another camera in Settings.</span>
          <button className="btn shrink-0" onClick={() => bridge.resume()}>Retry camera</button>
        </div>
      )}
      <TooCloseBanner />
      <div className="grid grid-cols-4 gap-5">
        <StatCard icon="💚" label="Healthy time" value={dur(healthy)} tone="text-good" sub={resting ? `Resting ${dur(resting)}` : 'Total today'} />
        <StatCard icon="🔴" label="Slouch time" value={dur(slouch)} tone="text-bad" sub="Total today (all slouching added up)" />
        <StatCard icon="🔔" label="Alerts today" value={today.alerts_triggered ?? 0} tone="text-warn" />
        <StatCard icon="📊" label="Posture score" value={today.health_score != null ? `${today.health_score}%` : '—'} tone="text-info" sub="Today's average" />
      </div>
      <div className="mt-5 grid grid-cols-[1.65fr_1fr] gap-5">
        <LivePosture onCalibrate={onCalibrate} />
        <DistancePanel />
      </div>
      <div className="mt-5 grid grid-cols-[1.65fr_1fr] gap-5">
        <Card title="Weekly posture breakdown" subtitle="Healthy vs. slouching — stacked percentage per day">
          <WeeklyBars week={stats?.week} />
        </Card>
        <Card title="Today's split" subtitle="Time distribution">
          <SplitDonut today={today} />
        </Card>
      </div>
    </div>
  );
}
