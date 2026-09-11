import test from "node:test";
import assert from "node:assert/strict";

const chat = await import("../../server/modules/chat/chat.service.ts");
const refs = await import("../../server/modules/referrals/referrals.constants.ts");

test("escapeHtml escapes XSS-sensitive characters", () => {
  assert.equal(chat.escapeHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(chat.escapeHtml("a & b"), "a &amp; b");
});

test("sanitizeChatPlainText strips tags and stores plain text (no entities)", () => {
  assert.equal(chat.sanitizeChatPlainText(`<script>alert("x")</script> hi`), 'alert("x") hi');
  assert.equal(chat.sanitizeChatPlainText("a <3 b"), "a 3 b");
  assert.equal(chat.sanitizeChatPlainText("  hello   world  "), "hello world");
  assert.equal(chat.sanitizeChatPlainText("<img src=x onerror=alert(1)>"), "");
  assert.equal(chat.sanitizeChatPlainText("ok\n\n\nline"), "ok\n\nline");
  assert.ok(!chat.sanitizeChatPlainText("<b>x</b>").includes("<"));
});

test("REFERRAL_MINING_COMMISSION_RATE is 10%", () => {
  assert.equal(refs.REFERRAL_MINING_COMMISSION_RATE, 0.1);
});

test("countsForDepositTournament excludes hd_deposit source", () => {
  assert.equal(refs.countsForDepositTournament(JSON.stringify({ source: "hd_deposit" })), false);
  assert.equal(refs.countsForDepositTournament(JSON.stringify({ source: "treasury" })), true);
  assert.equal(refs.countsForDepositTournament(null), true);
});
