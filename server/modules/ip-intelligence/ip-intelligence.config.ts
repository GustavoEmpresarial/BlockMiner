/**
 * Named env readers for IP intelligence + proxy/VPN providers.
 * Defaults match .env.example / provider docs (VPNAPI free tier = 1000/day UTC).
 */

export const PROXYCHECK_SOURCE = "proxycheck_v2";
export const VPNAPI_SOURCE = "vpnapi";
export const GETIPINTEL_SOURCE = "getipintel";
export const IPLOGS_SOURCE = "iplogs";
export const IPAPIIS_SOURCE = "ipapiis";
export const IPHUB_SOURCE = "iphub";
export const IPQS_SOURCE = "ipqs";
export const VPNBLOCKER_SOURCE = "vpnblocker";
export const ABSTRACTAPI_SOURCE = "abstractapi";

export const VPNAPI_DEFAULT_BASE_URL = "https://vpnapi.io/api";
export const IPLOGS_DEFAULT_BASE_URL = "https://iplogs.com";
export const IPAPIIS_DEFAULT_BASE_URL = "https://api.ipapi.is";
export const IPHUB_DEFAULT_BASE_URL = "https://v2.api.iphub.info";
export const IPQS_DEFAULT_BASE_URL = "https://ipqualityscore.com/api/json/ip";
export const VPNBLOCKER_DEFAULT_BASE_URL = "https://api.vpnblocker.net/v2";
export const ABSTRACTAPI_DEFAULT_BASE_URL = "https://ip-intelligence.abstractapi.com/v1";

export const PROXY_TYPE_PRIORITY = ["tor", "vpn", "proxy", "relay"] as const;
export const DEFAULT_PROVIDER_TTL_HOURS = 24;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 4000;
/**
 * When ≥2 providers return a boolean proxyDetected, require this many `true` votes
 * before OR-merge treats the IP as proxy. Single-provider answers still count as 1.
 * Env: IP_INTEL_PROXY_MIN_HITS
 */
export const IP_INTEL_PROXY_MIN_HITS_DEFAULT = 2;
/** Cloudflare WARP / CF egress. Client IPs in this ASN are not residential. */
export const CLOUDFLARE_WARP_ASN = 13335;
/** VPNAPI.io free-tier daily cap; resets 00:00:00 UTC. */
export const VPNAPI_FREE_DAILY_LIMIT = 1000;
export const PROXYCHECK_DEFAULT_DAILY_LIMIT = 1000;
/** GetIPIntel free: ≤500 queries/day (docs). */
export const GETIPINTEL_FREE_DAILY_LIMIT = 500;
/** flags=m returns 0|1; block when result ≥ this (1.0 = ban-list hit only). */
export const GETIPINTEL_DEFAULT_BLOCK_SCORE = 1;
export const GETIPINTEL_DEFAULT_FLAGS = "m";
/** IPLogs fair-use soft daily budget (no hard published daily cap). */
export const IPLOGS_DEFAULT_DAILY_LIMIT = 2000;
/** ipapi.is free account: 1000/day. */
export const IPAPIIS_FREE_DAILY_LIMIT = 1000;
/** IPHub free basic: 1000/day. */
export const IPHUB_FREE_DAILY_LIMIT = 1000;
/** IPQS free: 1000/month → soft daily = floor(1000/31). */
export const IPQS_FREE_MONTHLY_LIMIT = 1000;
export const IPQS_DEFAULT_DAILY_LIMIT = Math.floor(IPQS_FREE_MONTHLY_LIMIT / 31);
export const IPQS_DEFAULT_STRICTNESS = 1;
/** VPN Blocker free package: ~500/month → soft daily = floor(500/31). */
export const VPNBLOCKER_FREE_MONTHLY_LIMIT = 500;
export const VPNBLOCKER_DEFAULT_DAILY_LIMIT = Math.floor(VPNBLOCKER_FREE_MONTHLY_LIMIT / 31);
/** AbstractAPI free: 1000/month → soft daily. */
export const ABSTRACTAPI_FREE_MONTHLY_LIMIT = 1000;
export const ABSTRACTAPI_DEFAULT_DAILY_LIMIT = Math.floor(ABSTRACTAPI_FREE_MONTHLY_LIMIT / 31);
/** Joined proxySource ids fit comfortably in cache column. */
export const PROXY_SOURCE_MAX_LEN = 512;

function envFlag(name: string, fallback = "false"): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? fallback).trim());
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

