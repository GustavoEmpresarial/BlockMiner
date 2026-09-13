/**
 * Regression guard for the /media Cache-Control fix (server/bootstrap/server.ts).
 * Before this, express.static(mediaRootDir()) was mounted with no options, so every
 * request for every miner/rack/fan image came back with NO Cache-Control header at
 * all — every /inventory page view re-fetched every image from scratch. Uploaded
 * filenames are always unique (timestamp+hash) and never overwritten in place, so a
 * long, immutable cache is safe. This test exercises express.static with the exact
 * options now used in server.ts against a throwaway temp directory, rather than
 * booting the full app (too heavy for this one header check).
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      res.resume();
      resolve(res);
    }).on("error", reject);
  });
}

test("/media files are served with a long, immutable Cache-Control header", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "media-cache-test-"));
  const file = "miner-1780321812460-a416288557be.webp";
  writeFileSync(path.join(dir, file), "fake-webp-bytes");

  const app = express();
  app.use("/media", express.static(dir, { maxAge: "30d", immutable: true }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;

  try {
    const res = await get(`http://127.0.0.1:${port}/media/${file}`);
    assert.equal(res.statusCode, 200);
    const cacheControl = res.headers["cache-control"];
    assert.ok(cacheControl, "Cache-Control header must be present");
    assert.match(cacheControl, /max-age=2592000/, "30 days in seconds");
    assert.match(cacheControl, /immutable/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing /media file still 404s cleanly (cache headers don't mask a real miss)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "media-cache-test-"));
  const app = express();
  app.use("/media", express.static(dir, { maxAge: "30d", immutable: true }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;

  try {
    const res = await get(`http://127.0.0.1:${port}/media/does-not-exist.webp`);
    assert.equal(res.statusCode, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
