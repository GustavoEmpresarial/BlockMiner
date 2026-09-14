/**
 * Site keys públicas do Cloudflare Turnstile (login / register).
 *
 * Precedência:
 *  1. `import.meta.env.VITE_TURNSTILE_SITE_KEY_*` (build Vite)
 *  2. `window.__BLOCKMINER_ENV__` / `window.__BM_TURNSTILE_SITE_KEY__` (SPA pré-built)
 *
 * Sem key → TurnstileField renderiza null; sem secret no server o gate é no-op.
 */

type BlockminerEnv = {
  VITE_TURNSTILE_SITE_KEY?: string;
  VITE_TURNSTILE_SITE_KEY_LOGIN?: string;
  VITE_TURNSTILE_SITE_KEY_REGISTER?: string;
  VITE_TURNSTILE_SITE_KEY_FORGOT?: string;
};

declare global {
  interface Window {
    __BLOCKMINER_ENV__?: BlockminerEnv;
    __BM_TURNSTILE_SITE_KEY__?: string;
  }
}

function readVite(name: string): string {
  try {
    const env = import.meta.env as Record<string, unknown>;
    return String(env[name] ?? '').trim();
  } catch {
    return '';
  }
}

function readRuntime(...keys: Array<keyof BlockminerEnv | '__BM_TURNSTILE_SITE_KEY__'>): string {
  if (typeof window === 'undefined') return '';
  const bag = window.__BLOCKMINER_ENV__ ?? {};
  for (const key of keys) {
    if (key === '__BM_TURNSTILE_SITE_KEY__') {
      const v = String(window.__BM_TURNSTILE_SITE_KEY__ ?? '').trim();
      if (v) return v;
      continue;
    }
    const v = String(bag[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

export function resolveTurnstileSiteKeyLogin(): string {
  return (
    readVite('VITE_TURNSTILE_SITE_KEY_LOGIN') ||
    readVite('VITE_TURNSTILE_SITE_KEY') ||
    readRuntime('VITE_TURNSTILE_SITE_KEY_LOGIN', 'VITE_TURNSTILE_SITE_KEY', '__BM_TURNSTILE_SITE_KEY__')
  );
}

export function resolveTurnstileSiteKeyRegister(): string {
  return (
    readVite('VITE_TURNSTILE_SITE_KEY_REGISTER') ||
    readVite('VITE_TURNSTILE_SITE_KEY') ||
    readRuntime('VITE_TURNSTILE_SITE_KEY_REGISTER', 'VITE_TURNSTILE_SITE_KEY', '__BM_TURNSTILE_SITE_KEY__')
  );
}

export function resolveTurnstileSiteKeyForgot(): string {
  return (
    readVite('VITE_TURNSTILE_SITE_KEY_FORGOT') ||
    readVite('VITE_TURNSTILE_SITE_KEY') ||
    readRuntime('VITE_TURNSTILE_SITE_KEY_FORGOT', 'VITE_TURNSTILE_SITE_KEY', '__BM_TURNSTILE_SITE_KEY__')
  );
}

/** Generic / games — same public site key fallbacks. */
export function resolveTurnstileSiteKey(): string {
  return (
    readVite('VITE_TURNSTILE_SITE_KEY') ||
    resolveTurnstileSiteKeyLogin() ||
    resolveTurnstileSiteKeyRegister()
  );
}
