/**
 * BlockMiner game Turnstile gate v1 — every N rewarded games (SPA prebuilt).
 * On /games/<slug> (session pages), if captcha is due, shows Turnstile and
 * POSTs /api/games/turnstile-pass before play continues.
 */
(function () {
  "use strict";

  var SITE_KEY = (
    window.__BM_TURNSTILE_SITE_KEY__ ||
    (window.__BLOCKMINER_ENV__ && window.__BLOCKMINER_ENV__.VITE_TURNSTILE_SITE_KEY) ||
    ""
  ).trim();

  var busy = false;
  var lastPath = "";
  var scriptPromise = null;

  function csrfHeader() {
    try {
      var m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
      if (m) return { "x-csrf-token": decodeURIComponent(m[1]) };
    } catch (e) {}
    return {};
  }

  function isGameSessionPath(path) {
    try {
      var p = String(path || location.pathname || "");
      if (p === "/games" || p === "/games/") return false;
      if (p.indexOf("/games/verify") === 0) return false;
      if (p.indexOf("/games/2048") === 0) return true;
      return /^\/games\/[a-z0-9-]+\/?$/i.test(p);
    } catch (e) {
      return false;
    }
  }

  function loadTurnstile() {
    if (window.turnstile && typeof window.turnstile.render === "function") {
      return Promise.resolve();
    }
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        scriptPromise = null;
        reject(new Error("turnstile load failed"));
      };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  function fetchStatus() {
    return fetch("/api/games/turnstile-status", {
      credentials: "include",
      headers: Object.assign({ Accept: "application/json" }, csrfHeader()),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .catch(function () {
        return {};
      });
  }

  function postPass(token) {
    return fetch("/api/games/turnstile-pass", {
      method: "POST",
      credentials: "include",
      headers: Object.assign(
        { "Content-Type": "application/json", Accept: "application/json" },
        csrfHeader(),
      ),
      body: JSON.stringify({ cfTurnstileToken: token }),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data || !data.ok) throw new Error((data && data.code) || "pass_failed");
        return data;
      });
    });
  }

  function showModal() {
    return new Promise(function (resolve, reject) {
      if (!SITE_KEY) {
        reject(new Error("no site key"));
        return;
      }
      if (document.getElementById("bm-game-turnstile-overlay")) {
        reject(new Error("already_open"));
        return;
      }
      var overlay = document.createElement("div");
      overlay.id = "bm-game-turnstile-overlay";
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:16px;";
      var card = document.createElement("div");
      card.style.cssText =
        "width:100%;max-width:420px;background:#0f172a;border:1px solid #334155;border-radius:16px;padding:20px;color:#e2e8f0;font-family:system-ui,sans-serif;";
      card.innerHTML =
        '<h2 style="margin:0 0 8px;font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Verificação humana</h2>' +
        '<p style="margin:0 0 12px;font-size:13px;line-height:1.45;color:#cbd5e1">A cada 10 partidas pedimos uma verificação rápida da Cloudflare para liberar a recompensa.</p>' +
        '<div id="bm-game-ts-host" style="min-height:65px"></div>' +
        '<div style="display:flex;gap:10px;margin-top:14px">' +
        '<button type="button" id="bm-game-ts-cancel" style="flex:1;padding:12px;border-radius:12px;border:1px solid #475569;background:transparent;color:#cbd5e1;font-weight:700;cursor:pointer">Cancelar</button>' +
        '<button type="button" id="bm-game-ts-ok" disabled style="flex:1;padding:12px;border-radius:12px;border:0;background:#0ea5e9;color:#020617;font-weight:800;cursor:pointer;opacity:.4">Continuar</button>' +
        "</div>";
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      var token = "";
      var widgetId = null;
      var okBtn = card.querySelector("#bm-game-ts-ok");
      var cancelBtn = card.querySelector("#bm-game-ts-cancel");
      var host = card.querySelector("#bm-game-ts-host");

      function cleanup() {
        try {
          if (widgetId != null && window.turnstile && window.turnstile.remove) {
            window.turnstile.remove(widgetId);
          }
        } catch (e) {}
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      cancelBtn.onclick = function () {
        cleanup();
        reject(new Error("cancelled"));
      };
      okBtn.onclick = function () {
        if (!token) return;
        okBtn.disabled = true;
        postPass(token)
          .then(function () {
            cleanup();
            resolve(token);
          })
          .catch(function (err) {
            cleanup();
            reject(err);
          });
      };

      loadTurnstile()
        .then(function () {
          widgetId = window.turnstile.render(host, {
            sitekey: SITE_KEY,
            theme: "dark",
            callback: function (t) {
              token = String(t || "");
              okBtn.disabled = !token;
              okBtn.style.opacity = token ? "1" : ".4";
            },
            "expired-callback": function () {
              token = "";
              okBtn.disabled = true;
              okBtn.style.opacity = ".4";
            },
            "error-callback": function () {
              token = "";
              okBtn.disabled = true;
              okBtn.style.opacity = ".4";
            },
          });
        })
        .catch(function (e) {
          cleanup();
          reject(e);
        });
    });
  }

  function maybeGate() {
    if (busy) return;
    var path = location.pathname;
    if (!isGameSessionPath(path)) {
      lastPath = path;
      return;
    }
    if (path === lastPath) return;
    lastPath = path;
    busy = true;
    fetchStatus()
      .then(function (st) {
        if (!(st && st.active && st.required)) return;
        return showModal().catch(function (err) {
          if (String(err && err.message) === "cancelled") {
            try {
              location.assign("/games");
            } catch (e) {}
          }
        });
      })
      .finally(function () {
        busy = false;
      });
  }

  // SPA navigations
  try {
    var _ps = history.pushState;
    var _rs = history.replaceState;
    history.pushState = function () {
      var r = _ps.apply(this, arguments);
      setTimeout(maybeGate, 50);
      return r;
    };
    history.replaceState = function () {
      var r = _rs.apply(this, arguments);
      setTimeout(maybeGate, 50);
      return r;
    };
    addEventListener("popstate", function () {
      setTimeout(maybeGate, 50);
    });
  } catch (e) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeGate);
  } else {
    maybeGate();
  }
  setInterval(maybeGate, 2000);
})();
