// ==UserScript==
// @name         BlockMiner antibot probe (TEST)
// @namespace    https://blockminer.space
// @version      1.1.0
// @description  TESTE: marca a página p/ o antibot do BlockMiner. Remova depois.
// @author       BlockMiner QA
// @match        https://blockminer.space/*
// @match        https://www.blockminer.space/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

/**
 * Roda no page world (@inject-into page + @grant none).
 * NÃO misture com @grant GM_* — isso quebra o script no Tampermonkey.
 *
 * O antibot NÃO depende só de __BM_TM_TEST__. Este script também:
 * - expõe window.Tampermonkey
 * - remonta window.fetch (dispara o trap de hijack)
 * - injeta marker inline
 *
 * Instalação:
 * 1) Tampermonkey → + → apaga tudo → cola este arquivo → Salvar
 * 2) Ativa o script
 * 3) Hard refresh logado em https://blockminer.space
 * 4) Console: [BM-TM-TEST] OK — e deve cair no /login
 */
(function () {
  "use strict";

  var TAG = "[BM-TM-TEST]";

  try {
    window.__BM_TM_TEST__ = {
      at: Date.now(),
      handler: "Tampermonkey",
      script: "BlockMiner antibot probe (TEST)",
      v: "1.1.0",
    };
  } catch (e) {}

  try {
    window.Tampermonkey = {
      getVersion: function () {
        return "TEST-1.1.0";
      },
      isInstalled: function (_n, _ns, cb) {
        if (typeof cb === "function") cb(true);
      },
    };
  } catch (e) {}

  try {
    var orig = window.fetch;
    if (typeof orig === "function") {
      window.fetch = function bmTmTestFetch() {
        return orig.apply(this, arguments);
      };
    }
  } catch (e) {}

  function injectInline() {
    try {
      var s = document.createElement("script");
      s.textContent =
        'window.__BM_TM_INLINE__={ok:true,t:Date.now(),from:"tampermonkey-test-v1.1"};';
      (document.documentElement || document.head).appendChild(s);
      s.parentNode && s.parentNode.removeChild(s);
    } catch (e) {}
  }

  if (document.documentElement) injectInline();
  else document.addEventListener("DOMContentLoaded", injectInline, { once: true });

  try {
    console.info(TAG, "OK", location.href, window.__BM_TM_TEST__);
  } catch (e) {}
})();
