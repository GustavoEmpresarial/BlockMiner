import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSafeHttpUrl,
  assertValidTransparencyWalletAddress,
  parsePositiveIntParam,
  externalInvestmentCreateSchema,
  externalInvestmentUpdateSchema,
  transparencyEntryCreateSchema,
  trackedWalletCreateSchema,
  hardwareAssetCreateSchema,
  hardwareProfitLogCreateSchema,
} from '../../server/modules/transparency/transparency.validation.js';

test('isSafeHttpUrl: allows valid http/https URLs and local paths, blocks dangerous schemes', () => {
  assert.equal(isSafeHttpUrl('https://google.com'), true);
  assert.equal(isSafeHttpUrl('http://localhost:3000'), true);
  assert.equal(isSafeHttpUrl('/uploads/receipt.png'), true);
  assert.equal(isSafeHttpUrl(''), true);
  assert.equal(isSafeHttpUrl(null), true);
  assert.equal(isSafeHttpUrl(undefined), true);

  // Dangerous XSS / SSRF vectors:
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeHttpUrl('vbscript:msgbox(1)'), false);
  assert.equal(isSafeHttpUrl('//attacker.com/evil.js'), false);
  assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
});

test('assertValidTransparencyWalletAddress: validates EVM address format strictly', () => {
  const valid = '0x1ca03755c5132e238ae4e0f50d4929ea0d58b897';
  assert.equal(assertValidTransparencyWalletAddress(valid), valid);

  assert.throws(() => assertValidTransparencyWalletAddress('0x123'), /Endereço de carteira inválido/);
  assert.throws(() => assertValidTransparencyWalletAddress('not-an-address'), /Endereço de carteira inválido/);
  assert.throws(() => assertValidTransparencyWalletAddress('0x' + 'g'.repeat(40)), /Endereço de carteira inválido/);
});

test('parsePositiveIntParam: parses valid integer IDs, rejects floats, non-numeric and negative values', () => {
  assert.equal(parsePositiveIntParam('1'), 1);
  assert.equal(parsePositiveIntParam('42'), 42);
  assert.equal(parsePositiveIntParam(100), 100);
  assert.equal(parsePositiveIntParam('0'), null);
  assert.equal(parsePositiveIntParam('-5'), null);
  assert.equal(parsePositiveIntParam('abc'), null);
  assert.equal(parsePositiveIntParam(null), null);
});

test('externalInvestmentCreateSchema: validates clean investment data and rejects invalid inputs', () => {
  // Valid payload
  const valid = externalInvestmentCreateSchema.safeParse({
    name: 'FaucetPay Stake Pool',
    description: 'Staking pool investment',
    linkUrl: 'https://faucetpay.io/?r=blockminer',
    imageUrl: 'https://faucetpay.io/logo.png',
    amountInvestedUsd: 150.0,
    amountWithdrawnUsd: 25.5,
    roiForecast: '+15% a.a.',
    isActive: true,
    sortOrder: 1,
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.name, 'FaucetPay Stake Pool');
    assert.equal(valid.data.amountInvestedUsd, 150.0);
  }

  // Reject negative invested amount
  const negInvested = externalInvestmentCreateSchema.safeParse({
    name: 'Invalid Pool',
    amountInvestedUsd: -50,
  });
  assert.equal(negInvested.success, false);

  // Reject negative withdrawn amount
  const negWithdrawn = externalInvestmentCreateSchema.safeParse({
    name: 'Invalid Pool',
    amountWithdrawnUsd: -10,
  });
  assert.equal(negWithdrawn.success, false);

  // Reject XSS linkUrl
  const xssLink = externalInvestmentCreateSchema.safeParse({
    name: 'Evil Platform',
    linkUrl: 'javascript:alert(document.cookie)',
  });
  assert.equal(xssLink.success, false);

  // Reject empty/short name
  const shortName = externalInvestmentCreateSchema.safeParse({
    name: 'A',
  });
  assert.equal(shortName.success, false);
});

test('transparencyEntryCreateSchema: validates financial entry schemas', () => {
  const validExpense = transparencyEntryCreateSchema.safeParse({
    type: 'expense',
    category: 'infrastructure',
    name: 'Hetzner Cloud Dedicated Server',
    amountUsd: 120.0,
    period: 'monthly',
    provider: 'Hetzner',
    providerUrl: 'https://hetzner.com',
    isPaid: true,
  });
  assert.equal(validExpense.success, true);

  // Negative amount rejected
  const negExpense = transparencyEntryCreateSchema.safeParse({
    type: 'expense',
    category: 'infrastructure',
    name: 'Hetzner Cloud',
    amountUsd: -10,
  });
  assert.equal(negExpense.success, false);

  // Invalid period rejected
  const badPeriod = transparencyEntryCreateSchema.safeParse({
    name: 'Server',
    amountUsd: 50,
    period: 'every_century',
  });
  assert.equal(badPeriod.success, false);
});

test('trackedWalletCreateSchema: enforces EVM format and non-negative manual USD', () => {
  const validWallet = trackedWalletCreateSchema.safeParse({
    label: 'Main Treasury',
    address: '0x1ca03755c5132e238ae4e0f50d4929ea0d58b897',
    chain: 'polygon',
    assetSymbol: 'POL',
    manualUsdValue: 500.0,
  });
  assert.equal(validWallet.success, true);

  // Invalid EVM address
  const badWallet = trackedWalletCreateSchema.safeParse({
    label: 'Bad Wallet',
    address: 'not-an-evm-address',
  });
  assert.equal(badWallet.success, false);

  // Negative manual USD value
  const negManual = trackedWalletCreateSchema.safeParse({
    label: 'Bad Value',
    address: '0x1ca03755c5132e238ae4e0f50d4929ea0d58b897',
    manualUsdValue: -100,
  });
  assert.equal(negManual.success, false);
});

test('hardwareProfitLogCreateSchema: parses and validates satoshi amount and BTC price', () => {
  const validLog = hardwareProfitLogCreateSchema.safeParse({
    satoshiAmount: '50000',
    btcUsdPrice: 98500.0,
    earnedAt: new Date().toISOString(),
    notes: 'Daily lightning payout',
  });
  assert.equal(validLog.success, true);
  if (validLog.success) {
    assert.equal(validLog.data.satoshiAmount, 50000n);
    assert.equal(validLog.data.btcUsdPrice, 98500.0);
  }

  // Zero satoshis rejected
  const zeroSats = hardwareProfitLogCreateSchema.safeParse({
    satoshiAmount: '0',
    btcUsdPrice: 98000,
  });
  assert.equal(zeroSats.success, false);

  // Negative BTC price rejected
  const negPrice = hardwareProfitLogCreateSchema.safeParse({
    satoshiAmount: 1000,
    btcUsdPrice: -500,
  });
  assert.equal(negPrice.success, false);
});
