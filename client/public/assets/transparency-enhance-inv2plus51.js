/**
 * Transparency portal enhancements (inv2plus51).
 * Loaded on /transparency — patches live DOM when main bundle lacks newer sections.
 */
(function () {
  const PATH = '/transparency';
  if (!location.pathname.startsWith(PATH)) return;

  const LEGACY_WALLET_ADDRESSES = new Set([
    '0x1ca03755c5132e238ae4e0f50d4929ea0d58b897',
    '0x404cbec8ec6f59e28c5f3d9e5b6080da344792e7',
  ]);

  const HARDWARE_POLL_MS = 400;
  const HARDWARE_POLL_MAX = 45;

  const fmtUsd = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '$0.00';
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const lang = (document.documentElement.lang || 'pt-BR').toLowerCase();
  const T = {
    treasury: lang.startsWith('en') ? 'Treasury' : lang.startsWith('es') ? 'Tesorería' : 'Tesouraria',
    treasurySub: lang.startsWith('en') ? 'Tracked wallets (USD)' : lang.startsWith('es') ? 'Carteras rastreadas (USD)' : 'Carteiras rastreadas (USD)',
    withdrawalsTitle: lang.startsWith('en') ? 'Withdrawal Wallet' : 'Carteira de Saques',
    withdrawalsSub: lang.startsWith('en') ? 'Total paid to users via blockchain' : 'Total pago aos usuários via blockchain',
    totalPaid: lang.startsWith('en') ? 'Total Paid (POL)' : 'Total Pago (POL)',
    totalCount: lang.startsWith('en') ? 'Transactions' : 'Transações',
    txs: lang.startsWith('en') ? 'withdrawals' : 'saques',
    onchainSync: lang.startsWith('en') ? 'Last on-chain sync:' : lang.startsWith('es') ? 'Última sync on-chain:' : 'Último sync on-chain:',
    profitTitle: lang.startsWith('en') ? 'Investment recovery (Lightning)' : lang.startsWith('es') ? 'Recuperación de inversión (Lightning)' : 'Recuperação do investimento (Lightning)',
    profitTotal: lang.startsWith('en') ? 'Total received' : lang.startsWith('es') ? 'Total recibido' : 'Total recebido',
    profitRecovered: lang.startsWith('en') ? 'Recovered' : lang.startsWith('es') ? 'Recuperado' : 'Recuperado',
    profitEmpty: lang.startsWith('en') ? 'No profit logged yet — Lightning sats payouts will appear here.' : lang.startsWith('es') ? 'Sin ganancias registradas.' : 'Nenhum lucro lançado ainda — os pagamentos em sats aparecerão aqui.',
    profitDate: lang.startsWith('en') ? 'Date' : lang.startsWith('es') ? 'Fecha' : 'Data',
    profitSats: lang.startsWith('en') ? 'Satoshis' : 'Satoshis',
    profitBtc: lang.startsWith('en') ? 'BTC/USD' : 'BTC/USD',
    profitUsd: lang.startsWith('en') ? 'USD' : 'USD',
    profitHistoryTitle: lang.startsWith('en') ? 'Payout history (day by day)' : lang.startsWith('es') ? 'Historial (día a día)' : 'Histórico de lançamentos (dia a dia)',
    profitHistoryEmpty: lang.startsWith('en') ? 'No entries yet. Log in Admin → Transparency → ASIC profits.' : lang.startsWith('es') ? 'Sin registros. Cargue en Admin → Transparencia.' : 'Nenhum lançamento ainda. Registre em Admin → Transparência → Lucros ASIC.',
    roiReached: lang.startsWith('en') ? 'Investment recovered — ROI reached.' : lang.startsWith('es') ? 'Inversión recuperada.' : 'Investimento recuperado — ROI atingido.',
  };

  function walletCountsInTreasury(wallet) {
    if (wallet?.isActive === false) return false;
    if (wallet?.includeInTotals === false) return false;
    const addr = String(wallet?.address ?? '').toLowerCase();
    if (LEGACY_WALLET_ADDRESSES.has(addr)) return false;
    return true;
  }

  function walletTreasuryUsd(wallet) {
    if (!walletCountsInTreasury(wallet)) return 0;
    const n = Number(wallet?.valueUsd ?? wallet?.totalUsd ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    return res.json();
  }

  function waitForPage() {
    return new Promise((resolve) => {
      const tick = () => {
        const page = document.querySelector('[data-testid="transparency-page"]');
        if (page) return resolve(page);
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  function injectTreasuryKpi(page, totalUsd) {
    const grid = page.querySelector('[data-testid="kpi-grid"]');
    if (!grid || grid.querySelector('[data-testid="kpi-treasury"]')) return;
    grid.classList.remove('lg:grid-cols-4');
    grid.classList.add('lg:grid-cols-5');
    const card = document.createElement('div');
    card.setAttribute('data-testid', 'kpi-treasury');
    card.className = 'relative rounded-2xl border border-white/8 bg-white/3 p-5 flex flex-col gap-1 overflow-hidden';
    card.innerHTML = `
      <div class="w-8 h-8 rounded-xl flex items-center justify-center mb-1 bg-white/5">
        <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
      </div>
      <p class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">${T.treasury}</p>
      <p class="text-2xl font-black text-white leading-none">${fmtUsd(totalUsd)}</p>
      <p class="text-[11px] text-gray-600 mt-0.5">${T.treasurySub}</p>`;
    grid.appendChild(card);
  }

  function injectWithdrawals(page, stats) {
    if (!stats?.ok || page.querySelector('[data-testid="withdrawals-section"]')) return;
    const walletsSection = [...page.querySelectorAll('p')].find((el) =>
      /Carteiras do Projeto|Project Wallets/i.test(el.textContent || ''),
    );
    const anchor = walletsSection?.closest('.space-y-4') || page;
    const section = document.createElement('section');
    section.setAttribute('data-testid', 'withdrawals-section');
    section.className = 'rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-950/20 to-slate-950/40 overflow-hidden';
    const pol = Number(stats.totalPol ?? 0);
    const count = Number(stats.totalCount ?? 0);
    section.innerHTML = `
      <div class="px-6 py-4 border-b border-sky-500/10 bg-sky-500/5 flex items-center gap-2 flex-wrap">
        <p class="text-xs font-black text-sky-300 uppercase tracking-widest">${T.withdrawalsTitle}</p>
        <p class="text-[11px] text-gray-500 ml-auto">${T.withdrawalsSub}</p>
      </div>
      <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="rounded-xl border border-white/8 bg-black/20 p-4">
          <p class="text-[10px] uppercase tracking-widest text-gray-500">${T.totalPaid}</p>
          <p class="mt-1 text-2xl font-black text-white">${pol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}<span class="text-sm text-sky-400 ml-2">POL</span></p>
        </div>
        <div class="rounded-xl border border-white/8 bg-black/20 p-4">
          <p class="text-[10px] uppercase tracking-widest text-gray-500">${T.totalCount}</p>
          <p class="mt-1 text-2xl font-black text-white">${count.toLocaleString()}<span class="text-sm text-gray-500 ml-2">${T.txs}</span></p>
        </div>
      </div>`;
    anchor.parentNode?.insertBefore(section, anchor);
  }

  function injectOnchainSync(page, fetchedAt) {
    if (!fetchedAt) return;
    const hero = page.querySelector('.relative.rounded-3xl');
    if (!hero || hero.querySelector('[data-testid="onchain-sync"]')) return;
    const el = document.createElement('p');
    el.setAttribute('data-testid', 'onchain-sync');
    el.className = 'text-[10px] text-gray-600';
    const d = new Date(fetchedAt);
    el.textContent = `${T.onchainSync} ${d.toLocaleString()}`;
    const badgeWrap = hero.querySelector('.shrink-0 .text-gray-600')?.parentElement;
    if (badgeWrap) badgeWrap.appendChild(el);
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return iso;
    }
  }

  function findHardwareCard(page) {
    const byTestId = page.querySelector('[data-testid="hardware-asset-card"]');
    if (byTestId) return byTestId;
    return (
      [...page.querySelectorAll('section')].find(
        (el) =>
          /Antminer S19J Pro/i.test(el.textContent || '') &&
          /Custo de aquisição|Acquisition cost/i.test(el.textContent || ''),
      ) || null
    );
  }

  function fmtSats(raw) {
    try {
      return BigInt(String(raw ?? '0').replace(/\D/g, '') || '0').toLocaleString('en-US');
    } catch {
      return '0';
    }
  }

  function injectHardwareProfit(page, asset) {
    if (!asset?.profitSummary || page.querySelector('[data-testid="hardware-roi-section"]')) return true;
    const cost = Number(asset.purchaseCostUsd);
    if (!Number.isFinite(cost) || cost <= 0) return true;

    const host = findHardwareCard(page);
    if (!host) return false;

    const leftCol = host.querySelector('.space-y-4');
    if (!leftCol) return false;

    const summary = asset.profitSummary;
    const pct = Math.min(100, Math.max(0, Number(summary.recoveredPct || 0)));
    const logs = asset.profitLogs || [];
    const totalSats = fmtSats(summary.totalEarnedSatoshi ?? '0');

    const block = document.createElement('div');
    block.setAttribute('data-testid', 'hardware-roi-section');
    block.className = 'rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-4 mt-4';
    block.innerHTML = `
      <p class="text-[10px] uppercase tracking-widest text-emerald-400 font-mono">${T.profitTitle}</p>
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
          <p class="text-[9px] uppercase tracking-widest text-gray-500 font-mono">${T.profitTotal}</p>
          <p class="mt-0.5 text-lg font-black text-amber-300 font-mono">${totalSats} <span class="text-xs text-amber-400/80">sats</span></p>
          <p class="text-sm font-black text-emerald-300 font-mono">${fmtUsd(summary.totalEarnedUsd)}</p>
        </div>
        <div class="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
          <p class="text-[9px] uppercase tracking-widest text-gray-500 font-mono">${T.profitRecovered}</p>
          <p class="mt-0.5 text-lg font-black text-white font-mono">${pct.toFixed(1)}%</p>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-[10px] text-gray-500 mb-1.5">
          <span>ROI</span><span>${fmtUsd(summary.totalEarnedUsd)} / ${fmtUsd(cost)}</span>
        </div>
        <div class="h-2 rounded-full bg-black/30 overflow-hidden">
          <div class="h-full rounded-full bg-emerald-500/70" style="width:${pct}%"></div>
        </div>
        ${summary.roiReached ? `<p class="mt-2 text-[11px] text-emerald-400 font-bold">${T.roiReached}</p>` : ''}
      </div>
      <div class="space-y-2">
        <p class="text-[10px] uppercase tracking-widest text-gray-500 font-mono">${T.profitHistoryTitle}</p>
        <div class="overflow-x-auto rounded-xl border border-white/8">
          <table class="w-full text-left text-[11px]" data-testid="hardware-profit-history">
            <thead><tr class="border-b border-white/8 bg-black/20 text-[9px] uppercase tracking-widest text-gray-500">
              <th class="px-3 py-2">${T.profitDate}</th><th class="px-3 py-2">${T.profitSats}</th><th class="px-3 py-2">${T.profitUsd}</th>
            </tr></thead>
            <tbody>${
              logs.length
                ? logs
                    .map(
                      (log) => `<tr class="border-b border-white/5">
                <td class="px-3 py-2 text-gray-300 whitespace-nowrap">${fmtDate(log.earnedAt)}</td>
                <td class="px-3 py-2 text-amber-300 font-mono font-bold">${fmtSats(log.satoshiAmount)} sats</td>
                <td class="px-3 py-2 text-emerald-300 font-mono font-bold">${fmtUsd(log.earnedUsd)}</td>
              </tr>`,
                    )
                    .join('')
                : `<tr><td colspan="3" class="px-3 py-4 text-center text-gray-600">${T.profitHistoryEmpty}</td></tr>`
            }</tbody>
          </table>
        </div>
        ${logs.length === 0 ? `<p class="text-[11px] text-gray-600">${T.profitEmpty}</p>` : ''}
      </div>`;

    leftCol.appendChild(block);
    return true;
  }

  async function enhanceHardware(page) {
    const data = await fetchJson('/api/transparency/hardware-assets');
    if (!data?.ok || !Array.isArray(data.assets)) return;

    for (let attempt = 0; attempt < HARDWARE_POLL_MAX; attempt++) {
      let done = true;
      for (const asset of data.assets) {
        if (!injectHardwareProfit(page, asset)) done = false;
      }
      if (page.querySelector('[data-testid="hardware-roi-section"]')) return;
      if (done) return;
      await new Promise((r) => setTimeout(r, HARDWARE_POLL_MS));
    }
  }

  async function run() {
    const page = await waitForPage();
    const [walletsRaw, withdrawalsRaw] = await Promise.all([
      fetchJson('/api/transparency/wallets-live'),
      fetchJson('/api/transparency/withdrawal-stats'),
    ]);

    if (walletsRaw?.ok && Array.isArray(walletsRaw.wallets)) {
      const total = walletsRaw.wallets.reduce((s, w) => s + walletTreasuryUsd(w), 0);
      injectTreasuryKpi(page, total);
      const maxFetch = walletsRaw.wallets.reduce((m, w) => {
        if (!w.fetchedAt) return m;
        const t = new Date(w.fetchedAt).getTime();
        return t > m ? t : m;
      }, 0);
      if (maxFetch) injectOnchainSync(page, new Date(maxFetch).toISOString());
    }

    injectWithdrawals(page, withdrawalsRaw);
    await enhanceHardware(page);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void run());
  } else {
    void run();
  }
})();
