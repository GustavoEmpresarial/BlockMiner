/**
 * BlockMiner feature Turnstile gate v4 — every page visit, no TTL — page-entry captcha for
 * /youtube, /faucet, /shortlinks (SPA prebuilt).
 * Retries until status confirms pass (or gate inactive). Lazy site-key read.
 */
(function () {
  "use strict";
  if (window.__BM_FEATURE_TURNSTILE_GATE_V4__) return;
  window.__BM_FEATURE_TURNSTILE_GATE_V4__ = true;

  var busy = false;
  /** purpose -> "ok" | "pending" */
  var done = Object.create(null);
  var scriptPromise = null;
  var failStreak = 0;
  var needInvalidate = Object.create(null);

  var ROUTES = [
    { re: /^\/youtube(\/|$)/i, purpose: "youtube", api: "/api/youtube", home: "/" },
    { re: /^\/faucet(\/|$)/i, purpose: "faucet", api: "/api/faucet", home: "/" },
    { re: /^\/shortlinks?(\/|$)/i, purpose: "shortlink", api: "/api/shortlink", home: "/" },
    { re: /^\/auto-mining(\/|$)/i, purpose: "automining", api: "/api/auto-mining-gpu", home: "/" },
  ];

  function siteKey() {
    try {
      return (
        window.__BM_TURNSTILE_SITE_KEY__ ||
        (window.__BLOCKMINER_ENV__ && window.__BLOCKMINER_ENV__.VITE_TURNSTILE_SITE_KEY) ||
        ""
      ).trim();
    } catch (e) {
      return "";
    }
  }

  function csrfHeader() {
    try {
      var m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
      if (m) return { "x-csrf-token": decodeURIComponent(m[1]) };
    } catch (e) {}
    return {};
  }

  function matchRoute(path) {
    var p = String(path || location.pathname || "");
    for (var i = 0; i < ROUTES.length; i++) {
      if (ROUTES[i].re.test(p)) return ROUTES[i];
    }
    return null;
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

  function fetchStatus(apiBase, invalidate) {
    var q = invalidate ? "?invalidate=1" : "";
    return fetch(apiBase + "/turnstile-status" + q, {
      credentials: "include",
      headers: Object.assign({ Accept: "application/json" }, csrfHeader()),
    }).then(function (r) {
      return r.json().then(
        function (data) {
          return { http: r.status, data: data || {} };
        },
        function () {
          return { http: r.status, data: {} };
        },
      );
    });
  }

  function postPass(apiBase, token) {
    return fetch(apiBase + "/turnstile-pass", {
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

  function showModal(route) {
    return new Promise(function (resolve, reject) {
      var key = siteKey();
      if (!key) {
        reject(new Error("no site key"));
        return;
      }
      if (document.getElementById("bm-feature-turnstile-overlay")) {
        reject(new Error("already_open"));
        return;
      }
      var overlay = document.createElement("div");
      overlay.id = "bm-feature-turnstile-overlay";
      overlay.setAttribute("data-bm-purpose", route.purpose);
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:16px;";
      var card = document.createElement("div");
      card.style.cssText =
        "width:100%;max-width:420px;background:#0f172a;border:1px solid #334155;border-radius:16px;padding:20px;color:#e2e8f0;font-family:system-ui,sans-serif;";
      card.innerHTML =
        '<h2 style="margin:0 0 8px;font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Verificação humana</h2>' +
        '<p style="margin:0 0 12px;font-size:13px;line-height:1.45;color:#cbd5e1">Complete a verificação Cloudflare para continuar nesta página.</p>' +
        '<div id="bm-feature-ts-host" style="min-height:65px"></div>' +
        '<div style="display:flex;gap:10px;margin-top:14px">' +
        '<button type="button" id="bm-feature-ts-cancel" style="flex:1;padding:12px;border-radius:12px;border:1px solid #475569;background:transparent;color:#cbd5e1;font-weight:700;cursor:pointer">Cancelar</button>' +
        '<button type="button" id="bm-feature-ts-ok" disabled style="flex:1;padding:12px;border-radius:12px;border:0;background:#0ea5e9;color:#020617;font-weight:800;cursor:pointer;opacity:.4">Continuar</button>' +
        "</div>";
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      var token = "";
      var widgetId = null;
      var okBtn = card.querySelector("#bm-feature-ts-ok");
      var cancelBtn = card.querySelector("#bm-feature-ts-cancel");
      var host = card.querySelector("#bm-feature-ts-host");

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
        postPass(route.api, token)
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
            sitekey: key,
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
    if (document.getElementById("bm-feature-turnstile-overlay")) return;

    var path = location.pathname;
    var route = matchRoute(path);
    if (!route) return;
    if (done[route.purpose] === "ok") return;

    busy = true;
    var inv = !!needInvalidate[route.purpose];
    if (inv) needInvalidate[route.purpose] = false;
    fetchStatus(route.api, inv)
      .then(function (res) {
        var st = res && res.data;
        // Not logged in yet — retry later
        if (res.http === 401 || res.http === 403) {
          failStreak += 1;
          return;
        }
        if (!(st && st.ok !== false && st.active)) {
          // Gate inactive or unexpected — stop hammering this purpose
          if (st && st.active === false) done[route.purpose] = "ok";
          return;
        }
        // Server always reports required while gate is on (no TTL).
        // Local `done` skips only until reload / leaving the page.
        if (!st.required) {
          done[route.purpose] = "ok";
          failStreak = 0;
          return;
        }
        return showModal(route)
          .then(function () {
            done[route.purpose] = "ok";
            failStreak = 0;
          })
          .catch(function (err) {
            if (String(err && err.message) === "cancelled") {
              try {
                location.assign(route.home || "/");
              } catch (e) {}
              return;
            }
            // keep retrying
            failStreak += 1;
          });
      })
      .catch(function () {
        failStreak += 1;
      })
      .finally(function () {
        busy = false;
      });
  }

  var lastNavPath = "";
  function onNav() {
    var path = location.pathname;
    if (path !== lastNavPath) {
      lastNavPath = path;
      for (var k in done) {
        if (Object.prototype.hasOwnProperty.call(done, k)) delete done[k];
      }
      var r0 = matchRoute(path);
      if (r0) needInvalidate[r0.purpose] = true;
    }
    var route = matchRoute(path);
    if (!route) return;
    setTimeout(maybeGate, 30);
    setTimeout(maybeGate, 400);
    setTimeout(maybeGate, 1200);
  }

  try {
    var _ps = history.pushState;
    var _rs = history.replaceState;
    history.pushState = function () {
      var r = _ps.apply(this, arguments);
      onNav();
      return r;
    };
    history.replaceState = function () {
      var r = _rs.apply(this, arguments);
      onNav();
      return r;
    };
    addEventListener("popstate", onNav);
  } catch (e) {}

  // Also hook History.prototype in case SPA calls it directly
  try {
    if (typeof History !== "undefined" && History.prototype) {
      var _pps = History.prototype.pushState;
      var _prs = History.prototype.replaceState;
      if (_pps && !_pps.__bmFeatureTs) {
        History.prototype.pushState = function () {
          var r = _pps.apply(this, arguments);
          onNav();
          return r;
        };
        History.prototype.pushState.__bmFeatureTs = true;
      }
      if (_prs && !_prs.__bmFeatureTs) {
        History.prototype.replaceState = function () {
          var r = _prs.apply(this, arguments);
          onNav();
          return r;
        };
        History.prototype.replaceState.__bmFeatureTs = true;
      }
    }
  } catch (e) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onNav);
  } else {
    onNav();
  }
  setInterval(function () {
    var route = matchRoute(location.pathname);
    if (!route) return;
    if (done[route.purpose] === "ok") return;
    maybeGate();
  }, 1500);

  // When leaving feature pages, allow re-prompt next visit (TTL may expire)
  setInterval(function () {
    var route = matchRoute(location.pathname);
    if (!route) {
      for (var k in done) {
        if (Object.prototype.hasOwnProperty.call(done, k)) delete done[k];
      }
    }
  }, 3000);
})();
