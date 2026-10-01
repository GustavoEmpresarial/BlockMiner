/** Default checkout currency for offer-event miners (matches shop: BLK). */
export const DEFAULT_OFFER_CURRENCY = "BLK" as const;

/**
 * Hard cap for `POST /offer-events/purchase` (event miners).
 * Must stay in lockstep with `OFFER_PURCHASE_MAX_QUANTITY` on the client
 * (`client/src/features/offers/lib/offers.api.ts`). Fan/rack bulk caps live in
 * `FAN_MAX_BULK_QUANTITY` / `RACK_MAX_BULK_QUANTITY` and are echoed on
 * `GET /offer-events/active` as `maxBulkQuantity`.
 */
export const OFFER_EVENT_PURCHASE_MAX_QUANTITY = 25;

export const ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MIN = 5;
export const ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX = 100;

export const ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MIN = 5;
export const ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_DEFAULT = 100;
export const ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX = 200;

/** UTC day length used to schedule a delayed miner grant. */
export const OFFER_EVENT_MS_PER_DAY = 86_400_000;

/** How many due MCX9-style grants one cron tick delivers. */
export const OFFER_EVENT_DELIVERY_BATCH = 50;

/** Admin cannot schedule a grant further out than this. */
export const MAX_OFFER_DELIVERY_DELAY_DAYS = 60;

/**
 * MinerCore MCX9 — the only offer miner that ships a .glb.
 * Duration and delay are the product window the offer was opened with.
 * Price and hashrate default to the live catalog row "Streamers Miners"
 * (premium custom GPU, 20 BLK / 3000 H/s) and can be overridden by env
 * before the offer is seeded. A row that already exists is not rewritten.
 */
export const MINERCORE_MCX9_OFFER_TITLE = "MinerCore MCX9";
export const MINERCORE_MCX9_OFFER_DURATION_DAYS = 60;
export const MINERCORE_MCX9_DELIVERY_DELAY_DAYS = 5;
export const MINERCORE_MCX9_MODEL_URL = "/media/models/minercore-mcx9.glb";
/** Same front-on cutout framing as the shop and the live offer cards. */
export const MINERCORE_MCX9_IMAGE_URL = "/media/offers/minercore-mcx9.webp";
export const MINERCORE_MCX9_PRICE_ENV_KEY = "MINERCORE_MCX9_PRICE_BLK";
export const DEFAULT_MINERCORE_MCX9_PRICE_BLK = "20";
export const MINERCORE_MCX9_HASH_RATE_ENV_KEY = "MINERCORE_MCX9_HASH_RATE";
export const DEFAULT_MINERCORE_MCX9_HASH_RATE = 3000;

export const MINERCORE_MCX9_OFFER_DESCRIPTION =
  "Placa 3D da MinerCore. A compra é confirmada na hora, mas a máquina só entra no inventário 5 dias depois. As outras ofertas em imagem chegam hoje e continuam minerando.";

/**
 * The three image miners beside the MCX9.
 * No .glb, deliveryDelayDays 0, so the grant is immediate.
 * Colors follow the MinerCore dashboard palette: gold, amber, cyan.
 * Price and hashrate stay on the Mining Revolution ladder:
 * Block Overdrive, BlockEclipse, BlockNova.
 * Previous names were MinerCore DOGE, MinerCore BTC and MinerCore MCORE.
 */
export const MINERCORE_IMAGE_OFFER_MINERS = [
  {
    name: "Gildcore",
    description: "Placa dourada da MinerCore. A compra entra no inventário na hora e a máquina continua minerando.",
    imageUrl: "/media/offers/gildcore-hero.png",
    priceBlk: "0.5",
    hashRate: 750,
  },
  {
    name: "Amberforge",
    description: "Placa âmbar da MinerCore. A compra entra no inventário na hora e a máquina continua minerando.",
    imageUrl: "/media/offers/amberforge-hero.png",
    priceBlk: "1",
    hashRate: 2000,
  },
  {
    name: "Hexcore",
    description: "Placa ciano da MinerCore, com a marca M. A compra entra no inventário na hora e a máquina continua minerando.",
    imageUrl: "/media/offers/hexcore-hero.png",
    priceBlk: "1.5",
    hashRate: 3750,
  },
] as const;

/** Names already stored on the live offer, before the MinerCore rename. */
export const MINERCORE_IMAGE_OFFER_LEGACY_NAMES: Record<
  (typeof MINERCORE_IMAGE_OFFER_MINERS)[number]["name"],
  string
> = {
  Gildcore: "MinerCore DOGE",
  Amberforge: "MinerCore BTC",
  Hexcore: "MinerCore MCORE",
};
