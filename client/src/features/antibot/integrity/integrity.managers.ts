/**
 * Userscript *manager* presence (Tampermonkey / Violentmonkey / forks).
 *
 * Layers:
 *  1) Sync page markers (`**VMInitInjection**`, window.Tampermonkey, …).
 *  2) WAR image onload (works only if extension still exposes resources).
 *  3) Timing side-channel vs fake extension IDs — needed for Chrome Web Store
 *     Violentmonkey/Tampermonkey MV3 which ship with NO web_accessible_resources
 *     and no static content_scripts (idle install leaves no window markers).
 *
 * Honest limit: timing can miss on very fast machines or if CSP blocks
 * chrome-extension: images; we enable chrome-extension: in img-src for probes.
 */

export type UserscriptManagerId =
  | "tampermonkey"
  | "tampermonkey_beta"
  | "violentmonkey"
  | "scriptcat"
  | "firemonkey"
  | "greasemonkey"
  | "userscript_generic";

function readEnvNumber(key: string, fallback: number, min: number): number {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const raw = Number(env?.[key]);
    if (Number.isFinite(raw) && raw >= min) return raw;
  } catch {
    /* node / non-vite */
  }
  return fallback;
}

/** Image probes per ID (timing side-channel). */
export const USERSCRIPT_EXT_TIMING_SAMPLES = Math.floor(
  readEnvNumber("VITE_USERSCRIPT_EXT_TIMING_SAMPLES", 6, 3),
);
/** Per-probe timeout. */
export const USERSCRIPT_EXT_TIMING_TIMEOUT_MS = Math.floor(
  readEnvNumber("VITE_USERSCRIPT_EXT_TIMING_TIMEOUT_MS", 120, 40),
);
/** Absolute ms gap over control average → treat as installed. */
export const USERSCRIPT_EXT_TIMING_MARGIN_MS = readEnvNumber(
  "VITE_USERSCRIPT_EXT_TIMING_MARGIN_MS",
  2,
  0.5,
);
/** Relative slowdown vs control → treat as installed. */
export const USERSCRIPT_EXT_TIMING_RATIO = readEnvNumber(
  "VITE_USERSCRIPT_EXT_TIMING_RATIO",
  1.35,
  1.05,
);

/** Known Chrome extension IDs + candidate WAR / package paths. */
export const USERSCRIPT_MANAGER_WAR_PROBES: Array<{
  id: UserscriptManagerId;
  extensionId: string;
  paths: string[];
}> = [
  {
    id: "tampermonkey",
    extensionId: "dhdgffkkebhmkfjojejmpbldmpobfkfo",
    paths: ["images/icon128.png", "images/icon48.png", "images/icon38.png", "userscript.html"],
  },
  {
    id: "tampermonkey_beta",
    extensionId: "gcalenpjmijncebpfijmoaglllgpjagf",
    paths: ["images/icon128.png", "images/icon48.png"],
  },
  {
    id: "violentmonkey",
    extensionId: "jinjaccalgkegednnccohejagnlnfdag",
    // Real files inside the CWS package (even when not WAR — used for timing).
    paths: ["public/images/icon128.png", "public/images/icon48.png", "injected.js", "manifest.json"],
  },
  {
    id: "scriptcat",
    extensionId: "oiioibmapkiaambaaakhjpkdfoihllkh",
    paths: ["logo.png", "assets/logo.png"],
  },
];

/** Valid-format fake IDs (alphabet a–p) that are not real store extensions. */
const CONTROL_EXTENSION_IDS = [
  "abcdefghijklmnopabcdefghijklmnop",
  "ponmlkjihgfedcbaponmlkjihgfedcba",
] as const;

const VM_INIT = "**VMInitInjection**";

function hasOwn(obj: object, key: string): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(obj, key);
  } catch {
    return false;
  }
}

