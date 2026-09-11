/**
 * BM Captcha Gate v6 — same as v5, but skips modal when BM_CAPTCHA_ENABLED=0
 * (challenge returns CAPTCHA_DISABLED).
 */
(function () {
  "use strict";
  if (window.__BM_CAPTCHA_GATE_V6__) return;
  window.__BM_CAPTCHA_GATE_V6__ = true;

  var PURPOSE = "offerwall_external";

  function csrf() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)blockminer_csrf=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : "";
    } catch (e) {
      return "";
    }
  }

  function api(method, path, body) {
    var headers = { Accept: "application/json", "Content-Type": "application/json" };
    var t = csrf();
    if (t) headers["x-csrf-token"] = t;
    return fetch("/api" + path, {
      method: method,
      credentials: "include",
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().then(function (j) {
        return { status: r.status, json: j };
      });
    });
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hsl(h, s, l, a) {
    return "hsla(" + h + "," + s + "%," + l + "%," + (a == null ? 1 : a) + ")";
  }

  /** Draw a readable metal coin with a big digit (family = digit). */
  function drawCoin(ctx, spr, selected, hover) {
    var r = 22 * spr.scale;
    ctx.save();
    ctx.translate(spr.x, spr.y);
    ctx.rotate((spr.rot * Math.PI) / 180);

    if (spr.glow > 0.2) {
      ctx.shadowColor = hsl(spr.hue, Math.min(90, spr.sat + 10), 60, 0.45);
      ctx.shadowBlur = 10 + spr.glow * 14;
    }

    // outer rim
    var rim = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r);
    rim.addColorStop(0, hsl(spr.hue, spr.sat, Math.min(78, spr.lit + 18)));
    rim.addColorStop(0.55, hsl(spr.hue, spr.sat, spr.lit));
    rim.addColorStop(1, hsl(spr.hue, spr.sat + 5, Math.max(28, spr.lit - 18)));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    // inner face
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = hsl(spr.hue, Math.max(30, spr.sat - 15), Math.min(72, spr.lit + 8));
    ctx.fill();

    // dashed ring
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
    ctx.strokeStyle = hsl(spr.hue, 40, 80, 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // digit
    var digit = String(spr.family);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold " + Math.round(22 * spr.scale) + "px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(digit, 0, 1);

    // highlight arc
    ctx.beginPath();
    ctx.arc(-r * 0.15, -r * 0.2, r * 0.55, -Math.PI * 0.9, -Math.PI * 0.1);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;
    if (selected || hover) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = selected ? "#a855f7" : "rgba(148,163,184,0.55)";
      ctx.lineWidth = selected ? 3 : 2;
      ctx.stroke();
    }
    if (selected) {
      // check mark badge
      ctx.beginPath();
      ctx.arc(r * 0.65, -r * 0.65, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#a855f7";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r * 0.65 - 3, -r * 0.65);
      ctx.lineTo(r * 0.65 - 0.5, -r * 0.65 + 2.5);
      ctx.lineTo(r * 0.65 + 3.5, -r * 0.65 - 2.5);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawScene(ctx, size, sceneSeed, sprites, selected, hoverId) {
    var rnd = mulberry32(hashStr(sceneSeed));
    var bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, "#0b0f19");
    bg.addColorStop(1, "#111827");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // soft dots
    for (var p = 0; p < 28; p++) {
      ctx.fillStyle = "rgba(148,163,184," + (0.04 + rnd() * 0.08) + ")";
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, 1 + rnd() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    sprites.forEach(function (spr) {
      drawCoin(ctx, spr, !!selected[spr.id], hoverId === spr.id);
    });
  }

  function hitTest(sprites, x, y) {
    for (var i = sprites.length - 1; i >= 0; i--) {
      var s = sprites[i];
      if (Math.hypot(s.x - x, s.y - y) <= 24 * s.scale) return s;
    }
    return null;
  }

  function drawSample(canvas, sample) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCoin(
      ctx,
      {
        family: sample.family,
        morph: sample.morph,
        x: canvas.width / 2,
        y: canvas.height / 2,
        scale: sample.scale || 1.25,
        rot: 0,
        hue: sample.hue,
        sat: sample.sat,
        lit: sample.lit,
        glow: sample.glow,
      },
      false,
      false,
    );
  }

  var overlay = null;
  var pending = null;

  function closeModal(result) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    if (pending) {
      var p = pending;
      pending = null;
      if (result && result.ok) p.resolve(result.passToken);
      else p.reject(result && result.error ? result.error : new Error("captcha_cancelled"));
    }
  }

  function showModal(provider) {
    return new Promise(function (resolve, reject) {
      if (pending) {
        reject(new Error("captcha_busy"));
        return;
      }
      pending = { resolve: resolve, reject: reject };

      overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483640;background:rgba(11,15,25,.82);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:ui-sans-serif,system-ui,sans-serif";

      var card = document.createElement("div");
      card.style.cssText =
        "width:min(400px,100%);background:#0f172a;border:1px solid rgba(255,255,255,.10);border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.55);padding:20px;color:#e2e8f0";

      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="width:40px;height:40px;border-radius:12px;background:rgba(59,130,246,.20);display:flex;align-items:center;justify-content:center">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5c.5-1 1.5-1.5 2.5-1.5s2 .5 2.5 1.5M9.5 13.5c.5 1 1.5 1.5 2.5 1.5s2-.5 2.5-1.5"/></svg>' +
        '</div>' +
        '<div><div style="font-size:18px;font-weight:700;color:#fff;line-height:1.2">Verificação</div>' +
        '<div style="font-size:13px;color:#9ca3af;margin-top:2px">Selecione as moedas corretas</div></div></div>' +
        '<button type="button" data-bm-x style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);color:#9ca3af;font-size:18px;cursor:pointer;line-height:1">×</button></div>' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10)">' +
        '<canvas data-bm-sample width="72" height="72" style="width:64px;height:64px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:#020617"></canvas>' +
        '<div style="flex:1"><div style="font-size:13px;color:#e5e7eb;font-weight:600">Clique em todas as moedas com este número</div>' +
        '<div data-bm-progress style="font-size:12px;color:#9ca3af;margin-top:4px">—</div></div></div>' +
        '<div style="border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.10);background:#020617">' +
        '<canvas data-bm-board width="340" height="340" style="display:block;width:100%;height:auto;cursor:pointer;touch-action:manipulation"></canvas>' +
        "</div>" +
        '<div data-bm-err style="display:none;margin-top:10px;color:#f87171;font-size:12px"></div>' +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button type="button" data-bm-cancel style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:transparent;color:#d1d5db;cursor:pointer;font-weight:600">Cancelar</button>' +
        '<button type="button" data-bm-go style="flex:1.4;padding:12px;border-radius:12px;border:0;background:#9333ea;color:#fff;cursor:pointer;font-weight:700" disabled>Confirmar</button>' +
        "</div>";

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      var board = card.querySelector("[data-bm-board]");
      var sampleCv = card.querySelector("[data-bm-sample]");
      var progress = card.querySelector("[data-bm-progress]");
      var errEl = card.querySelector("[data-bm-err]");
      var goBtn = card.querySelector("[data-bm-go]");
      var state = { challenge: null, selected: {}, clicks: [], hoverId: -1, busy: false };

      function setErr(msg) {
        errEl.style.display = msg ? "block" : "none";
        errEl.textContent = msg || "";
      }

      function humanErr(code) {
        if (code === "SOLUTION_WRONG") return "Ops — faltou alguma ou errou o número";
        if (code === "TOO_FAST") return "Calma — selecione com atenção";
        if (code === "CHALLENGE_EXPIRED") return "Expirou — gerando outro…";
        if (code === "TOO_MANY_ATTEMPTS") return "Muitas tentativas — novo desafio";
        return code || "Falhou";
      }

      function updateProgress() {
        var ch = state.challenge;
        if (!ch) return;
        var n = Object.keys(state.selected).length;
        progress.textContent = n + " de " + ch.findCount + " selecionadas";
        goBtn.disabled = n !== ch.findCount || state.busy;
        goBtn.style.background = goBtn.disabled ? "#6b21a8" : "#9333ea";
        goBtn.style.opacity = goBtn.disabled ? "0.55" : "1";
      }

      function paint() {
        var ch = state.challenge;
        if (!ch) return;
        if (board.width !== ch.canvasSize) {
          board.width = ch.canvasSize;
          board.height = ch.canvasSize;
        }
        drawScene(board.getContext("2d"), ch.canvasSize, ch.sceneSeed, ch.sprites, state.selected, state.hoverId);
        updateProgress();
      }

      function canvasCoords(ev) {
        var rect = board.getBoundingClientRect();
        var cx = ev.clientX;
        var cy = ev.clientY;
        if (ev.touches && ev.touches[0]) {
          cx = ev.touches[0].clientX;
          cy = ev.touches[0].clientY;
        }
        return {
          x: (cx - rect.left) * (board.width / rect.width),
          y: (cy - rect.top) * (board.height / rect.height),
        };
      }

      board.addEventListener("mousemove", function (ev) {
        if (!state.challenge) return;
        var pt = canvasCoords(ev);
        var hit = hitTest(state.challenge.sprites, pt.x, pt.y);
        var id = hit ? hit.id : -1;
        if (id !== state.hoverId) {
          state.hoverId = id;
          paint();
        }
      });

      board.addEventListener("click", function (ev) {
        if (!state.challenge || state.busy) return;
        var pt = canvasCoords(ev);
        var hit = hitTest(state.challenge.sprites, pt.x, pt.y);
        if (!hit) return;
        if (state.selected[hit.id]) {
          delete state.selected[hit.id];
          state.clicks = state.clicks.filter(function (c) {
            return c.id !== hit.id;
          });
        } else {
          if (Object.keys(state.selected).length >= state.challenge.findCount) return;
          state.selected[hit.id] = true;
          state.clicks.push({ id: hit.id, x: hit.x, y: hit.y, t: Date.now() });
        }
        paint();
      });

      card.querySelector("[data-bm-x]").onclick = function () {
        closeModal({ ok: false, error: new Error("captcha_cancelled") });
      };
      card.querySelector("[data-bm-cancel]").onclick = function () {
        closeModal({ ok: false, error: new Error("captcha_cancelled") });
      };

      goBtn.onclick = function () {
        if (state.busy || !state.challenge) return;
        if (Object.keys(state.selected).length !== state.challenge.findCount) return;
        state.busy = true;
        goBtn.disabled = true;
        goBtn.textContent = "Validando…";
        setErr("");
        api("POST", "/bm-captcha/verify", {
          challengeId: state.challenge.challengeId,
          clicks: state.clicks,
          powCounter: 0,
        })
          .then(function (res) {
            if (res.json && res.json.ok && res.json.passToken) {
              closeModal({ ok: true, passToken: res.json.passToken });
              return;
            }
            state.busy = false;
            goBtn.textContent = "Confirmar";
            var code = res.json && res.json.code;
            setErr(humanErr(code));
            if (code === "TOO_MANY_ATTEMPTS" || code === "CHALLENGE_EXPIRED") loadChallenge();
            else {
              state.selected = {};
              state.clicks = [];
              paint();
            }
          })
          .catch(function () {
            state.busy = false;
            goBtn.textContent = "Confirmar";
            setErr("Erro de rede");
            updateProgress();
          });
      };

      function loadChallenge() {
        state.selected = {};
        state.clicks = [];
        state.busy = false;
        goBtn.textContent = "Confirmar";
        progress.textContent = "Carregando…";
        setErr("");
        api("POST", "/bm-captcha/challenge", { purpose: PURPOSE, provider: provider })
          .then(function (res) {
            if (!res.json || !res.json.ok || !res.json.challenge) {
              setErr((res.json && res.json.code) || "Não foi possível criar o desafio");
              return;
            }
            state.challenge = res.json.challenge;
            drawSample(sampleCv, state.challenge.sample);
            paint();
          })
          .catch(function () {
            setErr("Erro de rede");
          });
      }

      loadChallenge();
    });
  }

  var inflight = {};
  function ensurePass(provider) {
    if (inflight[provider]) return inflight[provider];
    inflight[provider] = api("POST", "/bm-captcha/challenge", {
      purpose: PURPOSE,
      provider: provider,
    })
      .then(function (res) {
        var code = res.json && res.json.code;
        // Gate off — open partner without a pass token (server also skips consume).
        if (code === "CAPTCHA_DISABLED" || res.status === 503) {
          return "";
        }
        return showModal(provider);
      })
      .then(
        function (token) {
          delete inflight[provider];
          return token;
        },
        function (err) {
          delete inflight[provider];
          throw err;
        },
      );
    return inflight[provider];
  }

  function openWithPass(provider, fetchUrlWithPass, onUrl) {
    return ensurePass(provider)
      .then(function (pass) {
        return fetchUrlWithPass(pass);
      })
      .then(function (url) {
        if (url && typeof onUrl === "function") onUrl(String(url));
        return url;
      });
  }

  window.BmCaptchaGate = { ensure: ensurePass, show: showModal, openWithPass: openWithPass };
})();
