import React from 'react';
import { useStats } from '../lib/engine.jsx';
import { mmss, timeOf } from '../lib/format.js';
import { Card, Empty, StatCard } from '../components/ui.jsx';

const TYPES = {
  Posture_Violation: { label: 'Posture Violation', icon: '🧍', tone: 'text-bad' },
  Eye_Strain: { label: 'Too Close (Eye Strain)', icon: '👁', tone: 'text-info' },
};
const ACTION_TONE = { Snoozed: 'text-warn', Opened: 'text-good', Dismissed: 'text-mute-300' };

export default function Alerts() {
  const stats = useStats(10000);
  const alerts = stats?.alerts_today || [];
  const posture = alerts.filter((a) => a.alert_type === 'Posture_Violation').length;
  const eye = alerts.filter((a) => a.alert_type === 'Eye_Strain').length;
  return (
    <div>
      <div className="grid grid-cols-3 gap-5">
        <StatCard label="Total today" value={alerts.length} tone="text-head" />
        <StatCard label="Posture alerts" value={posture} tone="text-bad" />
        <StatCard label="Eye alerts" value={eye} tone="text-info" />
      </div>
      <Card title="Alert history" subtitle="All ergonomic alerts triggered today" className="mt-5 overflow-hidden">
        {alerts.length === 0 ? (
          <Empty>No alerts today — keep it up!</Empty>
        ) : (
          <table className="-mx-6 -mb-6 w-[calc(100%+3rem)] text-sm">
            <thead>
              <tr className="label border-y border-ink-700 bg-ink-900/60 text-left">
                <th className="px-6 py-3 font-semibold">#</th><th className="font-semibold">Time</th>
                <th className="font-semibold">Alert type</th><th className="font-semibold">Duration</th><th className="font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const t = TYPES[a.alert_type] || { label: a.alert_type, icon: '•', tone: 'text-mute-200' };
                return (
                  <tr key={a.alert_id} className="border-b border-ink-700/60 last:border-0">
                    <td className="px-6 py-4 font-mono text-mute-400">#{String(a.alert_id).padStart(3, '0')}</td>
                    <td className="font-mono text-mute-200">{timeOf(a.timestamp)}</td>
                    <td className={`font-medium ${t.tone}`}>{t.icon} {t.label}</td>
                    <td className="font-mono text-mute-300">{mmss(a.duration_seconds)}</td>
                    <td className={ACTION_TONE[a.user_action] || 'text-mute-400'}>{a.user_action || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-5 py-3 text-xs text-mute-400">
        <span className="rounded bg-info px-1.5 font-bold text-head">i</span>
        Alerts are stored in the local <code className="rounded bg-ink-700 px-1.5 py-0.5 text-mute-200">ALERT_HISTORY</code> SQLite table and fetched via
        <code className="rounded bg-ink-700 px-1.5 py-0.5 text-mute-200">ipc-get-posture-stats</code>.
      </div>
    </div>
  );
}
