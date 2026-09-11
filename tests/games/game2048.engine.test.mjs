import test from "node:test";
import assert from "node:assert/strict";

const engine = await import("../../server/modules/games/game2048/game2048.engine.ts");

test("emptyBoard is 4x4 zeros", () => {
  const b = engine.emptyBoard();
  assert.equal(b.length, 4);
  assert.ok(b.every((row) => row.length === 4 && row.every((c) => c === 0)));
});

test("mergeLineTowardZero merges equal adjacent tiles once, left-packed", () => {
  const { row, scoreAdd } = engine.mergeLineTowardZero([2, 2, 2, 0]);
  assert.deepEqual(row, [4, 2, 0, 0]);
  assert.equal(scoreAdd, 4);
});

test("moveBoard left merges and reports moved=true only on change", () => {
  const board = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const result = engine.moveBoard(board, "left");
  assert.equal(result.moved, true);
  assert.equal(result.scoreDelta, 4);
  assert.deepEqual(result.board[0], [4, 0, 0, 0]);
});

test("moveBoard reports moved=false when nothing changes", () => {
  const board = [
    [2, 4, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const result = engine.moveBoard(board, "left");
  assert.equal(result.moved, false);
});

test("maxTile finds the highest tile on the board", () => {
  const board = engine.emptyBoard();
  board[2][1] = 512;
  assert.equal(engine.maxTile(board), 512);
});

test("hasValidMove is true with an empty cell, false on a locked full board", () => {
  const withEmpty = engine.emptyBoard();
  withEmpty[0][0] = 2;
  assert.equal(engine.hasValidMove(withEmpty), true);

  const locked = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];
  assert.equal(engine.hasValidMove(locked), false);
});

test("parseBoard rejects malformed shapes and accepts a valid 4x4 grid", () => {
  assert.equal(engine.parseBoard(null), null);
  assert.equal(engine.parseBoard([[1, 2, 3]]), null);
  const valid = engine.emptyBoard();
  assert.deepEqual(engine.parseBoard(valid), valid);
});

test("spawnRandomTile places a 2 or 4 in an empty cell using the injected rng", () => {
  const board = engine.emptyBoard();
  const placed = engine.spawnRandomTile(board, () => 0);
  assert.equal(placed, true);
  assert.equal(board[0][0], 2);
});
