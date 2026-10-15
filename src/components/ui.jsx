import React from 'react';
import { useTheme } from '../lib/theme.jsx';

export function StatCard({ icon, label, value, tone = 'text-mute-200', sub }) {
  return (
    <div className="card px-6 py-5">
      <div className="label flex items-center gap-2">
        {icon && <span className="text-base leading-none">{icon}</span>}
        {label}
      </div>
      <div className={`mt-3 font-mono text-[34px] font-bold leading-none ${tone}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-mute-400">{sub}</div>}
    </div>
  );
}

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`card p-6 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="mt-1 text-xs text-mute-400">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-good' : 'bg-ink-600'} disabled:opacity-40`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

export function SettingRow({ title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-ink-700 py-4 last:border-0">
      <div>
        <div className="text-[15px] font-medium text-mute-200">{title}</div>
        {desc && <div className="mt-1 text-xs leading-relaxed text-mute-400">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export function SliderRow({ title, desc, value, min, max, step = 1, unit, onChange, format }) {
  const { c } = useTheme();
  return (
    <div className="border-b border-ink-700 py-4 last:border-0">
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-medium text-mute-200">{title}</div>
        <div className="font-mono text-sm font-bold text-good">{format ? format(value) : `${value}${unit}`}</div>
      </div>
      {desc && <div className="mt-1 text-xs text-mute-400">{desc}</div>}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full"
        style={{ background: `linear-gradient(to right, ${c('good')} ${((value - min) / (max - min)) * 100}%, ${c('ink-700')} 0)` }}
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-mute-400">
        <span>{format ? format(min) : `${min}${unit}`}</span>
        <span>{format ? format(max) : `${max}${unit}`}</span>
      </div>
    </div>
  );
}

export function Bar({ value, color = 'bg-good' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value || 0)) * 100)}%` }} />
    </div>
  );
}

export function Empty({ children }) {
  return <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-mute-400">{children}</div>;
}
