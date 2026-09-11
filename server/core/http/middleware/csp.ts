/**
 * Ported from legacy/server/middleware/csp.ts verbatim (directives, host allowlists,
 * and the "api"/"asset" routes get no CSP header at all" behavior are unchanged).
 * Only the internal-offerwall import paths changed for current/'s module layout.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NextFunction, Request, Response } from "express";
import type { HelmetOptions } from "helmet";
import helmet from "helmet";
import { getIframeHostAllowlistCachedSync } from "../../../modules/internal-offerwall/internal-offerwall.iframe-allowlist.js";
import { expandCspFrameSrcHostSources } from "../../../modules/internal-offerwall/internal-offerwall.iframe-validate.js";

function isAssetPath(pathname: string | undefined): boolean {
  return Boolean(pathname && /\.(css|js|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(pathname));
}

function getRouteGroup(pathname: string | undefined): "api" | "asset" | "app" {
  const path = String(pathname || "/");
  if (path.startsWith("/api/")) return "api";
  if (isAssetPath(path)) return "asset";
  return "app";
}

const WALLETCONNECT_CONNECT = [
  "https://rpc.walletconnect.com",
  "https://rpc.walletconnect.org",
  "https://relay.walletconnect.com",
  "https://relay.walletconnect.org",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
  "https://pulse.walletconnect.com",
  "https://pulse.walletconnect.org",
  "https://api.web3modal.com",
  "https://api.web3modal.org",
  "https://keys.walletconnect.com",
  "https://keys.walletconnect.org",
  "https://notify.walletconnect.com",
  "https://notify.walletconnect.org",
  "https://echo.walletconnect.com",
  "https://echo.walletconnect.org",
  "https://push.walletconnect.com",
  "https://push.walletconnect.org",
  "wss://www.walletlink.org",
  "https://cca-lite.coinbase.com",
  "https://explorer-api.walletconnect.com",
  "https://explorer-api.walletconnect.org",
  "https://registry.walletconnect.com",
  "https://registry.walletconnect.org",
  "https://api.reown.com",
  "https://pulse.reown.com",
  "https://echo.reown.com",
  "https://notify.reown.com",
  "https://push.reown.com",
  "https://keys.reown.com",
] as const;

/** Google AdSense, Funding Choices (Offerwall/consent), and ad frames. */
const GOOGLE_ADS_SCRIPT = [
  "https://pagead2.googlesyndication.com",
  "https://www.googleadservices.com",
  "https://www.googletagmanager.com",
  "https://fundingchoicesmessages.google.com",
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
] as const;

const GOOGLE_ADS_FRAME = [
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://www.google.com",
  "https://pagead2.googlesyndication.com",
  "https://fundingchoicesmessages.google.com",
  "https://ep1.adtrafficquality.google",
  "https://ep2.adtrafficquality.google",
] as const;

type CspDirectives = NonNullable<Exclude<HelmetOptions["contentSecurityPolicy"], boolean | undefined>["directives"]>;

