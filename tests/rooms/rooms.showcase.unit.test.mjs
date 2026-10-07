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
  isShowcaseRoomEnabledForUser,
  nextShowcaseRackLayout,
  nextStandardRoomNumber,
  readShowcaseRackPrice,
  readShowcaseRoomUserIds,
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

function showcaseRoomRow() {
  return {
    id: 9,
    roomNumber: SHOWCASE_3D_ROOM_NUMBER,
    kind: "showcase_3d",
    pricePaid: 0,
    unlockedAt: new Date("2026-10-01T00:00:00.000Z"),
    racks: [],
  };
}

test("allowlist adds users while the global flag stays the path for everyone", () => {
  assert.equal(isShowcaseRoomEnabledForUser(7, "1", ""), true);
  assert.equal(isShowcaseRoomEnabledForUser(7, "1", "8"), true);
  assert.equal(isShowcaseRoomEnabledForUser(7, "0", "7"), true);
  assert.equal(isShowcaseRoomEnabledForUser(7, "0", "8, 7"), true);
  assert.equal(isShowcaseRoomEnabledForUser(8, "0", "7"), false);
  assert.equal(isShowcaseRoomEnabledForUser(7, "0", ""), false);
  assert.equal(isShowcaseRoomEnabledForUser(7, "0", "foo"), false);
  assert.equal(isShowcaseRoomEnabledForUser(7, "0", "-7"), false);
  assert.equal(isShowcaseRoomEnabledForUser(7, "0", "0"), false);
  assert.equal(isShowcaseRoomEnabledForUser(7.5, "0", "7"), false);
  assert.deepEqual(
    [...readShowcaseRoomUserIds("1, foo, -2, 0, 7, 01, 1.5, ")].sort((a, b) => a - b),
    [1, 7],
  );
  assert.equal(readShowcaseRoomUserIds("").size, 0);
  assert.equal(readShowcaseRoomUserIds(null).size, 0);
});

test("allowlisted user sees the room and its rack price; a user outside the list does not", () => {
  const previousEnabled = process.env.SHOWCASE_3D_ROOM_ENABLED;
  const previousIds = process.env.SHOWCASE_3D_ROOM_USER_IDS;
  delete process.env.SHOWCASE_3D_ROOM_ENABLED;
  process.env.SHOWCASE_3D_ROOM_USER_IDS = "7, foo, -1";
  try {
    const allowed = buildListedRoomsPayload([showcaseRoomRow()], undefined, new Date("2026-10-06T00:00:00.000Z"), 7);
    assert.equal(allowed.length, ROOM_MAX + 1);
    const showcase = allowed[allowed.length - 1];
    assert.equal(showcase.roomNumber, SHOWCASE_3D_ROOM_NUMBER);
    if (showcase.unlocked) assert.equal(showcase.showcaseRackPrice, 1);

    const outsider = buildListedRoomsPayload([showcaseRoomRow()], undefined, new Date("2026-10-06T00:00:00.000Z"), 8);
    assert.equal(outsider.length, ROOM_MAX);
    assert.equal(outsider.some((room) => room.roomNumber === SHOWCASE_3D_ROOM_NUMBER), false);

    const omitted = buildListedRoomsPayload([showcaseRoomRow()]);
    assert.equal(omitted.some((room) => room.roomNumber === SHOWCASE_3D_ROOM_NUMBER), false);
  } finally {
    if (previousEnabled === undefined) delete process.env.SHOWCASE_3D_ROOM_ENABLED;
    else process.env.SHOWCASE_3D_ROOM_ENABLED = previousEnabled;
    if (previousIds === undefined) delete process.env.SHOWCASE_3D_ROOM_USER_IDS;
    else process.env.SHOWCASE_3D_ROOM_USER_IDS = previousIds;
  }
});

test("global flag lists the room for a user who is not on the allowlist", () => {
  const previousEnabled = process.env.SHOWCASE_3D_ROOM_ENABLED;
  const previousIds = process.env.SHOWCASE_3D_ROOM_USER_IDS;
  process.env.SHOWCASE_3D_ROOM_ENABLED = "1";
  process.env.SHOWCASE_3D_ROOM_USER_IDS = "8";
  try {
    const listed = buildListedRoomsPayload([showcaseRoomRow()], undefined, new Date("2026-10-06T00:00:00.000Z"), 7);
    assert.equal(listed.length, ROOM_MAX + 1);
    const showcase = listed[listed.length - 1];
    assert.equal(showcase.roomNumber, SHOWCASE_3D_ROOM_NUMBER);
    if (showcase.unlocked) assert.equal(showcase.showcaseRackPrice, DEFAULT_SHOWCASE_RACK_PRICE);
  } finally {
    if (previousEnabled === undefined) delete process.env.SHOWCASE_3D_ROOM_ENABLED;
    else process.env.SHOWCASE_3D_ROOM_ENABLED = previousEnabled;
    if (previousIds === undefined) delete process.env.SHOWCASE_3D_ROOM_USER_IDS;
    else process.env.SHOWCASE_3D_ROOM_USER_IDS = previousIds;
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
