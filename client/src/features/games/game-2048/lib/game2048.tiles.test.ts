import { describe, expect, it, beforeEach } from "vitest";
import { moveBoardTraced } from "../../lib/game2048Engine";
import { addSpawnedTiles, applyTraces, hydrateTiles, resetVisualTileIdsForTests } from "./game2048.tiles";

beforeEach(() => {
  resetVisualTileIdsForTests();
});

describe("moveBoardTraced", () => {
  it("traces a left merge of two tiles into one cell", () => {
    const board = [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const res = moveBoardTraced(board, "left");
    expect(res.board[0]).toEqual([4, 0, 0, 0]);
    expect(res.traces.filter((t) => t.merged)).toHaveLength(2);
    expect(res.traces.every((t) => t.toC === 0 && t.toR === 0)).toBe(true);
  });
});

describe("applyTraces", () => {
  it("slides both coins into the merge cell and marks one fading", () => {
    const board = [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const tiles = hydrateTiles(board);
    const { traces } = moveBoardTraced(board, "left");
    const next = applyTraces(tiles, traces);
    const live = next.filter((t) => !t.fading);
    const fading = next.filter((t) => t.fading);
    expect(live).toHaveLength(1);
    expect(live[0]?.value).toBe(4);
    expect(live[0]?.merged).toBe(true);
    expect(fading).toHaveLength(1);
    expect(fading[0]?.r).toBe(0);
    expect(fading[0]?.c).toBe(0);
  });
});

describe("addSpawnedTiles", () => {
  it("spawns the extra cell that appeared after the move", () => {
    const tiles = hydrateTiles([
      [4, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const server = [
      [4, 0, 0, 0],
      [0, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const next = addSpawnedTiles(tiles, server);
    expect(next).toHaveLength(2);
    const spawned = next.find((t) => t.spawned);
    expect(spawned?.value).toBe(2);
    expect(spawned?.r).toBe(1);
    expect(spawned?.c).toBe(2);
  });
});
