export function hm(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export function mmss(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}m ${ss}s`;
}

export function weekday(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
}

export function timeOf(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T'));
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function pct(part, total) {
  return total ? Math.round((100 * part) / total) : 0;
}

export const STATE_STYLE = {
  Healthy: { text: 'text-good', bg: 'bg-good', label: 'Good posture' },
  Slouching: { text: 'text-bad', bg: 'bg-bad', label: 'Slouching' },
  Resting: { text: 'text-warn', bg: 'bg-warn', label: 'Resting' },
  Away: { text: 'text-mute-400', bg: 'bg-mute-400', label: 'Away from desk' },
  Paused: { text: 'text-mute-300', bg: 'bg-mute-300', label: 'Paused' },
  Calibrating: { text: 'text-info', bg: 'bg-info', label: 'Calibrating' },
  Uncalibrated: { text: 'text-warn', bg: 'bg-warn', label: 'Needs calibration' },
  NoCamera: { text: 'text-bad', bg: 'bg-bad', label: 'Camera unavailable' },
  Starting: { text: 'text-mute-300', bg: 'bg-mute-300', label: 'Starting engine…' },
};
