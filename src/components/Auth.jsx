import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { bridge } from '../lib/engine.jsx';

// Security layer: the dashboard, history, settings and camera preview are
// only shown after the profile password is entered. The password is checked
// (and stored as a salted hash) by the Python engine, never in the UI.
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function Shell({ children }) {
  return (
    <div className="flex h-full items-center justify-center bg-ink-950 p-6">
      <div className="card w-full max-w-[440px] p-8">
        <div className="mb-6 whitespace-nowrap font-display text-[22px] font-extrabold tracking-tight">
          <span className="text-good">Desk</span><span className="text-head">Health</span>
          <span className="ml-1 font-sans text-base font-medium text-mute-400">AI</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, id, ...props }) {
  return (
    <label htmlFor={id} className="mb-4 block text-sm text-mute-300">
      {label}
      <input
        id={id}
        {...props}
        className="mt-1.5 w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 text-[15px] text-mute-200 outline-none focus:border-good"
      />
    </label>
  );
}

function errText(e) {
  const m = String(e?.message || e || '');
  // Electron prefixes errors from the main process
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Something went wrong.';
}

function SetupScreen({ onDone }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 6) return setErr('The password must be at least 6 characters long.');
    if (pw !== pw2) return setErr('The two passwords are not the same.');
    setBusy(true);
    try { onDone(await bridge.authSetup(name, pw)); } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };
  return (
    <Shell>
      <h1 className="font-display text-xl font-extrabold text-head">Create your profile</h1>
      <p className="mb-6 mt-2 text-sm leading-relaxed text-mute-400">
        Your posture history is stored only on this computer. The password protects your dashboard,
        history, settings and camera preview from other people using this computer.
      </p>
      <form onSubmit={submit}>
        <Field label="Your name" id="setup-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus required />
        <Field label="Password (at least 6 characters)" id="setup-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <Field label="Repeat password" id="setup-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        {err && <p className="mb-4 text-sm text-bad">{err}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create profile'}
        </button>
      </form>
      <p className="mt-4 text-xs text-mute-400">There is no online account: if you forget the password, the only way back in is to erase this computer&apos;s DeskHealth data.</p>
    </Shell>
  );
}

function LoginScreen({ status, onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(status.locked_for || 0);
  const [resetMode, setResetMode] = useState(false);
  const [confirm, setConfirm] = useState('');
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      onDone(await bridge.authLogin(pw));
    } catch (x) {
      setErr(errText(x));
      setPw('');
      const st = await bridge.authStatus().catch(() => null);
      if (st?.locked_for) setWait(st.locked_for);
    }
    setBusy(false);
  };
  const reset = async () => {
    setBusy(true);
    try { onDone(await bridge.authReset(confirm)); } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };

  if (resetMode) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-extrabold text-head">Forgot your password?</h1>
        <p className="mb-5 mt-2 text-sm leading-relaxed text-mute-400">
          The password cannot be recovered, because it is never stored. You can erase this computer&apos;s
          DeskHealth data (posture history, alerts, calibration and settings) and create a new profile.
        </p>
        <Field label='Type RESET to erase all DeskHealth data' id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoFocus />
        {err && <p className="mb-4 text-sm text-bad">{err}</p>}
        <div className="flex gap-3">
          <button type="button" className="btn flex-1 justify-center" onClick={() => { setResetMode(false); setErr(''); }}>Back</button>
          <button type="button" className="btn btn-danger flex-1 justify-center" disabled={busy || confirm !== 'RESET'} onClick={reset}>Erase and start again</button>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <h1 className="font-display text-xl font-extrabold text-head">Welcome back{status.profile_name ? `, ${status.profile_name}` : ''}</h1>
      <p className="mb-6 mt-2 text-sm text-mute-400">Posture tracking keeps running in the background. Enter your password to open the dashboard.</p>
      <form onSubmit={submit}>
        <Field label="Password" id="login-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" disabled={wait > 0} />
        {wait > 0 ? (
          <p className="mb-4 text-sm text-bad">Too many wrong attempts. Try again in {wait} s.</p>
        ) : err && <p className="mb-4 text-sm text-bad">{err}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy || wait > 0 || !pw}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
      <button type="button" className="mt-4 text-xs text-mute-400 underline hover:text-mute-200" onClick={() => setResetMode(true)}>
        Forgot password?
      </button>
    </Shell>
  );
}

export function AuthGate({ children }) {
  const [status, setStatus] = useState(null);
  const refresh = useCallback(() => {
    bridge.authStatus().then(setStatus).catch(() => setTimeout(refresh, 1000)); // engine still starting
  }, []);
  useEffect(() => {
    refresh();
    return bridge.onLocked?.(() => refresh());
  }, [refresh]);

  const lock = async () => setStatus(await bridge.authLock());
  if (!status) {
    return <Shell><p className="text-sm text-mute-400">Starting DeskHealth AI…</p></Shell>;
  }
  if (!status.has_password) return <SetupScreen onDone={setStatus} />;
  if (!status.unlocked) return <LoginScreen key={String(status.locked_for)} status={status} onDone={setStatus} />;
  return <AuthContext.Provider value={{ status, lock, setStatus }}>{children}</AuthContext.Provider>;
}
