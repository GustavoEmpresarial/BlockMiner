import type { TranslateFn } from "../../lib/games.i18n";
import {
  game2048BoardGridGapClass,
  game2048BoardShellClass,
} from "../lib/game2048.layout";

interface Game2048BoardSkeletonProps {
  t: TranslateFn;
  labelKey: string;
}

export function Game2048BoardSkeleton({ t, labelKey }: Game2048BoardSkeletonProps) {
  const n = 4;
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={t(labelKey)}
      className={`${game2048BoardShellClass} animate-pulse`}
    >
      <div
        className={game2048BoardGridGapClass}
        style={{
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: n * n }, (_, i) => (
          <div
            key={`sk-${i}`}
            className="rounded-md border border-sky-800/35 bg-[#0c1929]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          />
        ))}
      </div>
    </div>
  );
}
