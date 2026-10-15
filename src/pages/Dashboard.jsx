import React from 'react';
import { useEngine, useStats } from '../lib/engine.jsx';
import { hm } from '../lib/format.js';
import { Card, StatCard } from '../components/ui.jsx';
import { SplitDonut, WeeklyBars } from '../components/Charts.jsx';
import { DistancePanel, LivePosture, TooCloseBanner } from '../components/Live.jsx';

export default function Dashboard({ onCalibrate }) {
  const stats = useStats(10000);
  const { status, call, bridge } = useEngine();
  const today = stats?.today || {};
  const healthy = Math.max(0, (today.total_active_seconds || 0) - (today.total_slouch_seconds || 0) - (today.total_resting_seconds || 0));
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
        <StatCard icon="💚" label="Healthy time" value={hm(healthy)} tone="text-good" />
        <StatCard icon="🔴" label="Slouch time" value={hm(today.total_slouch_seconds)} tone="text-bad" />
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
