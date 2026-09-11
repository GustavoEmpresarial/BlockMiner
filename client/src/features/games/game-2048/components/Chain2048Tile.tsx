import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Transition } from "framer-motion";
import type { TranslateFn } from "../../lib/games.i18n";
import { CRYPTO_ICONS, COIN_COLORS, cryptoSlugFor2048Tile, type CryptoIconKey } from "../../lib/cryptoGameIcons";
import type { VisualTile } from "../lib/game2048.tiles";

type GridTileProps = {
  value: unknown;
  row: number;
  col: number;
  t: TranslateFn;
  tile?: never;
};

type AnimatedTileProps = {
  tile: VisualTile;
  t: TranslateFn;
  value?: never;
  row?: never;
  col?: never;
};

export type Chain2048TileProps = GridTileProps | AnimatedTileProps;

function tileInner(
  num: number,
  row: number,
  col: number,
  t: TranslateFn,
  reduceMotion: boolean,
  tileTransition: Transition,
  imgOk: boolean,
  onImgError: () => void,
) {
  const hasTile = Number.isFinite(num) && num > 0;
  const slug: CryptoIconKey | null = hasTile ? cryptoSlugFor2048Tile(num) : null;
  const scheme = slug ? COIN_COLORS[slug] ?? COIN_COLORS.ethereum : null;
  const iconSrc = slug ? CRYPTO_ICONS[slug] ?? CRYPTO_ICONS.ethereum : null;

  return (
    <>
      <AnimatePresence mode="popLayout">
        {hasTile && scheme ? (
          <motion.div
            key={`slot-${row}-${col}`}
            initial={reduceMotion ? { opacity: 0.95 } : { scale: 0.94, opacity: 0.88 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
            transition={tileTransition}
            className="relative flex h-[78%] w-[78%] items-center justify-center overflow-hidden rounded-full shadow-inner"
            style={{
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: scheme.border,
              background: `radial-gradient(circle at 30% 25%, ${scheme.bg}, rgba(6,10,18,0.95))`,
              boxShadow: `0 0 14px -4px ${scheme.glow}`,
            }}
            aria-label={t("game2048.tile_aria", { row: row + 1, col: col + 1, value: num })}
          >
            {iconSrc && imgOk ? (
              <img
                src={iconSrc}
                alt=""
                className="pointer-events-none h-[62%] w-[62%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                draggable={false}
                onError={onImgError}
              />
            ) : (
              <span className="select-none font-mono text-[clamp(10px,3.5vmin,18px)] font-black tabular-nums text-white/90">
                {num}
              </span>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function Chain2048Tile(props: Chain2048TileProps) {
  const reduceMotion = useReducedMotion();
  const num =
    "tile" in props && props.tile
      ? props.tile.value
      : typeof props.value === "number"
        ? props.value
        : Number(props.value);
  const row = "tile" in props && props.tile ? props.tile.r : props.row;
  const col = "tile" in props && props.tile ? props.tile.c : props.col;
  const t = props.t;
  const hasTile = Number.isFinite(num) && num > 0;
  const slug = hasTile ? cryptoSlugFor2048Tile(num) : null;
  const [imgOk, setImgOk] = useState(true);
  const tileTransition: Transition = reduceMotion
    ? { duration: 0.06 }
    : { type: "tween" as const, duration: 0.1, ease: [0.25, 0.1, 0.25, 1] as const };

  useEffect(() => {
    setImgOk(true);
  }, [num, slug]);

  const shellClass =
    "relative flex aspect-square items-center justify-center overflow-hidden rounded border border-sky-500/35 bg-[#0a1628] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

  const content = tileInner(num, row, col, t, Boolean(reduceMotion), tileTransition, imgOk, () =>
    setImgOk(false),
  );

  if ("tile" in props && props.tile) {
    const { tile } = props;
    return (
      <motion.div
        layout
        layoutId={`tile-${tile.id}`}
        className={shellClass}
        style={{
          position: "absolute",
          width: "calc((100% - (var(--n) - 1) * var(--gap)) / var(--n))",
          height: "calc((100% - (var(--n) - 1) * var(--gap)) / var(--n))",
          left: `calc(${tile.c} * ((100% - (var(--n) - 1) * var(--gap)) / var(--n) + var(--gap)))`,
          top: `calc(${tile.r} * ((100% - (var(--n) - 1) * var(--gap)) / var(--n) + var(--gap)))`,
          zIndex: tile.merged ? 2 : 1,
        }}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <div className={shellClass} style={!hasTile ? { background: "#0c1929" } : undefined}>
      {content}
    </div>
  );
}
