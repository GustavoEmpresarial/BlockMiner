/**
 * BlockMiner — SatsPay OAuth button injector (v3).
 * Uses redirect mode (COOP same-origin breaks popup opener) + official logo swap.
 */
(function () {
  "use strict";
  if (window.__BM_SATSPAY_AUTH_V3__) return;
  window.__BM_SATSPAY_AUTH_V3__ = true;

  var SATSPAY_LOGO_URL = "/media/brand/satspay-icon-64.png";
  var SATSPAY_LOGO_HTML =
    '<img src="' +
    SATSPAY_LOGO_URL +
    '" alt="" width="20" height="20" style="width:20px;height:20px;object-fit:contain;flex-shrink:0;border-radius:4px" />';

  function csrfHeader() {
    try {
      var m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
      if (m) return { "x-csrf-token": decodeURIComponent(m[1]) };
    } catch (e) {}
    return {};
  }

  function onLoginPath() {
    try {
      var p = String(location.pathname || "");
      return p === "/login" || p.indexOf("/login") === 0;
    } catch (e) {
      return false;
    }
  }

  function loadSdk(src) {
    return new Promise(function (resolve, reject) {
      if (window.SatsPay) return resolve();
      var existing = document.querySelector('script[data-satspay-sdk="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", function () {
          reject(new Error("sdk"));
        });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.setAttribute("data-satspay-sdk", "1");
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("sdk"));
      };
      document.head.appendChild(s);
    });
  }

  /** Force redirect mode — popup + COOP leaves opener blind. */
  function forceRedirectMode() {
    try {
      if (!window.SatsPay || window.SatsPay.__bmRedirectPatched) return;
      var orig = window.SatsPay.signIn.bind(window.SatsPay);
      window.SatsPay.signIn = function (options) {
        options = Object.assign({}, options || {}, { mode: "redirect" });
        return orig(options);
      };
      window.SatsPay.__bmRedirectPatched = true;
      if (window.SatsPay.config) window.SatsPay.config.mode = "redirect";
    } catch (e) {}
  }

  function findMount() {
    var form = document.querySelector('form[data-testid="login-main-form"]') || document.querySelector("form");
    if (!form || !form.parentElement) return null;
    var existing = document.getElementById("bm-satspay-mount");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = "bm-satspay-mount";
    wrap.style.cssText =
      "margin-top:1.25rem;display:flex;flex-direction:column;align-items:stretch;gap:0.75rem;";
    form.parentElement.insertBefore(wrap, form.nextSibling);
    return wrap;
  }

  function showError(msg) {
    try {
      var el = document.getElementById("bm-satspay-error");
      if (!el) {
        el = document.createElement("div");
        el.id = "bm-satspay-error";
        el.style.cssText =
          "margin:0.75rem 0;padding:0.75rem 1rem;border-radius:1rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;font-size:12px;font-weight:700;";
        var mount = document.getElementById("bm-satspay-mount");
        if (mount) mount.insertBefore(el, mount.firstChild);
      }
      el.textContent = String(msg || "Login SatsPay falhou.");
    } catch (e) {}
  }

  function swapOfficialLogo(root) {
    try {
      var scope = root || document.getElementById("bm-satspay-mount") || document;
      var buttons = scope.querySelectorAll(".satspay-signin button, [data-satspay-signin] button");
      buttons.forEach(function (btn) {
        if (btn.getAttribute("data-bm-satspay-logo") === "1") return;
        var svg = btn.querySelector("svg");
        if (svg) {
          var wrap = document.createElement("span");
          wrap.innerHTML = SATSPAY_LOGO_HTML;
          var img = wrap.firstChild;
          svg.parentNode.replaceChild(img, svg);
          btn.setAttribute("data-bm-satspay-logo", "1");
        }
      });
    } catch (e) {}
  }

  function goDashboard() {
    location.href = "/dashboard";
  }

  function exchangeCode(code) {
    var redirectUri = window.__BM_SATSPAY_REDIRECT__ || "";
    return fetch("/api/auth/satspay", {
      method: "POST",
      credentials: "include",
      headers: Object.assign(
        { "Content-Type": "application/json", Accept: "application/json" },
        csrfHeader(),
      ),
      body: JSON.stringify({ code: code, redirectUri: redirectUri || undefined }),
    }).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, j: j };
      });
    });
  }

  window.onBlockMinerSatsPaySuccess = function (response) {
    if (response && response.sessionReady) {
      goDashboard();
      return;
    }
    var code = response && response.code ? String(response.code) : "";
    if (!code) return showError("Código OAuth ausente.");
    exchangeCode(code)
      .then(function (x) {
        if (x.ok && x.j && x.j.ok) {
          goDashboard();
          return;
        }
        showError((x.j && (x.j.message || x.j.error)) || "Login SatsPay falhou.");
      })
      .catch(function () {
        showError("Login SatsPay falhou.");
      });
  };

  // Backup if popup somehow still used and callback posts sessionReady
  try {
    window.addEventListener("message", function (event) {
      var d = event && event.data;
      if (!d || d.type !== "SATSPAY_AUTH_SUCCESS") return;
      if (d.sessionReady) {
        goDashboard();
        return;
      }
      if (typeof window.onBlockMinerSatsPaySuccess === "function") {
        window.onBlockMinerSatsPaySuccess(d);
      }
    });
    window.addEventListener("storage", function (event) {
      if (event.key !== "bm_satspay_oauth" || !event.newValue) return;
      try {
        var payload = JSON.parse(event.newValue);
        if (payload && payload.sessionReady) goDashboard();
      } catch (e) {}
    });
  } catch (e) {}

  function mount(cfg) {
    if (!cfg || !cfg.enabled || !cfg.clientId) return;
    var wrap = findMount();
    if (!wrap) return;
    wrap.innerHTML = "";
    var divider = document.createElement("div");
    divider.style.cssText =
      "display:flex;align-items:center;gap:0.75rem;color:#64748b;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;";
    divider.innerHTML =
      '<span style="flex:1;height:1px;background:rgba(255,255,255,0.1)"></span><span>ou</span><span style="flex:1;height:1px;background:rgba(255,255,255,0.1)"></span>';
    wrap.appendChild(divider);
    var btn = document.createElement("div");
    btn.className = "satspay-signin";
    btn.setAttribute("data-client_id", cfg.clientId);
    btn.setAttribute("data-redirect_uri", cfg.redirectUri || "");
    btn.setAttribute("data-theme", cfg.theme || "light");
    btn.setAttribute("data-text", "signin_with");
    btn.setAttribute("data-size", "large");
    btn.setAttribute("data-onsuccess", "onBlockMinerSatsPaySuccess");
    wrap.appendChild(btn);
    window.__BM_SATSPAY_REDIRECT__ = cfg.redirectUri || "";
    forceRedirectMode();
    try {
      if (window.SatsPay && window.SatsPay.autoRender) window.SatsPay.autoRender();
    } catch (e) {}
    swapOfficialLogo(wrap);
    setTimeout(function () {
      swapOfficialLogo(wrap);
    }, 50);
    setTimeout(function () {
      swapOfficialLogo(wrap);
    }, 300);
  }

  function boot() {
    if (!onLoginPath()) return;
    fetch("/api/auth/satspay/config", { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var cfg = (data && data.satspay) || {};
        if (!cfg.enabled || !cfg.clientId) return;
        return loadSdk(cfg.sdkUrl || "https://www.satspay.pro/sdk/satspay-auth.js").then(function () {
          forceRedirectMode();
          mount(cfg);
        });
      })
      .catch(function () {});
  }

  function watch() {
    boot();
    var last = location.pathname;
    setInterval(function () {
      if (location.pathname !== last) {
        last = location.pathname;
        boot();
      } else if (onLoginPath()) {
        if (!document.getElementById("bm-satspay-mount")) boot();
        else swapOfficialLogo();
      }
    }, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();
