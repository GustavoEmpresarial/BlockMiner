/**
 * Auth UI polish v6 — also kills dollarSign leak site-wide — slim login/register chrome for prebuilt SPA.
 * Replaces landing mega-footer with a compact bar; tightens card + header.
 */
(function () {
  "use strict";
  if (window.__BM_AUTH_UI_POLISH_V6__) return;
  window.__BM_AUTH_UI_POLISH_V6__ = true;

  var LEAK_RE = /^(dollarSign|DollarSign|dollar-sign)$/i;

  function isAuthPath() {
    try {
      var p = String(location.pathname || "");
      return p === "/login" || p === "/register" || p.indexOf("/login") === 0 || p.indexOf("/register") === 0;
    } catch (e) {
      return false;
    }
  }

  function injectCss() {
    var style = document.getElementById("bm-auth-ui-polish-css");
    if (!style) {
      style = document.createElement("style");
      style.id = "bm-auth-ui-polish-css";
      document.head.appendChild(style);
    }
    style.textContent = [
      /* Hide landing-style nav links on auth (Como funciona / Recursos / FAQ) */
      "body.bm-auth-polish header nav[aria-label],",
      "body.bm-auth-polish header .hidden.md\\:flex{display:none !important;}",
      "body.bm-auth-polish header{border-color:rgba(255,255,255,.06) !important;}",
      "body.bm-auth-polish header > div{max-width:36rem !important;margin-left:auto;margin-right:auto;}",
      /* Main + card */
      "body.bm-auth-polish main{padding:1.5rem 1rem 2rem !important;align-items:flex-start !important;}",
      "@media (min-width:640px){body.bm-auth-polish main{padding:2.5rem 1.5rem !important;align-items:center !important;}}",
      "body.bm-auth-polish main > div{width:100%;max-width:26rem;margin:0 auto;}",
      "@media (min-width:640px){body.bm-auth-polish main > div{max-width:28rem;}}",
      "body.bm-auth-polish main h1{font-size:clamp(1.45rem,5vw,2rem) !important;line-height:1.15 !important;}",
      "body.bm-auth-polish main div.backdrop-blur-xl,",
      "body.bm-auth-polish main form{max-width:100%;}",
      "body.bm-auth-polish main div.backdrop-blur-xl{",
      "  border-radius:1.15rem !important;padding:1.15rem !important;",
      "  box-shadow:0 20px 50px rgba(0,0,0,.35) !important;",
      "}",
      "@media (min-width:640px){body.bm-auth-polish main div.backdrop-blur-xl{border-radius:1.5rem !important;padding:1.75rem !important;}}",
      /* Kill stock / mega footers */
      "body.bm-auth-polish footer:not(#bm-auth-footer),",
      "body.bm-auth-polish .bm-auth-stock-footer,",
      "body.bm-auth-polish .bm-dollar-leak{display:none !important;}",
      "body.bm-auth-polish #bm-auth-footer{display:block !important;margin-top:auto;position:relative;z-index:10;}",
      "body.bm-auth-polish #bm-auth-footer a{color:#64748b;text-decoration:none;}",
      "body.bm-auth-polish #bm-auth-footer a:hover{color:#38bdf8;}",
      "body.bm-auth-polish #bm-satspay-mount{margin-top:1rem !important;}",
      "body.bm-auth-polish #bm-satspay-mount .satspay-signin,",
      "body.bm-auth-polish #bm-satspay-mount button{width:100% !important;max-width:100%;}",
      "body.bm-auth-polish iframe[src*='challenges.cloudflare.com']{max-width:100% !important;}",
      "body.bm-auth-polish #bm-satspay-error{margin-top:.75rem;}",
    ].join("\n");
  }

  function hideDollarLeaks(root) {
    try {
      var base = root || document.body;
      var walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, null);
      var node;
      var doomed = [];
      while ((node = walker.nextNode())) {
        var t = String(node.nodeValue || "").trim();
        if (LEAK_RE.test(t)) doomed.push(node);
      }
      doomed.forEach(function (n) {
        var p = n.parentElement;
        if (p) {
          p.classList.add("bm-dollar-leak");
          p.style.display = "none";
        }
        n.nodeValue = "";
      });
    } catch (e) {}
  }

  function stripComplianceLeak(root) {
    try {
      var base = root || document.body;
      var needles = ["acesso público apoia", "Public access supports GDPR", "requisitos de transparência da LGPD", "Mine POL, jogue e saque"];
      var walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, null);
      var node;
      var doomed = [];
      while ((node = walker.nextNode())) {
        var t = String(node.nodeValue || "");
        // Only strip LGPD / old mega-footer tagline outside our slim footer
        for (var i = 0; i < 3; i++) {
          if (t.indexOf(needles[i]) >= 0) {
            doomed.push(node);
            break;
          }
        }
      }
      doomed.forEach(function (n) {
        var p = n.parentElement;
        n.nodeValue = "";
        if (p && (!p.closest || !p.closest("#bm-auth-footer"))) {
          p.style.display = "none";
          p.classList.add("bm-auth-stock-footer");
        }
      });
    } catch (e) {}
  }

  function footerHtml(year) {
    return (
      '<footer id="bm-auth-footer" style="border-top:1px solid rgba(255,255,255,.06);background:#02070f;">' +
      '<div style="max-width:36rem;margin:0 auto;padding:1.1rem 1rem;display:flex;flex-wrap:wrap;gap:.75rem 1.25rem;align-items:center;justify-content:space-between;">' +
      '<p style="margin:0;font-size:.75rem;color:#64748b;">© ' +
      year +
      " BlockMiner</p>" +
      '<nav style="display:flex;flex-wrap:wrap;gap:.35rem 1rem;font-size:.75rem;">' +
      '<a href="/terms-of-use">Termos</a>' +
      '<a href="/privacy-policy">Privacidade</a>' +
      '<a href="/">Voltar</a>' +
      "</nav></div></footer>"
    );
  }

  function hideStockFooters(shell) {
    try {
      (shell || document).querySelectorAll("footer").forEach(function (el) {
        if (el.id === "bm-auth-footer") return;
        el.classList.add("bm-auth-stock-footer");
        el.style.display = "none";
      });
      // Hide mega blocks that look like landing footer columns
      (shell || document).querySelectorAll("footer, section, div").forEach(function (el) {
        if (el.id === "bm-auth-footer") return;
        var txt = (el.textContent || "").trim();
        if (
          txt.indexOf("Mine POL, jogue e saque") >= 0 ||
          (txt.indexOf("Produto") >= 0 && txt.indexOf("Como funciona") >= 0 && txt.indexOf("Transparência") >= 0 && txt.length < 800)
        ) {
          if (!el.querySelector("#bm-auth-footer")) {
            el.classList.add("bm-auth-stock-footer");
            el.style.display = "none";
          }
        }
      });
    } catch (e) {}
  }

  function ensureFooter() {
    var shell = document.querySelector("body > #root > div") || document.getElementById("root");
    if (!shell) return;
    hideStockFooters(shell);
    var existing = document.getElementById("bm-auth-footer");
    if (existing) {
      // Upgrade old mega footer to slim
      if (existing.textContent && existing.textContent.indexOf("Produto") >= 0) {
        existing.remove();
      } else {
        return;
      }
    }
    var wrap = document.createElement("div");
    wrap.innerHTML = footerHtml(new Date().getFullYear());
    var footer = wrap.firstChild;
    var col = shell.firstElementChild;
    if (col && getComputedStyle(col).display.indexOf("flex") >= 0) {
      col.appendChild(footer);
    } else {
      shell.appendChild(footer);
    }
  }

  function polish() {
    // Always scrub lucide "dollarSign" text leaks (games result / wallet chrome).
    hideDollarLeaks(document.body);
    if (!isAuthPath()) {
      document.body.classList.remove("bm-auth-polish");
      var f = document.getElementById("bm-auth-footer");
      if (f) f.remove();
      return;
    }
    document.body.classList.add("bm-auth-polish");
    injectCss();
    stripComplianceLeak(document.body);
    hideStockFooters(document.getElementById("root") || document.body);
    ensureFooter();
    hideStockFooters(document.getElementById("root") || document.body);
  }

  function boot() {
    polish();
    var last = location.pathname;
    setInterval(function () {
      if (location.pathname !== last) {
        last = location.pathname;
        polish();
      } else {
        hideDollarLeaks(document.body);
        if (isAuthPath()) {
          stripComplianceLeak(document.body);
          hideStockFooters(document.getElementById("root") || document.body);
          ensureFooter();
        }
      }
    }, 700);
    try {
      var obs = new MutationObserver(function () {
        hideDollarLeaks(document.body);
        if (!isAuthPath()) return;
        stripComplianceLeak(document.body);
        hideStockFooters(document.getElementById("root") || document.body);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
