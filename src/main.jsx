import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/syne/700.css';
import '@fontsource/syne/800.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';
import App from './App.jsx';
import { EngineProvider } from './lib/engine.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EngineProvider>
      <App />
    </EngineProvider>
  </React.StrictMode>,
);
