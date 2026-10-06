import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

const {
  SPA_INDEX_PROBE_TTL_MS,
  readSpaIndexProbeTtlMs,
  createSpaIndexProbe,
  attachClientDistStatic,
  attachSpaFallback,
  renderSpaIndex,
  sendSpaReadiness,
} = await import("../../server/shared/http/spaStatic.ts");

test("SPA index probe ttl defaults to 5s and reads SPA_INDEX_PROBE_TTL_MS", () => {
  assert.equal(SPA_INDEX_PROBE_TTL_MS, 5_000);
  assert.equal(readSpaIndexProbeTtlMs({}), 5_000);
  assert.equal(readSpaIndexProbeTtlMs({ SPA_INDEX_PROBE_TTL_MS: "1500" }), 1_500);
  assert.equal(readSpaIndexProbeTtlMs({ SPA_INDEX_PROBE_TTL_MS: "nope" }), 5_000);
  assert.equal(readSpaIndexProbeTtlMs({ SPA_INDEX_PROBE_TTL_MS: "" }), 5_000);
});

test("probe reuses the cached result inside the ttl and stats again when it expires", () => {
  let calls = 0;
  let present = false;
  let now = 10_000;
  const probe = createSpaIndexProbe("/virtual/index.html", {
    ttlMs: SPA_INDEX_PROBE_TTL_MS,
    now: () => now,
    exists: () => {
      calls += 1;
      return present;
    },
  });
  assert.equal(probe(), false);
  present = true;
  assert.equal(probe(), false);
  now += SPA_INDEX_PROBE_TTL_MS - 1;
  assert.equal(probe(), false);
  assert.equal(calls, 1);
  now += 1;
  assert.equal(probe(), true);
  assert.equal(calls, 2);
});

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

test("missing index is 503, then the same process serves HTML after the file appears", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spa-static-"));
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist);
  const indexPath = path.join(dist, "index.html");
  let now = 1_000_000;
  const probe = createSpaIndexProbe(indexPath, { ttlMs: SPA_INDEX_PROBE_TTL_MS, now: () => now });
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true, service: "blockminer" }));
  app.get("/health/ready", (_req, res) => sendSpaReadiness(res, probe));
  app.get("/api/ping", (_req, res) => res.json({ ok: true, ping: true }));
  attachClientDistStatic(app, dist, probe);
  attachSpaFallback(app, { indexPath, indexReady: probe, renderIndex: renderSpaIndex });
  const { server, base } = await listen(app);
  try {
    const missing = await fetch(`${base}/`);
    assert.equal(missing.status, 503);
    assert.equal(await missing.text(), "Frontend build unavailable.");

    const readyMissing = await fetch(`${base}/health/ready`);
    assert.equal(readyMissing.status, 503);
    assert.deepEqual(await readyMissing.json(), { ok: false, service: "blockminer", ready: false });

    const live = await fetch(`${base}/health`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { ok: true, service: "blockminer" });

    const ping = await fetch(`${base}/api/ping`);
    assert.equal(ping.status, 200);
    assert.match(ping.headers.get("content-type") ?? "", /json/);
    assert.deepEqual(await ping.json(), { ok: true, ping: true });

    const unknownApi = await fetch(`${base}/api/does-not-exist`);
    const unknownBody = await unknownApi.text();
    assert.equal(unknownApi.status, 404);
    assert.match(unknownApi.headers.get("content-type") ?? "", /json/);
    assert.equal(unknownBody.includes("<"), false);
    assert.equal(JSON.parse(unknownBody).code, "ROUTE_NOT_FOUND");

    const missingAsset = await fetch(`${base}/assets/missing.js`);
    const missingAssetBody = await missingAsset.text();
    assert.equal(missingAsset.status, 404);
    assert.match(missingAsset.headers.get("content-type") ?? "", /json/);
    assert.equal(missingAssetBody.includes("<html"), false);
    assert.equal(JSON.parse(missingAssetBody).code, "ASSET_NOT_FOUND");

    fs.writeFileSync(indexPath, "<!doctype html><html><body>spa-ready</body></html>");
    fs.mkdirSync(path.join(dist, "assets"));
    fs.writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)\n");

    const cachedMiss = await fetch(`${base}/`);
    assert.equal(cachedMiss.status, 503);

    now += SPA_INDEX_PROBE_TTL_MS;
    const healed = await fetch(`${base}/`);
    assert.equal(healed.status, 200);
    assert.match(healed.headers.get("content-type") ?? "", /html/);
    assert.match(await healed.text(), /spa-ready/);

    const ready = await fetch(`${base}/health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { ok: true, service: "blockminer", ready: true });

    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), "console.log(1)\n");

    const stillMissing = await fetch(`${base}/assets/other.js`);
    const stillMissingBody = await stillMissing.text();
    assert.equal(stillMissing.status, 404);
    assert.equal(JSON.parse(stillMissingBody).code, "ASSET_NOT_FOUND");
    assert.equal(stillMissingBody.includes("spa-ready"), false);

    const pingAfter = await fetch(`${base}/api/ping`);
    assert.deepEqual(await pingAfter.json(), { ok: true, ping: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
