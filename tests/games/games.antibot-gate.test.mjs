import test from "node:test";
import assert from "node:assert/strict";

const {
  evaluateGameRewardGate,
  gameAntibotDenyMinScore,
} = await import("../../server/modules/games/games.antibot-gate.ts");
const { parseGameStartPayload } = await import("../../server/modules/games/games.start-payload.ts");
const { evaluateTrust, GAME_MAX_ACTIONS_PER_SEC } = await import(
  "../../server/modules/games/games.anti-cheat.ts"
);
const { ALERT_RISK_THRESHOLD } = await import("../../server/modules/antibot/antibot.weights.ts");

const SLUGS = {
  "crypto-memory": "Memory Sync",
  "sky-runner": "Sky Runner",
};

test("gameAntibotDenyMinScore defaults to antibot alert threshold", () => {
  const saved = process.env.GAME_ANTIBOT_DENY_MIN_SCORE;
  delete process.env.GAME_ANTIBOT_DENY_MIN_SCORE;
  try {
    assert.equal(gameAntibotDenyMinScore(), ALERT_RISK_THRESHOLD);
  } finally {
    saved === undefined
      ? delete process.env.GAME_ANTIBOT_DENY_MIN_SCORE
      : (process.env.GAME_ANTIBOT_DENY_MIN_SCORE = saved);
  }
});

test("evaluateGameRewardGate: default denies high only; suspicious opt-in", () => {
  const savedGate = process.env.GAME_ANTIBOT_GATE_ENABLED;
  const savedSus = process.env.GAME_ANTIBOT_DENY_SUSPICIOUS;
  process.env.GAME_ANTIBOT_GATE_ENABLED = "true";
  delete process.env.GAME_ANTIBOT_DENY_SUSPICIOUS; // default false
  try {
    assert.equal(evaluateGameRewardGate({ riskScore: 10 }).allowed, true);
    assert.equal(evaluateGameRewardGate({ riskScore: 50 }).allowed, true); // suspicious passes by default
    assert.equal(evaluateGameRewardGate({ riskScore: 70 }).allowed, false);
    assert.equal(evaluateGameRewardGate({ riskScore: 90, trusted: true }).allowed, true);
    const auto = evaluateGameRewardGate({ riskScore: 0, automationDetected: true });
    assert.equal(auto.allowed, false);
    assert.equal(auto.messageCode, "antibot_automation");
  } finally {
    savedGate === undefined
      ? delete process.env.GAME_ANTIBOT_GATE_ENABLED
      : (process.env.GAME_ANTIBOT_GATE_ENABLED = savedGate);
    savedSus === undefined
      ? delete process.env.GAME_ANTIBOT_DENY_SUSPICIOUS
      : (process.env.GAME_ANTIBOT_DENY_SUSPICIOUS = savedSus);
  }
});

test("evaluateGameRewardGate: DENY_SUSPICIOUS=true blocks 41–60", () => {
  const savedGate = process.env.GAME_ANTIBOT_GATE_ENABLED;
  const savedSus = process.env.GAME_ANTIBOT_DENY_SUSPICIOUS;
  process.env.GAME_ANTIBOT_GATE_ENABLED = "true";
  process.env.GAME_ANTIBOT_DENY_SUSPICIOUS = "true";
  try {
    assert.equal(evaluateGameRewardGate({ riskScore: 50 }).allowed, false);
  } finally {
    savedGate === undefined
      ? delete process.env.GAME_ANTIBOT_GATE_ENABLED
      : (process.env.GAME_ANTIBOT_GATE_ENABLED = savedGate);
    savedSus === undefined
      ? delete process.env.GAME_ANTIBOT_DENY_SUSPICIOUS
      : (process.env.GAME_ANTIBOT_DENY_SUSPICIOUS = savedSus);
  }
});

test("parseGameStartPayload: string + object with antibot", () => {
  assert.equal(parseGameStartPayload("crypto-memory", SLUGS).slug, "crypto-memory");
  assert.equal(parseGameStartPayload("crypto-memory", SLUGS).automationDetected, false);
  const bot = parseGameStartPayload(
    { slug: "sky-runner", antibot: { webdriver: true } },
    SLUGS,
  );
  assert.equal(bot.slug, "sky-runner");
  assert.equal(bot.automationDetected, true);
});

test("evaluateTrust: action flood rejects", () => {
  const ok = evaluateTrust("crypto-memory", 10_000, 500, { actionCount: 20 });
  assert.equal(ok.rejected, false);
  const flood = evaluateTrust("crypto-memory", 1_000, 250, {
    actionCount: GAME_MAX_ACTIONS_PER_SEC * 5,
  });
  assert.equal(flood.rejected, true);
  assert.ok(flood.events.includes("action_flood") || flood.events.includes("score_anomaly"));
});

test("evaluateTrust: sky uses low score rate (pipes)", () => {
  const fair = evaluateTrust("sky-runner", 30_000, 15);
  assert.equal(fair.rejected, false);
  // Impossible: 100 pipes in 2s (below min duration + absurd rate)
  const impossible = evaluateTrust("sky-runner", 2_000, 100);
  assert.equal(impossible.rejected, true);
});
