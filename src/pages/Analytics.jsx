import React from 'react';
import { useEngine, useStats } from '../lib/engine.jsx';
import { hm, weekday } from '../lib/format.js';
import { Card, Empty, StatCard } from '../components/ui.jsx';
import { HourlyTrend, WeeklyBars } from '../components/Charts.jsx';

export default function Analytics() {
  const stats = useStats(30000);
  const { settings } = useEngine();
  const avg = stats?.avg_score;
  const prev = stats?.prev_avg_score;
  const diff = avg != null && prev != null ? (avg - prev).toFixed(1) : null;
  const week = stats?.week || [];
  const closeSecs = week.reduce((a, r) => a + (r.total_close_seconds || 0), 0);
  const activeSecs = week.reduce((a, r) => a + (r.total_active_seconds || 0), 0);
  return (
    <div>
      <div className="grid grid-cols-4 gap-5">
        <StatCard
          label="Avg. weekly score" value={avg != null ? `${avg}%` : '—'} tone="text-good"
          sub={diff != null ? `${diff >= 0 ? '↑' : '↓'} ${Math.abs(diff)}% vs last week` : 'Not enough data yet'}
        />
        <StatCard label="Total alerts" value={stats?.total_alerts ?? 0} tone="text-bad" sub="This week" />
        <StatCard
          label="Best day" value={stats?.best_day ? weekday(stats.best_day.date) : '—'} tone="text-info"
          sub={stats?.best_day ? `${stats.best_day.health_score}% posture score` : ''}
        />
        <StatCard label="Too close to screen" value={hm(closeSecs)} tone="text-warn" sub={activeSecs ? `${Math.round((100 * closeSecs) / activeSecs)}% of tracked time` : 'This week'} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-5">
        <Card title="Weekly breakdown">
          <WeeklyBars week={week} height={300} />
        </Card>
        <Card title="Today — hourly trend" subtitle="Average posture score and screen distance per hour">
          {stats?.hourly?.length ? <HourlyTrend hourly={stats.hourly} minDistance={settings?.min_distance_cm} height={280} /> : <Empty>No readings logged today yet.</Empty>}
        </Card>
      </div>
      <Card title="Daily log" className="mt-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="label border-b border-ink-700 text-left">
              <th className="py-3 font-semibold">Day</th><th className="font-semibold">Tracked</th><th className="font-semibold">Slouching</th>
              <th className="font-semibold">Resting</th><th className="font-semibold">Too close</th><th className="font-semibold">Alerts</th><th className="font-semibold">Score</th>
            </tr>
          </thead>
          <tbody>
            {[...week].reverse().map((d) => (
              <tr key={d.date} className="border-b border-ink-700/60 last:border-0">
                <td className="py-3 text-mute-200">{weekday(d.date)} <span className="ml-1 font-mono text-xs text-mute-400">{d.date}</span></td>
                <td className="font-mono">{hm(d.total_active_seconds)}</td>
                <td className="font-mono text-bad">{hm(d.total_slouch_seconds)}</td>
                <td className="font-mono text-warn">{hm(d.total_resting_seconds)}</td>
                <td className="font-mono text-info">{hm(d.total_close_seconds)}</td>
                <td className="font-mono">{d.alerts_triggered}</td>
                <td className="font-mono font-bold text-good">{d.health_score != null ? `${d.health_score}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
