import type { Match3Piece } from "./gameSession.types";

export type Match3Coord = { x: number; y: number };

const BOARD_SIZE = 8;

/**
 * Rebuilds the visual match-3 board after a server cascade.
 * Uses cleared cell coordinates so matched pieces never "stick" when the same
 * symbol refills a cell after gravity.
 */
export function rebuildMatch3VisualBoard(
  prev: Match3Piece[][],
  nextBoard: string[][],
  cleared: Match3Coord[],
): Match3Piece[][] {
  const clearedSet = new Set(cleared.map((c) => `${c.x},${c.y}`));
  const result: Match3Piece[][] = Array.from({ length: BOARD_SIZE }, () => []);

  for (let x = 0; x < BOARD_SIZE; x++) {
    const col = rebuildMatch3Column(prev, nextBoard, x, clearedSet);
    for (let y = 0; y < BOARD_SIZE; y++) {
      result[y][x] = col[y];
    }
  }

  return result;
}

function rebuildMatch3Column(
  prev: Match3Piece[][],
  nextBoard: string[][],
  x: number,
  clearedSet: Set<string>,
): Match3Piece[] {
  const survivors: { oy: number; sym: string; piece: Match3Piece }[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    if (clearedSet.has(`${x},${y}`)) continue;
    const piece = prev[y]?.[x];
    if (piece) survivors.push({ oy: y, sym: piece.symbol, piece });
  }

  const newCol = Array.from({ length: BOARD_SIZE }, (_, y) => nextBoard[y]?.[x] ?? "");
  const oldToNew = lcsAlign(
    survivors.map((s) => s.sym),
    newCol,
  );

  const result: Match3Piece[] = new Array(BOARD_SIZE);
  for (let y = 0; y < BOARD_SIZE; y++) {
    const sym = newCol[y];
    const survivorIdx = oldToNew.get(y);
    if (survivorIdx !== undefined) {
      const src = survivors[survivorIdx]!;
      result[y] = {
        ...src.piece,
        symbol: sym,
        x,
        y,
        visualX: x,
        visualY: src.oy,
        scale: 1.0,
      };
    } else {
      result[y] = {
        symbol: sym,
        x,
        y,
        visualX: x,
        visualY: y - clearedAbove(x, y, clearedSet) - 2,
        scale: 1.0,
      };
    }
  }

  return result;
}

/** Longest common subsequence — maps each new-row index to a survivor index. */
function lcsAlign(oldSyms: string[], newSyms: string[]): Map<number, number> {
  const m = oldSyms.length;
  const n = newSyms.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldSyms[i - 1] === newSyms[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const newToOldIdx = new Map<number, number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldSyms[i - 1] === newSyms[j - 1]) {
      newToOldIdx.set(j - 1, i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return newToOldIdx;
}

function clearedAbove(x: number, y: number, clearedSet: Set<string>): number {
  let count = 0;
  for (let row = 0; row < y; row++) {
    if (clearedSet.has(`${x},${row}`)) count++;
  }
  return count;
}
