import { useLayoutEffect, useRef, useState } from "react";
import type { TranslateFn } from "../../lib/games.i18n";
import type { TileTrace } from "../../lib/game2048Engine";
import { addSpawnedTiles, applyTraces, hydrateTiles, type VisualTile } from "../lib/game2048.tiles";
import { game2048BoardGridGapClass, game2048BoardShellClass } from "../lib/game2048.layout";
import { Chain2048Tile } from "./Chain2048Tile";

interface Chain2048BoardProps {
  board: number[][];
  sessionId: string;
  traces: TileTrace[] | null;
  moveEpoch: number;
  t: TranslateFn;
}

export function Chain2048Board({ board, sessionId, traces, moveEpoch, t }: Chain2048BoardProps) {
  const size = board.length;
  const [tiles, setTiles] = useState<VisualTile[]>(() => hydrateTiles(board));
  const sessionIdRef = useRef(sessionId);
  const epochRef = useRef(moveEpoch);

  useLayoutEffect(() => {
    setTiles((prev) => {
      if (sessionIdRef.current !== sessionId) {
        sessionIdRef.current = sessionId;
        epochRef.current = moveEpoch;
        return hydrateTiles(board);
      }
      let next = prev;
      if (epochRef.current !== moveEpoch) {
        epochRef.current = moveEpoch;
        if (traces && traces.length > 0) {
          next = applyTraces(prev.filter((tile) => !tile.fading), traces);
        } else {
          return hydrateTiles(board);
        }
      }
      if (next.length === 0) return hydrateTiles(board);
      return addSpawnedTiles(next, board);
    });
  }, [board, sessionId, traces, moveEpoch]);

  return (
    <div
      className={game2048BoardShellClass}
      style={{ touchAction: "none" }}
    >
      <div
        className="relative h-full w-full [--gap:0.5rem] sm:[--gap:0.625rem]"
        style={{ ["--n" as string]: String(size) }}
      >
        <div
          className={game2048BoardGridGapClass}
          style={{
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: size * size }, (_, i) => (
            <div
              key={`slot-${i}`}
              className="rounded-md border border-sky-500/25 bg-[#0a1628] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-lg"
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0">
          {tiles.map((tile) => (
            <Chain2048Tile key={tile.id} tile={tile} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
