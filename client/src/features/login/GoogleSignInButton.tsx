import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { getAuthGoogleConfig } from './lib/login.api';
import {
  createGoogleOAuthState,
  createGooglePkcePair,
  googlePkceSessionKey,
} from './lib/googlePkce';

type Props = {
  onError?: (message: string) => void;
};

/** Google OAuth redirect + PKCE — hidden when server config says disabled. */
export function GoogleSignInButton({ onError }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof getAuthGoogleConfig>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await getAuthGoogleConfig();
        if (!cancelled) setCfg(c);
      } catch {
        if (!cancelled) {
          setCfg({
            enabled: false,
            clientId: '',
            redirectUri: '',
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            scope: 'openid email profile',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cfg?.enabled || !cfg.clientId) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const state = createGoogleOAuthState();
      const { verifier, challenge } = await createGooglePkcePair();
      try {
        sessionStorage.setItem(googlePkceSessionKey(state), verifier);
      } catch {
        onError?.(t('auth.login.errors.google_failed'));
        return;
      }
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: cfg.scope,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      window.location.assign(`${cfg.authUrl}?${params.toString()}`);
    } catch {
      onError?.(t('auth.login.errors.google_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full">
      {busy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-950/50">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
        </div>
      )}
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="bm-oauth-btn w-full h-12 inline-flex items-center justify-center gap-3 rounded-xl border border-white/15 bg-white text-sm font-semibold text-slate-800 shadow-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-5.522 0-10-4.478-10-10s4.478-10 10-10c2.523 0 4.817.943 6.563 2.488l5.657-5.657C34.046 9.053 29.268 7 24 7 12.955 7 4 15.955 4 27s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
          />
          <path
            fill="#FF3D00"
            d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c2.523 0 4.817.943 6.563 2.488l5.657-5.657C34.046 9.053 29.268 7 24 7 15.323 7 7.981 12.352 6.306 14.691z"
          />
          <path
            fill="#4CAF50"
            d="M24 47c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 37.548 26.715 38.5 24 38.5c-5.059 0-9.345-3.352-10.947-7.946l-6.52 5.025C7.878 42.388 15.319 47 24 47z"
          />
          <path
            fill="#1976D2"
            d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 0 1-4.087 5.571l6.19 5.238C42.022 36.358 44 31.955 44 27c0-1.341-.138-2.65-.389-3.917z"
          />
        </svg>
        {t('auth.login.google_sign_in')}
      </button>
    </div>
  );
}