function envTrimmed(name: string): string {
  return String(process.env[name] || "").trim();
}

function envUnitInterval(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return fallback;
  return raw;
}

export function proxycheckApiKey(): string {
  return envTrimmed("PROXYCHECK_API_KEY");
}

export function proxycheckEnabled(): boolean {
  return Boolean(proxycheckApiKey()) && envFlag("PROXYCHECK_ENABLED");
}

export function proxycheckTtlHours(): number {
  return envPositiveInt("PROXYCHECK_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function proxycheckTimeoutMs(): number {
  return envPositiveInt("PROXYCHECK_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function proxycheckDailyLimit(): number {
  return envPositiveInt("PROXYCHECK_DAILY_LIMIT", PROXYCHECK_DEFAULT_DAILY_LIMIT);
}

export function vpnapiApiKey(): string {
  return envTrimmed("VPNAPI_API_KEY");
}

export function vpnapiEnabled(): boolean {
  return Boolean(vpnapiApiKey()) && envFlag("VPNAPI_ENABLED");
}

export function vpnapiBaseUrl(): string {
  return envTrimmed("VPNAPI_BASE_URL") || VPNAPI_DEFAULT_BASE_URL;
}

export function vpnapiTtlHours(): number {
  return envPositiveInt("VPNAPI_TTL_HOURS", proxycheckTtlHours());
}

export function vpnapiTimeoutMs(): number {
  return envPositiveInt("VPNAPI_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

/** VPNAPI.io free tier: 1000 requests/day, reset 00:00 UTC. */
export function vpnapiDailyLimit(): number {
  return envPositiveInt("VPNAPI_DAILY_LIMIT", VPNAPI_FREE_DAILY_LIMIT);
}

/** GetIPIntel — contact email required by provider ToS. */
export function getipintelContactEmail(): string {
  return envTrimmed("GETIPINTEL_CONTACT_EMAIL");
}

export function getipintelEnabled(): boolean {
  return Boolean(getipintelContactEmail()) && envFlag("GETIPINTEL_ENABLED");
}

export function getipintelFlags(): string {
  return envTrimmed("GETIPINTEL_FLAGS") || GETIPINTEL_DEFAULT_FLAGS;
}

export function getipintelBlockScore(): number {
  return envUnitInterval("GETIPINTEL_BLOCK_SCORE", GETIPINTEL_DEFAULT_BLOCK_SCORE);
}

export function getipintelTtlHours(): number {
  return envPositiveInt("GETIPINTEL_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function getipintelTimeoutMs(): number {
  return envPositiveInt("GETIPINTEL_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function getipintelDailyLimit(): number {
  return envPositiveInt("GETIPINTEL_DAILY_LIMIT", GETIPINTEL_FREE_DAILY_LIMIT);
}

export function iplogsEnabled(): boolean {
  return envFlag("IPLOGS_ENABLED");
}

export function iplogsBaseUrl(): string {
  return envTrimmed("IPLOGS_BASE_URL") || IPLOGS_DEFAULT_BASE_URL;
}

export function iplogsTtlHours(): number {
  return envPositiveInt("IPLOGS_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function iplogsTimeoutMs(): number {
  return envPositiveInt("IPLOGS_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function iplogsDailyLimit(): number {
  return envPositiveInt("IPLOGS_DAILY_LIMIT", IPLOGS_DEFAULT_DAILY_LIMIT);
}

export function ipapiisApiKey(): string {
  return envTrimmed("IPAPIIS_API_KEY");
}

export function ipapiisEnabled(): boolean {
  return Boolean(ipapiisApiKey()) && envFlag("IPAPIIS_ENABLED");
}

export function ipapiisBaseUrl(): string {
  return envTrimmed("IPAPIIS_BASE_URL") || IPAPIIS_DEFAULT_BASE_URL;
}

export function ipapiisTtlHours(): number {
  return envPositiveInt("IPAPIIS_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function ipapiisTimeoutMs(): number {
  return envPositiveInt("IPAPIIS_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function ipapiisDailyLimit(): number {
  return envPositiveInt("IPAPIIS_DAILY_LIMIT", IPAPIIS_FREE_DAILY_LIMIT);
}

export function iphubApiKey(): string {
  return envTrimmed("IPHUB_API_KEY");
}

export function iphubEnabled(): boolean {
  return Boolean(iphubApiKey()) && envFlag("IPHUB_ENABLED");
}

export function iphubBaseUrl(): string {
  return envTrimmed("IPHUB_BASE_URL") || IPHUB_DEFAULT_BASE_URL;
}

export function iphubTtlHours(): number {
  return envPositiveInt("IPHUB_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function iphubTimeoutMs(): number {
  return envPositiveInt("IPHUB_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function iphubDailyLimit(): number {
  return envPositiveInt("IPHUB_DAILY_LIMIT", IPHUB_FREE_DAILY_LIMIT);
}

export function ipqsApiKey(): string {
  return envTrimmed("IPQS_API_KEY");
}

export function ipqsEnabled(): boolean {
  return Boolean(ipqsApiKey()) && envFlag("IPQS_ENABLED");
}

export function ipqsBaseUrl(): string {
  return envTrimmed("IPQS_BASE_URL") || IPQS_DEFAULT_BASE_URL;
}

export function ipqsStrictness(): number {
  return Math.min(3, envPositiveInt("IPQS_STRICTNESS", IPQS_DEFAULT_STRICTNESS));
}

export function ipqsTtlHours(): number {
  return envPositiveInt("IPQS_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function ipqsTimeoutMs(): number {
  return envPositiveInt("IPQS_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function ipqsDailyLimit(): number {
  return envPositiveInt("IPQS_DAILY_LIMIT", IPQS_DEFAULT_DAILY_LIMIT);
}

export function vpnblockerApiKey(): string {
  return envTrimmed("VPNBLOCKER_API_KEY");
}

/** Free package works without a key; optional X-API-KEY upgrades package. */
export function vpnblockerEnabled(): boolean {
  return envFlag("VPNBLOCKER_ENABLED");
}

export function vpnblockerBaseUrl(): string {
  return envTrimmed("VPNBLOCKER_BASE_URL") || VPNBLOCKER_DEFAULT_BASE_URL;
}

export function vpnblockerTtlHours(): number {
  return envPositiveInt("VPNBLOCKER_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function vpnblockerTimeoutMs(): number {
  return envPositiveInt("VPNBLOCKER_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function vpnblockerDailyLimit(): number {
  return envPositiveInt("VPNBLOCKER_DAILY_LIMIT", VPNBLOCKER_DEFAULT_DAILY_LIMIT);
}

export function abstractapiApiKey(): string {
  return envTrimmed("ABSTRACTAPI_API_KEY");
}

export function abstractapiEnabled(): boolean {
  return Boolean(abstractapiApiKey()) && envFlag("ABSTRACTAPI_ENABLED");
}

export function abstractapiBaseUrl(): string {
  return envTrimmed("ABSTRACTAPI_BASE_URL") || ABSTRACTAPI_DEFAULT_BASE_URL;
}

export function abstractapiTtlHours(): number {
  return envPositiveInt("ABSTRACTAPI_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}

export function abstractapiTimeoutMs(): number {
  return envPositiveInt("ABSTRACTAPI_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}

export function abstractapiDailyLimit(): number {
  return envPositiveInt("ABSTRACTAPI_DAILY_LIMIT", ABSTRACTAPI_DEFAULT_DAILY_LIMIT);
}

export function intelCacheTtlHours(): number {
  return Number(process.env.IP_INTEL_CACHE_TTL_HOURS || 0);
}

export function intelSuccessTtlDays(): number {
  const hours = intelCacheTtlHours();
  if (hours > 0) return hours / 24;
  return envPositiveInt("IP_INTEL_SUCCESS_TTL_DAYS", 14);
}

export function intelErrorTtlHours(): number {
  return envPositiveInt("IP_INTEL_ERROR_TTL_HOURS", 12);
}

export function intelDnsTimeoutMs(): number {
  return envPositiveInt("IP_INTEL_DNS_TIMEOUT_MS", 1200);
}

export function intelAsnTimeoutMs(): number {
  return envPositiveInt("IP_INTEL_ASN_TIMEOUT_MS", 1500);
}

export function intelReverseDnsEnabled(): boolean {
  return envFlag("IP_INTEL_REVERSE_DNS_ENABLED");
}

/** Login/register reject VPN, proxy, Tor, relay, and Cloudflare WARP. Default on. */
export function authBlockVpnProxy(): boolean {
  return envFlag("AUTH_BLOCK_VPN_PROXY", "true");
}

/** Consensus floor for proxyDetected merge when multiple providers answered. */
export function ipIntelProxyMinHits(): number {
  return envPositiveInt("IP_INTEL_PROXY_MIN_HITS", IP_INTEL_PROXY_MIN_HITS_DEFAULT);
}
