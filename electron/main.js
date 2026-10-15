// Electron main process - ElectronWrapper in the class diagram.
// Hosts the React dashboard, runs in the system tray, spawns the Python AI
// engine, routes IPC and shows native OS notifications.
const {
  app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, nativeImage, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { EngineBridge } = require('./engine-bridge');
const { CallDetector } = require('./call-detector');

const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let win = null;
let tray = null;
let engine = null;
let callDetector = null;
let quitting = false;
let lastStatus = { state: 'Starting' };
let settings = {};
let lastAlertId = null;
let shutdownDone = false;

// Small UI preferences kept by Electron (not in the engine database)
//   closeAction: 'ask' | 'tray' | 'quit'   - what the window's X button does
const PREFS_FILE = () => path.join(app.getPath('userData'), 'prefs.json');
let prefs = { closeAction: 'ask', trayHintShown: false };
function loadPrefs() {
  try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(PREFS_FILE(), 'utf8')) }; } catch { /* first run */ }
}
function savePrefs() {
  try { fs.writeFileSync(PREFS_FILE(), JSON.stringify(prefs, null, 2)); } catch { /* ignore */ }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.setAppUserModelId('pk.edu.ucp.deskhealthai'); // needed for Windows toasts

// ------------------------------------------------------------------ window
function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#f1f4f7',
    title: 'DeskHealth AI',
    icon: ICON,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show();
  });
  // X button: ask whether to keep tracking in the background or quit.
  // The answer can be remembered (Settings -> "When I close the window").
  win.on('close', async (e) => {
    if (quitting) return;
    e.preventDefault();
    let action = prefs.closeAction;
    if (action === 'ask') {
      const res = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Close DeskHealth AI',
        message: 'Keep tracking your posture in the background?',
        detail: 'In the background DeskHealth AI stays in the system tray (click ^ next to the clock) and keeps sending posture and distance alerts.',
        buttons: ['Keep running in background', 'Quit DeskHealth AI', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        checkboxLabel: "Remember my choice",
      });
      if (res.response === 2) return;
      action = res.response === 1 ? 'quit' : 'tray';
      if (res.checkboxChecked) { prefs.closeAction = action; savePrefs(); }
    }
    if (action === 'quit') quitApp();
    else hideToTray();
  });
  // Minimise works normally (taskbar button); tracking continues
  win.on('minimize', () => setPreview(false));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function hideToTray() {
  win.hide();
  setPreview(false);
  if (!prefs.trayHintShown && Notification.isSupported()) {
    new Notification({
      title: 'DeskHealth AI is still running',
      body: 'Posture tracking continues. Open it or quit from the tray icon (click ^ next to the clock).',
      icon: ICON,
    }).show();
    prefs.trayHintShown = true;
    savePrefs();
  }
}

function quitApp() {
  quitting = true;
  app.quit();
}

