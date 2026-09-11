/**
 * Serves the built client/ SPA (client/dist) from the same Express process — no separate
 * static-file server needed, nginx just proxies everything to this app (see
 * nginx/nginx.vm5000.conf: `location /` and `location ^~ /assets/` both proxy_pass to $bm_app).
 *
 * Ported from legacy/server/utils/spaStatic.ts. Deviations (documented, not accidental):
 * - Dropped the WalletConnect runtime-config injection (`__BLOCKMINER_ENV__` /
 *   `resolveWalletConnectProjectIdFromEnv`) and the `/crypto-broadcast` static board —
 *   neither exists in current/'s scope (wallet linking here is injected-provider only, no
 *   WalletConnect; no crypto-broadcast feature was ported). `window.__BLOCKMINER_ENV__` is
 *   still read optionally client-side (game.store.ts) and degrades gracefully to `undefined`
 *   without this injection — not a silent breakage, just an unported nice-to-have.
 * - Dropped `adminOnlyMode` — current/ has no equivalent env-gated "admin-only deploy" mode.
 * - Kept: static asset serving with the same cache-header rules, the API/media/socket.io/
 *   assets 404 differentiation (so a bad /api/* or /media/* request never gets HTML back),
 *   and CSP nonce injection into every <script> tag — current/'s own CSP middleware
 *   (core/http/middleware/csp.ts) already emits `'nonce-${res.locals.cspNonce}'` +
 *   'strict-dynamic', but nothing was ever setting `res.locals.cspNonce` before this, since
 *   no HTML was served yet. That gap becomes load-bearing the moment this file is wired in.
 */
import path from "path";
import { existsSync } from "fs";
import type { Express, Request, Response } from "express";
import express from "express";

export interface ClientDistPaths {
  distPath: string;
  indexPath: string;
  indexExists: boolean;
}

export function resolveClientDistPaths(projectRoot: string): ClientDistPaths {
  const distPath = path.resolve(projectRoot, "client", "dist");
  const indexPath = path.join(distPath, "index.html");
  return { distPath, indexPath, indexExists: existsSync(indexPath) };
}

/** Browser paths under `/api` must never hit the SPA fallback. */
export function isApiRequestPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Browser paths under `/media` are served only by the media static middleware. */
export function isUploadsRequestPath(pathname: string): boolean {
  return pathname === "/media" || pathname.startsWith("/media/");
}

/** Vite build output lives under `/assets/*`. */
export function isAssetsRequestPath(pathname: string): boolean {
  return pathname === "/assets" || pathname.startsWith("/assets/");
}

/** Socket.IO engine path — must never return SPA HTML. */
export function isSocketIoRequestPath(pathname: string): boolean {
  return pathname === "/socket.io" || pathname.startsWith("/socket.io/");
}

/** Missing hashed bundles must not be rewritten to index.html. */
export function isBundledAssetExtensionPath(pathname: string): boolean {
  return /\.(m?js|css|wasm|map)(\?.*)?$/i.test(pathname);
}

export function applyNoStoreHtmlHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

/**
 * The SPA entry bundle and the locale bundles are NOT content-hashed — they carry a
 * hand-maintained version suffix (`index-inv2plus40.js`, `pt-BR-inv2plus40.js`), written by
 * scripts/patch-*-inv2plus*.py into FIXED destination names. Re-running a patch at the same
 * VER republishes different bytes under the same URL, so `immutable` there pins every browser
 * that already fetched it to the old build forever (only a cache-bypassing hard reload
 * recovers). These must revalidate; only the genuinely content-hashed chunks Vite emits
 * (`BoostsTab-DLpqOBFw.js`) may be immutable.
 */
export function isManualVersionEntryAsset(filePath: string): boolean {
  return /-inv2plus[0-9]+\.(m?js|css)$/i.test(path.basename(filePath));
}

export function applyRevalidateAssetHeaders(res: Response): void {
  res.setHeader("Cache-Control", "public, no-cache, must-revalidate");
  res.setHeader("CDN-Cache-Control", "no-cache");
}

function isHashedAssetPath(filePath: string): boolean {
  if (isManualVersionEntryAsset(filePath)) return false;
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/assets/")) return true;
  const base = path.basename(filePath);
  return /[-.][0-9A-Za-z_-]{7,}\.(m?js|css|wasm)$/i.test(base);
}

function sendAssetNotFound(res: Response): void {
  // Never allow CDN/browser to pin a missing hashed URL (nginx used to stamp immutable
  // on /assets/* including upstream 404 → sticky application/json 404 forever).
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.status(404).json({ ok: false, code: "ASSET_NOT_FOUND", message: "Asset não encontrado." });
}