function chromeExtUrl(extensionId: string, path: string): string {
  const clean = path.replace(/^\//, "");
  return `chrome-extension://${extensionId}/${clean}`;
}

/**
 * Sync markers — no network. Detects managers that already injected into the page.
 */
export function probeUserscriptManagerMarkers(
  root: Record<string, unknown> = globalThis as never,
): UserscriptManagerId[] {
  const found = new Set<UserscriptManagerId>();

  try {
    if (root[VM_INIT] != null) found.add("violentmonkey");
  } catch {
    /* ignore */
  }
  try {
    if (root.Violentmonkey != null || hasOwn(root, "Violentmonkey")) found.add("violentmonkey");
  } catch {
    /* ignore */
  }

  try {
    if (root.Tampermonkey != null || hasOwn(root, "Tampermonkey")) found.add("tampermonkey");
  } catch {
    /* ignore */
  }

  try {
    const ext = root.external as { AppNotifier?: unknown; GetVersion?: unknown } | undefined;
    if (ext && (ext.AppNotifier != null || typeof ext.GetVersion === "function")) {
      found.add("greasemonkey");
    }
  } catch {
    /* ignore */
  }

  try {
    if (root.ScriptCat != null || root.CAT_VM != null) found.add("scriptcat");
  } catch {
    /* ignore */
  }

  try {
    if (root.FireMonkey != null) found.add("firemonkey");
  } catch {
    /* ignore */
  }

  try {
    if (root.__BM_TM_TEST__ != null) found.add("tampermonkey");
  } catch {
    /* ignore */
  }

  return [...found];
}

function probeOneUrl(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(false);
      return;
    }
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const img = new Image();
    const t = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(t);
      finish(false);
    };
    try {
      img.src = `${url}${url.includes("?") ? "&" : "?"}_=${Math.random()}`;
    } catch {
      clearTimeout(t);
      finish(false);
    }
  });
}

function timeImageProbe(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || typeof performance === "undefined") {
      resolve(0);
      return;
    }
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Math.max(0, performance.now() - t0));
    };
    const img = new Image();
    const t = setTimeout(finish, timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      finish();
    };
    img.onerror = () => {
      clearTimeout(t);
      finish();
    };
    try {
      img.src = `${url}${url.includes("?") ? "&" : "?"}_=${Math.random()}`;
    } catch {
      clearTimeout(t);
      finish();
    }
  });
}

async function averageProbeMs(urls: string[], samples: number, timeoutMs: number): Promise<number> {
  if (!urls.length || samples <= 0) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < samples; i++) {
    const url = urls[i % urls.length]!;
    const ms = await timeImageProbe(url, timeoutMs);
    sum += ms;
    n += 1;
  }
  return n ? sum / n : 0;
}

/** Pure comparison — unit-tested. */
export function timingSuggestsInstalled(
  targetMs: number,
  controlMs: number,
  ratio: number = USERSCRIPT_EXT_TIMING_RATIO,
  marginMs: number = USERSCRIPT_EXT_TIMING_MARGIN_MS,
): boolean {
  if (!Number.isFinite(targetMs) || !Number.isFinite(controlMs)) return false;
  if (targetMs <= 0) return false;
  if (controlMs <= 0) return targetMs >= marginMs;
  if (targetMs >= controlMs * ratio) return true;
  if (targetMs - controlMs >= marginMs) return true;
  return false;
}

async function probeByTiming(id: UserscriptManagerId, extensionId: string, paths: string[]): Promise<boolean> {
  const targetUrls = paths.slice(0, 2).map((p) => chromeExtUrl(extensionId, p));
  const controlUrls = CONTROL_EXTENSION_IDS.flatMap((cid) =>
    paths.slice(0, 1).map((p) => chromeExtUrl(cid, p)),
  );
  const samples = USERSCRIPT_EXT_TIMING_SAMPLES;
  const timeoutMs = USERSCRIPT_EXT_TIMING_TIMEOUT_MS;
  const controlMs = await averageProbeMs(controlUrls, samples, timeoutMs);
  const targetMs = await averageProbeMs(targetUrls, samples, timeoutMs);
  return timingSuggestsInstalled(targetMs, controlMs);
}

export type ProbeUserscriptManagersOptions = {
  /**
   * Timing side-channel is noisy (false positives on clean browsers).
   * Default off — use only for soft telemetry, never for kick / login block.
   */
  includeTiming?: boolean;
};

/**
 * Async presence probe. Resolves with manager ids found via markers + WAR
 * (+ optional timing). Safe to call once at boot; never throws.
 */
export async function probeUserscriptManagersInstalled(
  timeoutMs = 1_500,
  options?: ProbeUserscriptManagersOptions,
): Promise<UserscriptManagerId[]> {
  const includeTiming = options?.includeTiming === true;
  const found = new Set<UserscriptManagerId>(probeUserscriptManagerMarkers());

  if (typeof window === "undefined") return [...found];

  for (const { id, extensionId, paths } of USERSCRIPT_MANAGER_WAR_PROBES) {
    if (found.has(id)) continue;
    try {
      let hit = false;
      for (const path of paths) {
        if (await probeOneUrl(chromeExtUrl(extensionId, path), timeoutMs)) {
          hit = true;
          break;
        }
      }
      if (!hit && includeTiming) {
        hit = await probeByTiming(id, extensionId, paths);
      }
      if (hit) found.add(id);
    } catch {
      /* next manager */
    }
  }

  return [...found];
}
