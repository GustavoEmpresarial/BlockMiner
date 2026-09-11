/**
 * Site-wide maintenance gate — pure helpers (testable) + Express middleware.
 * SITE_MAINTENANCE=1 → 503 for public traffic on the main host(s).
 * SITE_MAINTENANCE_BYPASS_HOSTS=dev.blockminer.space → those hosts stay fully open.
 * Health + /admin* remain available even on hosts under maintenance.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";

function envFlagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function siteMaintenanceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlagOn(env.SITE_MAINTENANCE);
}

/** Comma/space-separated hostnames that skip maintenance entirely. */
export function siteMaintenanceBypassHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = String(env.SITE_MAINTENANCE_BYPASS_HOSTS ?? "").trim();
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const host = part.trim().toLowerCase().replace(/\.$/, "");
    if (host) out.add(host);
  }
  return out;
}

export function normalizeRequestHost(rawHost: string): string {
  return rawHost.toLowerCase().split(":")[0]?.replace(/\.$/, "") ?? "";
}

export function resolveRequestHost(headers: {
  host?: string | string[];
  "x-forwarded-host"?: string | string[];
}): string {
  const xf = headers["x-forwarded-host"];
  const xfFirst = Array.isArray(xf) ? xf[0] : xf;
  const hostHeader = headers.host;
  const hostFirst = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const raw =
    (typeof xfFirst === "string" && xfFirst.split(",")[0]?.trim()) ||
    (typeof hostFirst === "string" ? hostFirst : "") ||
    "";
  return normalizeRequestHost(raw);
}

export function isMaintenanceBypassHost(
  host: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!host) return false;
  return siteMaintenanceBypassHosts(env).has(host);
}

export function isPathAllowedDuringMaintenance(path: string): boolean {
  if (path === "/health" || path === "/api/health") return true;
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-t")) return true;
  if (path.startsWith("/api/admin")) return true;
  if (path.startsWith("/assets/")) return true;
  // Catalog / inventory art must load even while the SPA is gated — otherwise shop
  // cards show broken images under SITE_MAINTENANCE on the primary host.
  if (path === "/media" || path.startsWith("/media/")) return true;
  // Mini-game sprites live under /games/<title>/*.png (not Vite hashed /assets).
  if (path.startsWith("/games/") && /\.(png|jpe?g|webp|gif|svg|json|mp3|ogg|wav)$/i.test(path)) {
    return true;
  }
  if (path === "/favicon.ico") return true;
  // OAuth browser callbacks + config/exchange must work on the primary host during maintenance.
  if (
    path === "/api/auth/google/callback" ||
    path === "/api/auth/satspay/callback" ||
    path === "/api/auth/google/config" ||
    path === "/api/auth/satspay/config" ||
    path === "/api/auth/google" ||
    path === "/api/auth/satspay"
  ) {
    return true;
  }
  // Login / register SPA routes (HTML) so OAuth buttons remain usable while gated.
  if (path === "/login" || path === "/register" || path.startsWith("/login?") || path.startsWith("/register?")) {
    return true;
  }
  return false;
}

export function wantsMaintenanceHtml(opts: {
  method: string;
  path: string;
  accept?: string;
}): boolean {
  const accept = String(opts.accept ?? "");
  if (accept.includes("text/html")) return true;
  const path = opts.path || "";
  if (path.startsWith("/api/") || path.startsWith("/socket.io") || path.startsWith("/media/")) {
    return false;
  }
  return opts.method === "GET" || opts.method === "HEAD";
}

function requestHost(req: Request): string {
  return resolveRequestHost(req.headers as { host?: string; "x-forwarded-host"?: string });
}

function wantsHtml(req: Request): boolean {
  return wantsMaintenanceHtml({
    method: req.method,
    path: req.path || "",
    accept: typeof req.headers.accept === "string" ? req.headers.accept : undefined,
  });
}

function isAllowedDuringMaintenance(req: Request): boolean {
  return isPathAllowedDuringMaintenance(req.path || "");
}

function isBypassHost(req: Request): boolean {
  return isMaintenanceBypassHost(requestHost(req));
}

