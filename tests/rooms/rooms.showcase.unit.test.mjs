import test from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_SHOWCASE_RACK_PRICE,
  SHOWCASE_3D_ROOM_NUMBER,
  SHOWCASE_RACK_BAYS,
  SHOWCASE_RACKS_PER_ROOM,
  countStandardRooms,
  decideShowcaseInstall,
  isShowcase3dMiner,
  isShowcaseRoomEnabled,
  nextShowcaseRackLayout,
  nextStandardRoomNumber,
  readShowcaseRackPrice,
  resolveShowcaseFloorSlot,
  showcaseRackAtCapacity,
  showcaseVisualCount,
} = await import("../../server/modules/rooms/rooms.showcase.ts");
const { buildListedRoomsPayload } = await import("../../server/modules/rooms/rooms.dto.ts");
const { ROOM_MAX } = await import("../../server/modules/rooms/rooms.types.ts");

test("showcase rack price defaults to 1 BLK and does not change room list prices", () => {
  assert.equal(DEFAULT_SHOWCASE_RACK_PRICE, 1);
  assert.equal(readShowcaseRackPrice(""), 1);
  assert.equal(readShowcaseRackPrice(undefined), 1);
  assert.equal(readShowcaseRackPrice("1"), 1);
  assert.equal(ROOM_MAX, 4);
  assert.ok(SHOWCASE_3D_ROOM_NUMBER > ROOM_MAX);
});

test("showcase room does not advance the paid room sequence", () => {
  assert.equal(countStandardRooms([1, SHOWCASE_3D_ROOM_NUMBER]), 1);
  assert.equal(nextStandardRoomNumber([1, SHOWCASE_3D_ROOM_NUMBER]), 2);
  assert.equal(nextStandardRoomNumber([1, 2, 3, SHOWCASE_3D_ROOM_NUMBER]), 4);
});

test("showcase room holds 24 racks and the 25th is refused", () => {
  assert.equal(SHOWCASE_RACKS_PER_ROOM, 24);
  assert.equal(SHOWCASE_RACK_BAYS, 2);
  assert.equal(showcaseRackAtCapacity(0), false);
  assert.equal(showcaseVisualCount(SHOWCASE_RACK_BAYS), 1);
  const first = nextShowcaseRackLayout(0);
  assert.deepEqual(first, { visualIndex: 0, positions: [0, 1] });
  const second = nextShowcaseRackLayout(SHOWCASE_RACK_BAYS);
  assert.deepEqual(second, { visualIndex: 1, positions: [2, 3] });
  const last = nextShowcaseRackLayout((SHOWCASE_RACKS_PER_ROOM - 1) * SHOWCASE_RACK_BAYS);
  assert.equal(last?.visualIndex, 23);
  assert.deepEqual(last?.positions, [46, 47]);
  assert.equal(nextShowcaseRackLayout(SHOWCASE_RACKS_PER_ROOM * SHOWCASE_RACK_BAYS), null);
  assert.equal(showcaseRackAtCapacity(SHOWCASE_RACKS_PER_ROOM * SHOWCASE_RACK_BAYS), true);
  assert.equal(showcaseVisualCount(SHOWCASE_RACKS_PER_ROOM * SHOWCASE_RACK_BAYS), 24);
  const openPad = resolveShowcaseFloorSlot(5, [0]);
  assert.equal(openPad.ok, true);
  if (openPad.ok) assert.equal(openPad.floorSlot, 5);
  const takenPad = resolveShowcaseFloorSlot(0, [0]);
  assert.equal(takenPad.ok, false);
  if (!takenPad.ok) assert.equal(takenPad.code, "SHOWCASE_RACK_OCCUPIED");
  const firstFree = resolveShowcaseFloorSlot(null, [0]);
  assert.equal(firstFree.ok, true);
  if (firstFree.ok) assert.equal(firstFree.floorSlot, 1);
});

test("PNG miners are refused and MCX9 is accepted without blocking the other bay", () => {
  const png = decideShowcaseInstall({
    minerName: "Gildcore",
    imageUrl: "/media/offers/gildcore-cut.png",
    modelUrl: null,
  });
  assert.equal(png.ok, false);
  if (!png.ok) assert.equal(png.code, "SHOWCASE_3D_ONLY");
  assert.equal(isShowcase3dMiner({ minerName: "Amberforge", imageUrl: "/media/offers/amberforge-cut.png" }), false);

  const byName = decideShowcaseInstall({ minerName: "[Event] MinerCore MCX9", imageUrl: "/media/offers/minercore-mcx9.webp" });
  assert.equal(byName.ok, true);
  if (byName.ok) assert.equal(byName.blockAdjacent, false);

  const byModel = decideShowcaseInstall({ modelUrl: "/media/models/minercore-mcx9.glb", minerName: "Other" });
  assert.equal(byModel.ok, true);
  if (byModel.ok) assert.equal(byModel.blockAdjacent, false);
});

test("showcase room stays hidden unless SHOWCASE_3D_ROOM_ENABLED is on", () => {
  assert.equal(isShowcaseRoomEnabled(undefined), false);
  assert.equal(isShowcaseRoomEnabled(""), false);
  assert.equal(isShowcaseRoomEnabled("0"), false);
  assert.equal(isShowcaseRoomEnabled("1"), true);

  const previous = process.env.SHOWCASE_3D_ROOM_ENABLED;
  delete process.env.SHOWCASE_3D_ROOM_ENABLED;
  try {
    const hidden = buildListedRoomsPayload([
      {
        id: 9,
        roomNumber: SHOWCASE_3D_ROOM_NUMBER,
        kind: "showcase_3d",
        pricePaid: 0,
        unlockedAt: new Date("2026-10-01T00:00:00.000Z"),
        racks: [],
      },
    ]);
    assert.equal(hidden.length, ROOM_MAX);
    assert.equal(hidden.some((room) => room.roomNumber === SHOWCASE_3D_ROOM_NUMBER), false);
  } finally {
    if (previous === undefined) delete process.env.SHOWCASE_3D_ROOM_ENABLED;
    else process.env.SHOWCASE_3D_ROOM_ENABLED = previous;
  }
});

test("listed rooms keep 1-4 and append the free showcase room when enabled", () => {
  const previous = process.env.SHOWCASE_3D_ROOM_ENABLED;
  process.env.SHOWCASE_3D_ROOM_ENABLED = "1";
  try {
  const listed = buildListedRoomsPayload([
    {
      id: 9,
      roomNumber: SHOWCASE_3D_ROOM_NUMBER,
      kind: "showcase_3d",
      pricePaid: 0,
      unlockedAt: new Date("2026-10-01T00:00:00.000Z"),
      racks: [],
    },
  ]);
  assert.equal(listed.length, ROOM_MAX + 1);
  assert.equal(listed[0].roomNumber, 1);
  assert.equal(listed[0].unlocked, false);
  const showcase = listed[listed.length - 1];
  assert.equal(showcase.unlocked, true);
  if (showcase.unlocked) {
    assert.equal(showcase.kind, "showcase_3d");
    assert.equal(showcase.showcaseRackPrice, 1);
    assert.equal(showcase.racks.length, 0);
  }
  } finally {
    if (previous === undefined) delete process.env.SHOWCASE_3D_ROOM_ENABLED;
    else process.env.SHOWCASE_3D_ROOM_ENABLED = previous;
  }
});
