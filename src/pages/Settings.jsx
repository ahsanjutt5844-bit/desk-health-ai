import React, { useEffect, useState } from 'react';
import { useEngine } from '../lib/engine.jsx';
import { Card, SettingRow, SliderRow, Toggle } from '../components/ui.jsx';
import { useTheme } from '../lib/theme.jsx';

export default function Settings({ onCalibrate }) {
  const { settings, setSettings, bridge } = useEngine();
  const { theme, setTheme } = useTheme();
  const [draft, setDraft] = useState(settings);
  const [cameras, setCameras] = useState(null);
  const [labels, setLabels] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => { if (settings) setDraft(settings); }, [settings]);
  const [closeAction, setCloseAction] = useState('ask');
  useEffect(() => { bridge.getPrefs?.().then((p) => p && setCloseAction(p.closeAction)); }, [bridge]);
  const chooseClose = async (v) => { setCloseAction(v); await bridge.setPrefs({ closeAction: v }); };
  useEffect(() => {
    bridge.listCameras().then(setCameras).catch(() => setCameras([]));
    // device names come from the OS through Chromium; indices from OpenCV
    navigator.mediaDevices?.enumerateDevices?.()
      .then((ds) => setLabels(ds.filter((d) => d.kind === 'videoinput').map((d) => d.label)))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft) return <div className="text-mute-400">Loading settings…</div>;
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const save = async () => { setSettings(await bridge.updateSettings(draft)); flash('Settings saved'); };
  const reset = async () => { setSettings(await bridge.resetSettings()); flash('Settings reset to defaults'); };
  const exportCsv = async () => {
    const r = await bridge.exportCsv();
    if (!r?.canceled) flash(`Exported ${r.rows} rows`);
  };
  const clearHistory = async () => {
    if (window.confirm('Delete all posture logs, alerts and daily summaries? Settings and calibration are kept.')) {
      await bridge.clearHistory();
      flash('History cleared');
    }
  };
  const camName = (i) => labels[i] || `Camera ${i}`;
  const selected = cameras?.find((c) => c.index === draft.camera_idx);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-head">Settings</h2>
          <p className="mt-1 text-sm text-mute-400">Changes are stored locally in SQLite — zero cloud sync.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-good">{msg}</span>}
          <button className="btn" onClick={reset}>Reset</button>
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>Save Settings</button>
        </div>
      </div>
      <div className="grid grid-cols-[1.15fr_1fr] gap-5">
        <div className="space-y-5">
          <Card title="Tracking">
            <SettingRow title="Eye Strain Tracking" desc={`Face mesh estimates your screen distance. Alerts below ${draft.min_distance_cm} cm.`}>
              <Toggle checked={draft.eye_strain_tracking} onChange={set('eye_strain_tracking')} />
            </SettingRow>
            <SettingRow title="Desktop Notifications" desc="Native OS banners after an alert threshold is exceeded. When off, alerts are only logged.">
              <Toggle checked={draft.desktop_notifications} onChange={set('desktop_notifications')} />
            </SettingRow>
            <SettingRow title="Auto-pause During Video Calls" desc="Releases the webcam when Zoom, Teams or another app starts using it.">
              <Toggle checked={draft.auto_pause_calls} onChange={set('auto_pause_calls')} />
            </SettingRow>
            <SettingRow title="Launch on Boot" desc="Start DeskHealth AI hidden in the tray when you log in.">
              <Toggle checked={draft.launch_on_boot} onChange={set('launch_on_boot')} />
            </SettingRow>
          </Card>
          <Card title="Thresholds">
            <SliderRow title="Alert Timer" desc="Continuous slouching needed before a posture alert." value={draft.alert_timer_mins} min={1} max={10} unit=" min" onChange={set('alert_timer_mins')} />
            <SliderRow title="Slouch Threshold" desc="How much your shoulders may drop or move forward before it counts as slouching (35% ≈ 2 cm). Lower = stricter." value={draft.posture_threshold} min={20} max={60} unit="%" onChange={set('posture_threshold')} />
            <SliderRow title="Minimum Screen Distance" desc="Closer than this counts as too close." value={draft.min_distance_cm} min={35} max={75} unit=" cm" onChange={set('min_distance_cm')} />
            <SliderRow title="Too-close Delay" desc="How long you may stay too close before being notified." value={draft.too_close_seconds} min={2} max={30} unit=" s" onChange={set('too_close_seconds')} />
            <SliderRow title="Analysis Rate" desc="Frames analysed per second. Lower = less CPU." value={draft.target_fps} min={1} max={3} unit=" FPS" onChange={set('target_fps')} />
          </Card>
        </div>
        <div className="space-y-5">
          <Card title={<span className="text-info">Hardware</span>}>
            <div className="label mb-2">Active camera device</div>
            <select
              value={draft.camera_idx}
              onChange={(e) => set('camera_idx')(Number(e.target.value))}
              className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-sm text-mute-200 outline-none focus:border-good/60"
            >
              {(cameras?.length ? cameras : [{ index: draft.camera_idx }]).map((c) => (
                <option key={c.index} value={c.index}>{camName(c.index)} — Camera {c.index}{c.index === 0 ? ' · Default' : ''}</option>
              ))}
            </select>
            <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
              <div className="label">Selected</div>
              <div className="mt-1 font-semibold text-good">📷 {camName(draft.camera_idx)}</div>
              <div className="mt-1 font-mono text-[11px] text-mute-400">
                Index: {draft.camera_idx}{selected?.width ? ` · ${selected.width}×${selected.height}` : ''}{selected?.in_use ? ' · in use by DeskHealth' : ''}
                {cameras === null ? ' · scanning…' : ''}
              </div>
            </div>
          </Card>
          <Card title={<span className="text-info">Calibration</span>}>
            <p className="text-sm text-mute-300">
              Status: {settings?.calibrated ? <span className="text-good">calibrated ✓</span> : <span className="text-warn">not calibrated</span>}
              {settings?.focal_scale ? <span className="text-mute-400"> · distance calibrated</span> : null}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-mute-400">Recalibrate after moving the laptop, camera or chair. Slouching is measured as change from this upright baseline.</p>
            <div className="mt-4 flex gap-3">
              <button className="btn btn-primary" onClick={onCalibrate}>Recalibrate posture</button>
              {settings?.calibrated && <button className="btn" onClick={async () => { await bridge.clearCalibration(); setSettings(await bridge.getSettings()); }}>Clear</button>}
            </div>
          </Card>
          <Card title={<span className="text-info">Appearance</span>}>
            <div className="flex gap-2" role="radiogroup" aria-label="Theme">
              {['light', 'dark'].map((t) => (
                <button
                  key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}
                  className={`btn flex-1 justify-center capitalize ${theme === t ? '!border-good !text-good' : ''}`}
                >
                  {t === 'light' ? '☀ Light' : '☾ Dark'}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-mute-400">Applies immediately and is remembered on this computer.</p>
          </Card>
          <Card title={<span className="text-info">When I close the window</span>}>
            <div className="grid gap-2" role="radiogroup" aria-label="Close button behaviour">
              {[
                ['ask', 'Ask me every time'],
                ['tray', 'Keep running in the background (system tray)'],
                ['quit', 'Quit DeskHealth AI completely'],
              ].map(([v, label]) => (
                <label key={v} className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-700 px-4 py-2.5 text-sm text-mute-200 hover:bg-ink-800">
                  <input type="radio" name="closeAction" checked={closeAction === v} onChange={() => chooseClose(v)} className="accent-[rgb(var(--good))]" />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-mute-400">You can always quit from the sidebar or the tray icon (^ next to the clock).</p>
              <button className="btn btn-danger shrink-0" onClick={() => bridge.quit()}>Quit app</button>
            </div>
          </Card>
          <Card title={<span className="text-info">Data & maintenance</span>}>
            <p className="text-xs leading-relaxed text-mute-400">Only numbers (state, score, angles, distance, timestamps) are stored. Video frames are never saved or uploaded.</p>
            <div className="mt-4 flex gap-3">
              <button className="btn" onClick={exportCsv}>Export data (CSV)</button>
              <button className="btn btn-danger" onClick={clearHistory}>Clear history</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
