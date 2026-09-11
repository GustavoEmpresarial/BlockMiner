/**
 * AdLinkFly shortlink API — GET /api?api=TOKEN&url=DEST[&format=json][&type=1]
 * Docs panel: Developers API & Integration (AdLinkFly).
 */
import { logger } from "../../core/logger/index.js";

const log = logger.child("adlinkfly-shortlink.api");

export const ADLINKFLY_SHORTLINK_API_TOKEN = (process.env.ADLINKFLY_SHORTLINK_API_TOKEN ?? "").trim();
export const ADLINKFLY_SHORTLINK_API_BASE = (
  process.env.ADLINKFLY_SHORTLINK_API_URL ?? "http://169.58.45.155:8088/api"
).trim();
/** Interstitial ads (AdLinkFly `type=1`). */
export const ADLINKFLY_SHORTLINK_TYPE = Math.max(
  0,
  Number(process.env.ADLINKFLY_SHORTLINK_TYPE ?? "1") || 1,
);
export const ADLINKFLY_SHORTLINK_FETCH_MS =
  Number(process.env.ADLINKFLY_SHORTLINK_FETCH_MS ?? "12000") || 12_000;
export const ADLINKFLY_SHORTLINK_FETCH_RETRIES = Math.max(
  1,
  Number(process.env.ADLINKFLY_SHORTLINK_FETCH_RETRIES ?? "2") || 2,
);

function envFlagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function readApiToken(): string {
  return String(process.env.ADLINKFLY_SHORTLINK_API_TOKEN ?? ADLINKFLY_SHORTLINK_API_TOKEN).trim();
}

function readApiBase(): string {
  return String(process.env.ADLINKFLY_SHORTLINK_API_URL ?? ADLINKFLY_SHORTLINK_API_BASE).trim();
}

/**
 * Maintenance defaults ON when unset — integrate credentials without exposing the offer.
 * Set ADLINKFLY_SHORTLINK_MAINTENANCE=0 to go live.
 */
export function isAdlinkflyShortlinkMaintenance(): boolean {
  const raw = process.env.ADLINKFLY_SHORTLINK_MAINTENANCE;
  if (raw === undefined || String(raw).trim() === "") return true;
  return envFlagOn(raw);
}

export function isAdlinkflyShortlinkApiEnabled(): boolean {
  if (isAdlinkflyShortlinkMaintenance()) return false;
  return Boolean(readApiToken() && readApiBase());
}

type ShrinkOk = { ok: true; shortCode: string; externalUrl: string };
type ShrinkFail = { ok: false; reason: string; detail?: string };

const FETCH_HEADERS = {
  Accept: "application/json,text/plain,*/*",
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

/** Pure parse of AdLinkFly API body (JSON or plain URL/text). */
export function parseAdlinkflyShrinkResponse(raw: string): ShrinkOk | ShrinkFail {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty", detail: "" };

  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as {
        status?: string;
        shortenedUrl?: string;
        shorturl?: string;
        url?: string;
        message?: string;
        error?: string;
      };
      const status = String(json.status ?? "").toLowerCase();
      const externalUrl = String(json.shortenedUrl || json.shorturl || json.url || "").trim();
      if (status && status !== "success" && status !== "ok") {
        return {
          ok: false,
          reason: "api_status",
          detail: String(json.message || json.error || status).slice(0, 160),
        };
      }
      if (!externalUrl || !/^https?:\/\//i.test(externalUrl)) {
        return { ok: false, reason: "bad_response", detail: text.slice(0, 160) };
      }
      let shortCode = externalUrl.replace(/\/$/, "").split("/").pop() || "";
      shortCode = shortCode.split("?")[0] || shortCode;
      return { ok: true, shortCode: shortCode.slice(0, 64), externalUrl };
    } catch {
      return { ok: false, reason: "bad_json", detail: text.slice(0, 160) };
    }
  }

  if (/^https?:\/\//i.test(text) && !text.includes(" ")) {
    const externalUrl = text;
    let shortCode = externalUrl.replace(/\/$/, "").split("/").pop() || "";
    shortCode = shortCode.split("?")[0] || shortCode;
    return { ok: true, shortCode: shortCode.slice(0, 64), externalUrl };
  }

  return { ok: false, reason: "bad_response", detail: text.slice(0, 160) };
}

async function fetchAdlinkflyApi(
  requestUrl: string,
): Promise<{ ok: true; raw: string } | { ok: false; reason: string; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADLINKFLY_SHORTLINK_FETCH_MS);
  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: FETCH_HEADERS,
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

/** Shorten `destinationUrl` via AdLinkFly; returns public short URL. */
export async function createAdlinkflyShrink(destinationUrl: string): Promise<ShrinkOk | ShrinkFail> {
  if (!isAdlinkflyShortlinkApiEnabled()) {
    return { ok: false, reason: "disabled" };
  }
  const query = new URLSearchParams({
    api: readApiToken(),
    url: destinationUrl,
    format: "json",
    type: String(ADLINKFLY_SHORTLINK_TYPE),
  });
  const requestUrl = `${readApiBase()}?${query.toString()}`;
  let lastDetail = "";
  for (let attempt = 1; attempt <= ADLINKFLY_SHORTLINK_FETCH_RETRIES; attempt += 1) {
    const result = await fetchAdlinkflyApi(requestUrl);
    if (!result.ok) {
      lastDetail = result.detail;
      log.warn("adlinkfly.api.attempt_failed", { attempt, reason: result.reason, detail: result.detail });
      if (attempt < ADLINKFLY_SHORTLINK_FETCH_RETRIES) {
        await sleep(800 * attempt);
        continue;
      }
      return { ok: false, reason: result.reason, detail: result.detail };
    }
    const parsed = parseAdlinkflyShrinkResponse(result.raw);
    if (!parsed.ok) {
      lastDetail = parsed.detail ?? parsed.reason;
      log.warn("adlinkfly.api.bad_body", { attempt, reason: parsed.reason, detail: parsed.detail });
      if (attempt < ADLINKFLY_SHORTLINK_FETCH_RETRIES) {
        await sleep(800 * attempt);
        continue;
      }
      return parsed;
    }
    return parsed;
  }
  return { ok: false, reason: "exhausted", detail: lastDetail };
}
