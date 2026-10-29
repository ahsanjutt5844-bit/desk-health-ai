// Browser-only stand-in for the Electron preload bridge.
// Lets the UI run with `npx vite` (no camera, no Python) for design work and
// demos. Inside Electron the real `window.deskHealth` is always used.

const listeners = {};
const emit = (ch, data) => (listeners[ch] || []).forEach((cb) => cb(data));
const on = (ch) => (cb) => {
  (listeners[ch] ||= []).push(cb);
  return () => { listeners[ch] = listeners[ch].filter((x) => x !== cb); };
};

let settings = {
  eye_strain_tracking: true, camera_idx: 0, alert_timer_mins: 3, desktop_notifications: true,
  posture_threshold: 35, min_distance_cm: 50, too_close_seconds: 5, target_fps: 2,
  auto_pause_calls: true, launch_on_boot: false, focal_scale: null, calibrated: true,
};
let paused = false;
const auth = { has_password: true, unlocked: false, profile_name: 'Ahsan' };
let authPw = 'demo123';
let snoozedUntil = null;

function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function fakeWeek(seed) {
  return Array.from({ length: 7 }, (_, i) => {
    const active = 3600 * (4 + ((i * 7 + seed) % 5));
    const slouchPct = [0.32, 0.25, 0.45, 0.18, 0.38, 0.09, 0.21][(i + seed) % 7];
    return {
      date: day(6 - i), total_active_seconds: active,
      total_slouch_seconds: Math.round(active * slouchPct),
      total_resting_seconds: Math.round(active * 0.08),
      total_close_seconds: Math.round(active * 0.06),
      alerts_triggered: Math.round(slouchPct * 10),
      health_score: Math.round(100 - slouchPct * 70),
    };
  });
}

const now = new Date();
const alertsToday = [
  { alert_id: 4, timestamp: `${day(0)} 14:02:10`, alert_type: 'Eye_Strain', duration_seconds: 6, user_action: null },
  { alert_id: 3, timestamp: `${day(0)} 13:38:41`, alert_type: 'Posture_Violation', duration_seconds: 241, user_action: 'Dismissed' },
  { alert_id: 2, timestamp: `${day(0)} 10:52:05`, alert_type: 'Eye_Strain', duration_seconds: 5, user_action: 'Snoozed' },
  { alert_id: 1, timestamp: `${day(0)} 09:14:12`, alert_type: 'Posture_Violation', duration_seconds: 192, user_action: 'Dismissed' },
];

// scripted live scenario: upright -> slouching -> too close -> upright
function scenario(t) {
  const phase = Math.floor(t / 8) % 4;
  const wobble = Math.sin(t * 1.7) * 0.03;
  if (phase === 1) {
    return { state: 'Slouching', k: 0.78 + wobble, f: 0.45, p: 0.5, drop: 4.2, fwd: 7.5, neck: 26, dist: 52 };
  }
  if (phase === 2) {
    return { state: 'Healthy', k: 0.12, f: 0.1, p: 0.0, drop: 0.4, fwd: 1.5, neck: 9, dist: 38 + wobble * 20 };
  }
  return { state: 'Healthy', k: 0.05 + wobble, f: 0.04, p: 0, drop: 0.2, fwd: 0.3, neck: 4, dist: 63 + wobble * 30 };
}

let t0 = Date.now();
setInterval(() => {
  const t = (Date.now() - t0) / 1000;
  if (paused) {
    emit('engine-status', { state: 'Paused', paused_reasons: ['user'], calibrated: true });
    return;
  }
  const s = scenario(t);
  const index = Math.min(1, 0.5 * s.k + 0.3 * s.f + 0.2 * s.p);
  emit('engine-status', {
    state: settings.calibrated ? s.state : 'Uncalibrated',
    calibrated: settings.calibrated,
    paused_reasons: [],
    distance_cm: s.dist,
    too_close: s.dist < settings.min_distance_cm,
    snoozed_until: snoozedUntil,
    slouch_seconds: s.state === 'Slouching' ? Math.round((t % 8) * 20) : 0,
    alert_after_seconds: settings.alert_timer_mins * 60,
    today: { active: 19260 + Math.round(t), slouch: 7200 + (s.state === 'Slouching' ? Math.round(t % 8) : 0), resting: 1380, close: 600 },
    posture: settings.calibrated ? {
      state: s.state, slouch_index: index, posture_score: Math.round(100 * (1 - index)),
      kyphosis: s.k, forward_head: s.f, pelvic_tilt: s.p, shoulder_drop_cm: s.drop,
      shoulder_forward_cm: s.fwd, neck_angle: s.neck,
      shoulder_angle: (Math.atan2(s.fwd, 50 - s.drop) * 180) / Math.PI,
    } : { state: 'Uncalibrated' },
  });
}, 500);

