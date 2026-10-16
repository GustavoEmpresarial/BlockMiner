import test from "node:test";
import assert from "node:assert/strict";

const { formatPartDropNotice } = await import("../../client/src/features/parts/lib/partDropNotice.ts");

function translate(key, opts = {}) {
  if (key === "parts.items.power_cable") return "Cabo de força";
  if (key === "parts.drop_toast") return `Peça: +${opts.quantity} ${opts.name}`;
  return opts.defaultValue ?? key;
}

test("formatPartDropNotice names a hit and stays quiet on a miss", () => {
  assert.equal(
    formatPartDropNotice({ partSlug: "power_cable", quantity: 1 }, translate),
    "Peça: +1 Cabo de força",
  );
  assert.equal(formatPartDropNotice(null, translate), null);
  assert.equal(formatPartDropNotice({ partSlug: "power_cable", quantity: 0 }, translate), null);
  assert.equal(formatPartDropNotice({ partSlug: "  ", quantity: 1 }, translate), null);
});
