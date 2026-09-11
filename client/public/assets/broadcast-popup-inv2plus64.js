/**
 * Post-login broadcast popup — Admin → Notificações broadcast.
 * Fetches GET /api/broadcast/active; dismiss via POST /api/broadcast/:id/dismiss.
 */
(function () {
  var ROOT_ID = "bm-broadcast-popup";
  var POLL_MS = 4000;
  var shownId = null;
  var timer = null;
  var countdownTimer = null;

  function readCookie(name) {
    try {
      var parts = String(document.cookie || "").split(";");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p.indexOf(name + "=") === 0) {
          return decodeURIComponent(p.slice(name.length + 1));
        }
      }
    } catch (_) {}
    return "";
  }

  function csrfHeader() {
    var t = readCookie("blockminer_csrf");
    return t ? { "x-csrf-token": t } : {};
  }

  function skipPath() {
    var p = location.pathname || "";
    if (p.indexOf("/admin") === 0) return true;
    if (p === "/" || p === "/login" || p === "/register") return true;
    if (p.indexOf("/forgot-password") === 0) return true;
    if (p.indexOf("/verify-email") === 0) return true;
    if (p.indexOf("/terms") === 0 || p.indexOf("/privacy") === 0) return true;
    return false;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatContent(raw) {
    var text = String(raw || "").trim();
    if (!text) return "";
    return escapeHtml(text).replace(/\n/g, "<br/>");
  }

  function unmount() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    var el = document.getElementById(ROOT_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function dismiss(messageId) {
    fetch("/api/broadcast/" + messageId + "/dismiss", {
      method: "POST",
      credentials: "include",
      headers: Object.assign({ "Content-Type": "application/json" }, csrfHeader()),
      body: "{}",
    }).catch(function () {});
    unmount();
    shownId = messageId;
  }

  function mount(msg) {
    if (!msg || !msg.id) return;
    if (document.getElementById(ROOT_ID)) return;
    shownId = msg.id;

    var delay = Math.max(0, Math.min(120, Number(msg.dismissDelaySeconds) || 0));
    var canClose = delay <= 0;
    var remaining = delay;

    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "bm-bc-title");

    var imgHtml = msg.imageUrl
      ? '<img class="bm-bc-img" src="' + escapeHtml(msg.imageUrl) + '" alt=""/>'
      : "";
    var contentHtml = msg.content ? '<div class="bm-bc-body">' + formatContent(msg.content) + "</div>" : "";
    var linkHtml = "";
    if (msg.linkUrl && msg.linkLabel) {
      var target = msg.linkNewTab ? ' target="_blank" rel="noopener noreferrer"' : "";
      linkHtml =
        '<a class="bm-bc-link" href="' +
        escapeHtml(msg.linkUrl) +
        '"' +
        target +
        ">" +
        escapeHtml(msg.linkLabel) +
        "</a>";
    }

    root.innerHTML =
      "<style>" +
      "#" +
      ROOT_ID +
      "{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,8,16,.72);backdrop-filter:blur(6px);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
      "#" +
      ROOT_ID +
      " .bm-bc-card{width:min(520px,100%);background:linear-gradient(165deg,#121826 0%,#0b1220 55%,#0a1628 100%);border:1px solid rgba(148,163,184,.22);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.55);padding:22px 22px 18px;color:#e2e8f0}" +
      "#" +
      ROOT_ID +
      " .bm-bc-badge{display:inline-block;margin-bottom:10px;padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fbbf24;background:rgba(245,158,11,.12);border:1px solid rgba(251,191,36,.28)}" +
      "#" +
      ROOT_ID +
      " h2{margin:0 0 10px;font-size:1.35rem;font-weight:800;letter-spacing:-.02em;color:#f8fafc}" +
      "#" +
      ROOT_ID +
      " .bm-bc-img{display:block;width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin:0 0 14px}" +
      "#" +
      ROOT_ID +
      " .bm-bc-body{margin:0 0 16px;font-size:.92rem;line-height:1.5;color:#cbd5e1;white-space:normal}" +
      "#" +
      ROOT_ID +
      " .bm-bc-actions{display:grid;gap:8px}" +
      "#" +
      ROOT_ID +
      " .bm-bc-link{display:block;text-align:center;padding:11px 16px;border-radius:12px;font-weight:700;font-size:.9rem;color:#f8fafc;background:rgba(51,65,85,.55);border:1px solid rgba(148,163,184,.25);text-decoration:none}" +
      "#" +
      ROOT_ID +
      " .bm-bc-link:hover{filter:brightness(1.08)}" +
      "#" +
      ROOT_ID +
      " button{appearance:none;border:0;cursor:pointer;width:100%;padding:12px 16px;border-radius:12px;font-weight:700;font-size:.95rem;color:#04101c;background:linear-gradient(90deg,#fbbf24,#f59e0b)}" +
      "#" +
      ROOT_ID +
      " button:disabled{opacity:.55;cursor:not-allowed}" +
      "#" +
      ROOT_ID +
      " button:not(:disabled):hover{filter:brightness(1.05)}" +
      "</style>" +
      '<div class="bm-bc-card">' +
      '<div class="bm-bc-badge">Aviso</div>' +
      '<h2 id="bm-bc-title"></h2>' +
      imgHtml +
      contentHtml +
      '<div class="bm-bc-actions">' +
      linkHtml +
      '<button type="button" id="bm-bc-dismiss"></button>' +
      "</div></div>";

    root.querySelector("h2").textContent = String(msg.title || "Aviso");
    var btn = root.querySelector("#bm-bc-dismiss");

    function setBtnLabel() {
      if (canClose) {
        btn.disabled = false;
        btn.textContent = "Entendi";
      } else {
        btn.disabled = true;
        btn.textContent = "Entendi (" + remaining + "s)";
      }
    }
    setBtnLabel();

    btn.addEventListener("click", function () {
      if (!canClose) return;
      dismiss(msg.id);
    });

    if (!canClose) {
      countdownTimer = setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) {
          canClose = true;
          if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
          }
        }
        setBtnLabel();
      }, 1000);
    }

    document.body.appendChild(root);
  }

  function poll() {
    if (skipPath()) return;
    if (document.getElementById(ROOT_ID)) return;

    fetch("/api/broadcast/active", { credentials: "include", headers: csrfHeader() })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) return null;
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok || !data.message) return;
        if (shownId === data.message.id) return;
        mount(data.message);
      })
      .catch(function () {});
  }

  function start() {
    poll();
    if (timer) clearInterval(timer);
    timer = setInterval(poll, POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  addEventListener("popstate", function () {
    setTimeout(poll, 300);
  });
})();
