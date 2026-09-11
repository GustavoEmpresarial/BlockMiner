// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Pure match-3 board logic + crypto-secure shuffle. Ported verbatim (semantics preserved) from
 * legacy/server/src/socket/gamesSocket.match3.ts. No IO — trivially unit-testable.
 */
import crypto from "node:crypto";
export const MATCH3_SYMBOLS = ["bitcoin", "ethereum", "solana", "binance-coin", "cardano"];
/** Fisher–Yates shuffle using cryptographically strong indices (crypto.randomInt, not Math.random). */
export function secureShuffle(items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(0, i + 1);
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}
export function randomMatch3Symbol() {
    return MATCH3_SYMBOLS[crypto.randomInt(0, MATCH3_SYMBOLS.length)];
}
/** Generates an 8x8 board with no pre-existing 3-in-a-row (horizontal or vertical). */
export function generateStableBoard() {
    const board = [];
    for (let y = 0; y < 8; y++) {
        board[y] = [];
        for (let x = 0; x < 8; x++) {
            let s;
            do {
                s = randomMatch3Symbol();
            } while ((x >= 2 && board[y][x - 1] === s && board[y][x - 2] === s) ||
                (y >= 2 && board[y - 1][x] === s && board[y - 2][x] === s));
            board[y][x] = s;
        }
    }
    return board;
}
/** Finds all cells in horizontal or vertical runs of 3+ identical symbols. */
export function findMatches(board) {
    const matches = new Set();
    for (let y = 0; y < 8; y++) {
        let x = 0;
        while (x < 8) {
            const sym = board[y][x];
            if (!sym) {
                x += 1;
                continue;
            }
            let end = x + 1;
            while (end < 8 && board[y][end] === sym)
                end += 1;
            if (end - x >= 3) {
                for (let i = x; i < end; i++)
                    matches.add(`${i},${y}`);
            }
            x = end;
        }
    }
    for (let x = 0; x < 8; x++) {
        let y = 0;
        while (y < 8) {
            const sym = board[y][x];
            if (!sym) {
                y += 1;
                continue;
            }
            let end = y + 1;
            while (end < 8 && board[end][x] === sym)
                end += 1;
            if (end - y >= 3) {
                for (let i = y; i < end; i++)
                    matches.add(`${x},${i}`);
            }
            y = end;
        }
    }
    return Array.from(matches).map((s) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y };
    });
}
/** Clears matched cells, drops surviving cells down, and refills the top with new symbols (in place). */
export function processCascades(board, matches) {
    matches.forEach((m) => (board[m.y][m.x] = null));
    for (let x = 0; x < 8; x++) {
        let emptyRow = 7;
        for (let y = 7; y >= 0; y--) {
            if (board[y][x] !== null) {
                board[emptyRow][x] = board[y][x];
                if (emptyRow !== y)
                    board[y][x] = null;
                emptyRow--;
            }
        }
        for (let y = emptyRow; y >= 0; y--) {
            board[y][x] = randomMatch3Symbol();
        }
    }
}
