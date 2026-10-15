// Spawns and talks to the Python AI engine over stdin/stdout (newline JSON).
const { spawn, execFileSync } = require('child_process');

function killTree(pid) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch { /* already gone */ }
}
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

function findEngineCommand(app) {
  // 1. packaged build: PyInstaller executable shipped in resources/engine
  if (app.isPackaged) {
    // portable build: bundled Python runtime + engine source
    const bundledPython = path.join(process.resourcesPath, 'engine', 'python', 'python.exe');
    if (fs.existsSync(bundledPython)) {
      return { cmd: bundledPython, args: ['-u', path.join(process.resourcesPath, 'engine', 'app', 'main.py')] };
    }
    const exe = process.platform === 'win32' ? 'deskhealth-engine.exe' : 'deskhealth-engine';
    return { cmd: path.join(process.resourcesPath, 'engine', exe), args: [] };
  }
  // 2. development: python + engine/main.py
  const root = path.join(__dirname, '..');
  const script = path.join(root, 'engine', 'main.py');
  const candidates = [
    process.env.DESKHEALTH_PYTHON,
    path.join(root, 'engine', '.venv', 'Scripts', 'python.exe'),
    path.join(root, 'engine', '.venv', 'bin', 'python'),
    path.join(root, '.venv', 'Scripts', 'python.exe'),
    path.join(root, '.venv', 'bin', 'python'),
  ].filter(Boolean);
  const python = candidates.find((p) => fs.existsSync(p)) ||
    (process.platform === 'win32' ? 'python' : 'python3');
  return { cmd: python, args: ['-u', script] };
}

class EngineBridge extends EventEmitter {
  constructor(app, dbPath) {
    super();
    this.app = app;
    this.dbPath = dbPath;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.restarts = 0;
    this.stopping = false;
  }

  start() {
    const { cmd, args } = findEngineCommand(this.app);
    this.proc = spawn(cmd, [...args, '--db', this.dbPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', GLOG_minloglevel: '2', TF_CPP_MIN_LOG_LEVEL: '2' },
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => this._onData(chunk));
    this.proc.stderr.on('data', (d) => {
      const text = d.toString();
      // MediaPipe prints harmless INFO/WARNING lines to stderr
      if (!/^(W0000|I0000|INFO|WARNING)/m.test(text)) console.error('[engine]', text.trim());
    });
    this.proc.on('error', (err) => {
      this.emit('fatal', `Could not start the AI engine (${cmd}): ${err.message}`);
    });
    this.proc.on('exit', (code) => {
      for (const { reject } of this.pending.values()) reject(new Error('engine exited'));
      this.pending.clear();
      this.proc = null;
      if (this.stopping) return;
      this.emit('exit', code);
      if (this.restarts < 5) {
        this.restarts += 1;
        setTimeout(() => this.start(), 2000);
      } else {
        this.emit('fatal', 'The AI engine stopped repeatedly. Check the Python installation.');
      }
    });
  }

  _onData(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === 'response') {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          clearTimeout(p.timer);
          msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error));
        }
      } else {
        if (msg.type === 'ready') this.restarts = 0;
        this.emit('message', msg);
        this.emit(msg.type, msg);
      }
    }
  }

  send(cmd, args = {}) {
    if (!this.proc) return;
    this.proc.stdin.write(JSON.stringify({ cmd, args }) + '\n');
  }

  request(cmd, args = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(new Error('engine not running'));
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`engine timeout: ${cmd}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    });
  }

  // Ask the engine to shut down; if it hasn't exited after `timeoutMs`, kill
  // it together with any child processes. Resolves once it is gone, so the
  // app never leaves a hidden engine process running (it would block
  // uninstalling).
  stop(timeoutMs = 2500) {
    this.stopping = true;
    const p = this.proc;
    if (!p || p.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); resolve(); };
      p.once('exit', done);
      const timer = setTimeout(() => {
        killTree(p.pid);
        setTimeout(resolve, 300);
      }, timeoutMs);
      try { this.send('shutdown'); p.stdin.end(); } catch { /* ignore */ }
    });
  }
}

module.exports = { EngineBridge, killTree };
