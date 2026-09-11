import type { TileTrace } from "../../lib/game2048Engine";

export type VisualTile = {
  id: number;
  r: number;
  c: number;
  value: number;
  merged: boolean;
  spawned: boolean;
  fading: boolean;
};

let nextTileId = 1;

export function resetVisualTileIdsForTests(): void {
  nextTileId = 1;
}

export function hydrateTiles(board: number[][]): VisualTile[] {
  const tiles: VisualTile[] = [];
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < board[r]!.length; c += 1) {
      const value = board[r]![c]!;
      if (value > 0) {
        tiles.push({
          id: nextTileId++,
          r,
          c,
          value,
          merged: false,
          spawned: false,
          fading: false,
        });
      }
    }
  }
  return tiles;
}

export function applyTraces(tiles: VisualTile[], traces: TileTrace[]): VisualTile[] {
  const live = tiles.filter((t) => !t.fading);
  const byPos = new Map<string, VisualTile>();
  for (const tile of live) byPos.set(`${tile.r},${tile.c}`, tile);

  const destGroups = new Map<string, TileTrace[]>();
  for (const tr of traces) {
    const key = `${tr.toR},${tr.toC}`;
    const group = destGroups.get(key) ?? [];
    group.push(tr);
    destGroups.set(key, group);
  }

  const next: VisualTile[] = [];
  for (const [key, group] of destGroups) {
    const [toR, toC] = key.split(",").map(Number);
    if (group.length >= 2) {
      const a = byPos.get(`${group[0]!.fromR},${group[0]!.fromC}`);
      const b = byPos.get(`${group[1]!.fromR},${group[1]!.fromC}`);
      const survivor = a ?? b;
      const other = survivor && survivor === a ? b : a;
      const value = group[0]!.toValue;
      if (survivor) {
        next.push({
          ...survivor,
          r: toR,
          c: toC,
          value,
          merged: true,
          spawned: false,
          fading: false,
        });
      } else {
        next.push({
          id: nextTileId++,
          r: toR,
          c: toC,
          value,
          merged: true,
          spawned: false,
          fading: false,
        });
      }
      if (other) {
        next.push({
          ...other,
          r: toR,
          c: toC,
          value: group[1]!.fromValue,
          merged: false,
          spawned: false,
          fading: true,
        });
      }
    } else {
      const tr = group[0]!;
      const src = byPos.get(`${tr.fromR},${tr.fromC}`);
      if (src) {
        next.push({
          ...src,
          r: toR,
          c: toC,
          value: tr.toValue,
          merged: false,
          spawned: false,
          fading: false,
        });
      } else {
        next.push({
          id: nextTileId++,
          r: toR,
          c: toC,
          value: tr.toValue,
          merged: false,
          spawned: false,
          fading: false,
        });
      }
    }
  }
  return next;
}

/** Adds tiles that exist on the server board but not in the visual list (the spawned cell). */
export function addSpawnedTiles(tiles: VisualTile[], board: number[][]): VisualTile[] {
  const kept = tiles.filter((t) => !t.fading);
  const occupied = new Set(kept.map((t) => `${t.r},${t.c}`));
  const next = kept.map((t) => ({ ...t, spawned: false }));
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < board[r]!.length; c += 1) {
      const value = board[r]![c]!;
      if (value <= 0 || occupied.has(`${r},${c}`)) continue;
      next.push({
        id: nextTileId++,
        r,
        c,
        value,
        merged: false,
        spawned: true,
        fading: false,
      });
    }
  }
  return next;
}
