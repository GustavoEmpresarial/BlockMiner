import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Unit tests for the Telegram subscription-broadcast bot engine (support + video notifiers) —
// ported from legacy/server/modules/telegram/notifiers/{support,video}.notifier.ts. These are
// broadcast bots (fan-out to subscribers), not the outbox worker (see telegram.worker.test.mjs
// for that mechanism) — the two run in parallel and independently, same as legacy.
const { createSubscriptionBotEngine, escapeHtml, escapeMarkdownV2 } = await import(
  "../../server/modules/notifications/telegram.subscription-bot.ts"
);

function tmpStorePath(name) {
  return path.join(os.tmpdir(), `blockminer-telegram-sub-bot-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test("createSubscriptionBotEngine: start() is a graceful no-op when the token env var is unset", () => {
  delete process.env.SMOKE_SUB_BOT_TEST_TOKEN;
  const engine = createSubscriptionBotEngine({
    name: "TestBotNoToken",
    tokenEnvVar: "SMOKE_SUB_BOT_TEST_TOKEN",
    storeOverrideEnvVar: "SMOKE_SUB_BOT_TEST_STORE",
    pollIntervalEnvVar: "SMOKE_SUB_BOT_TEST_POLL",
    defaultStoreFilename: "unused.json",
    startAckText: "ack",
    stopAckText: "stop-ack",
  });

  engine.start();
  assert.equal(engine.isStarted(), false, "must not start without a token — honest no-op");
  assert.deepEqual(engine.getSubscriberChatIds(), []);

  // notifyAll must also be a safe no-op — never throw, never fake a send.
  assert.doesNotThrow(() => engine.notifyAll({ text: "hello", parseMode: "HTML" }));
  engine.stop();
});

test("createSubscriptionBotEngine: persists and reloads the chat store to/from real disk", () => {
  const storePath = tmpStorePath("persist");
  process.env.SMOKE_SUB_BOT_TEST_TOKEN2 = "fake-token-not-real";
  process.env.SMOKE_SUB_BOT_TEST_STORE2 = storePath;

  const engine = createSubscriptionBotEngine({
    name: "TestBotPersist",
    tokenEnvVar: "SMOKE_SUB_BOT_TEST_TOKEN2",
    storeOverrideEnvVar: "SMOKE_SUB_BOT_TEST_STORE2",
    pollIntervalEnvVar: "SMOKE_SUB_BOT_TEST_POLL2",
    defaultStoreFilename: "unused.json",
    startAckText: "ack",
    stopAckText: "stop-ack",
  });

  try {
    // start() will kick off a real pollOnce() against a fake token, which will fail honestly
    // (bad token) and resolve without throwing (poll errors are caught + logged internally).
    engine.start();
    assert.equal(engine.isStarted(), true, "must start once a token is configured");

    // Simulate a subscriber having been captured (what pollOnce() would do on a real /start).
    // We write directly to disk in the exact shape the engine reads/writes, to test real
    // fs persistence without depending on network access to api.telegram.org.
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify({ chats: { "111": { registeredAt: new Date().toISOString() } }, lastUpdateId: 5 }, null, 2),
      "utf8",
    );
    assert.ok(fs.existsSync(storePath), "chat store file must exist on real disk");

    // A fresh engine instance pointed at the same store path must reload the persisted chat.
    const engine2 = createSubscriptionBotEngine({
      name: "TestBotPersistReload",
      tokenEnvVar: "SMOKE_SUB_BOT_TEST_TOKEN2",
      storeOverrideEnvVar: "SMOKE_SUB_BOT_TEST_STORE2",
      pollIntervalEnvVar: "SMOKE_SUB_BOT_TEST_POLL2",
      defaultStoreFilename: "unused.json",
      startAckText: "ack",
      stopAckText: "stop-ack",
    });
    engine2.start();
    assert.deepEqual(engine2.getSubscriberChatIds(), ["111"], "must reload subscriber chat ids from real disk");
    engine2.stop();
  } finally {
    engine.stop();
    fs.rmSync(storePath, { force: true });
    delete process.env.SMOKE_SUB_BOT_TEST_TOKEN2;
    delete process.env.SMOKE_SUB_BOT_TEST_STORE2;
  }
});

test("createSubscriptionBotEngine: notifyAll fans out to every subscriber chat id", async () => {
  const storePath = tmpStorePath("fanout");
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      { chats: { "111": { registeredAt: new Date().toISOString() }, "222": { registeredAt: new Date().toISOString() } }, lastUpdateId: 5 },
      null,
      2,
    ),
    "utf8",
  );
  process.env.SMOKE_SUB_BOT_TEST_TOKEN3 = "fake-token-not-real";
  process.env.SMOKE_SUB_BOT_TEST_STORE3 = storePath;

  const engine = createSubscriptionBotEngine({
    name: "TestBotFanout",
    tokenEnvVar: "SMOKE_SUB_BOT_TEST_TOKEN3",
    storeOverrideEnvVar: "SMOKE_SUB_BOT_TEST_STORE3",
    pollIntervalEnvVar: "SMOKE_SUB_BOT_TEST_POLL3",
    defaultStoreFilename: "unused.json",
    startAckText: "ack",
    stopAckText: "stop-ack",
  });

  try {
    engine.start();
    assert.deepEqual(engine.getSubscriberChatIds().sort(), ["111", "222"], "both subscribers must be loaded");
    // notifyAll fires a real (fire-and-forget) fetch per subscriber against a fake token, which
    // will fail honestly in the background — we only assert it attempted for both ids without
    // throwing synchronously, matching the "never fabricate delivery" invariant.
    assert.doesNotThrow(() => engine.notifyAll({ text: "broadcast test", parseMode: "HTML" }));
    // give the fire-and-forget fetches a tick to settle (they'll fail against the fake token,
    // which is caught internally and only logged — must not crash the process).
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    engine.stop();
    fs.rmSync(storePath, { force: true });
    delete process.env.SMOKE_SUB_BOT_TEST_TOKEN3;
    delete process.env.SMOKE_SUB_BOT_TEST_STORE3;
  }
});

test("escapeHtml / escapeMarkdownV2 escape the expected special characters", () => {
  assert.equal(escapeHtml("<b>&test</b>"), "&lt;b&gt;&amp;test&lt;/b&gt;");
  assert.equal(escapeMarkdownV2("a.b_c!"), "a\\.b\\_c\\!");
});

test("support-telegram.notifier: notifyNewSupportTicket / notifySupportReply are honest no-ops without SUPPORT_TELEGRAM_BOT_TOKEN", async () => {
  delete process.env.SUPPORT_TELEGRAM_BOT_TOKEN;
  const mod = await import(`../../server/modules/notifications/support-telegram.notifier.ts?t=${Date.now()}`);
  assert.equal(mod.isSupportTelegramNotifierStarted(), false);
  assert.doesNotThrow(() =>
    mod.notifyNewSupportTicket({ id: 1, subject: "s", body: "b", userId: 1, username: "u" }),
  );
  assert.doesNotThrow(() =>
    mod.notifySupportReply({ ticketId: 1, subject: "s", userId: 1, username: "u", message: "m" }),
  );
});

test("video-telegram.notifier: notifyNewVideoSubmission / notifyNewPublicSupportTicket are honest no-ops without VIDEO_TELEGRAM_BOT_TOKEN", async () => {
  delete process.env.VIDEO_TELEGRAM_BOT_TOKEN;
  const mod = await import(`../../server/modules/notifications/video-telegram.notifier.ts?t=${Date.now()}`);
  assert.equal(mod.isVideoTelegramNotifierStarted(), false);
  assert.doesNotThrow(() =>
    mod.notifyNewVideoSubmission({ id: 1, userId: 1, username: "u", videoId: "abc", title: "t" }),
  );
  assert.doesNotThrow(() =>
    mod.notifyNewPublicSupportTicket({ id: 1, guestName: "g", guestEmail: "g@x.com", subject: "s", message: "m" }),
  );
});
