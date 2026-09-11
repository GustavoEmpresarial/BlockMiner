(() => {
  // BlockMiner site-integrity v21 — drop dead WAR probe (MV3 TM no longer exposes icons).
  // Source: client/src/features/antibot/integrity/
  const NATIVE_MARK = "[native code]";
  const BM_MARK = "__bmIntegrityHookFn";
  const BM_INSTALLED = "__bmIntegrityHookInstalled";
  const VM_INIT = "**VMInitInjection**";
  const PROBE_MS = 120000;
  const GAP_MS = 60000;
  const USERSCRIPT_STACK_RE =
    /Tampermonkey|Violentmonkey|Greasemonkey|FireMonkey|ScriptCat|userscript\.html|user-script:|chrome-extension:\/\/|moz-extension:\/\/|safari-extension:\/\//;
  const USERSCRIPT_KEYS = [
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
  ];
  const WAR_PROBES = [
    {
      id: "tampermonkey",
      extensionId: "dhdgffkkebhmkfjojejmpbldmpobfkfo",
      paths: ["images/icon128.png", "images/icon48.png", "images/icon38.png"],
    },
    {
      id: "tampermonkey_beta",
      extensionId: "gcalenpjmijncebpfijmoaglllgpjagf",
      paths: ["images/icon128.png", "images/icon48.png"],
    },
    {
      id: "violentmonkey",
      extensionId: "jinjaccalgkegednnccohejagnlnfdag",
      paths: ["public/images/icon128.png", "public/images/icon48.png", "injected.js", "manifest.json"],
    },
  ];
  const CONTROL_EXT_IDS = [
    "abcdefghijklmnopabcdefghijklmnop",
    "ponmlkjihgfedcbaponmlkjihgfedcba",
  ];
  const TIMING_SAMPLES = 6;
  const TIMING_TIMEOUT_MS = 120;
  const TIMING_RATIO = 1.35;
  const TIMING_MARGIN_MS = 2;
  const BLOCKED_MANAGERS = { tampermonkey: 1, tampermonkey_beta: 1, violentmonkey: 1 };
  const LOGIN_REASON_URL = "/login?reason=userscript_manager";
  // Temporary product kill-switch — re-enable with true + USERSCRIPT_MANAGER_KICK_ENABLED=1
  const USERSCRIPT_MANAGER_KICK_ENABLED = false;
  let kickStarted = false;

  function blockedFrom(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (BLOCKED_MANAGERS[list[i]] && out.indexOf(list[i]) < 0) out.push(list[i]);
    }
    return out;
  }

  function alreadyOnReasonLogin() {
    try {
      if (!String(location.pathname || "").includes("/login")) return false;
      return new URLSearchParams(location.search || "").get("reason") === "userscript_manager";
    } catch (e) {
      return false;
    }
  }

  function kickToLogin(managers) {
    if (!USERSCRIPT_MANAGER_KICK_ENABLED) return;
    try {
      if (!String(location.pathname || "").includes("/login")) kickStarted = false;
    } catch (e) {}
    var blocked = blockedFrom(managers || []);
    if (!blocked.length) {
      if (!pageHasHardUserscriptSignal()) return;
      blocked = ["tampermonkey"];
    }
    try {
      sessionStorage.setItem("bm_logout_reason", "userscript_manager");
      sessionStorage.removeItem("bm_logout_message");
    } catch (e) {}
    try {
      console.warn("[BM-integrity] KICK userscript → login", blocked, {
        bmTest: !!globalThis.__BM_TM_TEST__,
        tm: !!globalThis.Tampermonkey,
        path: String(location.pathname || ""),
      });
    } catch (e) {}

    function fireKickSideEffects() {
      var headers = (function () {
        var h = { "Content-Type": "application/json" };
        try {
          var m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
          if (m) h["x-csrf-token"] = decodeURIComponent(m[1]);
        } catch (e) {}
        return h;
      })();
      try {
        fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: headers,
          body: "{}",
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
      try {
        fetch("/api/antibot/telemetry", {
          method: "POST",
          credentials: "include",
          headers: headers,
          body: JSON.stringify({
            eventType: "site:integrity:kick",
            sessionId: "site-integrity-kick",
            telemetry: {
              integrity: {
                userscriptManagerInstalled: true,
                userscriptManagers: blocked,
              },
            },
          }),
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
    }

    // Already on login: stay put. NEVER location.replace here (causes reload loops).
    if (String(location.pathname || "").includes("/login")) {
      if (!kickStarted) {
        kickStarted = true;
        fireKickSideEffects();
      }
      try {
        if (!alreadyOnReasonLogin()) {
          var u = new URL(location.href);
          u.searchParams.set("reason", "userscript_manager");
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        }
      } catch (e) {}
      return;
    }

    if (kickStarted) return;
    kickStarted = true;

    // Navigate FIRST — waiting on logout was racing SPA remount / cache.
    try {
      location.replace(LOGIN_REASON_URL);
    } catch (e) {
      location.href = LOGIN_REASON_URL;
    }
    fireKickSideEffects();
  }

  function pageHasHardUserscriptSignal() {
    try {
      if (globalThis.__BM_TM_TEST__) return true;
      if (globalThis.Tampermonkey) return true;
      if (globalThis["**VMInitInjection**"] != null) return true;
      if (globalThis.Violentmonkey) return true;
      // Zerads captcha solver flag (only visible if injected into THIS window)
      if (globalThis.ZERADS_PTC_SOLVER_RUNNING) return true;
      if (globalThis.ZERADS_PTC_SOLVER_SOLVED) return true;
    } catch (e) {}
    return false;
  }

  function scriptTextLooksHostile(text) {
    return /Tampermonkey|Violentmonkey|__BM_TM_TEST__|__BM_TM_INLINE__|GM_info|GM_xmlhttpRequest|\bGM_\w+|unsafeWindow|window\.fetch\s*=|XMLHttpRequest\.prototype\.(open|send)\s*=|ZERADS_PTC_SOLVER|findBestMatch|humanClick/i.test(
      String(text || ""),
    );
  }

  /** Best-effort peek into partner iframe — works only if same-origin (normally blocked). */
  function partnerFrameHasSolverSignal() {
    try {
      var frame = document.getElementById("bm-partner-frame");
      if (!frame || !frame.contentWindow) return false;
      var w = frame.contentWindow;
      if (w.ZERADS_PTC_SOLVER_RUNNING) return true;
      if (w.ZERADS_PTC_SOLVER_SOLVED) return true;
      if (w.Tampermonkey) return true;
      if (w.Violentmonkey) return true;
      if (w["**VMInitInjection**"] != null) return true;
      if (w.GM_info || w.GM_xmlhttpRequest) return true;
    } catch (e) {
      // Cross-origin: expected for zerads.com — cannot read solver state.
    }
    return false;
  }

  function zeradsEmbedIsOpen() {
    try {
      if (globalThis.__BM_PARTNER_IFRAME__ !== true) return false;
      var frame = document.getElementById("bm-partner-frame");
      if (!frame) return false;
      var src = String(frame.getAttribute("src") || frame.src || "");
      return /zerads\.com/i.test(src);
    } catch (e) {
      return false;
    }
  }

  function shouldKick(probe) {
    // Real injection / manager / userscript stack — not BM_TM-only, not bare timing/WAR.
    if (pageHasHardUserscriptSignal()) return true;
    if (partnerFrameHasSolverSignal()) return true;
    // While Zerads is embedded, any parent-visible userscript manager is enough to kick.
    if (zeradsEmbedIsOpen() && blockedFrom((probe && probe.markerManagers) || probeManagerMarkers()).length) {
      return true;
    }
    if (probe && probe.userscriptHint) return true;
    if (probe && probe.userscriptNetworkStack) return true;
    if (probe && probe.injectedInlineScript) return true;
    if (probe && probe.foreignFetchHijack) return true;
    if (probe && probe.foreignOpenHijack) return true;
    if (probe && probe.hostileOverlay) return true;
    if (probe && probe.syntheticClickWithoutGesture) return true;
    // Marker ids only (not WAR timing FPs) — see markerManagers snapshot
    if (blockedFrom((probe && probe.markerManagers) || []).length) return true;
    return false;
  }

  function evaluateKick(reason) {
    checkHookBypass();
    var markers = probeManagerMarkers();
    var probe = {
      userscriptManagers: userscriptManagers,
      markerManagers: markers,
      userscriptHint: userscriptHint(),
      userscriptNetworkStack: userscriptNetworkStack,
      injectedInlineScript: injectedInlineScript,
      foreignFetchHijack: foreignFetchHijack,
      foreignOpenHijack: foreignOpenHijack,
      hostileOverlay: hostileOverlay,
      syntheticClickWithoutGesture: syntheticClickWithoutGesture,
    };
    if (!shouldKick(probe)) return false;
    var managers = blockedFrom(markers);
    if (!managers.length && pageHasHardUserscriptSignal()) managers = ["tampermonkey"];
    if (!managers.length && partnerFrameHasSolverSignal()) managers = ["tampermonkey"];
    if (
      !managers.length &&
      (probe.userscriptHint ||
        probe.userscriptNetworkStack ||
        probe.injectedInlineScript ||
        probe.foreignFetchHijack ||
        probe.foreignOpenHijack ||
        probe.hostileOverlay ||
        probe.syntheticClickWithoutGesture)
    ) {
      managers = ["tampermonkey"];
    }
    if (!managers.length) return false;
    try {
      console.warn("[BM-integrity] KICK", reason || "flags", { managers: managers });
    } catch (e) {}
    kickToLogin(managers);
    return true;
  }
  const sessionId =
    "site-integrity-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
  let lastAt = 0;
  let lastSev = 0;
  let userscriptNetworkStack = false;
  let injectedInlineScript = false;
  let hookBypass = false;
  let foreignFetchHijack = false;
  let foreignOpenHijack = false;
  let hostileOverlay = false;
  let syntheticClickWithoutGesture = false;
  let syntheticClickStreak = 0;
  let lastPointerGesture = null;
  let lastKeyGesture = null;
  const POINTER_GESTURE_MAX_AGE_MS = 2500;
  const KEY_ACTIVATE_MAX_AGE_MS = 2500;
  /** Site-wide: kick after this many scripted clicks without pointer/key trail. */
  const SYNTHETIC_CLICK_STREAK_FOR_KICK = 2;
  let userscriptManagers = [];
  let ourFetch = null;
  let ourOpen = null;
  let ourXhrOpen = null;
  let ourXhrSend = null;

  function looksNative(fn) {
    if (typeof fn !== "function") return false;
    try {
      return Function.prototype.toString.call(fn).includes(NATIVE_MARK);
    } catch {
      return false;
    }
  }

  function stackLooksLikeUserscript(stack) {
    return Boolean(stack && USERSCRIPT_STACK_RE.test(stack));
  }

  function mergeManagers(ids) {
    const before = userscriptManagers.length;
    userscriptManagers = Array.from(new Set(userscriptManagers.concat(ids)));
    return userscriptManagers.length > before;
  }

  function probeManagerMarkers() {
    const found = [];
    try {
      if (globalThis[VM_INIT] != null) found.push("violentmonkey");
    } catch {}
    try {
      if (globalThis.Violentmonkey != null) found.push("violentmonkey");
    } catch {}
    try {
      if (globalThis.Tampermonkey != null) found.push("tampermonkey");
    } catch {}
    try {
      const ext = globalThis.external;
      if (ext && (ext.AppNotifier != null || typeof ext.GetVersion === "function")) {
        found.push("greasemonkey");
      }
    } catch {}
    try {
      if (globalThis.ScriptCat != null || globalThis.CAT_VM != null) found.push("scriptcat");
    } catch {}
    try {
      if (globalThis.FireMonkey != null) found.push("firemonkey");
    } catch {}
    try {
      if (globalThis.__BM_TM_TEST__) found.push("tampermonkey");
    } catch {}
    return found;
  }

  function chromeExtUrl(extensionId, path) {
    return "chrome-extension://" + extensionId + "/" + String(path || "").replace(/^\//, "");
  }

  function probeOneUrl(url, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (ok) {
        if (done) return;
        done = true;
        resolve(ok);
      };
      var img = new Image();
      var t = setTimeout(function () {
        finish(false);
      }, timeoutMs);
      img.onload = function () {
        clearTimeout(t);
        finish(true);
      };
      img.onerror = function () {
        clearTimeout(t);
        finish(false);
      };
      try {
        img.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Math.random();
      } catch (e) {
        clearTimeout(t);
        finish(false);
      }
    });
  }

  function timeImageProbe(url, timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        resolve(Math.max(0, performance.now() - t0));
      };
      var img = new Image();
      var t = setTimeout(finish, timeoutMs);
      img.onload = function () {
        clearTimeout(t);
        finish();
      };
      img.onerror = function () {
        clearTimeout(t);
        finish();
      };
      try {
        img.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Math.random();
      } catch (e) {
        clearTimeout(t);
        finish();
      }
    });
  }

  function averageProbeMs(urls, samples, timeoutMs) {
    return (async function () {
      if (!urls.length || samples <= 0) return 0;
      var sum = 0;
      var n = 0;
      for (var i = 0; i < samples; i++) {
        var ms = await timeImageProbe(urls[i % urls.length], timeoutMs);
        sum += ms;
        n += 1;
      }
      return n ? sum / n : 0;
    })();
  }

  function timingSuggestsInstalled(targetMs, controlMs) {
    if (!(targetMs > 0)) return false;
    if (!(controlMs > 0)) return targetMs >= TIMING_MARGIN_MS;
    if (targetMs >= controlMs * TIMING_RATIO) return true;
    if (targetMs - controlMs >= TIMING_MARGIN_MS) return true;
    return false;
  }

  function probeByTiming(extensionId, paths) {
    return (async function () {
      var targetUrls = paths.slice(0, 2).map(function (p) {
        return chromeExtUrl(extensionId, p);
      });
      var controlUrls = [];
      for (var c = 0; c < CONTROL_EXT_IDS.length; c++) {
        controlUrls.push(chromeExtUrl(CONTROL_EXT_IDS[c], paths[0]));
      }
      var controlMs = await averageProbeMs(controlUrls, TIMING_SAMPLES, TIMING_TIMEOUT_MS);
      var targetMs = await averageProbeMs(targetUrls, TIMING_SAMPLES, TIMING_TIMEOUT_MS);
      return timingSuggestsInstalled(targetMs, controlMs);
    })();
  }

  function probeManagersAsync() {
    // Sync markers only. WAR image probes are dead on modern Tampermonkey MV3
    // (always chrome-extension://invalid/) and only spam the console.
    mergeManagers(probeManagerMarkers());
    return Promise.resolve(userscriptManagers.slice());
  }

  var zeradsEmbedWatchId = null;

  function stopZeradsEmbedWatch() {
    if (zeradsEmbedWatchId != null) {
      clearInterval(zeradsEmbedWatchId);
      zeradsEmbedWatchId = null;
    }
  }

  function kickIfVisibleUserscriptOnParent(reason) {
    // Cross-origin Zerads iframe: we cannot see ZERADS_PTC_SOLVER_* inside.
    // Only parent-visible markers / readable frame (rare) can kick.
    if (partnerFrameHasSolverSignal() || pageHasHardUserscriptSignal()) {
      try {
        evaluateKick(reason || "zerads_parent_tm");
      } catch (e) {}
      return true;
    }
    mergeManagers(probeManagerMarkers());
    if (blockedFrom(userscriptManagers).length) {
      try {
        evaluateKick(reason || "zerads_parent_marker");
      } catch (e) {}
      return true;
    }
    return false;
  }

  function startZeradsEmbedWatch() {
    stopZeradsEmbedWatch();
    kickIfVisibleUserscriptOnParent("zerads_embed_open");
    zeradsEmbedWatchId = setInterval(function () {
      try {
        if (!zeradsEmbedIsOpen()) {
          stopZeradsEmbedWatch();
          return;
        }
        kickIfVisibleUserscriptOnParent("zerads_embed_watch");
      } catch (e) {}
    }, 2500);
  }

  function onPartnerIframeEvent(ev) {
    try {
      var url = "";
      if (ev && ev.detail && ev.detail.url) url = String(ev.detail.url);
      if (!url) {
        var frame = document.getElementById("bm-partner-frame");
        url = frame ? String(frame.src || "") : "";
      }
      if (/zerads\.com/i.test(url)) startZeradsEmbedWatch();
    } catch (e) {}
  }

  function listOverridden() {
    const apis = [
      ["fetch", typeof fetch === "function" ? fetch : null],
      [
        "XMLHttpRequest.open",
        typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest.prototype.open : null,
      ],
      [
        "XMLHttpRequest.send",
        typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest.prototype.send : null,
      ],
      ["WebSocket", typeof WebSocket !== "undefined" ? WebSocket : null],
      [
        "History.pushState",
        typeof History !== "undefined" ? History.prototype.pushState : null,
      ],
    ];
    const hit = [];
    for (const pair of apis) {
      const name = pair[0];
      const fn = pair[1];
      try {
        if (typeof fn !== "function") continue;
        if (fn[BM_MARK]) continue;
        if (!looksNative(fn)) hit.push(name);
      } catch (e) {
        hit.push(name);
      }
    }
    return hit;
  }

  function navTampered() {
    try {
      const d = Object.getOwnPropertyDescriptor(Navigator.prototype, "webdriver");
      if (!d) return false;
      if (typeof d.get === "function" && !looksNative(d.get)) return true;
      return d.value === true;
    } catch (e) {
      return false;
    }
  }

  function userscriptHint() {
    for (const k of USERSCRIPT_KEYS) {
      try {
        if (globalThis[k] != null) return true;
      } catch (e) {}
    }
    try {
      const info = globalThis.GM_info;
      if (info && (info.scriptHandler || info.script)) return true;
    } catch (e) {}
    return false;
  }

  function extensionHint() {
    try {
      return (
        document.querySelectorAll(
          'script[src^="chrome-extension://"],script[src^="moz-extension://"],script[src^="safari-extension://"]',
        ).length > 0
      );
    } catch (e) {
      return false;
    }
  }

  function consoleTampered() {
    try {
      for (const name of ["log", "debug", "info", "warn", "error"]) {
        const fn = console[name];
        if (typeof fn === "function" && !looksNative(fn)) return true;
      }
    } catch (e) {
      return true;
    }
    return false;
  }

  function noPermissions() {
    return typeof navigator !== "undefined" && !("permissions" in navigator);
  }

  function noChromeRuntime() {
    const ua = String(navigator.userAgent || "").toLowerCase();
    if (
      !ua.includes("chrome") ||
      ua.includes("chromium") ||
      ua.includes("edg/") ||
      ua.includes("electron")
    ) {
      return false;
    }
    return !(globalThis.chrome && globalThis.chrome.runtime);
  }

  function checkHookBypass() {
    if (!ourFetch) return;
    var was = hookBypass;
    try {
      if (window.fetch !== ourFetch) {
        hookBypass = true;
      } else if (ourOpen && window.open !== ourOpen) {
        foreignOpenHijack = true;
        hookBypass = true;
      } else if (ourXhrOpen && XMLHttpRequest.prototype.open !== ourXhrOpen) {
        hookBypass = true;
      } else if (ourXhrSend && XMLHttpRequest.prototype.send !== ourXhrSend) {
        hookBypass = true;
      }
    } catch (e) {
      hookBypass = true;
    }
    if (hookBypass && !was) {
      try {
        post("hot");
      } catch (e) {}
    }
  }

  function runProbe() {
    checkHookBypass();
    mergeManagers(probeManagerMarkers());
    const overriddenApis = listOverridden();
    const managers = userscriptManagers.slice(0, 10);
    return {
      overriddenApiCount: overriddenApis.length,
      overriddenApis: overriddenApis.slice(0, 20),
      navTampered: navTampered(),
      noPermissions: noPermissions(),
      noChromeRuntime: noChromeRuntime(),
      userscriptHint: userscriptHint(),
      extensionScriptHint: extensionHint(),
      userscriptNetworkStack: userscriptNetworkStack,
      injectedInlineScript: injectedInlineScript,
      consoleTampered: consoleTampered(),
      hookBypass: hookBypass,
      foreignFetchHijack: foreignFetchHijack,
      foreignOpenHijack: foreignOpenHijack,
      hostileOverlay: hostileOverlay,
      syntheticClickWithoutGesture: syntheticClickWithoutGesture,
      markerManagers: probeManagerMarkers(),
      userscriptManagerInstalled: managers.length > 0,
      userscriptManagers: managers,
    };
  }

  function severity(p) {
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

  function markNetworkStack(stack) {
    if (!stackLooksLikeUserscript(stack)) return;
    if (!userscriptNetworkStack) {
      userscriptNetworkStack = true;
      try {
        evaluateKick("userscriptNetworkStack");
      } catch (e) {
        post("hot");
      }
    }
  }

  function isSuspiciousInjectedScript(el) {
    const src = String(el.src || "");
    if (src.includes("/assets/") || src.includes("site-integrity")) return false;
    const text = String(el.textContent || "");
    const type = String(el.type || "").toLowerCase();
    if (type.includes("json") || type === "application/ld+json") return false;
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      return scriptTextLooksHostile(text) || text.trim().length >= 120;
    }
    if (!src) {
      if (text.trim().length < 40) return false;
      return scriptTextLooksHostile(text);
    }
    if (
      src.startsWith("chrome-extension://") ||
      src.startsWith("moz-extension://") ||
      src.startsWith("safari-extension://")
    ) {
      return /userscript|tamper|violent|grease|scriptcat|monkey/i.test(src);
    }
    return false;
  }

  function onScriptAdded(node) {
    if (!(node instanceof HTMLScriptElement)) return;
    if (!isSuspiciousInjectedScript(node)) return;
    if (!injectedInlineScript) {
      injectedInlineScript = true;
      try {
        evaluateKick("injectedInlineScript");
      } catch (e) {
        post("hot");
      }
    }
  }

  // Floating "Auto-Task Bot" panels appended outside #root (F12 paste / userscript UI).
  var HOSTILE_OVERLAY_RE =
    /auto[\s-]?task\s*bot|bot\s*status|\[bot\]|tampermonkey|violentmonkey|userscript\s*panel/i;

  function isHostileOverlay(el) {
    if (!(el instanceof HTMLElement)) return false;
    try {
      var root = document.getElementById("root");
      if (root && (el === root || root.contains(el))) return false;
      if (el.id === "root" || (el.classList && el.classList.contains("notranslate") && el.id === "root")) return false;
    } catch (e) {}
    var st = el.style;
    if (!st) return false;
    var pos = String(st.position || "").toLowerCase();
    if (pos !== "fixed" && pos !== "absolute") return false;
    var z = parseInt(String(st.zIndex || "0"), 10);
    if (!(z >= 99999)) return false;
    var text = "";
    try {
      text = String(el.textContent || el.innerText || "");
    } catch (e2) {
      text = "";
    }
    return HOSTILE_OVERLAY_RE.test(text);
  }

  function onDomNodeAdded(node) {
    onScriptAdded(node);
    if (!(node instanceof HTMLElement)) return;
    if (!isHostileOverlay(node)) return;
    if (!hostileOverlay) {
      hostileOverlay = true;
      try {
        evaluateKick("hostileOverlay");
      } catch (e) {
        post("hot");
      }
    }
  }

  function nodesRelated(a, b) {
    if (a == null || b == null) return false;
    if (a === b) return true;
    if (a instanceof Node && b instanceof Node) {
      try {
        return a.contains(b) || b.contains(a);
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  function hasRecentPointerGesture(target, now) {
    if (!lastPointerGesture) return false;
    if (now - lastPointerGesture.at > POINTER_GESTURE_MAX_AGE_MS) return false;
    if (!Number.isFinite(lastPointerGesture.x) || !Number.isFinite(lastPointerGesture.y)) return false;
    return nodesRelated(lastPointerGesture.target, target);
  }

  function hasRecentKeyGesture(target, now) {
    if (!lastKeyGesture) return false;
    if (now - lastKeyGesture.at > KEY_ACTIVATE_MAX_AGE_MS) return false;
    return nodesRelated(lastKeyGesture.target, target);
  }

  function hasRecentUserGesture(target) {
    var now = Date.now();
    return hasRecentPointerGesture(target, now) || hasRecentKeyGesture(target, now);
  }

  function isActivatableClickTarget(el) {
    if (!(el instanceof Element)) return false;
    var node = el;
    for (var i = 0; i < 6 && node; i++) {
      if (!(node instanceof Element)) break;
      var tag = node.tagName;
      var role = node.getAttribute("role");
      if (
        tag === "BUTTON" ||
        tag === "A" ||
        tag === "SUMMARY" ||
        role === "button" ||
        role === "link"
      ) {
        return true;
      }
      if (node instanceof HTMLInputElement && (node.type === "submit" || node.type === "button")) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /** Partner open helper uses a hidden <a>.click() after a real button press — must not kick. */
  function isEphemeralNavClickTarget(el) {
    if (!(el instanceof Element)) return false;
    var node = el;
    for (var i = 0; i < 6 && node; i++) {
      if (!(node instanceof Element)) break;
      try {
        if (node.getAttribute("aria-hidden") === "true") return true;
        if (node.hasAttribute("data-bm-partner-nav")) return true;
        if (node.id === "bm-partner-frame-close") return true;
        var st = node.style;
        if (st && (st.display === "none" || st.visibility === "hidden")) return true;
        if (node instanceof HTMLElement) {
          if (node.offsetParent === null && st && st.position !== "fixed") {
            // Detached / invisible (typical for temporary partner <a>)
            if (node.tagName === "A" && !node.offsetWidth && !node.offsetHeight) return true;
          }
        }
      } catch (err) {}
      node = node.parentElement;
    }
    return false;
  }

  /** Real UI controls only — skip our temporary partner <a> used by openPartnerWithReferrer. */
  function isVisibleActivatableTarget(el) {
    if (!isActivatableClickTarget(el)) return false;
    if (isEphemeralNavClickTarget(el)) return false;
    return true;
  }

  function pathLooksTaskHeavy() {
    try {
      var p = String(location.pathname || "");
      return (
        p.indexOf("/internal-offerwall") !== -1 ||
        p.indexOf("/ptc") !== -1 ||
        p.indexOf("/shortlinks") !== -1 ||
        p.indexOf("/shortlink") !== -1
      );
    } catch (e) {
      return false;
    }
  }

  function onPointerDownCapture(e) {
    try {
      if (!e || !e.isTrusted) return;
      lastPointerGesture = {
        at: Date.now(),
        x: e.clientX,
        y: e.clientY,
        target: e.target,
      };
      syntheticClickStreak = 0;
    } catch (err) {}
  }

  function onKeyDownCapture(e) {
    try {
      if (!e || !e.isTrusted) return;
      var key = e.key;
      if (key !== "Enter" && key !== " " && key !== "Spacebar") return;
      var t = e.target;
      if (!(t instanceof Element)) return;
      if (!isActivatableClickTarget(t)) return;
      lastKeyGesture = { at: Date.now(), target: t };
      syntheticClickStreak = 0;
    } catch (err) {}
  }

  function onClickCapture(e) {
    try {
      if (!e) return;
      // Ignore hidden partner-nav <a>.click() from openPartnerWithReferrer after a real CTA press.
      if (isEphemeralNavClickTarget(e.target)) return;
      if (!e.isTrusted) {
        // dispatchEvent path — already strong signal
        if (isVisibleActivatableTarget(e.target)) {
          syntheticClickWithoutGesture = true;
          e.preventDefault();
          e.stopImmediatePropagation();
          evaluateKick("untrusted_click");
        }
        return;
      }
      if (!isVisibleActivatableTarget(e.target)) return;
      if (hasRecentUserGesture(e.target)) {
        syntheticClickStreak = 0;
        return;
      }
      // HTMLElement.click() — trusted click, no prior pointer/key on this control
      syntheticClickStreak += 1;
      var kickNow = pathLooksTaskHeavy() || syntheticClickStreak >= SYNTHETIC_CLICK_STREAK_FOR_KICK;
      if (!kickNow) return;
      syntheticClickWithoutGesture = true;
      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch (err) {}
      evaluateKick("synthetic_click");
    } catch (err2) {}
  }

  let gestureGuardsInstalled = false;

  function installPointerGestureGuards() {
    if (typeof document === "undefined" || gestureGuardsInstalled) return;
    gestureGuardsInstalled = true;
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("keydown", onKeyDownCapture, true);
    document.addEventListener("click", onClickCapture, true);
  }

  function installHooks() {
    installPointerGestureGuards();
    if (window[BM_INSTALLED]) {
      const f = window.fetch;
      if (typeof f === "function" && f[BM_MARK]) ourFetch = f;
      try {
        var o = window.open;
        if (typeof o === "function" && o[BM_MARK]) ourOpen = o;
      } catch (e) {}
      if (typeof XMLHttpRequest !== "undefined") {
        if (XMLHttpRequest.prototype.open[BM_MARK]) ourXhrOpen = XMLHttpRequest.prototype.open;
        if (XMLHttpRequest.prototype.send[BM_MARK]) ourXhrSend = XMLHttpRequest.prototype.send;
      }
    } else {
      window[BM_INSTALLED] = true;
      var nativeFetch = window.fetch.bind(window);
      var fetchImpl = nativeFetch;
      function loginBlockedByUserscript() {
        if (!USERSCRIPT_MANAGER_KICK_ENABLED) return false;
        try {
          if (globalThis.__BM_TM_TEST__) return true;
          if (globalThis.Tampermonkey) return true;
          if (globalThis["**VMInitInjection**"] != null) return true;
          if (globalThis.Violentmonkey) return true;
          if (globalThis.GM_info || globalThis.GM_xmlhttpRequest) return true;
        } catch (e) {}
        return false;
      }
      function bmIntegrityFetch(input, init) {
        try {
          markNetworkStack(new Error().stack || "");
        } catch (e) {}
        try {
          var url = typeof input === "string" ? input : input && input.url;
          if (url && String(url).indexOf("/auth/login") !== -1 && loginBlockedByUserscript()) {
            var err = new Error("USERSCRIPT_MANAGER_BLOCKED");
            err.name = "USERSCRIPT_MANAGER_BLOCKED";
            return Promise.reject(err);
          }
        } catch (e) {}
        return fetchImpl.apply(undefined, arguments);
      }
      bmIntegrityFetch[BM_MARK] = true;
      ourFetch = bmIntegrityFetch;
      try {
        Object.defineProperty(window, "fetch", {
          configurable: true,
          enumerable: true,
          get: function () {
            return bmIntegrityFetch;
          },
          set: function (v) {
            if (typeof v !== "function") return;
            // Ignore our own re-marks (avoids recursion with login banner wraps).
            if (v[BM_MARK] || v.__bmLoginGuard) return;
            // Foreign assignment — classic userscript/F12 pattern: const o=fetch; fetch=...
            foreignFetchHijack = true;
            hookBypass = true;
            try {
              evaluateKick("fetch_hijack");
            } catch (e) {}
          },
        });
      } catch (e) {
        window.fetch = bmIntegrityFetch;
      }

      // Trap window.open — classic auto-task bots wrap it to capture partner tabs.
      var nativeOpen = typeof window.open === "function" ? window.open.bind(window) : null;
      function bmIntegrityOpenWin() {
        return nativeOpen ? nativeOpen.apply(window, arguments) : null;
      }
      bmIntegrityOpenWin[BM_MARK] = true;
      ourOpen = bmIntegrityOpenWin;
      try {
        Object.defineProperty(window, "open", {
          configurable: true,
          enumerable: true,
          get: function () {
            return bmIntegrityOpenWin;
          },
          set: function (v) {
            if (typeof v !== "function") return;
            if (v[BM_MARK]) return;
            foreignOpenHijack = true;
            hookBypass = true;
            try {
              evaluateKick("open_hijack");
            } catch (e) {}
          },
        });
      } catch (e) {
        try {
          window.open = bmIntegrityOpenWin;
        } catch (e2) {}
      }

      if (typeof XMLHttpRequest !== "undefined") {
        const proto = XMLHttpRequest.prototype;
        const originalOpen = proto.open;
        const originalSend = proto.send;
        function bmIntegrityOpen(method, url, async, username, password) {
          try {
            markNetworkStack(new Error().stack || "");
          } catch (e) {}
          return originalOpen.call(
            this,
            method,
            url,
            async !== false,
            username != null ? username : null,
            password != null ? password : null,
          );
        }
        function bmIntegritySend(body) {
          try {
            markNetworkStack(new Error().stack || "");
          } catch (e) {}
          return originalSend.call(this, body);
        }
        bmIntegrityOpen[BM_MARK] = true;
        bmIntegritySend[BM_MARK] = true;
        proto.open = bmIntegrityOpen;
        proto.send = bmIntegritySend;
        ourXhrOpen = proto.open;
        ourXhrSend = proto.send;
      }

      if (typeof MutationObserver !== "undefined" && document.documentElement) {
        new MutationObserver(function (mutations) {
          for (const m of mutations) {
            m.addedNodes.forEach(onDomNodeAdded);
          }
        }).observe(document.documentElement, { childList: true, subtree: true });
      }
    }

    probeManagersAsync().then(function (ids) {
      var markers = probeManagerMarkers();
      if (
        shouldKick({
          markerManagers: markers,
          userscriptHint: userscriptHint(),
          userscriptNetworkStack: userscriptNetworkStack,
          injectedInlineScript: injectedInlineScript,
          foreignFetchHijack: foreignFetchHijack,
          foreignOpenHijack: foreignOpenHijack,
          hostileOverlay: hostileOverlay,
          syntheticClickWithoutGesture: syntheticClickWithoutGesture,
        })
      ) {
        evaluateKick("probeManagers");
      } else if (ids && ids.length) {
        post("hot");
      }
    });
  }

  function post(reason) {
    try {
      const probe = runProbe();
      if (shouldKick(probe)) {
        kickToLogin(
          blockedFrom(probe.userscriptManagers).length
            ? probe.userscriptManagers
            : ["tampermonkey"],
        );
        return;
      }
      const sev = severity(probe);
      const now = Date.now();
      const urgent = reason === "boot" || reason === "hot";
      if (now - lastAt < GAP_MS && sev <= lastSev && !urgent) return;
      if (reason === "hot" && sev <= lastSev && now - lastAt < GAP_MS) return;
      lastAt = now;
      lastSev = Math.max(lastSev, sev);
      const body = {
        eventType: ("site:integrity:" + reason).slice(0, 40),
        sessionId: sessionId.slice(0, 80),
        telemetry: {
          browser: {
            webdriver: Boolean(navigator.webdriver),
            userAgent: navigator.userAgent,
          },
          environment: {
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            hardwareConcurrency: navigator.hardwareConcurrency,
            platform: navigator.platform,
            plugins: navigator.plugins && navigator.plugins.length,
          },
          device: {},
          behavior: { humanLikeInput: true, impossibleSpeed: false },
          integrity: probe,
        },
      };
      fetch("/api/antibot/telemetry", {
        method: "POST",
        credentials: "include",
        headers: (function () {
          const h = { "Content-Type": "application/json" };
          try {
            const m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
            if (m) h["x-csrf-token"] = decodeURIComponent(m[1]);
          } catch (e) {}
          return h;
        })(),
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        })
        .then(function (data) {
          if (data && data.kick) kickToLogin(data.managers || probe.userscriptManagers);
        })
        .catch(function () {});
    } catch (e) {}
  }

  function boot() {
    try {
      console.info("[BM-integrity] boot", {
        bmTest: !!globalThis.__BM_TM_TEST__,
        tm: !!globalThis.Tampermonkey,
      });
    } catch (e) {}
    installHooks();
    try {
      window.addEventListener("bm:partner-iframe", onPartnerIframeEvent);
      // If SPA already opened Zerads before this script finished, pick it up.
      if (zeradsEmbedIsOpen()) startZeradsEmbedWatch();
    } catch (e) {}
    post("boot");
    // Fast poll — TM inject-into may win the race after our first check.
    var polls = 0;
    var pollId = setInterval(function () {
      polls += 1;
      try {
        if (!String(location.pathname || "").includes("/login")) kickStarted = false;
      } catch (e) {}
      try {
        if (!String(location.pathname || "").includes("/login")) {
          if (partnerFrameHasSolverSignal()) evaluateKick("partner_solver");
          else if (zeradsEmbedIsOpen() && pageHasHardUserscriptSignal()) evaluateKick("zerads_embed_tm");
          else evaluateKick("poll");
        } else {
          checkHookBypass();
        }
      } catch (e) {}
      if (polls >= 60) clearInterval(pollId);
    }, 500);
    // Long-lived watchdog: re-kick if user logs back in with TM/VM still present.
    setInterval(function () {
      try {
        if (String(location.pathname || "").includes("/login")) return;
        kickStarted = false;
        if (partnerFrameHasSolverSignal()) evaluateKick("partner_solver_watch");
        else evaluateKick("watchdog");
      } catch (e) {}
    }, 2000);
    setInterval(function () {
      post("interval");
    }, PROBE_MS);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") post("focus");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
