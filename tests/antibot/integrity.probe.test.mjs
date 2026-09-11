/**
 * Unit tests for integrity probes (no DOM / optional jsdom stubs).
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  looksNative,
  listOverriddenApis,
  probeUserscriptGlobals,
  integritySeverity,
  stackLooksLikeUserscript,
  BM_INTEGRITY_HOOK_MARK,
} = await import("../../client/src/features/antibot/integrity/integrity.probe.ts");

test("looksNative: plain function is not native", () => {
  assert.equal(
    looksNative(function patched() {
      return 1;
    }),
    false,
  );
});

test("looksNative: Function.prototype.toString itself is native in Node", () => {
  assert.equal(looksNative(Function.prototype.toString), true);
});

test("listOverriddenApis: detects non-native fetch stand-in", () => {
  const hit = listOverriddenApis([
    { name: "fetch", get: () => function fakeFetch() {} },
    { name: "ok", get: () => Function.prototype.toString },
  ]);
  assert.deepEqual(hit, ["fetch"]);
});

test("listOverriddenApis: skips our integrity-marked wrappers", () => {
  function ourWrap() {}
  ourWrap[BM_INTEGRITY_HOOK_MARK] = true;
  const hit = listOverriddenApis([
    { name: "fetch", get: () => ourWrap },
    { name: "bad", get: () => function other() {} },
  ]);
  assert.deepEqual(hit, ["bad"]);
});

test("probeUserscriptGlobals: GM_info marks userscript", () => {
  assert.equal(probeUserscriptGlobals({}), false);
  assert.equal(probeUserscriptGlobals({ GM_info: { script: {} } }), true);
  assert.equal(probeUserscriptGlobals({ GM_xmlhttpRequest: () => {} }), true);
});

test("stackLooksLikeUserscript: Tampermonkey / extension frames", () => {
  assert.equal(stackLooksLikeUserscript("at Object.<anonymous> (userscript.html:1:1)"), true);
  assert.equal(stackLooksLikeUserscript("at Tampermonkey"), true);
  assert.equal(stackLooksLikeUserscript("at App.tsx:12"), false);
});

test("timingSuggestsInstalled: target slower than control", async () => {
  const { timingSuggestsInstalled } = await import(
    "../../client/src/features/antibot/integrity/integrity.managers.ts"
  );
  assert.equal(timingSuggestsInstalled(5, 2, 1.35, 2), true);
  assert.equal(timingSuggestsInstalled(2.1, 2, 1.35, 2), false);
  assert.equal(timingSuggestsInstalled(4.5, 2, 1.35, 2), true); // ratio
});

test("probeUserscriptManagerMarkers: Violentmonkey init + Tampermonkey global", async () => {
  const { probeUserscriptManagerMarkers } = await import(
    "../../client/src/features/antibot/integrity/integrity.managers.ts"
  );
  assert.deepEqual(probeUserscriptManagerMarkers({}), []);
  assert.deepEqual(probeUserscriptManagerMarkers({ "**VMInitInjection**": 1 }), ["violentmonkey"]);
  assert.deepEqual(probeUserscriptManagerMarkers({ Tampermonkey: {} }), ["tampermonkey"]);
});

test("integritySeverity: ranks nav tamper / hook bypass higher than lone extension hint", () => {
  const low = integritySeverity({
    overriddenApiCount: 0,
    overriddenApis: [],
    navTampered: false,
    noPermissions: false,
    noChromeRuntime: false,
    userscriptHint: false,
    extensionScriptHint: true,
    userscriptNetworkStack: false,
    injectedInlineScript: false,
    consoleTampered: false,
    hookBypass: false,
    userscriptManagerInstalled: false,
    userscriptManagers: [],
  });
  const high = integritySeverity({
    overriddenApiCount: 2,
    overriddenApis: ["fetch", "WebSocket"],
    navTampered: true,
    noPermissions: false,
    noChromeRuntime: false,
    userscriptHint: true,
    extensionScriptHint: false,
    userscriptNetworkStack: true,
    injectedInlineScript: false,
    consoleTampered: false,
    hookBypass: true,
    userscriptManagerInstalled: true,
    userscriptManagers: ["violentmonkey"],
  });
  assert.ok(high > low);
});
