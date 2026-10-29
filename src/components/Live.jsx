import React, { useEffect, useState } from 'react';
import { useEngine } from '../lib/engine.jsx';
import { STATE_STYLE, dur, mmss } from '../lib/format.js';
import PostureFigure from './PostureFigure.jsx';
import { Bar, Card, Toggle } from './ui.jsx';
import { useTheme } from '../lib/theme.jsx';

// ---------------------------------------------------------------- posture
export function LivePosture({ onCalibrate }) {
  const { status, frame, setFrame, bridge, settings } = useEngine();
  const [showCam, setShowCam] = useState(false);

  useEffect(() => {
    bridge.setPreview(showCam);
    if (!showCam) setFrame(null);
    return () => bridge.setPreview(false);
  }, [showCam]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = status.posture && status.posture.kyphosis != null ? status.posture : null;
  const state = status.state;
  const st = STATE_STYLE[state] || STATE_STYLE.Starting;
  const alertMins = settings?.alert_timer_mins ?? 3;

  return (
    <Card
      title="Live posture"
      subtitle="Slouching = Forward Head + Rounded Shoulders + Pelvic Tilt — shoulders weighted highest"
      right={(
        <div className="flex gap-2">
          <button className="btn whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => setShowCam((v) => !v)}>
            {showCam ? 'Hide camera' : 'Show camera'}
          </button>
          <button className="btn whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={onCalibrate}>Recalibrate</button>
        </div>
      )}
    >
      <div className="grid grid-cols-[1.1fr_1fr] gap-6">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
          {showCam && frame ? (
            <img alt="camera preview" className="h-full w-full object-cover" src={`data:image/jpeg;base64,${frame}`} />
          ) : (
            <div className="h-full w-full p-4"><PostureFigure posture={p} state={state} /></div>
          )}
          <div className={`absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-ink-950/80 px-3 py-1.5 text-xs font-semibold ${st.text}`}>
            <span className={`h-2 w-2 rounded-full ${st.bg}`} /> {st.label}
          </div>
          {showCam && <div className="absolute bottom-2 right-3 text-[10px] text-mute-400">Processed in memory only · never saved</div>}
        </div>

        <div className="flex flex-col justify-between">
          {state === 'Uncalibrated' ? (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
              <div className="font-semibold">Calibrate your upright posture</div>
              <p className="mt-1 text-xs leading-relaxed text-mute-300">Slouching is measured against <b>your</b> good posture. Sit upright once so DeskHealth can learn it.</p>
              <button className="btn btn-primary mt-3" onClick={onCalibrate}>Start calibration</button>
            </div>
          ) : (
            <>
              <div>
                <div className="label">Posture score</div>
                {state === 'Resting' ? (
                  <div className="font-mono text-[30px] font-bold leading-tight text-warn">Resting<div className="font-sans text-xs font-medium text-mute-400">Leaning back · alerts paused</div></div>
                ) : (
                  <div className={`font-mono text-[44px] font-bold leading-tight ${p?.posture_score != null ? (p.posture_score >= 70 ? 'text-good' : p.posture_score >= 45 ? 'text-warn' : 'text-bad') : 'text-mute-400'}`}>
                    {p?.posture_score != null ? `${p.posture_score}%` : '—'}
                  </div>
                )}
              </div>
              <SlouchTimer status={status} alertMins={alertMins} />
              <div className="mt-3 space-y-3">
                <Component name="Shoulders — rounded / dropped" weight="50%" value={p?.kyphosis} />
                <Component name="Forward head" weight="30%" value={p?.forward_head} />
                <Component name="Pelvic tilt (tucked tailbone)" weight="20%" value={p?.pelvic_tilt} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Metric label="Shoulder drop" value={p ? `${Math.max(0, p.shoulder_drop_cm).toFixed(1)}` : '—'} unit="cm" />
                <Metric label="Shoulder fwd" value={p ? `${Math.max(0, p.shoulder_forward_cm).toFixed(1)}` : '—'} unit="cm" />
                <Metric label="Neck angle" value={p ? `${Math.round(p.neck_angle)}` : '—'} unit="°" />
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// Continuous slouch streak (what the alert counts) and today's summed total
function SlouchTimer({ status, alertMins }) {
  const streak = status.slouch_seconds || 0;
  const limit = status.alert_after_seconds || alertMins * 60;
  const total = status.today?.slouch;
  return (
    <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="whitespace-nowrap text-mute-300">Continuous slouching</span>
        <span className={`whitespace-nowrap font-mono font-bold ${streak ? 'text-bad' : 'text-mute-400'}`}>{mmss(streak)} <span className="font-normal text-mute-400">/ {alertMins} min</span></span>
      </div>
      <div className="mt-1.5"><Bar value={streak / limit} color="bg-bad" /></div>
      <div className="mt-2 flex items-baseline justify-between text-xs">
        <span className="text-mute-300">Total slouch time today</span>
        <span className="font-mono font-bold text-mute-200">{total != null ? dur(total) : '—'}</span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-mute-400">The alert needs {alertMins} min of slouching in a row; sitting properly resets the timer.</p>
    </div>
  );
}

function Component({ name, weight, value }) {
  const v = value || 0;
  const color = v >= 0.6 ? 'bg-bad' : v >= 0.3 ? 'bg-warn' : 'bg-good';
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-mute-300">{name} <span className="text-mute-400">· {weight}</span></span>
        <span className="font-mono text-mute-200">{Math.round(v * 100)}%</span>
      </div>
      <Bar value={v} color={color} />
    </div>
  );
}

function Metric({ label, value, unit }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-mute-400">{label}</div>
      <div className="font-mono text-lg font-bold text-mute-200">{value}<span className="ml-0.5 text-xs text-mute-400">{unit}</span></div>
    </div>
  );
}

// ---------------------------------------------------------------- distance
export function DistancePanel() {
  const { status, settings, setSettings, bridge } = useEngine();
  const [saving, setSaving] = useState(false);
  const setEnabled = async (v) => {
    setSaving(true);
    try { setSettings(await bridge.updateSettings({ eye_strain_tracking: v })); } finally { setSaving(false); }
  };
  const { c } = useTheme();
  const min = settings?.min_distance_cm ?? 50;
  const d = status.distance_cm;
  const enabled = settings?.eye_strain_tracking !== false;
  const lo = 20;
  const hi = 100;
  const pos = (v) => `${((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100}%`;
  const close = status.too_close;
  return (
    <Card
      title="Screen distance"
      subtitle="Eye strain · face-to-screen distance from iris size"
      right={(
        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-mute-300">
          {enabled ? 'On' : 'Off'}
          <Toggle checked={enabled} onChange={setEnabled} disabled={saving || !settings} />
        </label>
      )}
    >
      {!enabled ? (
        <div className="py-6 text-sm leading-relaxed text-mute-400">Eye strain tracking is off: no distance checks and no "too close" alerts. Turn it on with the switch above (also in Settings).</div>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <div className={`font-mono text-[44px] font-bold leading-none ${d ? (close ? 'text-bad' : 'text-good') : 'text-mute-400'}`}>{d ? Math.round(d) : '—'}</div>
            <div className="pb-1 text-sm text-mute-400">cm</div>
            <div className={`mb-1 ml-auto rounded-lg px-3 py-1 text-xs font-semibold ${close ? 'bg-bad/15 text-bad' : d ? 'bg-good/10 text-good' : 'bg-ink-700 text-mute-400'}`}>
              {d ? (close ? 'Too close' : 'Safe distance') : 'No face detected'}
            </div>
          </div>
          <div className="relative mt-6 h-3 rounded-full" style={{ background: `linear-gradient(to right, ${c('bad', 0.3)} 0%, ${c('bad', 0.3)} ${pos(min)}, ${c('good', 0.3)} ${pos(min)}, ${c('good', 0.3)} ${pos(80)}, ${c('info', 0.25)} ${pos(80)})` }}>
            <div className="absolute -top-1 h-5 w-0.5 bg-warn" style={{ left: pos(min) }} />
            {d && <div className="absolute -top-1.5 h-6 w-6 -translate-x-1/2 rounded-full border-4 border-ink-850 bg-head shadow transition-all duration-500" style={{ left: pos(d) }} />}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-mute-400">
            <span>{lo}cm</span><span className="text-warn">min {min}cm</span><span>{hi}cm</span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-mute-400">
            Keep the screen about an arm&apos;s length away (50–70 cm). You are notified when you stay closer than {min} cm for {settings?.too_close_seconds ?? 5} s.
          </p>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------ too-close banner
export function TooCloseBanner() {
  const { status, settings } = useEngine();
  if (!status.too_close || settings?.eye_strain_tracking === false) return null;
  return (
    <div className="mb-6 flex items-center gap-4 rounded-2xl border border-bad/50 bg-bad/10 px-6 py-4">
      <div className="text-2xl">👁</div>
      <div>
        <div className="font-display text-base font-bold text-bad">You are too close to the screen — {Math.round(status.distance_cm)} cm</div>
        <div className="text-sm text-mute-300">Move back to at least {settings?.min_distance_cm ?? 50} cm (about an arm&apos;s length) to reduce eye strain.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- calibration
export function CalibrationModal({ open, onClose }) {
  const { bridge, setSettings } = useEngine();
  const [phase, setPhase] = useState('intro');
  const [progress, setProgress] = useState(0);
  const [known, setKnown] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setPhase('intro');
    setProgress(0);
    setHint('');
    return bridge.onCalibration((c) => {
      if (c.status === 'progress') setProgress(c.progress);
      if (c.status === 'waiting') setHint(c.msg);
      if (c.status === 'done') {
        setPhase('done');
        bridge.getSettings().then(setSettings);
      }
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const start = () => {
    setPhase('running');
    setTimeout(() => bridge.calibrate(known ? Number(known) : null), 1500);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 backdrop-blur-sm">
      <div className="card w-[520px] p-8">
        <h2 className="font-display text-xl font-extrabold text-head">Posture calibration</h2>
        {phase === 'intro' && (
          <>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-mute-300">
              <li>Sit back in your chair with your <b className="text-mute-200">hips against the backrest</b>.</li>
              <li>Lift your chest, <b className="text-mute-200">shoulders back and down</b> — not hunched forward.</li>
              <li>Ears above shoulders, look straight at the screen.</li>
              <li>Make sure both shoulders are visible to the camera.</li>
            </ol>
            <label className="mt-5 block text-xs text-mute-400">
              Optional — your measured eye-to-screen distance (cm) for exact distance readings
              <input
                value={known} onChange={(e) => setKnown(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 60"
                className="mt-2 w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 font-mono text-sm text-mute-200 outline-none focus:border-good/60"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={start}>I&apos;m sitting upright — start</button>
            </div>
          </>
        )}
        {phase === 'running' && (
          <div className="mt-6">
            <p className="text-sm text-mute-300">Hold still in your best posture for about 3 seconds…</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-ink-700">
              <div className="h-full rounded-full bg-good transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            {hint && <p className="mt-3 text-xs text-warn">{hint}</p>}
          </div>
        )}
        {phase === 'done' && (
          <>
            <p className="mt-4 text-sm text-mute-300">✅ Calibration saved. DeskHealth now compares your posture to this upright baseline. Recalibrate whenever you change your chair, desk or camera position.</p>
            <div className="mt-6 flex justify-end"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toast
export function AlertToast() {
  const { toast, setToast, bridge } = useEngine();
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!toast) return null;
  const eye = toast.alert_type === 'Eye_Strain';
  return (
    <div className={`fixed bottom-6 right-6 z-40 w-[380px] rounded-2xl border p-5 shadow-2xl ${eye ? 'border-info/50 bg-ink-800' : 'border-bad/50 bg-ink-800'}`}>
      <div className={`font-display font-bold ${eye ? 'text-info' : 'text-bad'}`}>{toast.title}</div>
      <div className="mt-1 text-sm text-mute-300">{toast.message}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn !py-1.5 text-xs" onClick={() => { bridge.snooze(15); setToast(null); }}>Snooze 15 min</button>
        <button className="btn btn-primary !py-1.5 text-xs" onClick={() => setToast(null)}>OK</button>
      </div>
    </div>
  );
}