export const mockBridge = {
  isMock: true,
  async getPostureStats() {
    const week = fakeWeek(2);
    const today = week[6];
    return {
      today, week, avg_score: 72.7, prev_avg_score: 68.5,
      total_alerts: week.reduce((a, r) => a + r.alerts_triggered, 0),
      best_day: week.reduce((a, r) => (r.health_score > a.health_score ? r : a)),
      hourly: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((h, i) => ({
        hour: h, score: [88, 76, 69, 81, 90, 62, 74, 70, 79, 84][i], distance: [62, 58, 55, 49, 61, 47, 53, 57, 60, 59][i],
      })),
      alerts_today: alertsToday,
    };
  },
  async getSettings() { return { ...settings }; },
  async updateSettings(v) { settings = { ...settings, ...v }; return { ...settings }; },
  async resetSettings() { settings = { ...settings, alert_timer_mins: 3, posture_threshold: 35, min_distance_cm: 50 }; return { ...settings }; },
  async getStatus() { return { state: 'Starting' }; },
  async listCameras() { return [{ index: 0, width: 1280, height: 720 }, { index: 1, width: 640, height: 480 }]; },
  pause() { paused = true; },
  resume() { paused = false; },
  async snooze(m) { snoozedUntil = m ? Date.now() / 1000 + m * 60 : null; },
  async calibrate() {
    let p = 0;
    const iv = setInterval(() => {
      p += 1 / 15;
      emit('engine-calibration', { status: 'progress', progress: Math.min(1, p) });
      if (p >= 1) {
        clearInterval(iv);
        settings.calibrated = true;
        emit('engine-calibration', { status: 'done' });
      }
    }, 200);
  },
  async clearCalibration() { settings.calibrated = false; },
  setPreview() {},
  async exportCsv() { return { rows: 0, canceled: true }; },
  async clearHistory() {},
  triggerAlert() {},
  async getPrefs() { return { closeAction: 'ask' }; },
  async setPrefs(p) { return { closeAction: p.closeAction }; },
  quit() {},
  // demo profile (browser preview only): password "demo123"
  async authStatus() { return { ...auth, locked_for: 0 }; },
  async authSetup(name, password) {
    if (!password || password.length < 6) throw new Error('The password must be 6 to 128 characters long.');
    Object.assign(auth, { has_password: true, unlocked: true, profile_name: name }); authPw = password; return { ...auth };
  },
  async authLogin(password) {
    if (password !== authPw) throw new Error('Wrong password. 4 attempts left.');
    auth.unlocked = true; return { ...auth };
  },
  async authLock() { auth.unlocked = false; emit('auth-locked'); return { ...auth }; },
  async authChange(o, n) { if (o !== authPw) throw new Error('The current password is not correct.'); authPw = n; return { ...auth }; },
  async authReset() { Object.assign(auth, { has_password: false, unlocked: false, profile_name: 'Main User' }); return { ...auth }; },
  onLocked: on('auth-locked'),
  onStatus: on('engine-status'),
  onFrame: on('engine-frame'),
  onAlert: on('engine-alert'),
  onCalibration: on('engine-calibration'),
  onCameraError: on('engine-camera-error'),
  onCall: on('engine-call'),
  onReady: on('engine-ready'),
  onFatal: on('engine-fatal'),
  onNavigate: on('navigate'),
};
