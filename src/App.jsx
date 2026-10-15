import React, { useEffect, useRef, useState } from 'react';
import { useEngine } from './lib/engine.jsx';
import { Sidebar, TopBar } from './components/Layout.jsx';
import { AlertToast, CalibrationModal } from './components/Live.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analytics from './pages/Analytics.jsx';
import Alerts from './pages/Alerts.jsx';
import Settings from './pages/Settings.jsx';

const TITLES = { dashboard: 'Dashboard', analytics: 'Analytics', alerts: 'Alerts', settings: 'Settings' };

export default function App() {
  const { bridge, status, fatal } = useEngine();
  const [page, setPage] = useState('dashboard');
  const [calibrating, setCalibrating] = useState(false);
  const askedCalibration = useRef(false);

  useEffect(() => bridge.onNavigate((p) => {
    if (p === 'calibrate') setCalibrating(true);
    else if (TITLES[p]) setPage(p);
  }), [bridge]);

  // first run: ask for calibration as soon as the engine reports it is needed
  useEffect(() => {
    if (status.state === 'Uncalibrated' && !askedCalibration.current) {
      askedCalibration.current = true;
      setCalibrating(true);
    }
  }, [status.state]);

  const openCalibration = () => setCalibrating(true);
  return (
    <div className="flex h-full">
      <Sidebar page={page} setPage={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={TITLES[page]} />
        <main className="flex-1 overflow-y-auto p-8">
          {fatal && <div className="mb-6 rounded-2xl border border-bad/50 bg-bad/10 px-6 py-4 text-sm text-bad">{fatal}</div>}
          {page === 'dashboard' && <Dashboard onCalibrate={openCalibration} />}
          {page === 'analytics' && <Analytics />}
          {page === 'alerts' && <Alerts />}
          {page === 'settings' && <Settings onCalibrate={openCalibration} />}
        </main>
      </div>
      <CalibrationModal open={calibrating} onClose={() => setCalibrating(false)} />
      <AlertToast />
    </div>
  );
}
