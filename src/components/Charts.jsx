import React from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Line, ComposedChart,
} from 'recharts';
import { weekday, pct, hm } from '../lib/format.js';

const AXIS = { stroke: '#7d8a99', fontSize: 11, tickLine: false, axisLine: false };
const TIP = {
  contentStyle: { background: '#111922', border: '1px solid #223040', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: '#c3ccd6', fontWeight: 600, marginBottom: 4 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};
const legend = (v) => <span style={{ color: '#9aa6b4', fontSize: 12 }}>{v}</span>;

export function WeeklyBars({ week, height = 260 }) {
  const data = (week || []).map((d) => {
    const total = d.total_active_seconds || 0;
    const slouch = pct(d.total_slouch_seconds, total);
    return { day: weekday(d.date), Healthy: total ? 100 - slouch : 0, Slouching: total ? slouch : 0, total };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={16}>
        <CartesianGrid vertical={false} stroke="#18222d" />
        <XAxis dataKey="day" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={40} />
        <Tooltip {...TIP} formatter={(v, n, item) => (item.payload.total ? [`${v}%`, n] : ['no data', n])} />
        <Legend iconType="circle" iconSize={8} formatter={legend} />
        <Bar dataKey="Healthy" stackId="a" fill="#12e2a3" />
        <Bar dataKey="Slouching" stackId="a" fill="#ff3d5e" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SplitDonut({ today, height = 260 }) {
  const t = today || {};
  const slouch = t.total_slouch_seconds || 0;
  const resting = t.total_resting_seconds || 0;
  const healthy = Math.max(0, (t.total_active_seconds || 0) - slouch - resting);
  const data = [
    { name: 'Healthy', value: healthy, color: '#12e2a3' },
    { name: 'Resting', value: resting, color: '#ffb020' },
    { name: 'Slouching', value: slouch, color: '#ff3d5e' },
  ];
  const empty = healthy + resting + slouch === 0;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={empty ? [{ name: 'No data', value: 1, color: '#18222d' }] : data}
          dataKey="value" innerRadius="62%" outerRadius="86%" paddingAngle={empty ? 0 : 3}
          stroke="none" startAngle={90} endAngle={-270}
        >
          {(empty ? [{ color: '#18222d' }] : data).map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        {!empty && <Tooltip {...TIP} formatter={(v, n) => [hm(v), n]} />}
        <Legend iconType="circle" iconSize={8} formatter={legend} />
      </PieChart>
    </ResponsiveContainer>
  );
}

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

export function HourlyTrend({ hourly, minDistance, height = 260 }) {
  const data = (hourly || []).map((r) => ({ hour: hourLabel(r.hour), Score: r.score, Distance: r.distance }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <defs>
          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12e2a3" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#12e2a3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#18222d" />
        <XAxis dataKey="hour" {...AXIS} />
        <YAxis yAxisId="s" {...AXIS} domain={[0, 100]} width={34} />
        <YAxis yAxisId="d" orientation="right" {...AXIS} domain={[20, 100]} width={40} tickFormatter={(v) => `${v}cm`} />
        <Tooltip {...TIP} formatter={(v, n) => (n === 'Score' ? [`${v}%`, 'Posture score'] : [`${v} cm`, 'Screen distance'])} />
        <Legend iconType="circle" iconSize={8} formatter={(v) => legend(v === 'Score' ? 'Posture score' : 'Screen distance')} />
        {minDistance && <ReferenceLine yAxisId="d" y={minDistance} stroke="#ffb020" strokeDasharray="4 4" />}
        <Area yAxisId="s" type="monotone" dataKey="Score" stroke="#12e2a3" strokeWidth={2.5} fill="url(#scoreFill)" />
        <Line yAxisId="d" type="monotone" dataKey="Distance" stroke="#4f9dff" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

