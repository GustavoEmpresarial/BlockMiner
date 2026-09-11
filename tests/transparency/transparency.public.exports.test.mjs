import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repoSrc = readFileSync(
  new URL("../../dist/server/modules/transparency/transparency.repository.js", import.meta.url),
  "utf8",
);
const controllerSrc = readFileSync(
  new URL("../../dist/server/modules/transparency/transparency.controller.js", import.meta.url),
  "utf8",
);

test("transparency.repository exports the expected functions", () => {
  for (const fn of [
    "listTrackedWallets",
    "listPublicActiveWallets",
    "findWalletSettings",
    "upsertWalletSettings",
    "listActiveTransparencyEntries",
    "listAllTransparencyEntries",
    "createTransparencyEntry",
    "findTransparencyEntryById",
    "updateTransparencyEntry",
    "deleteTransparencyEntry",
    "createTrackedWallet",
    "findTrackedWalletById",
    "updateTrackedWallet",
    "deleteTrackedWallet",
    "aggregateCompletedWithdrawals",
    "listPublicWalletsWithSnapshot",
    "listActiveHardwareAssets",
    "listAllHardwareAssets",
    "createHardwareAsset",
    "findHardwareAssetById",
    "updateHardwareAsset",
    "deleteHardwareAsset",
  ]) {
    assert.match(repoSrc, new RegExp(`export async function ${fn}`), `${fn} should be exported`);
  }
});

test("listPublicWalletsWithSnapshot includes liquidityPools in query", () => {
  assert.match(repoSrc, /liquidityPools/);
  assert.match(repoSrc, /where:\s*\{\s*isPublic:\s*true\s*\}/);
});

test("transparency.controller exports public handlers", () => {
  for (const fn of [
    "getPublicHardwareAssets",
    "getPublicTrackedWalletsLive",
    "getPublicWithdrawalStats",
    "getPublicEntries",
    "getPublicExternalInvestments",
    "adminHardwareAssetList",
    "adminHardwareAssetCreate",
  ]) {
    assert.match(controllerSrc, new RegExp(`export async function ${fn}`), `${fn} should be exported`);
  }
});

test("wallets-live response maps liquidityPools and valueUsd", () => {
  assert.match(controllerSrc, /liquidityPools/);
  assert.match(controllerSrc, /valueUsd:\s*totalUsd/);
});
