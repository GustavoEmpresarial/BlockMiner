import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Widget do Cloudflare Turnstile — porte de legacy/client/src/shared/components/auth/
 * TurnstileField.tsx (PROGRESSO.txt item 89).
 *
 * Contexto: o backend (`server/shared/security/turnstile.ts`) passou a validar tokens de
 * verdade contra o siteverify da Cloudflare. Sem este widget, ligar o secret no servidor
 * quebraria 100% dos logins/registros — o cliente nunca enviaria `cfTurnstileToken`. Os
 * dois lados são portados juntos por isso.
 *
 * Renderiza NULL quando não há site key configurada (`VITE_TURNSTILE_SITE_KEY*`), que é o
 * estado atual de produção — ou seja, portar isto não muda nada visualmente até alguém
 * decidir ligar o par completo (secret no servidor + site key no cliente).
 *
 * Desvio do legacy: a lógica de nonce CSP (`window.__BLOCKMINER_CSP_NONCE__`) não foi
 * portada — o CSP do current/ usa `'strict-dynamic'`, sob o qual um script injetado por um
 * script já confiado (o próprio bundle) é automaticamente confiado, tornando o nonce
 * desnecessário aqui. `challenges.cloudflare.com` já está no `scriptSrc`/`frameSrc` do
 * `core/http/middleware/csp.ts`.
 */

type TurnstileFieldProps = {
  onToken: (token: string) => void;
  siteKey?: string;
};

export type TurnstileFieldHandle = {
  /** Limpa o widget e o token — chamar após um login/registro falhado (token é single-use). */
  reset: () => void;
};

type TurnstileWidgetId = string | number | null;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => TurnstileWidgetId;
      remove?: (id: TurnstileWidgetId) => void;
      reset?: (id: TurnstileWidgetId) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function isTurnstileRenderable(): boolean {
  return typeof window !== 'undefined' && typeof window.turnstile?.render === 'function';
}

/** Carrega o script da Cloudflare uma única vez por página (idempotente e deduplicado). */
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (isTurnstileRenderable()) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  const p = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (isTurnstileRenderable()) {
        resolve();
        return;
      }
      // A API às vezes fica pronta um tick após o onload.
      setTimeout(() => {
        if (isTurnstileRenderable()) resolve();
        else reject(new Error('Turnstile API not ready after script load'));
      }, 0);
    };

    const existing = document.querySelector('script[src*="turnstile/v0/api.js"]');
    if (existing) {
      if (isTurnstileRenderable()) {
        finish();
        return;
      }
      const onLoad = () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        finish();
      };
      const onError = () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        turnstileScriptPromise = null;
        reject(new Error('Turnstile script load failed'));
      };
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => finish();
    s.onerror = () => {
      turnstileScriptPromise = null;
      reject(new Error('Turnstile script load failed'));
    };
    document.head.appendChild(s);
  });

  turnstileScriptPromise = p.catch((e) => {
    turnstileScriptPromise = null;
    throw e;
  });
  return turnstileScriptPromise;
}

/** Pré-carrega o script no mount da página de login/registro, pro widget aparecer antes. */
// eslint-disable-next-line react-refresh/only-export-components -- helper companheiro deste field, chamado de effects de página.
export function prefetchTurnstileScript(): Promise<void> {
  return loadTurnstileScript();
}

const TurnstileField = forwardRef<TurnstileFieldHandle, TurnstileFieldProps>(function TurnstileField(
  { onToken, siteKey },
  ref,
) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<TurnstileWidgetId>(null);
  const onTokenRef = useRef(onToken);
  useLayoutEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const resolvedSiteKey = String(siteKey || '').trim();
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading');

  useImperativeHandle(ref, () => ({
    reset: () => {
      try {
        if (widgetId.current != null && window.turnstile?.reset) {
          window.turnstile.reset(widgetId.current);
        }
      } catch {
        /* widget já desmontado — nada a fazer */
      }
      onTokenRef.current?.('');
    },
  }));

  useLayoutEffect(() => {
    if (!resolvedSiteKey) return undefined;
    let cancelled = false;
    setBootState('loading');

    const mountWidget = async () => {
      try {
        await loadTurnstileScript();
        if (cancelled) return;
        if (!hostRef.current || !window.turnstile) {
          setBootState('error');
          onTokenRef.current?.('');
          return;
        }
        if (widgetId.current != null && window.turnstile.remove) {
          try {
            window.turnstile.remove(widgetId.current);
          } catch {
            /* ignore */
          }
          widgetId.current = null;
        }
        const baseOpts: Record<string, unknown> = {
          sitekey: resolvedSiteKey,
          appearance: 'always',
          theme: 'dark',
          'refresh-expired': 'auto',
          callback: (token: string) => onTokenRef.current?.(token),
          'expired-callback': () => onTokenRef.current?.(''),
          'error-callback': () => onTokenRef.current?.(''),
        };
        // `size: flexible` é recente; cai pra `normal` e depois pro default em runtimes antigos.
        try {
          widgetId.current = window.turnstile.render(hostRef.current, { ...baseOpts, size: 'flexible' });
        } catch {
          try {
            widgetId.current = window.turnstile.render(hostRef.current, { ...baseOpts, size: 'normal' });
          } catch {
            widgetId.current = window.turnstile.render(hostRef.current, baseOpts);
          }
        }
        if (!cancelled) setBootState('ready');
      } catch {
        if (!cancelled) {
          setBootState('error');
          onTokenRef.current?.('');
        }
      }
    };

    void mountWidget();

    return () => {
      cancelled = true;
      try {
        if (widgetId.current != null && window.turnstile?.remove) {
          window.turnstile.remove(widgetId.current);
        }
      } catch {
        /* ignore */
      }
      widgetId.current = null;
    };
  }, [resolvedSiteKey]);

  // Sem site key => feature desligada => nada renderiza (estado atual de produção).
  if (!resolvedSiteKey) return null;

  return (
    <div className="relative my-3 w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-sm">
      <p className="px-3 pt-2.5 text-center text-[11px] font-medium leading-snug text-slate-100">
        {t('auth.turnstile.human_prompt')}
      </p>
      <div className="w-full px-1 pb-2 pt-1 [zoom:0.9] min-[400px]:[zoom:0.95] sm:[zoom:1]">
        <div ref={hostRef} className="min-h-[65px] w-full min-w-[300px] max-w-full" />
      </div>
      {bootState === 'loading' && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-800/80 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="animate-pulse text-[10px] font-bold uppercase tracking-widest text-slate-200">
            {t('auth.turnstile.loading')}
          </span>
        </div>
      )}
      {bootState === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-800/95 px-3">
          <p className="text-center text-[10px] font-semibold leading-relaxed text-red-300">
            {t('auth.turnstile.load_failed')}
          </p>
        </div>
      )}
    </div>
  );
});

TurnstileField.displayName = 'TurnstileField';

export default TurnstileField;
