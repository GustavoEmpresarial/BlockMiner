import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatUserSearchArgs,
  normalizeChatUserSearchQuery,
  toChatUserHit,
} from "../../server/modules/chat/chat.search.ts";
import { readChatConversationScanLimit } from "../../server/modules/chat/chat.config.ts";

const env = {};

test("a missing or short query does not search", () => {
  assert.equal(normalizeChatUserSearchQuery(undefined, env), null);
  assert.equal(normalizeChatUserSearchQuery("", env), null);
  assert.equal(normalizeChatUserSearchQuery("ab", env), null);
  assert.equal(buildChatUserSearchArgs(7, "  a ", env), null);
});

test("a usable query searches by username and returns only id and username", () => {
  const args = buildChatUserSearchArgs(7, "  Bea  ", env);
  assert.ok(args);
  assert.equal(args.where.isBanned, false);
  assert.deepEqual(args.where.id, { not: 7 });
  assert.deepEqual(args.where.username, { contains: "Bea", mode: "insensitive" });
  assert.deepEqual(Object.keys(args.select), ["id", "username"]);
  assert.equal("email" in args.select, false);
  assert.equal(args.take, 20);
});

test("the query is capped at the username length", () => {
  const q = normalizeChatUserSearchQuery("x".repeat(40), env);
  assert.equal(q?.length, 24);
});

test("a row without a username is dropped", () => {
  assert.equal(toChatUserHit({ id: 1, username: null }), null);
  assert.deepEqual(toChatUserHit({ id: 1, username: "bea" }), { id: 1, username: "bea" });
});

test("conversation scan limit defaults to a bounded window", () => {
  assert.equal(readChatConversationScanLimit(env), 100);
});
