/**
 * Site-wide browser integrity probes (F12 patches, Tampermonkey / userscripts).
 * Pure snapshot helpers — no network. Hooks live in integrity.hooks.ts.
 *
 * Honest limits: page JS cannot fully police itself. We score *naive* injections
 * (GM_* surfaces, toString-broken natives, userscript stacks, injected inline
 * scripts) and let the server tier system decide. Never ban on one weak hit.
 */

import { probeUserscriptManagerMarkers } from "./integrity.managers";

export type IntegrityProbeResult = {
  overriddenApiCount: number;
  overriddenApis: string[];
  navTampered: boolean;
  noPermissions: boolean;
  noChromeRuntime: boolean;
  /** GM_* / unsafeWindow — manager actively exposing API on this page. */
  userscriptHint: boolean;
  /** chrome-extension:// / moz-extension:// scripts in the DOM. */
  extensionScriptHint: boolean;
  /** fetch/XHR call stack looked like a userscript / extension. */
  userscriptNetworkStack: boolean;
  /** Inline / blob / data: <script> injected after boot. */
  injectedInlineScript: boolean;
  /** console.log (etc.) no longer native — common F12 / overlay hooks. */
  consoleTampered: boolean;
  /** Our network hooks were replaced after install. */
  hookBypass: boolean;
  /**
   * Userscript manager present (Violentmonkey always-inject, TM page markers,
   * or WAR hit). Idle Tampermonkey MV3 often invisible — see integrity.managers.
   */
  userscriptManagerInstalled: boolean;
  /** Which managers we could identify (e.g. violentmonkey, tampermonkey). */
  userscriptManagers: string[];
};

const NATIVE_MARK = "[native code]";

/** Set on our own fetch/XHR wrappers so listOverriddenApis ignores them. */
export const BM_INTEGRITY_HOOK_MARK = "__bmIntegrityHookFn";

/** Stack frames that indicate Tampermonkey / Violentmonkey / extension code. */
export const USERSCRIPT_STACK_RE =
  /Tampermonkey|Violentmonkey|Greasemonkey|FireMonkey|ScriptCat|userscript\.html|user-script:|chrome-extension:\/\/|moz-extension:\/\/|safari-extension:\/\//i;

const USERSCRIPT_GLOBAL_KEYS = [
  "GM_info",
  "GM_xmlhttpRequest",
  "GM_getValue",
  "GM_setValue",
  "GM_deleteValue",
  "GM_listValues",
  "GM_addStyle",
  "GM_notification",
  "GM_openInTab",
  "GM_registerMenuCommand",
  "GM_download",
  "GM_getResourceText",
  "GM_getResourceURL",
  "GM_cookie",
  "unsafeWindow",
  "GM",
  "cloneInto",
  "exportFunction",
  "wrappedJSObject",
] as const;

/** Read Vite env ms with floor; safe under Node test runner (no import.meta.env). */
function readEnvMs(key: string, fallback: number, minMs: number): number {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const raw = Number(env?.[key]);
    if (Number.isFinite(raw) && raw >= minMs) return Math.floor(raw);
  } catch {
    /* node / non-vite */
  }
  return fallback;
}

/** Named product default — override via VITE_SITE_INTEGRITY_PROBE_MS. */
export const SITE_INTEGRITY_PROBE_INTERVAL_MS = readEnvMs("VITE_SITE_INTEGRITY_PROBE_MS", 120_000, 30_000);

/** Min gap between telemetry posts unless severity rose. */
export const SITE_INTEGRITY_MIN_REPORT_GAP_MS = readEnvMs("VITE_SITE_INTEGRITY_REPORT_GAP_MS", 60_000, 15_000);

const WATCHED_APIS: Array<{ name: string; get: () => unknown }> = [
  { name: "fetch", get: () => (typeof fetch === "function" ? fetch : undefined) },
  {
    name: "XMLHttpRequest.open",
    get: () =>
      typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest.prototype.open : undefined,
  },
  {
    name: "XMLHttpRequest.send",
    get: () =>
      typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest.prototype.send : undefined,
  },
  { name: "WebSocket", get: () => (typeof WebSocket !== "undefined" ? WebSocket : undefined) },
  {
    name: "History.pushState",
    get: () => (typeof History !== "undefined" ? History.prototype.pushState : undefined),
  },
];

export function looksNative(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  try {
    const src = Function.prototype.toString.call(fn);
    return typeof src === "string" && src.includes(NATIVE_MARK);
  } catch {
    return false;
  }
}

