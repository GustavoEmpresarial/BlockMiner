import test from "node:test";
import assert from "node:assert/strict";

const { antibotEventAllowed, antibotGamesOnly } = await import(
  "../../server/modules/antibot/antibot.event-policy.ts"
);

test("antibotEventAllowed: default allowlist accepts game* and site:integrity*", () => {
  const savedG = process.env.ANTIBOT_GAMES_ONLY;
  const savedA = process.env.ANTIBOT_EVENT_ALLOWLIST;
  delete process.env.ANTIBOT_EVENT_ALLOWLIST;
  process.env.ANTIBOT_GAMES_ONLY = "1";
  try {
    assert.equal(antibotGamesOnly(), true);
    assert.equal(antibotEventAllowed("game:sky-runner:end"), true);
    assert.equal(antibotEventAllowed("site:integrity:boot"), true);
    assert.equal(antibotEventAllowed("shop:purchase"), false);
  } finally {
    savedG === undefined ? delete process.env.ANTIBOT_GAMES_ONLY : (process.env.ANTIBOT_GAMES_ONLY = savedG);
    savedA === undefined
      ? delete process.env.ANTIBOT_EVENT_ALLOWLIST
      : (process.env.ANTIBOT_EVENT_ALLOWLIST = savedA);
  }
});

test("antibotEventAllowed: ANTIBOT_GAMES_ONLY=0 accepts anything", () => {
  const savedG = process.env.ANTIBOT_GAMES_ONLY;
  const savedA = process.env.ANTIBOT_EVENT_ALLOWLIST;
  delete process.env.ANTIBOT_EVENT_ALLOWLIST;
  process.env.ANTIBOT_GAMES_ONLY = "0";
  try {
    assert.equal(antibotEventAllowed("shop:purchase"), true);
  } finally {
    savedG === undefined ? delete process.env.ANTIBOT_GAMES_ONLY : (process.env.ANTIBOT_GAMES_ONLY = savedG);
    savedA === undefined
      ? delete process.env.ANTIBOT_EVENT_ALLOWLIST
      : (process.env.ANTIBOT_EVENT_ALLOWLIST = savedA);
  }
});
