/**
 * ZerAds / AN-Script Shortlink API — https://zerads.com/linkapi.php
 * Advanced mode: success URL ($url), captcha-fail URL ($furl), $strict, $adsnum.
 * Query values with `&` must use `@@` instead (per ZerAds docs).
 */
import { logger } from "../../core/logger/index.js";

const log = logger.child("zerads-shortlink.api");

export const ZERADS_SHORTLINK_API_USER = (process.env.ZERADS_SHORTLINK_API_USER ?? "ElonMuskBRr").trim();
export const ZERADS_SHORTLINK_API_BASE = (
  process.env.ZERADS_SHORTLINK_API_URL ?? "https://zerads.com/linkapi.php"
).trim();
export const ZERADS_SHORTLINK_PUBLIC_BASE = (
  process.env.ZERADS_SHORTLINK_PUBLIC_BASE ?? "https://zerads.com/"
).replace(/\/?$/, "/");
export const ZERADS_SHORTLINK_STRICT = Math.max(1, Number(process.env.ZERADS_SHORTLINK_STRICT ?? "1") || 1);
export const ZERADS_SHORTLINK_ADSNUM = Math.max(1, Number(process.env.ZERADS_SHORTLINK_ADSNUM ?? "1") || 1);
export const ZERADS_SHORTLINK_FETCH_MS = Number(process.env.ZERADS_SHORTLINK_FETCH_MS ?? "12000") || 12_000;
export const ZERADS_SHORTLINK_FETCH_RETRIES = Math.max(
  1,
  Number(process.env.ZERADS_SHORTLINK_FETCH_RETRIES ?? "2") || 2,
);

function envFlagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** When true, ZerAds pastead shortlink is offline (maintenance) even if API credentials exist. */
export function isZeradsShortlinkMaintenance(): boolean {
  return envFlagOn(process.env.ZERADS_SHORTLINK_MAINTENANCE);
}

export function isZeradsShortlinkApiEnabled(): boolean {
  if (isZeradsShortlinkMaintenance()) return false;
  return Boolean(ZERADS_SHORTLINK_API_USER && ZERADS_SHORTLINK_API_BASE);
}

/** ZerAds requires `&` → `@@` inside $url / $furl before passing to linkapi.php. */
export function encodeZeradsLinkTarget(url: string): string {
  return url.replace(/&/g, "@@");
}

type ShrinkOk = { ok: true; shortCode: string; externalUrl: string };
type ShrinkFail = { ok: false; reason: string; detail?: string };

const ZERADS_FETCH_HEADERS = {
  Accept: "text/plain,*/*",
  "User-Agent": "BlockMiner/2.1 (+https://blockminer.space)",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchErrorDetail(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause;
    if (cause instanceof Error) return `${err.message}: ${cause.message}`;
    return err.message;
  }
  return String(err);
}

async function fetchZeradsLinkApi(
  requestUrl: string,
): Promise<{ ok: true; raw: string } | { ok: false; reason: string; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZERADS_SHORTLINK_FETCH_MS);
  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: ZERADS_FETCH_HEADERS,
    });
    if (!res.ok) {
      return { ok: false, reason: "http", detail: `HTTP ${res.status}` };
    }
    return { ok: true, raw: (await res.text()).trim() };
  } catch (err) {
    return { ok: false, reason: "network", detail: fetchErrorDetail(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Calls linkapi.php and returns `https://zerads.com/{code}`. */
export async function createZeradsShrink(successUrl: string, failUrl: string): Promise<ShrinkOk | ShrinkFail> {
  if (!isZeradsShortlinkApiEnabled()) {
    return { ok: false, reason: "disabled" };
  }
  const query = new URLSearchParams({
    user: ZERADS_SHORTLINK_API_USER,
    url: encodeZeradsLinkTarget(successUrl),
    furl: encodeZeradsLinkTarget(failUrl),
    strict: String(ZERADS_SHORTLINK_STRICT),
    adsnum: String(ZERADS_SHORTLINK_ADSNUM),
  });
  const requestUrl = `${ZERADS_SHORTLINK_API_BASE}?${query.toString()}`;
  let lastDetail = "";
  for (let attempt = 1; attempt <= ZERADS_SHORTLINK_FETCH_RETRIES; attempt += 1) {
    const result = await fetchZeradsLinkApi(requestUrl);
    if (!result.ok) {
      lastDetail = result.detail;
      log.warn("zerads.linkapi.attempt_failed", { attempt, reason: result.reason, detail: result.detail });
      if (attempt < ZERADS_SHORTLINK_FETCH_RETRIES) {
        await sleep(800 * attempt);
        continue;
      }
      return { ok: false, reason: result.reason, detail: result.detail };
    }
    const shortCode = result.raw;
    if (!shortCode || shortCode.includes(" ") || shortCode.length > 64) {
      return { ok: false, reason: "bad_response", detail: shortCode.slice(0, 120) };
    }
    return { ok: true, shortCode, externalUrl: `${ZERADS_SHORTLINK_PUBLIC_BASE}${shortCode}` };
  }
  return { ok: false, reason: "exhausted", detail: lastDetail };
}
