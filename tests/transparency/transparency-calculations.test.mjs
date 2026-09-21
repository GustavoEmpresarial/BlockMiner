import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SATOSHI_PER_BTC,
  parseSatoshiInput,
  parsePositiveDecimal,
  satoshiToBtc,
  computeEarnedUsd,
  computeHardwareRoiSummary,
} from '../../server/modules/transparency/transparency.hardware-profit.js';

test('parseSatoshiInput: handles diverse valid and invalid inputs', () => {
  assert.equal(parseSatoshiInput(1000), 1000n);
  assert.equal(parseSatoshiInput('50000'), 50000n);
  assert.equal(parseSatoshiInput('  12,345 sats  '), 12345n);
  assert.equal(parseSatoshiInput('0'), null);
  assert.equal(parseSatoshiInput(-100), null);
  assert.equal(parseSatoshiInput(''), null);
  assert.equal(parseSatoshiInput(null), null);
  assert.equal(parseSatoshiInput(undefined), null);
  assert.equal(parseSatoshiInput('abc'), null);
});

test('parsePositiveDecimal: validates positive finite numbers', () => {
  assert.equal(parsePositiveDecimal(640), 640);
  assert.equal(parsePositiveDecimal('95000.50'), 95000.5);
  assert.equal(parsePositiveDecimal(0), null);
  assert.equal(parsePositiveDecimal(-10), null);
  assert.equal(parsePositiveDecimal('invalid'), null);
  assert.equal(parsePositiveDecimal(Infinity), null);
});

test('satoshiToBtc: converts satoshis to BTC decimal correctly', () => {
  assert.equal(satoshiToBtc(100_000_000n), 1.0);
  assert.equal(satoshiToBtc(50_000_000n), 0.5);
  assert.equal(satoshiToBtc(1_000n), 0.00001);
});

test('computeEarnedUsd: converts sats to USD at given BTC price with 2 decimal precision', () => {
  // 100,000 sats at $100,000 / BTC = 0.001 BTC * $100,000 = $100.00
  assert.equal(computeEarnedUsd(100_000n, 100_000), 100);

  // 1,234 sats at $60,000 / BTC = 0.00001234 * 60000 = $0.7404 -> $0.74
  assert.equal(computeEarnedUsd(1_234n, 60_000), 0.74);
});

test('computeHardwareRoiSummary: calculates ROI progress, remaining cost, and daily rate', () => {
  const purchaseCostUsd = 640.0;
  const day1 = new Date('2026-09-01T12:00:00Z');
  const day2 = new Date('2026-09-02T12:00:00Z');
  const day3 = new Date('2026-09-03T12:00:00Z');

  const logs = [
    { earnedAt: day1, satoshiAmount: 10_000n, earnedUsd: 6.0 },
    { earnedAt: day2, satoshiAmount: 10_000n, earnedUsd: 6.0 },
    { earnedAt: day3, satoshiAmount: 20_000n, earnedUsd: 12.0 },
  ];

  const summary = computeHardwareRoiSummary(purchaseCostUsd, logs);

  assert.equal(summary.purchaseCostUsd, 640.0);
  assert.equal(summary.totalEarnedUsd, 24.0);
  assert.equal(summary.totalEarnedSatoshi, '40000');
  assert.equal(summary.logCount, 3);
  assert.equal(summary.roiReached, false);
  assert.equal(summary.remainingUsd, 616.0);
  // recoveredPct = (24 / 640) * 100 = 3.75%
  assert.equal(summary.recoveredPct, 3.75);
  // 3 logs over 2-day span (from Sep 1 to Sep 3) = spanDays = 2, avgDailyUsd = 24 / 2 = 12.0
  assert.equal(summary.avgDailyUsd, 12.0);
  // estimatedDaysToRoi = ceil(616 / 12.0) = 52 days
  assert.equal(summary.estimatedDaysToRoi, 52);
  assert.equal(summary.firstEarnedAt, day1.toISOString());
  assert.equal(summary.lastEarnedAt, day3.toISOString());
});

test('computeHardwareRoiSummary: handles zero or empty logs gracefully', () => {
  const summary = computeHardwareRoiSummary(500, []);
  assert.equal(summary.totalEarnedUsd, 0);
  assert.equal(summary.totalEarnedSatoshi, '0');
  assert.equal(summary.logCount, 0);
  assert.equal(summary.recoveredPct, 0);
  assert.equal(summary.remainingUsd, 500);
  assert.equal(summary.roiReached, false);
  assert.equal(summary.avgDailyUsd, null);
  assert.equal(summary.estimatedDaysToRoi, null);
  assert.equal(summary.firstEarnedAt, null);
  assert.equal(summary.lastEarnedAt, null);
});

test('computeHardwareRoiSummary: flags roiReached when earned >= purchase cost', () => {
  const summary = computeHardwareRoiSummary(100, [
    { earnedAt: new Date(), satoshiAmount: 150_000n, earnedUsd: 120.0 },
  ]);
  assert.equal(summary.roiReached, true);
  assert.equal(summary.recoveredPct, 120.0);
  assert.equal(summary.remainingUsd, 0);
  assert.equal(summary.estimatedDaysToRoi, 0);
});
