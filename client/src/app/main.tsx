import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { i18nReady } from '../i18n/config';
import App from './App';
import RootErrorBoundary from './RootErrorBoundary';
import { Toaster } from 'sonner';
import { api } from '../shared/auth/auth.store';
import { installAxiosClientErrorReporting } from '../shared/utils/installAxiosClientErrorReporting';

installAxiosClientErrorReporting(api);

// Wait for the active locale chunk only (~1 JSON) before first paint — other locales lazy-load.
// Mirrors legacy/client/src/main.tsx.
void i18nReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors={false}
        expand
        toastOptions={{
          className:
            'bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-xl text-white font-mono text-[10px] uppercase tracking-widest p-4 shadow-2xl',
          style: {
            background: 'rgba(2, 6, 23, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: '#fff',
          },
          classNames: {
            error: 'border-red-500/30 !text-red-400',
            success: 'border-emerald-500/30 !text-emerald-400',
            warning: 'border-orange-500/30 !text-orange-400',
            info: 'border-blue-500/30 !text-blue-400',
          },
        }}
      />
    </StrictMode>,
  );
});
