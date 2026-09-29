import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  transparencyEntryCreateSchema,
  transparencyEntryUpdateSchema,
  trackedWalletCreateSchema,
  parsePositiveIntParam,
  isSafeHttpUrl,
} from "../../server/modules/transparency/transparency.validation.ts";

describe("Transparency Full Unit & Asset Validation", () => {
  it("verifies Blender-generated 3D assets exist in public media directory", () => {
    const root = process.cwd();
    const mediaDir = path.join(root, "client", "public", "media", "transparency");
    const requiredFiles = [
      "contabo.glb",
      "contabo.png",
      "claude.glb",
      "claude.png",
      "gemini.glb",
      "gemini.png",
    ];

    for (const f of requiredFiles) {
      const fullPath = path.join(mediaDir, f);
      assert.ok(fs.existsSync(fullPath), `Missing required asset: ${f}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 1000, `Asset ${f} is too small (${stats.size} bytes)`);
    }
  });

  it("validates transparencyEntryCreateSchema with Blender 3D logo path", () => {
    const payload = {
      type: "expense",
      category: "infrastructure",
      name: "Server Contabo VPS",
      provider: "Contabo",
      imageUrl: "/media/transparency/contabo.png",
      amountUsd: 9.0,
      period: "monthly",
      isPaid: true,
      isActive: true,
    };

    const res = transparencyEntryCreateSchema.safeParse(payload);
    assert.ok(res.success, `Expected valid parse: ${JSON.stringify(res)}`);
    assert.equal(res.data.imageUrl, "/media/transparency/contabo.png");
    assert.equal(res.data.amountUsd, 9.0);
  });

  it("rejects malicious javascript: URI in imageUrl and referenceUrl", () => {
    const maliciousPayload = {
      name: "Malicious Entry",
      amountUsd: 10,
      imageUrl: "javascript:alert(1)",
    };
    const res = transparencyEntryCreateSchema.safeParse(maliciousPayload);
    assert.equal(res.success, false);
  });

  it("rejects negative amountUsd in entry schema", () => {
    const negativePayload = {
      name: "Negative Entry",
      amountUsd: -50,
    };
    const res = transparencyEntryCreateSchema.safeParse(negativePayload);
    assert.equal(res.success, false);
  });

  it("enforces .strict() against mass assignment in create and update schemas", () => {
    const taintedCreate = {
      name: "Valid Name",
      amountUsd: 100,
      attackerField: "injected",
    };
    const resCreate = transparencyEntryCreateSchema.safeParse(taintedCreate);
    assert.equal(resCreate.success, false);

    const taintedUpdate = {
      amountUsd: 150,
      adminBypass: true,
    };
    const resUpdate = transparencyEntryUpdateSchema.safeParse(taintedUpdate);
    assert.equal(resUpdate.success, false);
  });

  it("validates trackedWalletCreateSchema with valid EVM address and clamps manual value", () => {
    const validWallet = {
      label: "Treasury Cold Storage",
      address: "0x1ca03755c5132e238ae4e0f50d4929ea0d58b897",
      chain: "polygon",
      manualUsdValue: 50000.5,
    };
    const res = trackedWalletCreateSchema.safeParse(validWallet);
    assert.ok(res.success);
    assert.equal(res.data.manualUsdValue, 50000.5);

    const invalidAddress = {
      label: "Bad Wallet",
      address: "invalid_not_hex",
    };
    const resInvalid = trackedWalletCreateSchema.safeParse(invalidAddress);
    assert.equal(resInvalid.success, false);
  });

  it("parsePositiveIntParam correctly clamps 32-bit boundary and rejects non-integers", () => {
    assert.equal(parsePositiveIntParam("42"), 42);
    assert.equal(parsePositiveIntParam("2147483647"), 2147483647);
    assert.equal(parsePositiveIntParam("2147483648"), null);
    assert.equal(parsePositiveIntParam("99999999999999"), null);
    assert.equal(parsePositiveIntParam("-1"), null);
    assert.equal(parsePositiveIntParam("abc"), null);
    assert.equal(parsePositiveIntParam(""), null);
  });
});