export function listOverriddenApis(
  apis: Array<{ name: string; get: () => unknown }> = WATCHED_APIS,
): string[] {
  const hit: string[] = [];
  for (const { name, get } of apis) {
    try {
      const fn = get();
      if (typeof fn !== "function") continue;
      // Skip our integrity wrappers (they are intentionally non-native).
      if ((fn as { [BM_INTEGRITY_HOOK_MARK]?: boolean })[BM_INTEGRITY_HOOK_MARK]) continue;
      if (!looksNative(fn)) hit.push(name);
    } catch {
      hit.push(name);
    }
  }
  return hit;
}

export function stackLooksLikeUserscript(stack: string): boolean {
  return Boolean(stack && USERSCRIPT_STACK_RE.test(stack));
}

export function probeNavWebdriverTampered(): boolean {
  if (typeof Navigator === "undefined") return false;
  try {
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, "webdriver");
    if (!desc) return false;
    if (typeof desc.get === "function" && !looksNative(desc.get)) return true;
    if (desc.value === true) return true;
    return false;
  } catch {
    return false;
  }
}

export function probeUserscriptGlobals(root: Record<string, unknown> = globalThis as never): boolean {
  for (const k of USERSCRIPT_GLOBAL_KEYS) {
    try {
      if (root[k] != null) return true;
    } catch {
      /* cross-origin getter */
    }
  }
  // Tampermonkey sometimes exposes only GM_info.script
  try {
    const info = root.GM_info as { scriptHandler?: string; script?: unknown } | undefined;
    if (info && (info.scriptHandler || info.script)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function probeExtensionScripts(
  doc: Document | null = typeof document !== "undefined" ? document : null,
): boolean {
  if (!doc?.querySelectorAll) return false;
  try {
    const nodes = doc.querySelectorAll(
      'script[src^="chrome-extension://"],script[src^="moz-extension://"],script[src^="safari-extension://"]',
    );
    return nodes.length > 0;
  } catch {
    return false;
  }
}

export function probeConsoleTampered(): boolean {
  if (typeof console === "undefined") return false;
  try {
    for (const name of ["log", "debug", "info", "warn", "error"] as const) {
      const fn = console[name];
      if (typeof fn === "function" && !looksNative(fn)) return true;
    }
  } catch {
    return true;
  }
  return false;
}

export function probeNoPermissions(): boolean {
  return typeof navigator !== "undefined" && !("permissions" in navigator);
}

export function probeNoChromeRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  if (!ua.includes("chrome") || ua.includes("chromium") || ua.includes("edg/") || ua.includes("electron")) {
    return false;
  }
  const g = globalThis as { chrome?: { runtime?: unknown } };
  return !(g.chrome && g.chrome.runtime);
}

export type IntegrityHookFlags = {
  userscriptNetworkStack: boolean;
  injectedInlineScript: boolean;
  hookBypass: boolean;
  /** Async WAR / deferred manager ids (merged with sync markers). */
  userscriptManagers: string[];
};

const EMPTY_HOOKS: IntegrityHookFlags = {
  userscriptNetworkStack: false,
  injectedInlineScript: false,
  hookBypass: false,
  userscriptManagers: [],
};

/** Full snapshot. Pass live hook flags from integrity.hooks when available. */
export function runIntegrityProbe(hooks: IntegrityHookFlags = EMPTY_HOOKS): IntegrityProbeResult {
  const overriddenApis = listOverriddenApis();
  const managers = [
    ...new Set([...probeUserscriptManagerMarkers(), ...hooks.userscriptManagers]),
  ].slice(0, 10);
  return {
    overriddenApiCount: overriddenApis.length,
    overriddenApis,
    navTampered: probeNavWebdriverTampered(),
    noPermissions: probeNoPermissions(),
    noChromeRuntime: probeNoChromeRuntime(),
    userscriptHint: probeUserscriptGlobals(),
    extensionScriptHint: probeExtensionScripts(),
    userscriptNetworkStack: hooks.userscriptNetworkStack,
    injectedInlineScript: hooks.injectedInlineScript,
    consoleTampered: probeConsoleTampered(),
    hookBypass: hooks.hookBypass,
    userscriptManagerInstalled: managers.length > 0,
    userscriptManagers: managers,
  };
}

/** Severity rank for throttle — higher means “report even if gap not elapsed”. */
export function integritySeverity(p: IntegrityProbeResult): number {
  let s = 0;
  if (p.navTampered) s += 4;
  if (p.hookBypass) s += 4;
  if (p.userscriptNetworkStack) s += 4;
  if (p.overriddenApiCount >= 2) s += 3;
  else if (p.overriddenApiCount === 1) s += 1;
  if (p.userscriptHint) s += 3;
  if (p.userscriptManagerInstalled) s += 3;
  if (p.injectedInlineScript) s += 2;
  if (p.consoleTampered) s += 1;
  if (p.extensionScriptHint) s += 1;
  return s;
}
