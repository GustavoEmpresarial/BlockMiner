/** Pure board logic. Ported from legacy/server/services/game2048Engine.ts — no DB, no side effects (except spawnRandomTile mutating its board arg, matching legacy). */
export type Game2048Direction = "up" | "down" | "left" | "right";
/** Client aliases (legacy `@game2048/engine` package names). */
export type Direction2048 = Game2048Direction;
export type Board2048 = number[][];

export const BOARD_SIZE = 4;

export function emptyBoard(): number[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

/** Coerces a JSON cell to a valid non-negative integer tile value, or null if invalid (some drivers deserialize numeric JSON as strings). */
export function normalize2048Cell(c: unknown): number | null {
  if (typeof c === "number" && Number.isFinite(c) && Number.isInteger(c) && c >= 0 && c <= 1_048_576) {
    return c;
  }
  if (typeof c === "string") {
    const t = c.trim();
    if (!/^-?\d+$/.test(t)) return null;
    const n = Number(t);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 1_048_576) return n;
  }
  return null;
}

/** Some drivers / legacy writes store the full grid as a JSON string (or double-encoded). */
export function unwrapBoardJson(json: unknown): unknown[] | null {
  let v: unknown = json;
  for (let depth = 0; depth < 4 && typeof v === "string"; depth += 1) {
    const t = v.trim();
    if (!t) return null;
    try {
      v = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v) || v.length !== BOARD_SIZE) return null;
  return v;
}

export function parseBoard(json: unknown): number[][] | null {
  const top = unwrapBoardJson(json);
  if (!top) return null;
  const out: number[][] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = top[i];
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) return null;
    const r: number[] = [];
    for (let j = 0; j < BOARD_SIZE; j++) {
      const v = normalize2048Cell(row[j]);
      if (v === null) return null;
      r.push(v);
    }
    out.push(r);
  }
  return out;
}

function cellNum(c: unknown): number {
  const n = normalize2048Cell(c);
  return n === null ? 0 : n;
}

export function maxTile(board: number[][]): number {
  let m = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      const v = cellNum(board[i][j]);
      if (v > m) m = v;
    }
  }
  return m;
}

export function mergeLineTowardZero(line: unknown[]): { row: number[]; scoreAdd: number } {
  const nums: number[] = [];
  for (const cell of line) {
    const n = normalize2048Cell(cell);
    if (n !== null && n !== 0) nums.push(n);
  }
  const merged: number[] = [];
  let scoreAdd = 0;
  let i = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      scoreAdd += v;
      merged.push(v);
      i += 2;
    } else {
      merged.push(nums[i]);
      i += 1;
    }
  }
  while (merged.length < BOARD_SIZE) merged.push(0);
  return { row: merged.slice(0, BOARD_SIZE), scoreAdd };
}

export type TileTrace = {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  fromValue: number;
  toValue: number;
  merged: boolean;
};

type LineItem = { index: number; value: number };
type LineTrace = {
  fromIndex: number;
  toIndex: number;
  fromValue: number;
  toValue: number;
  merged: boolean;
};

function mergeLineTowardZeroTraced(line: number[]): { row: number[]; scoreAdd: number; traces: LineTrace[] } {
  const items: LineItem[] = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] > 0) items.push({ index: i, value: line[i] });
  }
  const row = Array.from({ length: line.length }, () => 0);
  const traces: LineTrace[] = [];
  let write = 0;
  let i = 0;
  let scoreAdd = 0;
  while (i < items.length) {
    const a = items[i]!;
    const b = items[i + 1];
    if (b && a.value === b.value) {
      const v = a.value * 2;
      scoreAdd += v;
      row[write] = v;
      traces.push({ fromIndex: a.index, toIndex: write, fromValue: a.value, toValue: v, merged: true });
      traces.push({ fromIndex: b.index, toIndex: write, fromValue: b.value, toValue: v, merged: true });
      write += 1;
      i += 2;
    } else {
      row[write] = a.value;
      traces.push({ fromIndex: a.index, toIndex: write, fromValue: a.value, toValue: a.value, merged: false });
      write += 1;
      i += 1;
    }
  }
  return { row, scoreAdd, traces };
}

function mapLineTraces(
  direction: Game2048Direction,
  axis: number,
  traces: LineTrace[],
  size: number,
): TileTrace[] {
  return traces.map((tr) => {
    if (direction === "left") {
      return { fromR: axis, fromC: tr.fromIndex, toR: axis, toC: tr.toIndex, fromValue: tr.fromValue, toValue: tr.toValue, merged: tr.merged };
    }
    if (direction === "right") {
      return {
        fromR: axis,
        fromC: size - 1 - tr.fromIndex,
        toR: axis,
        toC: size - 1 - tr.toIndex,
        fromValue: tr.fromValue,
        toValue: tr.toValue,
        merged: tr.merged,
      };
    }
    if (direction === "up") {
      return { fromR: tr.fromIndex, fromC: axis, toR: tr.toIndex, toC: axis, fromValue: tr.fromValue, toValue: tr.toValue, merged: tr.merged };
    }
    return {
      fromR: size - 1 - tr.fromIndex,
      fromC: axis,
      toR: size - 1 - tr.toIndex,
      toC: axis,
      fromValue: tr.fromValue,
      toValue: tr.toValue,
      merged: tr.merged,
    };
  });
}

