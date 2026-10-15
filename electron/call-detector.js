// Detects when another application (Zoom, Teams, Meet in a browser...) wants
// the webcam, so the engine can release it (US-05 / NFR-02).
//
// Windows: Windows records camera usage per app in the registry
//   HKCU\...\CapabilityAccessManager\ConsentStore\webcam
//   LastUsedTimeStop == 0  ->  that app is using the camera right now.
// All platforms: a list of known "in meeting" processes (e.g. Zoom's CptHost).
const { execFile } = require('child_process');
const { EventEmitter } = require('events');

const WEBCAM_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam';
const MEETING_PROCESSES = ['cpthost', 'aomhost'];             // Zoom meeting helpers
const OWN_PROCESSES = ['deskhealth-engine', 'python', 'electron', 'deskhealth ai'];

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 4000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve(err ? '' : stdout));
  });
}

async function windowsCameraUsers() {
  const out = await run('reg', ['query', WEBCAM_KEY, '/s', '/v', 'LastUsedTimeStop']);
  const users = [];
  let key = null;
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('HKEY_')) key = line;
    else if (key && line.startsWith('LastUsedTimeStop')) {
      const value = line.split(/\s+/).pop();
      if (/^0x0+$/i.test(value)) {
        const name = key.split('\\').pop().replace(/#/g, '\\');
        const lower = name.toLowerCase();
        if (!OWN_PROCESSES.some((p) => lower.includes(p))) users.push(name);
      }
    }
  }
  return users;
}

async function runningMeetingProcesses() {
  const out = process.platform === 'win32'
    ? await run('tasklist', ['/fo', 'csv', '/nh'])
    : await run('ps', ['-Ao', 'comm']);
  const lower = out.toLowerCase();
  return MEETING_PROCESSES.filter((p) => lower.includes(p));
}

class CallDetector extends EventEmitter {
  constructor(intervalMs = 1000) {
    super();
    this.intervalMs = intervalMs;
    this.active = false;
    this.timer = null;
    this.tick = 0;
  }

  start() {
    if (this.timer) return;
    const loop = async () => {
      try { await this.check(); } catch { /* ignore */ }
      this.timer = setTimeout(loop, this.intervalMs);
    };
    loop();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.active) { this.active = false; this.emit('change', false, []); }
  }

  async check() {
    let apps = [];
    if (process.platform === 'win32') apps = await windowsCameraUsers();
    // process listing is heavier, check it every 3rd tick
    if (this.tick++ % 3 === 0 || this.lastProc?.length) {
      this.lastProc = await runningMeetingProcesses();
    }
    apps = apps.concat(this.lastProc || []);
    const active = apps.length > 0;
    if (active !== this.active) {
      this.active = active;
      this.emit('change', active, apps);
    }
  }
}

module.exports = { CallDetector };
