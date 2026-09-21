import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { transparencyRouter } from '../../server/modules/transparency/transparency.routes.js';
import { transparencyAdminRouter } from '../../server/modules/transparency/transparency.admin.routes.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-blockminer-integration-testing';

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

test.before(async () => {
  const token = jwt.sign(
    { role: 'admin', type: 'admin_session' },
    process.env.JWT_SECRET,
    { issuer: 'blockminer-admin', algorithm: 'HS256' },
  );
  adminAuthHeader = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  app = express();
  app.use(express.json());

  // Public transparency routes
  app.use('/api/transparency', transparencyRouter);

  // Protected admin transparency routes
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

// ─── SUITE 1: Transparency Entries CRUD Integration ─────────────────────────

test('Integration CRUD: Transparency Entries (Expense & Income)', async () => {
  let createdExpenseId;
  let createdIncomeId;

  try {
    // 1. Create an expense entry
    const expPayload = {
      type: 'expense',
      category: 'infrastructure',
      name: 'TEST_INTEG_Hetzner Dedicated Server',
      provider: 'Hetzner Online',
      providerUrl: 'https://hetzner.com',
      amountUsd: 149.99,
      currencyCode: 'USD',
      period: 'monthly',
      isOnChain: false,
      isPaid: true,
      isActive: true,
      sortOrder: 0,
    };
    const resCreateExp = await adminFetch('/api/admin/transparency', {
      method: 'POST',
      body: JSON.stringify(expPayload),
    });
    assert.equal(resCreateExp.status, 201, 'Expense creation should return 201');
    const dataCreateExp = await resCreateExp.json();
    assert.equal(dataCreateExp.ok, true);
    assert.ok(dataCreateExp.entry?.id);
    createdExpenseId = dataCreateExp.entry.id;

    // 2. Create an income entry
    const incPayload = {
      type: 'income',
      category: 'misc',
      incomeCategory: 'sponsorship',
      name: 'TEST_INTEG_Top Banner Sponsor',
      provider: 'CryptoAds Global',
      amountUsd: 450.00,
      currencyCode: 'USD',
      period: 'monthly',
      isOnChain: false,
      isPaid: true,
      isActive: true,
      sortOrder: 1,
    };
    const resCreateInc = await adminFetch('/api/admin/transparency', {
      method: 'POST',
      body: JSON.stringify(incPayload),
    });
    assert.equal(resCreateInc.status, 201, 'Income creation should return 201');
    const dataCreateInc = await resCreateInc.json();
    assert.equal(dataCreateInc.ok, true);
    assert.ok(dataCreateInc.entry?.id);
    createdIncomeId = dataCreateInc.entry.id;

    // 3. List all entries via Admin API
    const resList = await adminFetch('/api/admin/transparency');
    assert.equal(resList.status, 200);
    const dataList = await resList.json();
    assert.equal(dataList.ok, true);
    const foundExp = dataList.entries.find((e) => e.id === createdExpenseId);
    const foundInc = dataList.entries.find((e) => e.id === createdIncomeId);
    assert.ok(foundExp, 'Created expense should be listed in admin');
    assert.ok(foundInc, 'Created income should be listed in admin');
    assert.equal(Number(foundExp.amountUsd), 149.99);
    assert.equal(Number(foundInc.amountUsd), 450.00);

    // 4. Update the expense entry
    const updatePayload = {
      amountUsd: 199.99,
      provider: 'Hetzner Online GmbH',
      notes: 'Upgraded RAM to 128GB',
    };
    const resUpdate = await adminFetch(`/api/admin/transparency/${createdExpenseId}`, {
      method: 'PUT',
      body: JSON.stringify(updatePayload),
    });
    assert.equal(resUpdate.status, 200, 'Update should return 200');
    const dataUpdate = await resUpdate.json();
    assert.equal(dataUpdate.ok, true);
    assert.equal(Number(dataUpdate.entry?.amountUsd), 199.99);

    // 5. Verify Public Portal returns the active entries
    const resPublic = await fetch(`${baseUrl}/api/transparency`);
    assert.equal(resPublic.status, 200);
    const dataPublic = await resPublic.json();
    assert.equal(dataPublic.ok, true);
    const publicExp = dataPublic.entries.find((e) => e.id === createdExpenseId);
    assert.ok(publicExp, 'Active expense should be visible in public API');
    assert.equal(Number(publicExp.amountUsd), 199.99);

    // 6. Set expense to inactive (draft mode)
    await adminFetch(`/api/admin/transparency/${createdExpenseId}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: false }),
    });

    // 7. Verify Public Portal omits inactive entries
    const resPublic2 = await fetch(`${baseUrl}/api/transparency`);
    const dataPublic2 = await resPublic2.json();
    const publicExp2 = dataPublic2.entries.find((e) => e.id === createdExpenseId);
    assert.equal(publicExp2, undefined, 'Inactive expense must be hidden from public API');
  } finally {
    // Cleanup
    if (createdExpenseId) {
      await adminFetch(`/api/admin/transparency/${createdExpenseId}`, { method: 'DELETE' });
    }
    if (createdIncomeId) {
      await adminFetch(`/api/admin/transparency/${createdIncomeId}`, { method: 'DELETE' });
    }
  }
});

// ─── SUITE 2: Tracked Wallets & Settings CRUD Integration ───────────────────

test('Integration CRUD: Tracked Wallets and Treasury Settings', async () => {
  let createdWalletId;

  try {
    // 1. Create a tracked wallet with valid EVM address
    const walletPayload = {
      label: 'TEST_INTEG_Polygon Treasury',
      address: '0x56a655787f73ffab2cbdb702008adacb60f1c9fc',
      chain: 'polygon',
      assetSymbol: 'USDC',
      explorerBaseUrl: 'https://polygonscan.com',
      isActive: true,
      isPublic: true,
      includeInTotals: true,
      displayMode: 'live',
      sortOrder: 0,
      manualUsdValue: 12500.50,
    };
    const resCreate = await adminFetch('/api/admin/transparency/tracked-wallets', {
      method: 'POST',
      body: JSON.stringify(walletPayload),
    });
    assert.equal(resCreate.status, 201, 'Tracked wallet creation should return 201');
    const dataCreate = await resCreate.json();
    assert.equal(dataCreate.ok, true);
    assert.ok(dataCreate.wallet?.id);
    createdWalletId = dataCreate.wallet.id;

    // 2. List tracked wallets in admin
    const resList = await adminFetch('/api/admin/transparency/tracked-wallets');
    assert.equal(resList.status, 200);
    const dataList = await resList.json();
    assert.equal(dataList.ok, true);
    const found = dataList.wallets.find((w) => w.id === createdWalletId);
    assert.ok(found, 'Created wallet should be in list');
    assert.equal(found.label, 'TEST_INTEG_Polygon Treasury');
    assert.equal(Number(found.manualUsdValue), 12500.50);

    // 3. Update wallet settings
    const updatePayload = {
      label: 'TEST_INTEG_Polygon Vault',
      manualUsdValue: 15000.00,
      displayMode: 'current_balance',
    };
    const resUpdate = await adminFetch(`/api/admin/transparency/tracked-wallets/${createdWalletId}`, {
      method: 'PUT',
      body: JSON.stringify(updatePayload),
    });
    assert.equal(resUpdate.status, 200);
    const dataUpdate = await resUpdate.json();
    assert.equal(dataUpdate.ok, true);
    assert.equal(dataUpdate.wallet?.label, 'TEST_INTEG_Polygon Vault');
    assert.equal(Number(dataUpdate.wallet?.manualUsdValue), 15000.00);

    // 4. Update and fetch primary treasury wallet settings
    const resSettingsPut = await adminFetch('/api/admin/transparency/wallet/settings', {
      method: 'PUT',
      body: JSON.stringify({ address: '0x56a655787f73ffab2cbdb702008adacb60f1c9fc' }),
    });
    assert.equal(resSettingsPut.status, 200);
    const dataSettingsPut = await resSettingsPut.json();
    assert.equal(dataSettingsPut.ok, true);

    const resSettingsGet = await adminFetch('/api/admin/transparency/wallet/settings');
    assert.equal(resSettingsGet.status, 200);
    const dataSettingsGet = await resSettingsGet.json();
    assert.equal(dataSettingsGet.ok, true);
    assert.equal(dataSettingsGet.address, '0x56a655787f73ffab2cbdb702008adacb60f1c9fc');
  } finally {
    if (createdWalletId) {
      await adminFetch(`/api/admin/transparency/tracked-wallets/${createdWalletId}`, {
        method: 'DELETE',
      });
    }
  }
});

// ─── SUITE 3: Hardware ASICs & Daily Profit Logs CRUD Integration ───────────

test('Integration CRUD: Hardware Assets & Lightning Profit Logs', async () => {
  let createdAssetId;
  let createdLogId;

  try {
    // 1. Create a physical mining hardware asset
    const assetPayload = {
      name: 'TEST_INTEG_Antminer S19J Pro 104 TH/s',
      manufacturer: 'Bitmain',
      purchaseCostUsd: 1500.00,
      status: 'running',
      description: 'Test integration rig',
      sortOrder: 0,
      isActive: true,
    };
    const resCreateAsset = await adminFetch('/api/admin/transparency/hardware-assets', {
      method: 'POST',
      body: JSON.stringify(assetPayload),
    });
    assert.equal(resCreateAsset.status, 201, 'Hardware asset creation should return 201');
    const dataCreateAsset = await resCreateAsset.json();
    assert.equal(dataCreateAsset.ok, true);
    assert.ok(dataCreateAsset.asset?.id);
    createdAssetId = dataCreateAsset.asset.id;

    // 2. List hardware assets
    const resListAssets = await adminFetch('/api/admin/transparency/hardware-assets');
    assert.equal(resListAssets.status, 200);
    const dataListAssets = await resListAssets.json();
    assert.equal(dataListAssets.ok, true);
    const foundAsset = dataListAssets.assets.find((a) => a.id === createdAssetId);
    assert.ok(foundAsset, 'Hardware asset should be in list');
    assert.equal(foundAsset.name, 'TEST_INTEG_Antminer S19J Pro 104 TH/s');

    // 3. Post a daily satoshi profit log
    // 35,000 sats @ $65,000 BTC = 0.00035000 * 65000 = $22.75
    const logPayload = {
      satoshiAmount: 35000,
      btcUsdPrice: 65000,
      earnedAt: '2026-09-20',
      notes: 'Lightning daily payment payout',
    };
    const resCreateLog = await adminFetch(
      `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs`,
      {
        method: 'POST',
        body: JSON.stringify(logPayload),
      },
    );
    assert.equal(resCreateLog.status, 201, 'Profit log creation should return 201');
    const dataCreateLog = await resCreateLog.json();
    assert.equal(dataCreateLog.ok, true);
    assert.ok(dataCreateLog.profitLog?.id);
    createdLogId = dataCreateLog.profitLog.id;
    assert.equal(Number(dataCreateLog.profitLog?.earnedUsd), 22.75);

    // 4. Retrieve profit logs & ROI summary
    const resGetLogs = await adminFetch(
      `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs`,
    );
    assert.equal(resGetLogs.status, 200);
    const dataGetLogs = await resGetLogs.json();
    assert.equal(dataGetLogs.ok, true);
    assert.ok(dataGetLogs.profitSummary, 'ROI summary should be returned');
    assert.equal(dataGetLogs.profitSummary.purchaseCostUsd, 1500.00);
    assert.equal(dataGetLogs.profitSummary.totalEarnedUsd, 22.75);
    assert.equal(dataGetLogs.profitSummary.remainingUsd, 1477.25);
    assert.equal(dataGetLogs.profitSummary.roiReached, false);
    assert.ok(dataGetLogs.profitSummary.recoveredPct > 1.0);

    // 5. Delete profit log
    const resDelLog = await adminFetch(
      `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs/${createdLogId}`,
      { method: 'DELETE' },
    );
    assert.equal(resDelLog.status, 200);
    createdLogId = null;
  } finally {
    if (createdLogId && createdAssetId) {
      await adminFetch(
        `/api/admin/transparency/hardware-assets/${createdAssetId}/profit-logs/${createdLogId}`,
        { method: 'DELETE' },
      );
    }
    if (createdAssetId) {
      await adminFetch(`/api/admin/transparency/hardware-assets/${createdAssetId}`, {
        method: 'DELETE',
      });
    }
  }
});

// ─── SUITE 4: External Investments CRUD Integration ─────────────────────────

test('Integration CRUD: External Investments Portfolio', async () => {
  let createdInvestmentId;

  try {
    // 1. Create an external investment
    const invPayload = {
      name: 'TEST_INTEG_Uniswap V3 USDC/WETH LP',
      description: 'Pool de liquidez concentrada em Polygon',
      linkUrl: 'https://app.uniswap.org',
      amountInvestedUsd: 5000.00,
      amountWithdrawnUsd: 1200.00,
      roiForecast: '18% a.a.',
      sortOrder: 0,
      isActive: true,
    };
    const resCreate = await adminFetch('/api/admin/transparency/external-investments', {
      method: 'POST',
      body: JSON.stringify(invPayload),
    });
    assert.equal(resCreate.status, 201, 'External investment creation should return 201');
    const dataCreate = await resCreate.json();
    assert.equal(dataCreate.ok, true);
    assert.ok(dataCreate.investment?.id);
    createdInvestmentId = dataCreate.investment.id;

    // 2. List in admin API
    const resListAdmin = await adminFetch('/api/admin/transparency/external-investments');
    assert.equal(resListAdmin.status, 200);
    const dataListAdmin = await resListAdmin.json();
    assert.equal(dataListAdmin.ok, true);
    const found = dataListAdmin.investments.find((i) => i.id === createdInvestmentId);
    assert.ok(found, 'Created investment should be returned in admin list');
    assert.equal(Number(found.amountInvestedUsd), 5000.00);
    assert.equal(Number(found.amountWithdrawnUsd), 1200.00);

    // 3. List in public API
    const resListPublic = await fetch(`${baseUrl}/api/transparency/external-investments`);
    assert.equal(resListPublic.status, 200);
    const dataListPublic = await resListPublic.json();
    assert.equal(dataListPublic.ok, true);
    const foundPublic = dataListPublic.investments.find((i) => i.id === createdInvestmentId);
    assert.ok(foundPublic, 'Created investment should be returned in public list');
    assert.equal(foundPublic.roiForecast, '18% a.a.');

    // 4. Update the investment (e.g. new withdrawal received)
    const updatePayload = {
      amountWithdrawnUsd: 2500.00,
      roiForecast: '22% a.a.',
    };
    const resUpdate = await adminFetch(
      `/api/admin/transparency/external-investments/${createdInvestmentId}`,
      {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      },
    );
    assert.equal(resUpdate.status, 200);
    const dataUpdate = await resUpdate.json();
    assert.equal(dataUpdate.ok, true);
    assert.equal(Number(dataUpdate.investment?.amountWithdrawnUsd), 2500.00);

    // 5. Delete the investment
    const resDel = await adminFetch(
      `/api/admin/transparency/external-investments/${createdInvestmentId}`,
      { method: 'DELETE' },
    );
    assert.equal(resDel.status, 200);
    createdInvestmentId = null;

    // 6. Verify it is gone from the public list
    const resListPublic2 = await fetch(`${baseUrl}/api/transparency/external-investments`);
    const dataListPublic2 = await resListPublic2.json();
    const foundDeleted = dataListPublic2.investments.find((i) => i.id === createdInvestmentId);
    assert.equal(foundDeleted, undefined, 'Deleted investment must not appear in public list');
  } finally {
    if (createdInvestmentId) {
      await adminFetch(
        `/api/admin/transparency/external-investments/${createdInvestmentId}`,
        { method: 'DELETE' },
      );
    }
  }
});
