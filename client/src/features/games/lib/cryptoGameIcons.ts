/** Server `SYMBOLS` slugs — keys must match memory / match-3 board cells. */
export const CRYPTO_SLUGS = [
  "bitcoin",
  "ethereum",
  "solana",
  "binance-coin",
  "cardano",
  "polkadot",
  "dogecoin",
  "polygon",
] as const;

export type CryptoIconKey = (typeof CRYPTO_SLUGS)[number];

export type CoinColorScheme = {
  border: string;
  bg: string;
  glow: string;
};

/** img `src` for Chain2048 tiles */
export const CRYPTO_ICONS: Record<CryptoIconKey, string> = Object.fromEntries(
  CRYPTO_SLUGS.map((slug) => [slug, `/media/icons/${slug}.webp`]),
) as Record<CryptoIconKey, string>;

const ICON_SRCS: Record<CryptoIconKey, string> = CRYPTO_ICONS;

export const COIN_COLORS: Record<CryptoIconKey, CoinColorScheme> = {
  bitcoin: {
    border: "rgba(247, 147, 26, 0.55)",
    bg: "rgba(247, 147, 26, 0.22)",
    glow: "rgba(247, 147, 26, 0.45)",
  },
  ethereum: {
    border: "rgba(98, 126, 234, 0.55)",
    bg: "rgba(98, 126, 234, 0.22)",
    glow: "rgba(98, 126, 234, 0.45)",
  },
  solana: {
    border: "rgba(20, 241, 149, 0.55)",
    bg: "rgba(20, 241, 149, 0.18)",
    glow: "rgba(20, 241, 149, 0.4)",
  },
  "binance-coin": {
    border: "rgba(243, 186, 47, 0.55)",
    bg: "rgba(243, 186, 47, 0.2)",
    glow: "rgba(243, 186, 47, 0.42)",
  },
  cardano: {
    border: "rgba(0, 51, 173, 0.55)",
    bg: "rgba(59, 130, 246, 0.2)",
    glow: "rgba(59, 130, 246, 0.4)",
  },
  polkadot: {
    border: "rgba(230, 0, 122, 0.55)",
    bg: "rgba(230, 0, 122, 0.18)",
    glow: "rgba(230, 0, 122, 0.38)",
  },
  dogecoin: {
    border: "rgba(194, 166, 51, 0.55)",
    bg: "rgba(194, 166, 51, 0.2)",
    glow: "rgba(194, 166, 51, 0.4)",
  },
  polygon: {
    border: "rgba(130, 71, 229, 0.55)",
    bg: "rgba(130, 71, 229, 0.2)",
    glow: "rgba(130, 71, 229, 0.42)",
  },
};

const TILE_LADDER: CryptoIconKey[] = [
  "polygon",
  "cardano",
  "solana",
  "dogecoin",
  "polkadot",
  "binance-coin",
  "ethereum",
  "bitcoin",
];

export const ICON_IMAGES = {} as Record<CryptoIconKey, HTMLImageElement>;

function loadIcon(key: CryptoIconKey): HTMLImageElement {
  const existing = ICON_IMAGES[key];
  if (existing) return existing;
  const img = new Image();
  img.decoding = "async";
  img.src = ICON_SRCS[key];
  ICON_IMAGES[key] = img;
  return img;
}

/** Eager preload so Memory / Match-3 tiles paint logos instead of empty cells. */
export function preloadCryptoGameIcons(): void {
  CRYPTO_SLUGS.forEach(loadIcon);
}

/** Maps 2048 tile values (powers of two) onto the crypto ladder used in arena art. */
export function cryptoSlugFor2048Tile(value: unknown): CryptoIconKey {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return "polygon";
  const exp = Math.round(Math.log2(num));
  if (exp < 1 || 2 ** exp !== num) return "polygon";
  return TILE_LADDER[(exp - 1) % TILE_LADDER.length] ?? "polygon";
}

if (typeof window !== "undefined") {
  preloadCryptoGameIcons();
}
