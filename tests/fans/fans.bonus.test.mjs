import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Cooling Fan Bonus System", () => {
  it("computeRackFanBonus awards 1% when fan is mounted, 0 when not mounted", async () => {
    const { computeRackFanBonus } = await import(
      "../../client/src/features/machines/lib/machines.shared.ts"
    );

    assert.equal(computeRackFanBonus(0, false), 0);
    assert.equal(computeRackFanBonus(0, true), 0);
    assert.equal(computeRackFanBonus(10000, false), 0);
    assert.equal(computeRackFanBonus(10000, true), 100);
    assert.equal(computeRackFanBonus(500, true), 5);
    assert.equal(computeRackFanBonus(25000, true), 250);
  });

  it("calculates independent visual rack fan bonuses correctly", () => {
    // Pure replication of computeFanBonusHashRate algorithm
    function calculateFanBonus(
      fans,
      slots,
    ) {
      if (fans.length === 0) return 0;
      const fanSet = new Set(fans.map((f) => `${f.roomId}:${f.visualIndex}`));
      let bonus = 0;
      for (const slot of slots) {
        const visualIndex = Math.floor(slot.position / 8);
        if (fanSet.has(`${slot.roomId}:${visualIndex}`)) {
          bonus += (slot.hashRate || 0) * 0.01;
        }
      }
      return bonus;
    }

    const roomId = 1;

    // Rack 0 (positions 0..7) has 10,000 H/s
    // Rack 1 (positions 8..15) has 5,000 H/s
    const slots = [
      { roomId, position: 0, hashRate: 5000 },
      { roomId, position: 1, hashRate: 5000 },
      { roomId, position: 8, hashRate: 2500 },
      { roomId, position: 9, hashRate: 2500 },
    ];

    // No fans mounted
    assert.equal(calculateFanBonus([], slots), 0);

    // Fan only on Rack 0 (visualIndex 0)
    assert.equal(
      calculateFanBonus([{ roomId, visualIndex: 0 }], slots),
      100, // 1% of 10,000 = 100
    );

    // Fan only on Rack 1 (visualIndex 1)
    assert.equal(
      calculateFanBonus([{ roomId, visualIndex: 1 }], slots),
      50, // 1% of 5,000 = 50
    );

    // Fans on both racks (visualIndex 0 and 1)
    assert.equal(
      calculateFanBonus(
        [
          { roomId, visualIndex: 0 },
          { roomId, visualIndex: 1 },
        ],
        slots,
      ),
      150, // 100 + 50 = 150
    );
  });
});