function sendReservedRouteNotFound(res: Response): void {
  res.status(404).json({ ok: false, code: "ROUTE_NOT_FOUND", message: "Rota não encontrada." });
}

export function attachClientDistStatic(app: Express, distPath: string, indexExists: boolean): void {
  if (!indexExists) return;

  const adminTournamentsIndex = path.join(distPath, "admin-t", "index.html");
  app.get(["/admin-t", "/admin-t/", "/admin-t/index.html"], async (req, res, next) => {
    if (!existsSync(adminTournamentsIndex)) {
      next();
      return;
    }
    try {
      const fs = await import("fs/promises");
      let html = await fs.readFile(adminTournamentsIndex, "utf8");
      const nonce = typeof res.locals.cspNonce === "string" ? res.locals.cspNonce : "";
      if (nonce) {
        html = html.replace(/<script(?![^>]*\snonce=)/g, `<script nonce="${nonce}"`);
      }
      applyNoStoreHtmlHeaders(res);
      res.type("html");
      res.send(html);
    } catch (error) {
      next(error);
    }
  });

  app.use(
    express.static(distPath, {
      index: false,
      fallthrough: true,
      // Some mobile clients + HTTP/2 + nginx proxy stall on 206 Range chains for module
      // scripts — full-file 200 is safer here (same reasoning as legacy).
      acceptRanges: false,
      setHeaders(res, filePath) {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        const normalized = filePath.replace(/\\/g, "/");
        if (normalized.endsWith("/index.html") || path.basename(filePath) === "index.html") {
          applyNoStoreHtmlHeaders(res);
          return;
        }
        if (isManualVersionEntryAsset(filePath)) {
          applyRevalidateAssetHeaders(res);
          res.setHeader("X-Content-Type-Options", "nosniff");
          return;
        }
        if (isHashedAssetPath(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.setHeader("X-Content-Type-Options", "nosniff");
          return;
        }
        if (/\.(png|jpe?g|webp|gif|ico|svg)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );

  /** Only reached when `express.static` did not find the file (fallthrough). */
  app.use("/assets", (_req: Request, res: Response) => sendAssetNotFound(res));
}

export type SpaIndexRenderer = (html: string, ctx: { nonce: string }) => string;

export interface SpaFallbackOptions {
  indexPath: string;
  indexExists: boolean;
  renderIndex: SpaIndexRenderer;
  onMissingIndex?: (res: Response) => void;
  onRenderFailure?: (res: Response, error: unknown) => void;
}

function sendSpaUnavailable(res: Response): void {
  res.status(503).type("text/plain").send("Frontend build unavailable.");
}

export function attachSpaFallback(app: Express, opts: SpaFallbackOptions): void {
  const { indexPath, indexExists, renderIndex, onMissingIndex = sendSpaUnavailable, onRenderFailure = sendSpaUnavailable } = opts;

  app.get("/{*all}", async (req: Request, res: Response) => {
    if (isApiRequestPath(req.path)) {
      sendReservedRouteNotFound(res);
      return;
    }
    if (isUploadsRequestPath(req.path)) {
      res.status(404).json({ ok: false, code: "UPLOAD_NOT_FOUND", message: "Arquivo não encontrado." });
      return;
    }
    if (isSocketIoRequestPath(req.path)) {
      sendReservedRouteNotFound(res);
      return;
    }
    if (isAssetsRequestPath(req.path) || isBundledAssetExtensionPath(req.path)) {
      sendAssetNotFound(res);
      return;
    }
    if (!indexExists) {
      onMissingIndex(res);
      return;
    }
    try {
      const fs = await import("fs/promises");
      const rawHtml = await fs.readFile(indexPath, "utf8");
      const nonce = typeof res.locals.cspNonce === "string" ? res.locals.cspNonce : "";
      const html = renderIndex(rawHtml, { nonce });
      applyNoStoreHtmlHeaders(res);
      res.type("html");
      res.send(html);
    } catch (error: unknown) {
      onRenderFailure(res, error);
    }
  });
}

/** Every <script> tag needs the nonce — 'strict-dynamic' makes the browser ignore the host
 *  allowlist entirely, so an un-nonced tag is simply blocked (including our own bundle). */
export const renderSpaIndex: SpaIndexRenderer = (html, { nonce }) => {
  if (!nonce) return html;
  const nonceAttr = ` nonce="${nonce}"`;
  return html.replace(/<script(?![^>]*\snonce=)/g, `<script${nonceAttr}`);
};
