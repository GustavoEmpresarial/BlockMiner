import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../shared/auth/auth.store';
import { getAuthSatspayConfig, postAuthSatspayExchange } from './lib/login.api';

declare global {
  interface Window {
    SatsPay?: {
      signIn: (opts: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, opts?: Record<string, unknown>) => void;
      autoRender?: () => void;
      consumePkceVerifier?: (state?: string) => string | null;
    };
    onBlockMinerSatsPaySuccess?: (response: {
      code?: string;
      state?: string;
      code_verifier?: string;
    }) => void;
  }
}

function loadSdk(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.SatsPay) {
      resolve();
      return;
    }

    const finish = () => {
      if (window.SatsPay) resolve();
      else reject(new Error('sdk_load_failed'));
    };

    const existing = document.querySelector(
      'script[data-satspay-sdk="1"]',
    ) as HTMLScriptElement | null;
    if (existing) {
      // Script may already be loaded — `load` will never fire again.
      if (window.SatsPay || existing.dataset.loaded === '1') {
        finish();
        return;
      }
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearInterval(poll);
        if (ok) {
          existing.dataset.loaded = '1';
          resolve();
        } else {
          reject(new Error('sdk_load_failed'));
        }
      };
      existing.addEventListener('load', () => done(Boolean(window.SatsPay)));
      existing.addEventListener('error', () => done(false));
      let tries = 0;
      const poll = window.setInterval(() => {
        tries += 1;
        if (window.SatsPay) done(true);
        else if (tries >= 40) done(false);
      }, 50);
      return;
    }

    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.dataset.satspaySdk = '1';
    s.onload = () => {
      s.dataset.loaded = '1';
      finish();
    };
    s.onerror = () => reject(new Error('sdk_load_failed'));
    document.head.appendChild(s);
  });
}

type Props = {
  onError?: (message: string) => void;
};

/** Official SatsPay OAuth button — hidden when server config says disabled. */
export function SatspaySignInButton({ onError }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const checkSession = useAuthStore((s) => s.checkSession);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof getAuthSatspayConfig>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await getAuthSatspayConfig();
        if (cancelled) return;
        if (!c.enabled || !c.clientId) {
          setCfg(c);
          return;
        }
        await loadSdk(c.sdkUrl);
        if (cancelled) return;
        try {
          if (window.SatsPay) {
            const orig = window.SatsPay.signIn.bind(window.SatsPay);
            window.SatsPay.signIn = (opts: Record<string, unknown>) =>
              orig({ ...opts, mode: 'redirect' });
          }
        } catch {
          /* ignore */
        }
        setCfg(c);
        setReady(true);
      } catch {
        if (!cancelled) {
          setCfg({ enabled: false, clientId: '', redirectUri: '', sdkUrl: '', theme: 'light' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !cfg?.enabled) return;

    const swapOfficialLogo = () => {
      try {
        const buttons = document.querySelectorAll('.satspay-signin button');
        buttons.forEach((btn) => {
          if (btn.getAttribute('data-bm-satspay-logo') === '1') return;
          const svg = btn.querySelector('svg');
          if (!svg) return;
          const img = document.createElement('img');
          img.src = '/media/brand/satspay-icon-64.png';
          img.alt = '';
          img.width = 20;
          img.height = 20;
          img.style.cssText =
            'width:20px;height:20px;object-fit:contain;flex-shrink:0;border-radius:4px';
          svg.replaceWith(img);
          btn.setAttribute('data-bm-satspay-logo', '1');
        });
      } catch {
        /* ignore */
      }
    };

    window.onBlockMinerSatsPaySuccess = async (response) => {
      const code = String(response?.code || '').trim();
      if (!code) {
        onError?.(t('auth.login.errors.satspay_failed', { defaultValue: 'Login SatsPay falhou.' }));
        return;
      }
      let codeVerifier = String(response?.code_verifier || '').trim();
      if (!codeVerifier) {
        try {
          codeVerifier = String(
            window.SatsPay?.consumePkceVerifier?.(response?.state) || '',
          ).trim();
        } catch {
          codeVerifier = '';
        }
      }
      if (codeVerifier.length < 43) {
        onError?.(
          t('auth.login.errors.satspay_failed', { defaultValue: 'Login SatsPay falhou (PKCE).' }),
        );
        return;
      }
      setBusy(true);
      try {
        const { data } = await postAuthSatspayExchange({
          code,
          codeVerifier,
          redirectUri: cfg.redirectUri || undefined,
        });
        if (data?.ok) {
          await checkSession({ silent: true });
          navigate('/dashboard', { replace: true });
          return;
        }
        onError?.(
          String(
            data?.message ||
              t('auth.login.errors.satspay_failed', { defaultValue: 'Login SatsPay falhou.' }),
          ),
        );
      } catch (err) {
        const body = (err as { response?: { data?: { message?: string } } })?.response?.data;
        onError?.(
          String(
            body?.message ||
              t('auth.login.errors.satspay_failed', { defaultValue: 'Login SatsPay falhou.' }),
          ),
        );
      } finally {
        setBusy(false);
      }
    };

    try {
      window.SatsPay?.autoRender?.();
    } catch {
      /* ignore */
    }
    swapOfficialLogo();
    const t1 = window.setTimeout(swapOfficialLogo, 50);
    const t2 = window.setTimeout(swapOfficialLogo, 300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      delete window.onBlockMinerSatsPaySuccess;
    };
  }, [ready, cfg, navigate, onError, checkSession, t]);

  if (!cfg?.enabled || !ready) return null;

  return (
    <div className="relative w-full min-h-12">
      <style>{`
        .satspay-signin,
        .satspay-signin > div,
        .satspay-signin button {
          width: 100% !important;
          max-width: 100% !important;
          height: 48px !important;
          min-height: 48px !important;
          box-sizing: border-box !important;
        }
        .satspay-signin button {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 0.75rem !important;
        }
      `}</style>
      {busy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-950/50">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
        </div>
      )}
      <div
        className="satspay-signin w-full flex justify-center"
        data-client_id={cfg.clientId}
        data-redirect_uri={cfg.redirectUri}
        data-theme={cfg.theme}
        data-text="signin_with"
        data-size="large"
        data-onsuccess="onBlockMinerSatsPaySuccess"
      />
    </div>
  );
}