function showWindow(page) {
  if (!win) createWindow();
  win.show();
  win.focus();
  if (page) win.webContents.send('navigate', page);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function setPreview(enabled) {
  engine?.send('set_preview', { enabled });
}

// -------------------------------------------------------------------- tray
function trayIcon(size) {
  return nativeImage.createFromPath(ICON).resize({ width: size, height: size });
}

function stateLabel() {
  const s = lastStatus;
  if (s.state === 'Paused') {
    return s.paused_reasons?.includes('video_call') ? 'Paused - video call' : 'Paused';
  }
  const parts = [s.state];
  if (s.posture?.posture_score != null) parts.push(`score ${s.posture.posture_score}%`);
  if (s.distance_cm) parts.push(`${Math.round(s.distance_cm)} cm`);
  return parts.join(' · ');
}

function buildTrayMenu() {
  if (!tray) return;
  const paused = lastStatus.state === 'Paused';
  tray.setToolTip(`DeskHealth AI - ${stateLabel()}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `DeskHealth AI - ${stateLabel()}`, enabled: false },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => showWindow('dashboard') },
    { label: paused ? 'Resume Tracking' : 'Pause Tracking',
      click: () => engine.send(paused ? 'resume' : 'pause', paused ? {} : { reason: 'user' }) },
    { label: 'Snooze alerts', submenu: [
      { label: '15 minutes', click: () => snooze(15) },
      { label: '30 minutes', click: () => snooze(30) },
      { label: '1 hour', click: () => snooze(60) },
      { label: 'Cancel snooze', click: () => engine.send('unsnooze') },
    ] },
    { label: 'Recalibrate posture', click: () => showWindow('calibrate') },
    { type: 'separator' },
    { label: 'Quit DeskHealth AI', click: quitApp },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon(process.platform === 'darwin' ? 18 : 16));
  tray.on('click', () => showWindow());
  buildTrayMenu();
}

function snooze(minutes) {
  engine.send('snooze', { minutes });
  if (lastAlertId) engine.send('alert_action', { alert_id: lastAlertId, action: 'Snoozed' });
}

// ----------------------------------------------------------- notifications
function showNotification(alert) {
  send('engine-alert', alert);
  if (!alert.notify || !Notification.isSupported()) return;
  const n = new Notification({
    title: alert.title || 'DeskHealth AI',
    body: alert.message || '',
    icon: ICON,
    silent: false,
  });
  if (alert.alert_id) {
    lastAlertId = alert.alert_id;
    n.on('click', () => {
      engine.send('alert_action', { alert_id: alert.alert_id, action: 'Opened' });
      showWindow('alerts');
    });
    n.on('close', () => engine.send('alert_action', { alert_id: alert.alert_id, action: 'Dismissed' }));
  }
  n.show();
}

// ------------------------------------------------------------- engine/IPC
function startEngine() {
  const dbPath = path.join(app.getPath('userData'), 'deskhealth.db');
  engine = new EngineBridge(app, dbPath);
  engine.on('ready', (m) => {
    settings = m.settings;
    applyAutoPause();
    applyLoginItem();
    send('engine-ready', m);
  });
  engine.on('status', (s) => {
    const changed = s.state !== lastStatus.state;
    lastStatus = s;
    send('engine-status', s);
    if (changed) buildTrayMenu();
  });
  engine.on('frame', (f) => send('engine-frame', f.jpeg));
  engine.on('calibration', (c) => send('engine-calibration', c));
  engine.on('alert', showNotification);
  engine.on('camera_error', (e) => send('engine-camera-error', e));
  engine.on('log', (l) => { if (l.level !== 'info') console.log(`[engine:${l.level}]`, l.msg); });
  engine.on('fatal', (msg) => {
    send('engine-fatal', msg);
    dialog.showErrorBox('DeskHealth AI', msg);
  });
  engine.start();
}

function applyAutoPause() {
  if (settings.auto_pause_calls) {
    if (!callDetector) {
      callDetector = new CallDetector(1000);
      callDetector.on('change', (inCall, apps) => {
        if (inCall) engine.send('pause', { reason: 'video_call' });
        else engine.send('resume', { reason: 'video_call' });
        send('engine-call', { inCall, apps });
      });
    }
    callDetector.start();
  } else if (callDetector) {
    callDetector.stop();
    engine.send('resume', { reason: 'video_call' });
  }
}

function applyLoginItem() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!settings.launch_on_boot, args: ['--hidden'] });
}

const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => fn(payload || {}));

function registerIpc() {
  // Channels from the SDS API design
  handle('ipc-get-posture-stats', (p) => engine.request('get_stats', { date_range: p.date_range || 'weekly' }));
  handle('ipc-update-settings', async (p) => {
    settings = await engine.request('update_settings', p);
    applyAutoPause();
    applyLoginItem();
    return settings;
  });
  ipcMain.on('ipc-trigger-alert', (_e, p) => showNotification({ title: 'DeskHealth AI', message: p.msg, notify: true }));
  handle('ipc-camera-hardware', () => engine.request('list_cameras', {}, 30000));
  ipcMain.on('ipc-camera-pause', (_e, p) => engine.send('pause', { reason: p?.reason || 'user' }));
  ipcMain.on('ipc-camera-resume', (_e, p) => engine.send('resume', p?.reason ? { reason: p.reason } : {}));

  // Additional channels
  handle('ipc-get-settings', () => engine.request('get_settings'));
  handle('ipc-get-prefs', () => prefs);
  handle('ipc-set-prefs', (p) => {
    if (['ask', 'tray', 'quit'].includes(p.closeAction)) prefs.closeAction = p.closeAction;
    savePrefs();
    return prefs;
  });
  ipcMain.on('ipc-quit', () => quitApp());
  handle('ipc-reset-settings', async () => {
    settings = await engine.request('reset_settings');
    applyAutoPause();
    applyLoginItem();
    return settings;
  });
  handle('ipc-get-status', () => engine.request('get_status').catch(() => lastStatus));
  handle('ipc-calibrate', (p) => engine.request('calibrate', p));
  handle('ipc-clear-calibration', () => engine.request('clear_calibration'));
  handle('ipc-snooze', (p) => (p.minutes ? snooze(p.minutes) : engine.send('unsnooze')));
  ipcMain.on('ipc-set-preview', (_e, p) => setPreview(!!p?.enabled));
  handle('ipc-clear-history', () => engine.request('clear_history'));
  handle('ipc-export-csv', async () => {
    const res = await dialog.showSaveDialog(win, {
      title: 'Export posture data',
      defaultPath: `deskhealth-posture-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    return engine.request('export_csv', { path: res.filePath });
  });
}

// --------------------------------------------------------------- lifecycle
app.on('second-instance', () => showWindow());

app.whenReady().then(() => {
  loadPrefs();
  registerIpc();
  startEngine();
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in tray
app.on('activate', () => showWindow());
// Quit cleanly: stop the AI engine (and the camera) BEFORE the app exits, so
// no hidden process is left running that would block uninstalling.
app.on('before-quit', (e) => {
  quitting = true;
  if (shutdownDone) return;
  e.preventDefault();
  callDetector?.stop();
  const finish = () => {
    shutdownDone = true;
    tray?.destroy();
    app.exit(0);
  };
  (engine ? engine.stop() : Promise.resolve()).then(finish, finish);
});