const MAINTENANCE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="theme-color" content="#070b14" />
  <title>BlockMiner</title>
  <link rel="icon" href="/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Sora:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #070b14;
      --ink: #e8eef8;
      --muted: #8b9bb4;
      --cyan: #22d3ee;
      --cyan-dim: rgba(34, 211, 238, 0.14);
      --line: rgba(148, 163, 184, 0.18);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font-family: "Sora", system-ui, sans-serif;
      background:
        radial-gradient(900px 520px at 50% -8%, rgba(14, 165, 233, 0.18), transparent 58%),
        radial-gradient(700px 420px at 85% 90%, rgba(34, 211, 238, 0.08), transparent 50%),
        linear-gradient(180deg, #0a1220 0%, var(--bg) 45%, #05080f 100%);
      overflow: hidden;
    }
    .grid {
      position: fixed; inset: 0; pointer-events: none; opacity: 0.22;
      background-image:
        linear-gradient(var(--line) 1px, transparent 1px),
        linear-gradient(90deg, var(--line) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(ellipse at center, #000 20%, transparent 75%);
      animation: drift 28s linear infinite;
    }
    .scan {
      position: fixed; left: 0; right: 0; height: 28%;
      background: linear-gradient(180deg, transparent, rgba(34, 211, 238, 0.05), transparent);
      animation: scan 7.5s ease-in-out infinite;
      pointer-events: none;
    }
    .wrap {
      position: relative; z-index: 1;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 2rem 1.25rem;
    }
    .stage {
      width: min(560px, 100%);
      text-align: center;
    }
    .mark {
      width: 72px; height: 72px; margin: 0 auto 1.5rem;
      border-radius: 22px;
      display: grid; place-items: center;
      background: linear-gradient(145deg, rgba(34, 211, 238, 0.2), rgba(14, 165, 233, 0.05));
      border: 1px solid rgba(34, 211, 238, 0.35);
      box-shadow: 0 0 0 8px var(--cyan-dim), 0 20px 50px rgba(0, 0, 0, 0.35);
      animation: pulse 2.8s ease-in-out infinite;
    }
    .mark svg { width: 34px; height: 34px; color: var(--cyan); }
    .brand {
      margin: 0;
      font-family: "Orbitron", sans-serif;
      font-weight: 800;
      font-size: clamp(2rem, 7vw, 3.1rem);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1.05;
      background: linear-gradient(180deg, #f8fbff 10%, #9adcf5 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .status {
      margin: 1.1rem 0 0;
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      color: var(--cyan);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--cyan);
      box-shadow: 0 0 12px var(--cyan);
      animation: blink 1.4s ease-in-out infinite;
    }
    .copy {
      margin: 1.15rem auto 0;
      max-width: 34rem;
      color: var(--muted);
      font-size: 1.02rem;
      line-height: 1.65;
      font-weight: 400;
    }
    .bar {
      margin: 2rem auto 0;
      width: min(280px, 70%);
      height: 3px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.15);
      overflow: hidden;
    }
    .bar > span {
      display: block; height: 100%; width: 40%;
      border-radius: inherit;
      background: linear-gradient(90deg, transparent, var(--cyan), transparent);
      animation: load 2.2s ease-in-out infinite;
    }
    @keyframes drift {
      from { transform: translateY(0); }
      to { transform: translateY(64px); }
    }
    @keyframes scan {
      0%, 100% { top: -10%; opacity: 0; }
      15% { opacity: 1; }
      50% { top: 80%; opacity: 0.6; }
      85% { opacity: 0; }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 8px var(--cyan-dim), 0 20px 50px rgba(0,0,0,.35); }
      50% { transform: scale(1.03); box-shadow: 0 0 0 14px rgba(34,211,238,.08), 0 24px 60px rgba(0,0,0,.4); }
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }
    @keyframes load {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(320%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .grid, .scan, .mark, .dot, .bar > span { animation: none; }
    }
  </style>
</head>
<body>
  <div class="grid" aria-hidden="true"></div>
  <div class="scan" aria-hidden="true"></div>
  <div class="wrap">
    <main class="stage">
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2 4.5 6.5v11L12 22l7.5-4.5v-11L12 2Z"/>
          <path d="M12 22V12"/>
          <path d="m4.5 6.5 7.5 5.5 7.5-5.5"/>
        </svg>
      </div>
      <h1 class="brand">BlockMiner</h1>
      <p class="status"><span class="dot" aria-hidden="true"></span>Sistemas em manutenção</p>
      <p class="copy">Estamos atualizando a rede de mineração. O painel volta em breve — seu progresso e saldo permanecem seguros.</p>
      <div class="bar" aria-hidden="true"><span></span></div>
    </main>
  </div>
</body>
</html>`;

export function createSiteMaintenanceMiddleware(
  env: NodeJS.ProcessEnv = process.env,
): RequestHandler {
  return function siteMaintenanceMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!siteMaintenanceEnabled(env)) {
      next();
      return;
    }
    if (isMaintenanceBypassHost(requestHost(req), env)) {
      next();
      return;
    }
    if (isAllowedDuringMaintenance(req)) {
      next();
      return;
    }

    res.setHeader("Retry-After", "3600");
    res.setHeader("Cache-Control", "no-store");
    if (wantsHtml(req)) {
      res.status(503).type("html").send(MAINTENANCE_HTML);
      return;
    }
    res.status(503).json({
      ok: false,
      code: "SITE_MAINTENANCE",
      message: "Site em manutenção. Tente novamente em breve.",
    });
  };
}
