// Secure bridge between the sandboxed React UI and the Electron main process.
const { contextBridge, ipcRenderer } = require('electron');

function on(channel) {
  return (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('deskHealth', {
  getPostureStats: (dateRange = 'weekly') => ipcRenderer.invoke('ipc-get-posture-stats', { date_range: dateRange }),
  getSettings: () => ipcRenderer.invoke('ipc-get-settings'),
  updateSettings: (values) => ipcRenderer.invoke('ipc-update-settings', values),
  resetSettings: () => ipcRenderer.invoke('ipc-reset-settings'),
  getStatus: () => ipcRenderer.invoke('ipc-get-status'),
  listCameras: () => ipcRenderer.invoke('ipc-camera-hardware'),
  pause: (reason = 'user') => ipcRenderer.send('ipc-camera-pause', { reason }),
  resume: () => ipcRenderer.send('ipc-camera-resume', {}),
  snooze: (minutes) => ipcRenderer.invoke('ipc-snooze', { minutes }),
  calibrate: (knownDistanceCm) => ipcRenderer.invoke('ipc-calibrate', { known_distance_cm: knownDistanceCm || null }),
  clearCalibration: () => ipcRenderer.invoke('ipc-clear-calibration'),
  setPreview: (enabled) => ipcRenderer.send('ipc-set-preview', { enabled }),
  exportCsv: () => ipcRenderer.invoke('ipc-export-csv'),
  clearHistory: () => ipcRenderer.invoke('ipc-clear-history'),
  triggerAlert: (msg) => ipcRenderer.send('ipc-trigger-alert', { msg }),
  getPrefs: () => ipcRenderer.invoke('ipc-get-prefs'),
  setPrefs: (p) => ipcRenderer.invoke('ipc-set-prefs', p),
  quit: () => ipcRenderer.send('ipc-quit'),
  authStatus: () => ipcRenderer.invoke('ipc-auth-status'),
  authSetup: (name, password) => ipcRenderer.invoke('ipc-auth-setup', { name, password }),
  authLogin: (password) => ipcRenderer.invoke('ipc-auth-login', { password }),
  authLock: () => ipcRenderer.invoke('ipc-auth-lock'),
  authChange: (oldPassword, newPassword) => ipcRenderer.invoke('ipc-auth-change', { old: oldPassword, new: newPassword }),
  authReset: (confirm) => ipcRenderer.invoke('ipc-auth-reset', { confirm }),
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
});
