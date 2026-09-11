import test from "node:test";
import assert from "node:assert/strict";
import {
  secureShuffle,
  generateStableBoard,
  findMatches,
  processCascades,
  MATCH3_SYMBOLS,
} from "../../server/modules/games/games.match3.pure.ts";

test("secureShuffle: returns a permutation of the input (same multiset, same length)", () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = secureShuffle(input);
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort(), [...input].sort());
});

test("secureShuffle: does not mutate the input array", () => {
  const input = [1, 2, 3];
  const copy = [...input];
  secureShuffle(input);
  assert.deepEqual(input, copy);
});

test("generateStableBoard: produces an 8x8 board using only known symbols", () => {
  const board = generateStableBoard();
  assert.equal(board.length, 8);
  for (const row of board) {
    assert.equal(row.length, 8);
    for (const cell of row) assert.ok(MATCH3_SYMBOLS.includes(cell));
  }
});

test("generateStableBoard: never starts with a pre-existing 3-in-a-row match", () => {
  for (let i = 0; i < 20; i++) {
    const board = generateStableBoard();
    assert.deepEqual(findMatches(board), []);
  }
});

/**
 * A fully-controlled, provably match-free 8x8 board (same checkerboard-cycle pattern as the
 * "no false positives" test below) — used instead of `generateStableBoard()` whenever a test
 * needs to assert an EXACT match set. `generateStableBoard()` only guarantees no match at
 * generation time; overwriting just 2-3 cells on top of its otherwise-random remainder left a
 * real (if low-probability) chance that an untouched neighboring cell coincidentally extended
 * the intended match (e.g. the row/column right after the 3-in-a-row also happened to match),
 * which intermittently broke the exact-keys assertion — not a bug in findMatches/board
 * generation itself, just test data that wasn't fully deterministic. See docs/PROGRESSO.txt.
 */
function safeBaseBoard() {
  const board = [];
  for (let y = 0; y < 8; y++) {
    board[y] = [];
    for (let x = 0; x < 8; x++) {
      board[y][x] = MATCH3_SYMBOLS[(x + y) % MATCH3_SYMBOLS.length];
    }
  }
  return board;
}

test("findMatches: detects a horizontal 4-in-a-row", () => {
  const board = safeBaseBoard();
  board[0][0] = "bitcoin";
  board[0][1] = "bitcoin";
  board[0][2] = "bitcoin";
  board[0][3] = "bitcoin";
  const matches = findMatches(board);
  const keys = matches.map((m) => `${m.x},${m.y}`).sort();
  assert.deepEqual(keys, ["0,0", "1,0", "2,0", "3,0"]);
});

test("findMatches: detects a horizontal 3-in-a-row", () => {
  const board = safeBaseBoard();
  board[0][0] = "bitcoin";
  board[0][1] = "bitcoin";
  board[0][2] = "bitcoin";
  const matches = findMatches(board);
  const keys = matches.map((m) => `${m.x},${m.y}`).sort();
  assert.deepEqual(keys, ["0,0", "1,0", "2,0"]);
});

test("findMatches: detects a vertical 3-in-a-row", () => {
  const board = safeBaseBoard();
  board[0][0] = "ethereum";
  board[1][0] = "ethereum";
  board[2][0] = "ethereum";
  const matches = findMatches(board);
  const keys = matches.map((m) => `${m.x},${m.y}`).sort();
  assert.deepEqual(keys, ["0,0", "0,1", "0,2"]);
});

test("findMatches: no false positives on a match-free board", () => {
  const board = [];
  for (let y = 0; y < 8; y++) {
    board[y] = [];
    for (let x = 0; x < 8; x++) {
      board[y][x] = MATCH3_SYMBOLS[(x + y) % MATCH3_SYMBOLS.length];
    }
  }
  assert.deepEqual(findMatches(board), []);
});

test("processCascades: clears matched cells, drops survivors down, refills top with valid symbols", () => {
  const board = generateStableBoard();
  board[0][0] = "bitcoin";
  board[0][1] = "bitcoin";
  board[0][2] = "bitcoin";
  const matches = findMatches(board);
  assert.ok(matches.length > 0);
  processCascades(board, matches);

  // Every cell is filled with a known symbol (nothing left null after cascade).
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      assert.ok(MATCH3_SYMBOLS.includes(board[y][x]), `cell ${x},${y} should be filled`);
    }
  }
});

test("processCascades: column height is conserved (8 rows) after clearing", () => {
  const board = generateStableBoard();
  // Force a vertical match in column 3.
  board[5][3] = "solana";
  board[6][3] = "solana";
  board[7][3] = "solana";
  processCascades(board, findMatches(board));
  for (let x = 0; x < 8; x++) {
    let filled = 0;
    for (let y = 0; y < 8; y++) if (board[y][x] !== null) filled++;
    assert.equal(filled, 8, `column ${x} should have 8 filled cells`);
  }
});
