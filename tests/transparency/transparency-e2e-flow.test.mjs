import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { transparencyRouter } from '../../server/modules/transparency/transparency.routes.js';
import { transparencyAdminRouter } from '../../server/modules/transparency/transparency.admin.routes.js';

let app;
let server;
let baseUrl;
let adminAuthHeader;

function adminFetch(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...adminAuthHeader,
      ...(options.headers || {}),
    },
  });
}

function publicFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  return fetch(url, options);
}

test.before(async () => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  const token = jwt.sign(
    { role: 'admin', type: 'admin_session' },
    secret,
    { issuer: 'blockminer-admin', algorithm: 'HS256' },
  );
  adminAuthHeader = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  app = express();
  app.use(express.json());

  // Public transparency endpoints
  app.use('/api/transparency', transparencyRouter);

  // Admin transparency endpoints
  app.use('/api/admin', transparencyAdminRouter);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ─── E2E FULL LIFECYCLE TEST ────────────────────────────────────────────────

test('E2E Lifecycle: Admin configuration -> Public Portal consumption -> Live updates & Cleanup', async () => {
  // Track IDs for teardown
  let createdExpenseId;
  let createdIncomeId;
  let createdWalletId;
  let createdAssetId;
  let createdLog1Id;
  let createdLog2Id;
  let createdInvestmentId;

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Admin configures Master Treasury Wallet & Settings
    // ─────────────────────────────────────────────────────────────────────────
    const masterWalletAddress = '0x8888888888888888888888888888888888888888';
    const resSetMaster = await adminFetch('/api/admin/transparency/wallet/settings', {
      method: 'PUT',
      body: JSON.stringify({ address: masterWalletAddress }),
    });
    assert.equal(resSetMaster.status, 200, 'Master wallet settings should update');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Admin adds a cold multisig Tracked Wallet with manual valuation
    // ─────────────────────────────────────────────────────────────────────────
    const walletPayload = {
      label: 'E2E_TEST_Cold Reserve Multisig',
      address: '0x9999999999999999999999999999999999999999',
      chain: 'polygon',
      assetSymbol: 'USDC',
      explorerBaseUrl: 'https://polygonscan.com',
      isActive: true,
      isPublic: true,
      includeInTotals: true,
      displayMode: 'live',
      sortOrder: 1,
      manualUsdValue: 35000.00,
      manualValueNote: 'Audited Multi-sig Safe reserve',
    };
    const resCreateWallet = await adminFetch('/api/admin/transparency/tracked-wallets', {
      method: 'POST',
      body: JSON.stringify(walletPayload),
    });
    assert.equal(resCreateWallet.status, 201);
    const dataWallet = await resCreateWallet.json();
    assert.ok(dataWallet.wallet?.id);
    createdWalletId = dataWallet.wallet.id;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Admin registers an Infrastructure Expense and Community Income
    // ─────────────────────────────────────────────────────────────────────────
    const expPayload = {
      type: 'expense',
      category: 'infrastructure',
      name: 'E2E_TEST_Cloudflare Enterprise Protection',
      provider: 'Cloudflare Inc',
      providerUrl: 'https://cloudflare.com',
      amountUsd: 200.00,
      currencyCode: 'USD',
      period: 'monthly',
      isOnChain: false,
      isPaid: true,
      isActive: true,
      sortOrder: 1,
    };
    const resCreateExp = await adminFetch('/api/admin/transparency', {
      method: 'POST',
      body: JSON.stringify(expPayload),
    });
    assert.equal(resCreateExp.status, 201);
    const dataExp = await resCreateExp.json();
    createdExpenseId = dataExp.entry.id;

    const incPayload = {
      type: 'income',
      category: 'misc',
      incomeCategory: 'sponsorship',
      name: 'E2E_TEST_Verified Direct Sponsor',
      provider: 'Web3 Brands LLC',
      amountUsd: 800.00,
      currencyCode: 'USD',
      period: 'monthly',
      isOnChain: false,
      isPaid: true,
      isActive: true,
      sortOrder: 2,
    };
    const resCreateInc = await adminFetch('/api/admin/transparency', {
      method: 'POST',
      body: JSON.stringify(incPayload),
    });
    assert.equal(resCreateInc.status, 201);
    const dataInc = await resCreateInc.json();
    createdIncomeId = dataInc.entry.id;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Admin registers an ASIC Antminer S21 Pro Hardware Asset
    // ─────────────────────────────────────────────────────────────────────────
    const assetPayload = {
      name: 'E2E_TEST_Bitmain Antminer S21 Pro 234TH/s',
      manufacturer: 'Bitmain',
      description: 'Mineradora ASIC de alto desempenho refrigerada a ar',
      status: 'running',
      statusLabel: 'Em Operação',
      purchaseCostUsd: 4500.00,
      specs: ['SHA-256', '234 TH/s', '3510W', '15.0 J/TH'],
      isActive: true,
      sortOrder: 1,
    };
    const resCreateAsset = await adminFetch('/api/admin/transparency/hardware-assets', {
      method: 'POST',
      body: JSON.stringify(assetPayload),
    });
    assert.equal(resCreateAsset.status, 201);
    const dataAsset = await resCreateAsset.json();
    createdAssetId = dataAsset.asset.id;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Admin logs daily Bitcoin mining sats for the hardware asset
    // Day 1: 15,000 sats @ $65,000/BTC => $9.75 USD
    // ─────────────────────────────────────────────────────────────────────────
    const log1Payload = {
      earnedAt: '2026-09-19T00:00:00.000Z',
      satoshiAmount: '15000',
      btcUsdPrice: 65000.00,
      notes: 'Day 1 mining batch via Braiins Pool',
    };
    const resCreateLog1 = await adminFetch(
      `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs`,
      {
        method: 'POST',
        body: JSON.stringify(log1Payload),
      },
    );
    assert.equal(resCreateLog1.status, 201);
    const dataLog1 = await resCreateLog1.json();
    createdLog1Id = dataLog1.profitLog.id;
    assert.equal(Number(dataLog1.profitLog.earnedUsd), 9.75);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Admin creates an External Investment (DeFi Liquidity Pool)
    // ─────────────────────────────────────────────────────────────────────────
    const invPayload = {
      name: 'E2E_TEST_Aave V3 Polygon USDC Reserve',
      description: 'Lending pool descentralizado na rede Polygon com rendimento em USDC',
      linkUrl: 'https://app.aave.com',
      amountInvestedUsd: 10000.00,
      amountWithdrawnUsd: 1500.00,
      roiForecast: '12.5% a.a.',
      sortOrder: 1,
      isActive: true,
    };
    const resCreateInv = await adminFetch('/api/admin/transparency/external-investments', {
      method: 'POST',
      body: JSON.stringify(invPayload),
    });
    assert.equal(resCreateInv.status, 201);
    const dataInv = await resCreateInv.json();
    createdInvestmentId = dataInv.investment.id;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Public Visitor accesses Public Transparency endpoints
    // ─────────────────────────────────────────────────────────────────────────

    // 7.1 Public Entries (Balance)
    const resPubEntries = await publicFetch(`${baseUrl}/api/transparency`);
    assert.equal(resPubEntries.status, 200);
    const dataPubEntries = await resPubEntries.json();
    assert.equal(dataPubEntries.ok, true);
    assert.equal(dataPubEntries.trackedWallet, masterWalletAddress);

    const pubExp = dataPubEntries.entries.find((e) => e.id === createdExpenseId);
    const pubInc = dataPubEntries.entries.find((e) => e.id === createdIncomeId);
    assert.ok(pubExp, 'Public visitor should see the expense');
    assert.equal(Number(pubExp.amountUsd), 200.00);
    assert.ok(pubInc, 'Public visitor should see the income');
    assert.equal(Number(pubInc.amountUsd), 800.00);

    // 7.2 Public Live Wallets
    const resPubWallets = await publicFetch(`${baseUrl}/api/transparency/wallets-live`);
    assert.equal(resPubWallets.status, 200);
    const dataPubWallets = await resPubWallets.json();
    assert.equal(dataPubWallets.ok, true);
    const pubWallet = dataPubWallets.wallets.find((w) => w.id === createdWalletId);
    assert.ok(pubWallet, 'Public visitor should see tracked wallet');
    assert.equal(Number(pubWallet.manualUsdValue), 35000.00);
    assert.equal(pubWallet.manualValueNote, 'Audited Multi-sig Safe reserve');

    // 7.3 Public Hardware Assets with Live ROI Calculation
    const resPubHardware = await publicFetch(`${baseUrl}/api/transparency/hardware-assets`);
    assert.equal(resPubHardware.status, 200);
    const dataPubHardware = await resPubHardware.json();
    assert.equal(dataPubHardware.ok, true);
    const pubAsset = dataPubHardware.assets.find((a) => a.id === createdAssetId);
    assert.ok(pubAsset, 'Public visitor should see the ASIC hardware asset');
    assert.equal(Number(pubAsset.purchaseCostUsd), 4500.00);
    assert.ok(pubAsset.profitSummary, 'Asset must include computed profit summary');
    assert.equal(pubAsset.profitSummary.totalEarnedSatoshi, '15000');
    assert.equal(Number(pubAsset.profitSummary.totalEarnedUsd), 9.75);
    assert.equal(pubAsset.profitSummary.roiReached, false);
    assert.ok(pubAsset.profitSummary.recoveredPct > 0);
    assert.equal(pubAsset.profitLogs.length, 1);
    assert.equal(pubAsset.profitLogs[0].satoshiAmount, '15000');

    // 7.4 Public External Investments
    const resPubInv = await publicFetch(`${baseUrl}/api/transparency/external-investments`);
    assert.equal(resPubInv.status, 200);
    const dataPubInv = await resPubInv.json();
    assert.equal(dataPubInv.ok, true);
    const pubInv = dataPubInv.investments.find((i) => i.id === createdInvestmentId);
    assert.ok(pubInv, 'Public visitor should see external investment');
    assert.equal(Number(pubInv.amountInvestedUsd), 10000.00);
    assert.equal(Number(pubInv.amountWithdrawnUsd), 1500.00);
    assert.equal(pubInv.roiForecast, '12.5% a.a.');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Admin Operational Updates & Live Public Sync Verification
    // ─────────────────────────────────────────────────────────────────────────

    // 8.1 Admin logs Day 2 sats: 20,000 sats @ $70,000/BTC => $14.00 USD
    const log2Payload = {
      earnedAt: '2026-09-20T00:00:00.000Z',
      satoshiAmount: '20000',
      btcUsdPrice: 70000.00,
    };
    const resCreateLog2 = await adminFetch(
      `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs`,
      {
        method: 'POST',
        body: JSON.stringify(log2Payload),
      },
    );
    assert.equal(resCreateLog2.status, 201);
    const dataLog2 = await resCreateLog2.json();
    createdLog2Id = dataLog2.profitLog.id;
    assert.equal(Number(dataLog2.profitLog.earnedUsd), 14.00);

    // 8.2 Verify public hardware stats aggregated both days (15k + 20k = 35k sats, $9.75 + $14 = $23.75)
    const resPubHardware2 = await publicFetch(`${baseUrl}/api/transparency/hardware-assets`);
    const dataPubHardware2 = await resPubHardware2.json();
    const pubAsset2 = dataPubHardware2.assets.find((a) => a.id === createdAssetId);
    assert.equal(pubAsset2.profitSummary.totalEarnedSatoshi, '35000');
    assert.equal(Number(pubAsset2.profitSummary.totalEarnedUsd), 23.75);
    assert.equal(pubAsset2.profitLogs.length, 2);

    // 8.3 Admin updates External Investment with newly harvested returns
    const resUpdateInv = await adminFetch(
      `/api/admin/transparency/external-investments/${createdInvestmentId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ amountWithdrawnUsd: 3000.00, roiForecast: '14.0% a.a.' }),
      },
    );
    assert.equal(resUpdateInv.status, 200);

    // 8.4 Public visitor sees updated yield immediately
    const resPubInv2 = await publicFetch(`${baseUrl}/api/transparency/external-investments`);
    const dataPubInv2 = await resPubInv2.json();
    const pubInv2 = dataPubInv2.investments.find((i) => i.id === createdInvestmentId);
    assert.equal(Number(pubInv2.amountWithdrawnUsd), 3000.00);
    assert.equal(pubInv2.roiForecast, '14.0% a.a.');

    // 8.5 Admin deactivates expense (moves to draft)
    await adminFetch(`/api/admin/transparency/${createdExpenseId}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: false }),
    });

    // 8.6 Public visitor should no longer see the deactivated expense
    const resPubEntries2 = await publicFetch(`${baseUrl}/api/transparency`);
    const dataPubEntries2 = await resPubEntries2.json();
    const pubExp2 = dataPubEntries2.entries.find((e) => e.id === createdExpenseId);
    assert.equal(pubExp2, undefined, 'Deactivated expense must be omitted from public response');
  } finally {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: Clean Teardown
    // ─────────────────────────────────────────────────────────────────────────
    if (createdLog1Id && createdAssetId) {
      await adminFetch(
        `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs/${createdLog1Id}`,
        { method: 'DELETE' },
      );
    }
    if (createdLog2Id && createdAssetId) {
      await adminFetch(
        `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs/${createdLog2Id}`,
        { method: 'DELETE' },
      );
    }
    if (createdAssetId) {
      await adminFetch(`/api/admin/transparency/hardware-assets/${createdAssetId}`, {
        method: 'DELETE',
      });
    }
    if (createdInvestmentId) {
      await adminFetch(`/api/admin/transparency/external-investments/${createdInvestmentId}`, {
        method: 'DELETE',
      });
    }
    if (createdWalletId) {
      await adminFetch(`/api/admin/transparency/tracked-wallets/${createdWalletId}`, {
        method: 'DELETE',
      });
    }
    if (createdExpenseId) {
      await adminFetch(`/api/admin/transparency/${createdExpenseId}`, { method: 'DELETE' });
    }
    if (createdIncomeId) {
      await adminFetch(`/api/admin/transparency/${createdIncomeId}`, { method: 'DELETE' });
    }
  }
});