/** Same as `moveBoard`, plus per-tile traces used for slide/merge animation. */
export function moveBoardTraced(
  board: number[][],
  direction: Game2048Direction,
): { board: number[][]; scoreDelta: number; moved: boolean; traces: TileTrace[] } {
  const next = board.map((r) => [...r]);
  const traces: TileTrace[] = [];
  let scoreDelta = 0;
  const size = BOARD_SIZE;

  if (direction === "left" || direction === "right") {
    for (let r = 0; r < size; r += 1) {
      const line = direction === "left" ? [...next[r]!] : [...next[r]!].reverse();
      const res = mergeLineTowardZeroTraced(line);
      next[r] = direction === "left" ? res.row : [...res.row].reverse();
      scoreDelta += res.scoreAdd;
      traces.push(...mapLineTraces(direction, r, res.traces, size));
    }
  } else if (direction === "up" || direction === "down") {
    for (let c = 0; c < size; c += 1) {
      const line: number[] = [];
      for (let r = 0; r < size; r += 1) line.push(next[r]![c]!);
      const oriented = direction === "up" ? line : [...line].reverse();
      const res = mergeLineTowardZeroTraced(oriented);
      const restored = direction === "up" ? res.row : [...res.row].reverse();
      scoreDelta += res.scoreAdd;
      for (let r = 0; r < size; r += 1) next[r]![c] = restored[r]!;
      traces.push(...mapLineTraces(direction, c, res.traces, size));
    }
  } else {
    return { board: next, scoreDelta: 0, moved: false, traces: [] };
  }

  const moved = !boardsEqual(board, next);
  return { board: next, scoreDelta, moved, traces: moved ? traces : [] };
}

export function boardsEqual(a: number[][], b: number[][]): boolean {
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      if (cellNum(a[i][j]) !== cellNum(b[i][j])) return false;
    }
  }
  return true;
}

export function moveBoard(
  board: number[][],
  direction: Game2048Direction,
): { board: number[][]; scoreDelta: number; moved: boolean } {
  const next = board.map((r) => [...r]);
  let scoreDelta = 0;

  if (direction === "left") {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const { row, scoreAdd } = mergeLineTowardZero(next[i]);
      next[i] = row;
      scoreDelta += scoreAdd;
    }
  } else if (direction === "right") {
    for (let i = 0; i < BOARD_SIZE; i++) {
      next[i].reverse();
      const { row, scoreAdd } = mergeLineTowardZero(next[i]);
      next[i] = row;
      next[i].reverse();
      scoreDelta += scoreAdd;
    }
  } else if (direction === "up") {
    for (let j = 0; j < BOARD_SIZE; j++) {
      const col: number[] = [];
      for (let i = 0; i < BOARD_SIZE; i++) col.push(next[i][j]);
      const { row, scoreAdd } = mergeLineTowardZero(col);
      scoreDelta += scoreAdd;
      for (let i = 0; i < BOARD_SIZE; i++) next[i][j] = row[i];
    }
  } else if (direction === "down") {
    for (let j = 0; j < BOARD_SIZE; j++) {
      const col: number[] = [];
      for (let i = 0; i < BOARD_SIZE; i++) col.push(next[i][j]);
      col.reverse();
      const { row, scoreAdd } = mergeLineTowardZero(col);
      const restored = row.reverse();
      scoreDelta += scoreAdd;
      for (let i = 0; i < BOARD_SIZE; i++) next[i][j] = restored[i];
    }
  } else {
    return { board: next, scoreDelta: 0, moved: false };
  }

  const moved = !boardsEqual(board, next);
  return { board: next, scoreDelta, moved };
}

export function spawnRandomTile(board: number[][], rng: () => number = Math.random): boolean {
  const empties: [number, number][] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      if (cellNum(board[i][j]) === 0) empties.push([i, j]);
    }
  }
  if (empties.length === 0) return false;
  const pick = empties[Math.floor(rng() * empties.length)];
  board[pick[0]][pick[1]] = rng() < 0.9 ? 2 : 4;
  return true;
}

export function createInitialBoard(rng: () => number = Math.random): number[][] {
  const b = emptyBoard();
  spawnRandomTile(b, rng);
  spawnRandomTile(b, rng);
  return b;
}

export function hasValidMove(board: number[][]): boolean {
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      if (cellNum(board[i][j]) === 0) return true;
      const v = cellNum(board[i][j]);
      if (j + 1 < BOARD_SIZE && cellNum(board[i][j + 1]) === v) return true;
      if (i + 1 < BOARD_SIZE && cellNum(board[i + 1][j]) === v) return true;
    }
  }
  return false;
}
