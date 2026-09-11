/**
 * Unit: userscript manager kick policy (TM/VM only).
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  filterBlockedUserscriptManagers,
  blockedManagersFromTelemetry,
  userscriptManagerKickEnabled,
} = await import("../../server/modules/antibot/antibot.userscript-kick.ts");

test("filterBlockedUserscriptManagers: only TM/VM (not scriptcat alone)", () => {
  assert.deepEqual(filterBlockedUserscriptManagers(["scriptcat", "violentmonkey"]), ["violentmonkey"]);
  assert.deepEqual(filterBlockedUserscriptManagers(["tampermonkey_beta"]), ["tampermonkey_beta"]);
  assert.deepEqual(filterBlockedUserscriptManagers([]), []);
});

test("blockedManagersFromTelemetry: requires explicit manager ids", () => {
  assert.deepEqual(
    blockedManagersFromTelemetry({
      integrity: { userscriptManagerInstalled: true, userscriptManagers: ["violentmonkey"] },
    }),
    ["violentmonkey"],
  );
  assert.deepEqual(
    blockedManagersFromTelemetry({ integrity: { userscriptManagerInstalled: true } }),
    [],
  );
});

test("hasBlockedUserscriptManager via filter length", () => {
  assert.equal(filterBlockedUserscriptManagers(["tampermonkey"]).length > 0, true);
  assert.equal(filterBlockedUserscriptManagers(["greasemonkey"]).length > 0, false);
});

test("userscriptManagerKickEnabled defaults on", () => {
  const prev = process.env.USERSCRIPT_MANAGER_KICK_ENABLED;
  delete process.env.USERSCRIPT_MANAGER_KICK_ENABLED;
  try {
    assert.equal(userscriptManagerKickEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.USERSCRIPT_MANAGER_KICK_ENABLED;
    else process.env.USERSCRIPT_MANAGER_KICK_ENABLED = prev;
  }
});