function baseDirectives(opts: { allowWebSockets: boolean }): CspDirectives {
  const connectBase = opts.allowWebSockets
    ? ["'self'", "https:", "ws:", "wss:", "blob:", "http://localhost:*", "ws://localhost:*"]
    : ["'self'", "https:", "blob:"];

  const internalOfferwallFrameHosts = expandCspFrameSrcHostSources(getIframeHostAllowlistCachedSync());

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: [
      "'self'",
      "https://genesisdao.tech",
      "https://www.genesisdao.tech",
      "https://acrenighttv.base44.app",
      "https://zerads.com",
      "https://www.zerads.com",
      "https://sh.blockminer.space",
      "http://sh.blockminer.space",
      "https://minercore.online",
      "https://www.minercore.online",
      "https://dev.minercore.online",
      "http://dev.minercore.online",
    ],
    frameSrc: [
      "'self'",
      "https://challenges.cloudflare.com",
      "https://www.satspay.pro",
      "https://satspay.pro",
      "https://verify.walletconnect.com",
      "https://verify.walletconnect.org",
      "https://secure.walletconnect.com",
      "https://secure.walletconnect.org",
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://ss.mrmnd.com",
      "https://*.mrmnd.com",
      "https://*.atmndx.com",
      "https://*.bmndx.com",
      "https://*.mndlvr.com",
      "https://zerads.com",
      "https://sh.blockminer.space",
      "http://sh.blockminer.space",
      "https://offerwall.me",
      "https://offerwallpro.com",
      "https://www.offerwallpro.com",
      "https://multiwall-ads.shop",
      "https://www.multiwall-ads.shop",
      "https://offerwall.gg",
      "https://www.offerwall.gg",
      "https://offerwall.moneyrain.top",
      "https://www.tradingview.com",
      "https://s.tradingview.com",
      "https://widget.tradingview.com",
      "https://ad.a-ads.com",
      "http://ad.a-ads.com",
      "https://acceptable.a-ads.com",
      "https://*.a-ads.com",
      ...GOOGLE_ADS_FRAME,
      ...internalOfferwallFrameHosts,
    ],
    objectSrc: ["'none'"],
    scriptSrcAttr: ["'none'"],
    imgSrc: [
      "*",
      "'self'",
      "data:",
      "blob:",
      // Userscript-manager presence probes (MV3 timing / WAR image loads).
      "chrome-extension:",
      "https://walletconnect.org",
      "https://walletconnect.com",
      "https://secure.walletconnect.com",
      "https://secure.walletconnect.org",
      "https://tokens-data.1inch.io",
      "https://tokens.1inch.io",
      "https://ipfs.io",
      "https://cdn.zerion.io",
    ],
    fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com", "https://fonts.reown.com", "data:"],
    scriptSrc:
      process.env.NODE_ENV === "production"
        ? [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) =>
              `'nonce-${(res as Response).locals.cspNonce || ""}'`,
            "'strict-dynamic'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "'sha256-NJS0Wtnrtaj0vSuZKVDn1gR0BSXI5XqyNQHem7I9CyM='",
            "'sha256-NzvNrqk5jB9YZATwo5BF4JoRlJ02HsnFikbKXgEPdaQ='",
            "https://challenges.cloudflare.com",
            "https://www.satspay.pro",
            "https://satspay.pro",
            "https://cdn.jsdelivr.net",
            ...GOOGLE_ADS_SCRIPT,
            "https://www.youtube.com",
            "https://s.ytimg.com",
            "https://s3.tradingview.com",
            "https://www.tradingview.com",
            "https://s.tradingview.com",
            "https://ss.mrmnd.com",
            "https://*.mrmnd.com",
            "https://*.mndlvr.com",
          ]
        : [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://challenges.cloudflare.com",
            "https://www.satspay.pro",
            "https://satspay.pro",
            "https://cdn.jsdelivr.net",
            ...GOOGLE_ADS_SCRIPT,
            "https://www.youtube.com",
            "https://s.ytimg.com",
            "https://s3.tradingview.com",
            "https://www.tradingview.com",
            "https://s.tradingview.com",
            "https://ss.mrmnd.com",
            "https://*.mrmnd.com",
            "https://*.mndlvr.com",
          ],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
    connectSrc: [...connectBase, "chrome-extension:", ...WALLETCONNECT_CONNECT],
    workerSrc: ["'self'", "blob:", "https:"],
  };
}

type CspConfig = Exclude<HelmetOptions["contentSecurityPolicy"], boolean | undefined>;

export function getHelmetContentSecurityPolicyOptions(): CspConfig {
  return {
    useDefaults: false,
    directives: baseDirectives({ allowWebSockets: true }),
  };
}

export function createCspMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const group = getRouteGroup(req.path);
    if (group === "api" || group === "asset") {
      next();
      return;
    }
    const directives = baseDirectives({ allowWebSockets: true });
    helmet.contentSecurityPolicy({ useDefaults: false, directives })(req, res, next);
  };
}
