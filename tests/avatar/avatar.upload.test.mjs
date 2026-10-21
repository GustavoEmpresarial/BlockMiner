/**
 * Uploads are decoded and re-encoded server-side: 256x256 WebP, metadata stripped, server-chosen
 * name. Only PNG/JPEG/WebP/GIF; SVG, garbage and decompression bombs are refused. No license, no upload.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), "bm-avatar-"));
process.env.UPLOADS_DIR = uploads;

const avatars = new Map();
const prismaFake = {
  userAvatar: {
    findUnique: async ({ where }) => avatars.get(where.userId) ?? null,
    updateMany: async ({ where, data }) => {
      const row = avatars.get(where.userId);
      if (!row || row.uploadBlocked !== where.uploadBlocked || !(row.licenseExpiresAt > where.licenseExpiresAt.gt)) return { count: 0 };
      avatars.set(where.userId, { ...row, ...data });
      return { count: 1 };
    },
    upsert: async ({ where, create, update }) => {
      const cur = avatars.get(where.userId);
      const row = cur ? { ...cur, ...update } : { ...create };
      avatars.set(where.userId, row);
      return row;
    },
  },
};
prismaFake.$transaction = async (fn) => fn(prismaFake);
mock.module(spec("server/core/database/prisma.ts"), { defaultExport: prismaFake });
mock.module(spec("server/shared/cryptoPrice/cryptoPrice.ts"), { namedExports: { getFreshUsdPrice: async () => 1 } });
mock.module(spec("server/modules/wallet/balance/balance.service.ts"), { namedExports: { invalidateBalanceCache: () => {} } });
mock.module(spec("server/shared/security/authUser.ts"), { namedExports: { invalidateAuthUserCache: () => {} } });

const svc = await import("../../server/modules/avatar/avatar.service.ts");
const now = new Date();
const future = new Date(Date.now() + 86_400_000);
const dir = path.join(uploads, "media", "avatars");
const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: "#3b82f6" } }).png().toBuffer();
const withExif = () => sharp({ create: { width: 400, height: 300, channels: 3, background: "#ff0000" } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: "secret-gps-owner" } } }).toBuffer();

test.after(() => fs.rmSync(uploads, { recursive: true, force: true }));

test("a PNG becomes a 256x256 WebP with no metadata", async () => {
  const out = await svc.normalizeAvatarImage(await png(800, 400));
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 256);
  assert.equal(meta.height, 256);
  const jpgOut = await svc.normalizeAvatarImage(await withExif());
  assert.equal((await sharp(jpgOut).metadata()).exif, undefined, "EXIF stripped");
  assert.ok(!jpgOut.includes(Buffer.from("secret-gps-owner")));
});

test("SVG, garbage and a polyglot are refused", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  await assert.rejects(svc.normalizeAvatarImage(svg), (e) => e.code === "AVATAR_UPLOAD_INVALID");
  await assert.rejects(svc.normalizeAvatarImage(Buffer.from("not an image at all")), (e) => e.code === "AVATAR_UPLOAD_INVALID");
  const polyglot = Buffer.concat([Buffer.from("<?php system($_GET[1]); ?>"), await png(10, 10)]);
  await assert.rejects(svc.normalizeAvatarImage(polyglot), (e) => e.code === "AVATAR_UPLOAD_INVALID");
});

test("decompression bomb (over 40 MP) is refused", async () => {
  const big = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "#000000" } }).png({ compressionLevel: 9 }).toBuffer();
  await assert.rejects(svc.normalizeAvatarImage(big), (e) => e.code === "AVATAR_UPLOAD_INVALID");
});

test("no license / blocked: upload refused and nothing written", async () => {
  avatars.set(20, { path: null, uploadBlocked: false, licenseExpiresAt: new Date(Date.now() - 1000) });
  await assert.rejects(svc.saveAvatarPhoto(20, await png(300, 300)), (e) => e.code === "AVATAR_LICENSE_REQUIRED");
  avatars.set(21, { path: null, uploadBlocked: true, licenseExpiresAt: future });
  await assert.rejects(svc.saveAvatarPhoto(21, await png(300, 300)), (e) => e.code === "AVATAR_UPLOAD_BLOCKED");
  await assert.rejects(svc.saveAvatarPhoto(22, await png(300, 300)), (e) => e.code === "AVATAR_LICENSE_REQUIRED");
  assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], []);
});

test("replacing a photo deletes the old file; the new name is server-chosen", async () => {
  avatars.set(30, { path: null, uploadBlocked: false, licenseExpiresAt: future });
  const a = await svc.saveAvatarPhoto(30, await png(300, 300), now);
  const first = avatars.get(30).path;
  assert.match(first, /^[a-f0-9]{32}\.webp$/);
  assert.equal(a.avatarUrl, `/media/avatars/${first}`);
  assert.ok(fs.existsSync(path.join(dir, first)));
  await svc.saveAvatarPhoto(30, await png(500, 500), now);
  const second = avatars.get(30).path;
  assert.notEqual(second, first);
  assert.ok(!fs.existsSync(path.join(dir, first)), "old file removed");
  assert.ok(fs.existsSync(path.join(dir, second)));
});

test("admin removal keeps the license, can block further uploads", async () => {
  const before = avatars.get(30);
  await svc.removeAvatarPhoto(30, { block: true });
  const after = avatars.get(30);
  assert.equal(after.path, null);
  assert.equal(after.uploadBlocked, true);
  assert.equal(after.licenseExpiresAt, before.licenseExpiresAt);
  assert.ok(!fs.existsSync(path.join(dir, before.path)));
  await assert.rejects(svc.saveAvatarPhoto(30, await png(300, 300)), (e) => e.code === "AVATAR_UPLOAD_BLOCKED");
});
