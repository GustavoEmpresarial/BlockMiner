/**
 * Early network / DOM hooks — catch Tampermonkey and F12 scripts that
 * patch fetch/XHR or inject <script> while talking to BlockMiner APIs.
 *
 * Install once at boot (SPA + standalone). Pure side-effects; flags are
 * read by runIntegrityProbe via getIntegrityHookFlags().
 */
import { BM_INTEGRITY_HOOK_MARK, stackLooksLikeUserscript } from "./integrity.probe";
import {
  probeUserscriptManagerMarkers,
  probeUserscriptManagersInstalled,
} from "./integrity.managers";

export type IntegrityHookFlags = {
  userscriptNetworkStack: boolean;
  injectedInlineScript: boolean;
  hookBypass: boolean;
  userscriptManagers: string[];
};

type HotHandler = () => void;

const BM_HOOK_INSTALLED = "__bmIntegrityHookInstalled";

/** Ignore tiny bootstraps / JSON-LD-ish snippets; avoid FP from innocuous inline tags. */
export const INJECTED_INLINE_SCRIPT_MIN_CHARS = 160;

let installed = false;
let userscriptNetworkStack = false;
let injectedInlineScript = false;
let hookBypass = false;
let userscriptManagers: string[] = [];
let ourFetch: typeof fetch | null = null;
let ourXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let ourXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
let onHot: HotHandler | null = null;
let observer: MutationObserver | null = null;

function mergeManagers(ids: string[]): boolean {
  const before = userscriptManagers.length;
  userscriptManagers = [...new Set([...userscriptManagers, ...ids])];
  return userscriptManagers.length > before;
}

function markNetworkStack(stack: string): void {
  if (!stackLooksLikeUserscript(stack)) return;
  if (!userscriptNetworkStack) {
    userscriptNetworkStack = true;
    onHot?.();
  }
}

function isSuspiciousInjectedScript(el: HTMLScriptElement): boolean {
  const src = String(el.src || "");
  if (src.startsWith("chrome-extension://") || src.startsWith("moz-extension://") || src.startsWith("safari-extension://")) {
    return true;
  }
  if (src.startsWith("blob:") || src.startsWith("data:")) return true;
  // Inline script with real body — F12 paste / TM inject without src.
  if (!src) {
    const text = String(el.textContent || "").trim();
    if (text.length < INJECTED_INLINE_SCRIPT_MIN_CHARS) return false;
    // Skip JSON-LD / ld+json style data blocks.
    const type = String(el.type || "").toLowerCase();
    if (type.includes("json") || type === "application/ld+json") return false;
    return true;
  }
  return false;
}

function onScriptAdded(node: Node): void {
  if (!(node instanceof HTMLScriptElement)) return;
  // Ignore our own integrity / vite module tags that carry src under /assets/
  const src = String(node.src || "");
  if (src.includes("/assets/") || src.includes("site-integrity")) return;
  if (!isSuspiciousInjectedScript(node)) return;
  if (!injectedInlineScript) {
    injectedInlineScript = true;
    onHot?.();
  }
}

function checkHookBypass(): void {
  if (typeof window === "undefined" || !ourFetch) return;
  try {
    if (window.fetch !== ourFetch) {
      hookBypass = true;
      onHot?.();
      return;
    }
    if (ourXhrOpen && XMLHttpRequest.prototype.open !== ourXhrOpen) {
      hookBypass = true;
      onHot?.();
      return;
    }
    if (ourXhrSend && XMLHttpRequest.prototype.send !== ourXhrSend) {
      hookBypass = true;
      onHot?.();
    }
  } catch {
    hookBypass = true;
  }
}

/** Snapshot of live hook flags (also re-checks bypass + sync manager markers). */
export function getIntegrityHookFlags(): IntegrityHookFlags {
  checkHookBypass();
  mergeManagers(probeUserscriptManagerMarkers());
  return {
    userscriptNetworkStack,
    injectedInlineScript,
    hookBypass,
    userscriptManagers: [...userscriptManagers],
  };
}

/**
 * Install fetch/XHR wrappers + MutationObserver for injected scripts.
 * Idempotent. `hot` fires when a strong signal flips (report ASAP).
 * If another integrity bundle already wrapped (standalone + SPA), adopt the
 * marked fetch/XHR so bypass checks still work.
 */
export function installIntegrityHooks(hot?: HotHandler): void {
  if (typeof window === "undefined") return;
  if (hot) onHot = hot;
  if (installed) return;
  installed = true;

  const g = window as Window & { [BM_HOOK_INSTALLED]?: boolean };
  if (g[BM_HOOK_INSTALLED]) {
    const f = window.fetch;
    if (typeof f === "function" && (f as { [BM_INTEGRITY_HOOK_MARK]?: boolean })[BM_INTEGRITY_HOOK_MARK]) {
      ourFetch = f;
    }
    if (typeof XMLHttpRequest !== "undefined") {
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      if ((open as { [BM_INTEGRITY_HOOK_MARK]?: boolean })[BM_INTEGRITY_HOOK_MARK]) ourXhrOpen = open;
      if ((send as { [BM_INTEGRITY_HOOK_MARK]?: boolean })[BM_INTEGRITY_HOOK_MARK]) ourXhrSend = send;
    }
    mergeManagers(probeUserscriptManagerMarkers());
    void probeUserscriptManagersInstalled()
      .then((ids) => {
        if (mergeManagers(ids)) onHot?.();
      })
      .catch(() => undefined);
    return;
  }
  g[BM_HOOK_INSTALLED] = true;

  const originalFetch = window.fetch.bind(window);
  const wrappedFetch: typeof fetch = function bmIntegrityFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      markNetworkStack(new Error().stack || "");
    } catch {
      /* ignore */
    }
    return originalFetch(input, init);
  };
  (wrappedFetch as { [BM_INTEGRITY_HOOK_MARK]?: boolean })[BM_INTEGRITY_HOOK_MARK] = true;
  ourFetch = wrappedFetch;
  window.fetch = wrappedFetch;

  if (typeof XMLHttpRequest !== "undefined") {
    const proto = XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const wrappedOpen = function bmIntegrityOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      try {
        markNetworkStack(new Error().stack || "");
      } catch {
        /* ignore */
      }
      return originalOpen.call(
        this,
        method,
        url,
        async !== false,
        username ?? null,
        password ?? null,
      );
    } as typeof proto.open;
    const wrappedSend = function bmIntegritySend(
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      try {
        markNetworkStack(new Error().stack || "");
      } catch {
        /* ignore */
      }
      return originalSend.call(this, body);
    };
    (wrappedOpen as { [BM_INTEGRITY_HOOK_MARK]?: boolean })[BM_INTEGRITY_HOOK_MARK] = true;
    (wrappedSend as { [BM_INTEGRITY_HOOK_MARK]?: boolean })[BM_INTEGRITY_HOOK_MARK] = true;
    proto.open = wrappedOpen;
    proto.send = wrappedSend;
    ourXhrOpen = proto.open;
    ourXhrSend = proto.send;
  }

  if (typeof MutationObserver !== "undefined" && document.documentElement) {
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => onScriptAdded(n));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Presence scan: sync markers only. WAR image probes spam net::ERR_FAILED on MV3.
  mergeManagers(probeUserscriptManagerMarkers());
  void probeUserscriptManagersInstalled()
    .then((ids) => {
      if (mergeManagers(ids)) onHot?.();
    })
    .catch(() => undefined);
}

export function stopIntegrityHooks(): void {
  onHot = null;
  observer?.disconnect();
  observer = null;
}
