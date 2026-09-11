import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, rmSync } from "node:fs";

const cfg = await import("../../server/modules/media/media.config.ts");

test("MEDIA_CATEGORIES includes legacy set plus models", () => {
  assert.deepEqual(cfg.MEDIA_CATEGORIES, [
    "miners",
    "banners",
    "offers",
    "transparency",
    "burn",
    "support",
    "broadcast",
    "social",
    "partner-games",
    "sala",
    "racks",
    "fans",
    "icons",
    "brand",
    "models",
  ]);
});

test("isMediaCategory: accepts every known category", () => {
  for (const c of cfg.MEDIA_CATEGORIES) {
    assert.equal(cfg.isMediaCategory(c), true);
  }
});

test("isMediaCategory: rejects unknown slugs", () => {
  assert.equal(cfg.isMediaCategory("not-a-category"), false);
  assert.equal(cfg.isMediaCategory(""), false);
  assert.equal(cfg.isMediaCategory("Miners"), false); // case-sensitive
});

test("mediaPublicPath: builds /media/<category>/<file>", () => {
  assert.equal(cfg.mediaPublicPath("miners", "abc.webp"), "/media/miners/abc.webp");
  assert.equal(cfg.mediaPublicPath("partner-games", "pg-1-x.webp"), "/media/partner-games/pg-1-x.webp");
});

test("MEDIA_PUBLIC_PREFIX defaults to /media", () => {
  assert.equal(cfg.MEDIA_PUBLIC_PREFIX, "/media");
});

test("mediaRootDir / mediaDiskDir resolve under <projectRoot>/storage/uploads/media and create the dir", () => {
  const root = cfg.mediaRootDir();
  assert.ok(root.endsWith(path.join("storage", "uploads", "media")), `unexpected root: ${root}`);
  assert.ok(existsSync(root), "mediaRootDir() should create the directory");

  const dir = cfg.mediaDiskDir("icons");
  assert.equal(dir, path.join(root, "icons"));
  assert.ok(existsSync(dir), "mediaDiskDir() should create the category directory");

  // Cleanup only the (empty) test-created category dir, never the shared root.
  rmSync(dir, { recursive: true, force: true });
});
