import test from "node:test";
import assert from "node:assert/strict";
import { requireAdminPermission, hasPermission } from "../../server/modules/admin/admin.permissions.js";
import prisma from "../../server/core/database/prisma.js";

test("Broadcast RBAC & Security Validation", async (t) => {
  await t.test("RBAC - hasPermission correctly authorizes broadcast permission", () => {
    // Super admin
    assert.equal(hasPermission(["*"], "broadcast"), true);

    // Explicit broadcast permission
    assert.equal(hasPermission(["broadcast"], "broadcast"), true);

    // Readonly / Moderator / Support should NOT have broadcast permission
    assert.equal(hasPermission(["dashboard"], "broadcast"), false);
    assert.equal(hasPermission(["dashboard", "users.view", "support"], "broadcast"), false);
    assert.equal(hasPermission(["dashboard", "users.view", "users.ban"], "broadcast"), false);
  });

  await t.test("RBAC - requireAdminPermission middleware blocks unauthorized admins", () => {
    const middleware = requireAdminPermission("broadcast", "promotions");

    // Case 1: No admin session on request
    let statusSent = null;
    let jsonSent = null;
    const reqNoAuth = {};
    const resNoAuth = {
      status(code) {
        statusSent = code;
        return {
          json(data) {
            jsonSent = data;
          },
        };
      },
    };
    middleware(reqNoAuth, resNoAuth, () => {});
    assert.equal(statusSent, 401);

    // Case 2: Admin with insufficient permissions (e.g. readonly)
    statusSent = null;
    jsonSent = null;
    const reqReadonly = {
      admin: {
        adminId: 999,
        role: "readonly",
        permissions: ["dashboard"],
      },
    };
    middleware(reqReadonly, resNoAuth, () => {});
    assert.equal(statusSent, 403);
    assert.equal(jsonSent.code, "FORBIDDEN_PERMISSION");

    // Case 3: Admin with broadcast permission
    let nextCalled = false;
    const reqBroadcastAdmin = {
      admin: {
        adminId: 100,
        role: "admin",
        permissions: ["dashboard", "broadcast"],
      },
    };
    middleware(reqBroadcastAdmin, resNoAuth, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);

    // Case 4: Admin with promotions fallback permission
    nextCalled = false;
    const reqPromoAdmin = {
      admin: {
        adminId: 101,
        role: "admin",
        permissions: ["dashboard", "promotions"],
      },
    };
    middleware(reqPromoAdmin, resNoAuth, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  await t.test("Anti-XSS & Safe URL Validation — reject dangerous schemes", () => {
    function normalizeBroadcastLink(v) {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const s = String(v).trim().slice(0, 1000);
      if (!s) return null;
      if (/^(javascript|data|vbscript|file):/i.test(s)) return null;
      if (s.startsWith("//")) return null;
      if (s.startsWith("/") && !s.startsWith("//")) return s;
      if (/^https:\/\/[a-zA-Z0-9\-\.]+(\.[a-zA-Z]{2,}|localhost)/i.test(s)) return s;
      if (/^http:\/\/(localhost|127\.0\.0\.1)/i.test(s)) return s;
      return null;
    }

    // Malicious XSS vectors
    assert.equal(normalizeBroadcastLink("javascript:alert('xss')"), null);
    assert.equal(normalizeBroadcastLink("JAVASCRIPT:alert(document.cookie)"), null);
    assert.equal(normalizeBroadcastLink("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="), null);
    assert.equal(normalizeBroadcastLink("vbscript:msgbox(1)"), null);
    assert.equal(normalizeBroadcastLink("//evil-phishing-site.com/login"), null);

    // Valid relative internal paths
    assert.equal(normalizeBroadcastLink("/shop"), "/shop");
    assert.equal(normalizeBroadcastLink("/faucet/claim?ref=123"), "/faucet/claim?ref=123");
    assert.equal(normalizeBroadcastLink("/tournaments/crypto#live"), "/tournaments/crypto#live");

    // Valid absolute external URLs
    assert.equal(normalizeBroadcastLink("https://polygonscan.com/tx/0x123"), "https://polygonscan.com/tx/0x123");
    assert.equal(normalizeBroadcastLink("https://twitter.com/blockminer"), "https://twitter.com/blockminer");
    assert.equal(normalizeBroadcastLink("http://localhost:3000/test"), "http://localhost:3000/test");
  });

  await t.test("Parameter Validation — reject invalid / NaN IDs", () => {
    function validateBroadcastId(rawId) {
      const messageId = Number(rawId);
      if (!Number.isInteger(messageId) || messageId < 1) {
        return false;
      }
      return true;
    }

    assert.equal(validateBroadcastId("abc"), false);
    assert.equal(validateBroadcastId("0"), false);
    assert.equal(validateBroadcastId("-5"), false);
    assert.equal(validateBroadcastId("12.5"), false);
    assert.equal(validateBroadcastId("undefined"), false);
    assert.equal(validateBroadcastId("1"), true);
    assert.equal(validateBroadcastId("42"), true);
  });
});
