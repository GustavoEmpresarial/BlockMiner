/** Live USD rates for the license currencies. Fails closed: no fresh price, no sale. */
import { getFreshUsdPrice } from "../../shared/cryptoPrice/cryptoPrice.js";
import { logger } from "../../core/logger/index.js";
import type { AvatarCurrency } from "./avatar.rules.js";

const log = logger.child("AvatarPricing");

export async function getAvatarUsdRate(currency: AvatarCurrency): Promise<number | null> {
  const rate = await getFreshUsdPrice(currency);
  if (rate == null) log.warn("AVATAR_PRICE_UNAVAILABLE", { currency });
  return rate;
}
