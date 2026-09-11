/**
 * Admin Transparency tabs + ASIC profit logging (inv2plus56).
 * Includes CSRF header so "Lançar lucro" actually saves.
 */
(function () {
  const path = location.pathname.replace(/\/$/, '');
  if (path !== '/admin/transparency') return;

  const API = '/api/admin';
  const STYLE_ID = 'bm-admin-transparency-tabs-style';
  const CSS = `
#bm-admin-transparency-tabs-wrap {
  margin: 8px 0 28px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.55);
}
#bm-admin-transparency-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.65);
  border: 1px solid rgba(51, 65, 85, 0.8);
}
#bm-admin-transparency-tabs button {
  appearance: none;
  cursor: pointer;
  border: 0;
  border-radius: 10px;
  padding: 10px 18px;
  font: 800 11px/1 system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
  background: transparent;
  transition: background .15s ease, color .15s ease, box-shadow .15s ease;
}
#bm-admin-transparency-tabs button:hover {
  color: #e2e8f0;
  background: rgba(255,255,255,0.04);
}
#bm-admin-transparency-tabs button[data-active="1"] {
  color: #a7f3d0;
  background: rgba(16, 185, 129, 0.16);
  box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.35);
}
#bm-tab-panel-geral {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
#bm-tab-panel-asic {
  margin: 0;
  padding: 24px;
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 18px;
  background: linear-gradient(160deg, rgba(6, 78, 59, 0.18), rgba(2, 6, 23, 0.92));
}
#bm-tab-panel-asic .bm-asic-field { display: grid; gap: 6px; }
#bm-tab-panel-asic label {
  font: 700 10px/1 system-ui, sans-serif;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #64748b;
}
#bm-tab-panel-asic input {
  padding: 11px 12px;
  border-radius: 11px;
  border: 1px solid #334155;
  background: #020617;
  color: #fff;
  font: 500 13px/1.3 system-ui, sans-serif;
}
#bm-tab-panel-asic input[name="satoshiAmount"] {
  color: #fcd34d;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
}
#bm-tab-panel-asic .bm-asic-actions { display: flex; gap: 8px; flex-wrap: wrap; }
#bm-tab-panel-asic .bm-asic-btn {
  padding: 11px 14px;
  border-radius: 11px;
  border: 1px solid #334155;
  background: #0f172a;
  color: #e2e8f0;
  font: 800 11px/1 system-ui, sans-serif;
  cursor: pointer;
}
#bm-tab-panel-asic .bm-asic-submit {
  border: none;
  background: #10b981;
  color: #020617;
  font: 800 13px/1 system-ui, sans-serif;
  padding: 13px 16px;
  border-radius: 12px;
  cursor: pointer;
}
#bm-tab-panel-asic .bm-asic-submit:disabled {
  opacity: .55;
  cursor: wait;
}
#bm-asic-form-error {
  display: none;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(248,113,113,.35);
  background: rgba(127,29,29,.25);
  color: #fecaca;
  font: 600 12px/1.4 system-ui, sans-serif;
}
#bm-profit-logs .bm-log-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #1e293b;
  font-size: 12px;
}
#bm-profit-logs .bm-log-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
#bm-profit-logs .bm-log-btn {
  appearance: none;
  cursor: pointer;
  border-radius: 8px;
  padding: 6px 8px;
  font: 800 10px/1 system-ui, sans-serif;
  letter-spacing: .04em;
  text-transform: uppercase;
}
#bm-profit-logs .bm-log-edit {
  border: 1px solid rgba(245,158,11,.35);
  background: rgba(245,158,11,.1);
  color: #fcd34d;
}
#bm-profit-logs .bm-log-del {
  border: 1px solid rgba(248,113,113,.35);
  background: rgba(248,113,113,.1);
  color: #fca5a5;
}
#bm-asic-cancel-edit {
  display: none;
  border: 1px solid #334155;
  background: #0f172a;
  color: #e2e8f0;
  font: 800 12px/1 system-ui, sans-serif;
  padding: 13px 16px;
  border-radius: 12px;
  cursor: pointer;
}
`;

  const fmtUsd = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  function fmtSats(raw) {
    try {
      return BigInt(String(raw ?? '0').replace(/\D/g, '') || '0').toLocaleString('en-US');
    } catch {
      return '0';
    }
  }

  function readCookie(name) {
    const parts = String(document.cookie || '').split(';');
    for (const part of parts) {
      const [k, ...rest] = part.trim().split('=');
      if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
  }

  function csrfHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = readCookie('blockminer_csrf');
    if (token) headers['x-csrf-token'] = token;
    return headers;
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? undefined : csrfHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      const msg = json.message || json.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  function toast(msg, ok) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;padding:12px 16px;border-radius:12px;font:600 12px system-ui;color:#fff;background:${ok ? '#059669' : '#dc2626'}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function findPageRoot() {
    const h2 = [...document.querySelectorAll('h2')].find((el) =>
      /Transparência|Transparency/i.test(el.textContent || ''),
    );
    if (!h2) return null;
    return h2.closest('.space-y-8') || h2.closest('[class*="space-y"]') || h2.parentElement?.parentElement;
  }

  function setTab(active) {
    const geral = document.getElementById('bm-tab-panel-geral');
    const asic = document.getElementById('bm-tab-panel-asic');
    const btnGeral = document.getElementById('bm-tab-btn-geral');
    const btnAsic = document.getElementById('bm-tab-btn-asic');
    if (!geral || !asic || !btnGeral || !btnAsic) return;
    const isAsic = active === 'asic';
    geral.style.display = isAsic ? 'none' : 'flex';
    asic.style.display = isAsic ? 'block' : 'none';
    btnGeral.dataset.active = isAsic ? '0' : '1';
    btnAsic.dataset.active = isAsic ? '1' : '0';
  }

  async function run() {
    if (document.getElementById('bm-admin-transparency-tabs-wrap')) return;
    ensureStyles();

    let root = null;
    for (let i = 0; i < 40; i++) {
      root = findPageRoot();
      if (root && root.children.length > 1) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!root) return;

    document.getElementById('bm-asic-profit-admin')?.remove();
    document.getElementById('bm-admin-transparency-tabs')?.remove();

    const header = root.firstElementChild;
    if (!header) return;
    if (header instanceof HTMLElement) header.style.marginBottom = '4px';

    const geral = document.createElement('div');
    geral.id = 'bm-tab-panel-geral';
    [...root.children].slice(1).forEach((el) => geral.appendChild(el));

    const wrap = document.createElement('div');
    wrap.id = 'bm-admin-transparency-tabs-wrap';
    wrap.innerHTML = `
      <div style="margin:0 0 10px;font:700 10px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#64748b">Seções</div>
      <div id="bm-admin-transparency-tabs">
        <button type="button" id="bm-tab-btn-geral" data-active="1">Geral</button>
        <button type="button" id="bm-tab-btn-asic" data-active="0">Lucros ASIC</button>
      </div>`;

    const asic = document.createElement('section');
    asic.id = 'bm-tab-panel-asic';
    asic.style.display = 'none';
    asic.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px">
        <div>
          <h3 style="margin:0 0 8px;font:800 15px/1.2 system-ui;letter-spacing:.05em;text-transform:uppercase;color:#6ee7b7">Lucros ASIC (Lightning)</h3>
          <p id="bm-asic-asset-line" style="margin:0;font:500 13px/1.45 system-ui;color:#94a3b8;max-width:52ch">Carregando…</p>
        </div>
      </div>
      <div id="bm-profit-summary" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:20px;max-width:460px"></div>
      <div id="bm-asic-form-error"></div>
      <form id="bm-profit-form" style="display:grid;gap:14px;max-width:560px">
        <div class="bm-asic-field">
          <label>Data do recebimento</label>
          <input type="datetime-local" name="earnedAt" required />
        </div>
        <div class="bm-asic-field">
          <label>Satoshis recebidos (Lightning)</label>
          <input name="satoshiAmount" required inputmode="numeric" placeholder="Ex: 125000" />
        </div>
        <div class="bm-asic-field">
          <label>Preço BTC/USD na data (opcional)</label>
          <div class="bm-asic-actions">
            <input name="btcUsdPrice" placeholder="Busca automática se vazio" style="flex:1;min-width:160px" />
            <button type="button" id="bm-fetch-btc" class="bm-asic-btn">Preço atual</button>
          </div>
        </div>
        <div class="bm-asic-field">
          <label>Observações</label>
          <input name="notes" placeholder="Opcional" />
        </div>
        <button type="submit" class="bm-asic-submit" id="bm-asic-submit">Lançar lucro</button>
        <button type="button" id="bm-asic-cancel-edit">Cancelar edição</button>
      </form>
      <div style="margin-top:22px">
        <p style="margin:0 0 10px;font:700 10px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;color:#64748b">Histórico de lançamentos</p>
        <div id="bm-profit-logs" style="max-height:280px;overflow:auto;border:1px solid #1e293b;border-radius:12px;padding:10px 14px;background:rgba(15,23,42,.85)"></div>
      </div>`;

    header.insertAdjacentElement('afterend', wrap);
    wrap.insertAdjacentElement('afterend', asic);
    asic.insertAdjacentElement('afterend', geral);

    wrap.querySelector('#bm-tab-btn-geral').addEventListener('click', () => setTab('geral'));
    wrap.querySelector('#bm-tab-btn-asic').addEventListener('click', () => setTab('asic'));
    setTab('geral');

    let assets = [];
    try {
      const data = await api('GET', `${API}/transparency/hardware-assets`);
      assets = data.assets || [];
    } catch (e) {
      toast(`Lucros ASIC: ${e.message || 'falha ao carregar'}`, false);
      return;
    }
    if (!assets.length) {
      asic.querySelector('#bm-asic-asset-line').textContent = 'Nenhum ativo ASIC cadastrado.';
      return;
    }

    const asset = assets[0];
    const assetId = asset.id;
    asic.querySelector('#bm-asic-asset-line').textContent =
      `${asset.name} · custo ${fmtUsd(asset.purchaseCostUsd)}. Cada lançamento entra no portal público.`;

    const form = asic.querySelector('#bm-profit-form');
    const errBox = asic.querySelector('#bm-asic-form-error');
    const submitBtn = asic.querySelector('#bm-asic-submit');
    const cancelEditBtn = asic.querySelector('#bm-asic-cancel-edit');
    form.earnedAt.value = new Date().toISOString().slice(0, 16);
    let editingId = null;
    let logsCache = [];

    function showError(msg) {
      errBox.style.display = 'block';
      errBox.textContent = msg;
    }
    function clearError() {
      errBox.style.display = 'none';
      errBox.textContent = '';
    }

    function toLocalInput(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function resetFormMode() {
      editingId = null;
      submitBtn.textContent = 'Lançar lucro';
      cancelEditBtn.style.display = 'none';
      form.satoshiAmount.value = '';
      form.notes.value = '';
      form.btcUsdPrice.value = '';
      form.earnedAt.value = new Date().toISOString().slice(0, 16);
      clearError();
    }

    function startEdit(log) {
      editingId = log.id;
      form.earnedAt.value = toLocalInput(log.earnedAt);
      form.satoshiAmount.value = String(log.satoshiAmount);
      form.btcUsdPrice.value = log.btcUsdPrice != null ? String(log.btcUsdPrice) : '';
      form.notes.value = log.notes || '';
      submitBtn.textContent = 'Salvar alteração';
      cancelEditBtn.style.display = 'inline-block';
      clearError();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.satoshiAmount.focus();
    }

    asic.querySelector('#bm-fetch-btc').addEventListener('click', async () => {
      try {
        const data = await api('GET', `${API}/transparency/btc-usd-price`);
        if (data.btcUsdPrice != null) form.btcUsdPrice.value = String(data.btcUsdPrice);
        toast('Preço BTC atualizado.', true);
      } catch (e) {
        toast(e.message || 'Erro', false);
      }
    });

    cancelEditBtn.addEventListener('click', () => resetFormMode());

    async function refresh() {
      const data = await api('GET', `${API}/transparency/hardware-assets/${assetId}/profit-logs`);
      const s = data.profitSummary;
      asic.querySelector('#bm-profit-summary').innerHTML = `
        <div style="padding:14px;border-radius:14px;border:1px solid #1e293b;background:#020617">
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px">Total recebido</div>
          <div style="font-weight:800;color:#fcd34d;font-family:ui-monospace,monospace;font-size:16px">${fmtSats(s?.totalEarnedSatoshi)} sats</div>
          <div style="font-weight:800;color:#6ee7b7;margin-top:4px">${fmtUsd(s?.totalEarnedUsd)}</div>
        </div>
        <div style="padding:14px;border-radius:14px;border:1px solid #1e293b;background:#020617">
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px">Recuperado</div>
          <div style="font-weight:800;color:#fff;font-size:24px;line-height:1">${Number(s?.recoveredPct || 0).toFixed(1)}%</div>
        </div>`;
      logsCache = data.profitLogs || [];
      const host = asic.querySelector('#bm-profit-logs');
      if (!logsCache.length) {
        host.innerHTML = '<p style="font-size:12px;color:#64748b;margin:10px 0">Nenhum lançamento ainda — use o formulário acima.</p>';
        return;
      }
      host.innerHTML = logsCache
        .map(
          (log) =>
            `<div class="bm-log-row" data-log-id="${log.id}">
              <span style="color:#cbd5e1;min-width:0">
                ${new Date(log.earnedAt).toLocaleString()}<br/>
                <strong style="color:#fcd34d;font-family:ui-monospace,monospace">${fmtSats(log.satoshiAmount)} sats</strong>
                <span style="color:#64748b;margin-left:8px">BTC ${fmtUsd(log.btcUsdPrice)}</span>
              </span>
              <div class="bm-log-actions">
                <strong style="color:#6ee7b7">${fmtUsd(log.earnedUsd)}</strong>
                <button type="button" class="bm-log-btn bm-log-edit" data-edit="${log.id}">Editar</button>
                <button type="button" class="bm-log-btn bm-log-del" data-del="${log.id}">Excluir</button>
              </div>
            </div>`,
        )
        .join('');
    }

    asic.querySelector('#bm-profit-logs').addEventListener('click', async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const editId = t.getAttribute('data-edit');
      const delId = t.getAttribute('data-del');
      if (editId) {
        const log = logsCache.find((l) => String(l.id) === editId);
        if (log) startEdit(log);
        return;
      }
      if (delId) {
        if (!confirm('Excluir este lançamento?')) return;
        try {
          await api('DELETE', `${API}/transparency/hardware-assets/${assetId}/profit-logs/${delId}`);
          if (editingId != null && String(editingId) === delId) resetFormMode();
          toast('Lançamento excluído.', true);
          await refresh();
        } catch (err) {
          toast(err.message || 'Erro ao excluir', false);
        }
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();
      const sats = String(form.satoshiAmount.value || '').trim();
      if (!sats || !/^\d+$/.test(sats) || Number(sats) <= 0) {
        showError('Informe a quantidade de satoshis (número inteiro).');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = editingId ? 'Salvando…' : 'Salvando…';
      try {
        const earnedAt = form.earnedAt.value
          ? new Date(form.earnedAt.value).toISOString()
          : new Date().toISOString();
        if (Number.isNaN(new Date(earnedAt).getTime())) {
          throw new Error('Data de lançamento inválida.');
        }
        const body = {
          earnedAt,
          satoshiAmount: sats,
          btcUsdPrice: form.btcUsdPrice.value.trim() || undefined,
          notes: form.notes.value.trim() || null,
        };
        if (editingId) {
          await api('PUT', `${API}/transparency/hardware-assets/${assetId}/profit-logs/${editingId}`, body);
          toast('Lançamento atualizado.', true);
        } else {
          await api('POST', `${API}/transparency/hardware-assets/${assetId}/profit-logs`, body);
          toast('Lucro lançado — já aparece no portal público.', true);
        }
        resetFormMode();
        await refresh();
      } catch (err) {
        const msg = err.message || 'Erro ao salvar';
        showError(msg);
        toast(msg, false);
        submitBtn.textContent = editingId ? 'Salvar alteração' : 'Lançar lucro';
      } finally {
        submitBtn.disabled = false;
        if (editingId) submitBtn.textContent = 'Salvar alteração';
        else if (submitBtn.textContent === 'Salvando…') submitBtn.textContent = 'Lançar lucro';
      }
    });

    await refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void run());
  else void run();
})();
