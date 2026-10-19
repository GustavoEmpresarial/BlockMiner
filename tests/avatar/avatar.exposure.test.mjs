/**
 * Where photos are exposed: ranking / leaderboards (one batched lookup, failure shows initials) and
 * public chat (only username + visible avatarUrl, never the raw avatar row or the real name).
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;
const FILE = "b".repeat(32) + ".webp";
const future = new Date(Date.now() + 86_400_000);
let lookupFails = false;
const queries = [];
mock.module(spec("server/core/database/prisma.ts"), {
  defaultExport: {
    userAvatar: {
      findMany: async (args) => {
        queries.push(args);
        if (lookupFails) throw new Error("db down");
        return [{ userId: 1, path: FILE, licenseExpiresAt: future, uploadBlocked: false }];
      },
    },
    chatMessage: {
      findMany: async () => [
        { id: 2, username: "bob", message: "hi", createdAt: new Date(), user: { name: "Bob Real Name", username: "bob", avatar: { path: FILE, licenseExpiresAt: new Date(Date.now() - 1), uploadBlocked: false } } },
        { id: 1, username: "ana", message: "oi", createdAt: new Date(), user: { name: "Ana Real", username: "ana", avatar: { path: FILE, licenseExpiresAt: future, uploadBlocked: false } } },
      ],
    },
  },
});

const lookup = await import("../../server/modules/avatar/avatar.lookup.ts");
const chat = await import("../../server/modules/chat/chat.service.ts");

test("leaderboard rows get user.avatarUrl from one batched query (ids deduped)", async () => {
  queries.length = 0;
  const rows = [
    { userId: 1, user: { id: 1, username: "ana" } },
    { userId: 2, user: { id: 2, username: "bob" } },
    { userId: 1, user: { id: 1, username: "ana" } },
  ];
  const out = await lookup.withLeaderboardAvatars(rows);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].where.userId.in, [1, 2]);
  assert.equal(out[0].user.avatarUrl, `/media/avatars/${FILE}`);
  assert.equal(out[1].user.avatarUrl, null);
  assert.deepEqual(Object.keys(out[1].user).sort(), ["avatarUrl", "id", "username"]);
});

test("ranking rows get avatarUrl; a failed lookup degrades to initials instead of failing", async () => {
  const ok = await lookup.withAvatarUrls([{ id: 1 }, { id: 3 }]);
  assert.deepEqual(ok.map((r) => r.avatarUrl), [`/media/avatars/${FILE}`, null]);
  lookupFails = true;
  try {
    const degraded = await lookup.withAvatarUrls([{ id: 1 }]);
    assert.equal(degraded[0].avatarUrl, null);
  } finally {
    lookupFails = false;
  }
});

test("public chat: avatarUrl only while the license is active; raw avatar row and real name not exposed beyond what was already public", async () => {
  const msgs = await chat.listMessages();
  const ana = msgs.find((m) => m.username === "ana");
  const bob = msgs.find((m) => m.username === "bob");
  assert.equal(ana.avatarUrl, `/media/avatars/${FILE}`);
  assert.equal(bob.avatarUrl, null, "expired license => initials");
  for (const m of msgs) assert.equal(m.user.avatar, undefined);
});
