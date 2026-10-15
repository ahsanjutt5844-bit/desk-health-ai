import React from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Line, ComposedChart,
} from 'recharts';
import { weekday, pct, hm } from '../lib/format.js';
import { useTheme } from '../lib/theme.jsx';

// Shared axis / tooltip / legend styling, built from the current theme
function useChartStyle() {
  const { c } = useTheme();
  return {
    c,
    axis: { stroke: c('mute-400'), fontSize: 11, tickLine: false, axisLine: false },
    grid: c('chart-grid'),
    tip: {
      contentStyle: { background: c('ink-850'), border: `1px solid ${c('ink-700')}`, borderRadius: 12, fontSize: 12, boxShadow: `0 4px 16px ${c('shadow', 0.12)}` },
      labelStyle: { color: c('head'), fontWeight: 600, marginBottom: 4 },
      itemStyle: { color: c('mute-200') },
      cursor: { fill: c('ink-700', 0.45) },
    },
    legend: (v) => <span style={{ color: c('mute-300'), fontSize: 12 }}>{v}</span>,
  };
}

export function WeeklyBars({ week, height = 260 }) {
  const { c, axis, grid, tip, legend } = useChartStyle();
  const data = (week || []).map((d) => {
    const total = d.total_active_seconds || 0;
    const slouch = pct(d.total_slouch_seconds, total);
    return { day: weekday(d.date), Healthy: total ? 100 - slouch : 0, Slouching: total ? slouch : 0, total };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={16}>
        <CartesianGrid vertical={false} stroke={grid} />
        <XAxis dataKey="day" {...axis} />
        <YAxis {...axis} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={40} />
        <Tooltip {...tip} formatter={(v, n, item) => (item.payload.total ? [`${v}%`, n] : ['no data', n])} />
        <Legend iconType="circle" iconSize={8} formatter={legend} />
        <Bar dataKey="Healthy" stackId="a" fill={c('good')} />
        <Bar dataKey="Slouching" stackId="a" fill={c('bad')} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SplitDonut({ today, height = 260 }) {
  const { c, tip, legend } = useChartStyle();
  const t = today || {};
  const slouch = t.total_slouch_seconds || 0;
  const resting = t.total_resting_seconds || 0;
  const healthy = Math.max(0, (t.total_active_seconds || 0) - slouch - resting);
  const data = [
    { name: 'Healthy', value: healthy, color: c('good') },
    { name: 'Resting', value: resting, color: c('warn') },
    { name: 'Slouching', value: slouch, color: c('bad') },
  ];
  const empty = healthy + resting + slouch === 0;
  const emptyData = [{ name: 'No data', value: 1, color: c('ink-700') }];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={empty ? emptyData : data}
          dataKey="value" innerRadius="62%" outerRadius="86%" paddingAngle={empty ? 0 : 3}
          stroke="none" startAngle={90} endAngle={-270}
        >
          {(empty ? emptyData : data).map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        {!empty && <Tooltip {...tip} formatter={(v, n) => [hm(v), n]} />}
        <Legend iconType="circle" iconSize={8} formatter={legend} />
      </PieChart>
    </ResponsiveContainer>
  );
}

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

export function HourlyTrend({ hourly, minDistance, height = 260 }) {
  const { c, axis, grid, tip, legend } = useChartStyle();
  const data = (hourly || []).map((r) => ({ hour: hourLabel(r.hour), Score: r.score, Distance: r.distance }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <defs>
          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c('good')} stopOpacity={0.3} />
            <stop offset="100%" stopColor={c('good')} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={grid} />
        <XAxis dataKey="hour" {...axis} />
        <YAxis yAxisId="s" {...axis} domain={[0, 100]} width={34} />
        <YAxis yAxisId="d" orientation="right" {...axis} domain={[20, 100]} width={40} tickFormatter={(v) => `${v}cm`} />
        <Tooltip {...tip} formatter={(v, n) => (n === 'Score' ? [`${v}%`, 'Posture score'] : [`${v} cm`, 'Screen distance'])} />
        <Legend iconType="circle" iconSize={8} formatter={(v) => legend(v === 'Score' ? 'Posture score' : 'Screen distance')} />
        {minDistance && <ReferenceLine yAxisId="d" y={minDistance} stroke={c('warn')} strokeDasharray="4 4" />}
        <Area yAxisId="s" type="monotone" dataKey="Score" stroke={c('good')} strokeWidth={2.5} fill="url(#scoreFill)" />
        <Line yAxisId="d" type="monotone" dataKey="Distance" stroke={c('info')} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
