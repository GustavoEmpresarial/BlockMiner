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
export const PROXY_TYPE_PRIORITY = ["tor", "vpn", "proxy", "relay"];
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
function envFlag(name, fallback = "false") {
    return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? fallback).trim());
}
function envPositiveInt(name, fallback) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw <= 0)
        return fallback;
    return Math.floor(raw);
}
function envTrimmed(name) {
    return String(process.env[name] || "").trim();
}
function envUnitInterval(name, fallback) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw < 0 || raw > 1)
        return fallback;
    return raw;
}
export function proxycheckApiKey() {
    return envTrimmed("PROXYCHECK_API_KEY");
}
export function proxycheckEnabled() {
    return Boolean(proxycheckApiKey()) && envFlag("PROXYCHECK_ENABLED");
}
export function proxycheckTtlHours() {
    return envPositiveInt("PROXYCHECK_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function proxycheckTimeoutMs() {
    return envPositiveInt("PROXYCHECK_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function proxycheckDailyLimit() {
    return envPositiveInt("PROXYCHECK_DAILY_LIMIT", PROXYCHECK_DEFAULT_DAILY_LIMIT);
}
export function vpnapiApiKey() {
    return envTrimmed("VPNAPI_API_KEY");
}
export function vpnapiEnabled() {
    return Boolean(vpnapiApiKey()) && envFlag("VPNAPI_ENABLED");
}
export function vpnapiBaseUrl() {
    return envTrimmed("VPNAPI_BASE_URL") || VPNAPI_DEFAULT_BASE_URL;
}
export function vpnapiTtlHours() {
    return envPositiveInt("VPNAPI_TTL_HOURS", proxycheckTtlHours());
}
export function vpnapiTimeoutMs() {
    return envPositiveInt("VPNAPI_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
/** VPNAPI.io free tier: 1000 requests/day, reset 00:00 UTC. */
export function vpnapiDailyLimit() {
    return envPositiveInt("VPNAPI_DAILY_LIMIT", VPNAPI_FREE_DAILY_LIMIT);
}
/** GetIPIntel — contact email required by provider ToS. */
export function getipintelContactEmail() {
    return envTrimmed("GETIPINTEL_CONTACT_EMAIL");
}
export function getipintelEnabled() {
    return Boolean(getipintelContactEmail()) && envFlag("GETIPINTEL_ENABLED");
}
export function getipintelFlags() {
    return envTrimmed("GETIPINTEL_FLAGS") || GETIPINTEL_DEFAULT_FLAGS;
}
export function getipintelBlockScore() {
    return envUnitInterval("GETIPINTEL_BLOCK_SCORE", GETIPINTEL_DEFAULT_BLOCK_SCORE);
}
export function getipintelTtlHours() {
    return envPositiveInt("GETIPINTEL_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function getipintelTimeoutMs() {
    return envPositiveInt("GETIPINTEL_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function getipintelDailyLimit() {
    return envPositiveInt("GETIPINTEL_DAILY_LIMIT", GETIPINTEL_FREE_DAILY_LIMIT);
}
export function iplogsEnabled() {
    return envFlag("IPLOGS_ENABLED");
}
export function iplogsBaseUrl() {
    return envTrimmed("IPLOGS_BASE_URL") || IPLOGS_DEFAULT_BASE_URL;
}
export function iplogsTtlHours() {
    return envPositiveInt("IPLOGS_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function iplogsTimeoutMs() {
    return envPositiveInt("IPLOGS_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function iplogsDailyLimit() {
    return envPositiveInt("IPLOGS_DAILY_LIMIT", IPLOGS_DEFAULT_DAILY_LIMIT);
}
export function ipapiisApiKey() {
    return envTrimmed("IPAPIIS_API_KEY");
}
export function ipapiisEnabled() {
    return Boolean(ipapiisApiKey()) && envFlag("IPAPIIS_ENABLED");
}
export function ipapiisBaseUrl() {
    return envTrimmed("IPAPIIS_BASE_URL") || IPAPIIS_DEFAULT_BASE_URL;
}
export function ipapiisTtlHours() {
    return envPositiveInt("IPAPIIS_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function ipapiisTimeoutMs() {
    return envPositiveInt("IPAPIIS_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function ipapiisDailyLimit() {
    return envPositiveInt("IPAPIIS_DAILY_LIMIT", IPAPIIS_FREE_DAILY_LIMIT);
}
export function iphubApiKey() {
    return envTrimmed("IPHUB_API_KEY");
}
export function iphubEnabled() {
    return Boolean(iphubApiKey()) && envFlag("IPHUB_ENABLED");
}
export function iphubBaseUrl() {
    return envTrimmed("IPHUB_BASE_URL") || IPHUB_DEFAULT_BASE_URL;
}
export function iphubTtlHours() {
    return envPositiveInt("IPHUB_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function iphubTimeoutMs() {
    return envPositiveInt("IPHUB_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function iphubDailyLimit() {
    return envPositiveInt("IPHUB_DAILY_LIMIT", IPHUB_FREE_DAILY_LIMIT);
}
export function ipqsApiKey() {
    return envTrimmed("IPQS_API_KEY");
}
export function ipqsEnabled() {
    return Boolean(ipqsApiKey()) && envFlag("IPQS_ENABLED");
}
export function ipqsBaseUrl() {
    return envTrimmed("IPQS_BASE_URL") || IPQS_DEFAULT_BASE_URL;
}
export function ipqsStrictness() {
    return Math.min(3, envPositiveInt("IPQS_STRICTNESS", IPQS_DEFAULT_STRICTNESS));
}
export function ipqsTtlHours() {
    return envPositiveInt("IPQS_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function ipqsTimeoutMs() {
    return envPositiveInt("IPQS_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function ipqsDailyLimit() {
    return envPositiveInt("IPQS_DAILY_LIMIT", IPQS_DEFAULT_DAILY_LIMIT);
}
export function vpnblockerApiKey() {
    return envTrimmed("VPNBLOCKER_API_KEY");
}
/** Free package works without a key; optional X-API-KEY upgrades package. */
export function vpnblockerEnabled() {
    return envFlag("VPNBLOCKER_ENABLED");
}
export function vpnblockerBaseUrl() {
    return envTrimmed("VPNBLOCKER_BASE_URL") || VPNBLOCKER_DEFAULT_BASE_URL;
}
export function vpnblockerTtlHours() {
    return envPositiveInt("VPNBLOCKER_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function vpnblockerTimeoutMs() {
    return envPositiveInt("VPNBLOCKER_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function vpnblockerDailyLimit() {
    return envPositiveInt("VPNBLOCKER_DAILY_LIMIT", VPNBLOCKER_DEFAULT_DAILY_LIMIT);
}
export function abstractapiApiKey() {
    return envTrimmed("ABSTRACTAPI_API_KEY");
}
export function abstractapiEnabled() {
    return Boolean(abstractapiApiKey()) && envFlag("ABSTRACTAPI_ENABLED");
}
export function abstractapiBaseUrl() {
    return envTrimmed("ABSTRACTAPI_BASE_URL") || ABSTRACTAPI_DEFAULT_BASE_URL;
}
export function abstractapiTtlHours() {
    return envPositiveInt("ABSTRACTAPI_TTL_HOURS", DEFAULT_PROVIDER_TTL_HOURS);
}
export function abstractapiTimeoutMs() {
    return envPositiveInt("ABSTRACTAPI_TIMEOUT_MS", DEFAULT_PROVIDER_TIMEOUT_MS);
}
export function abstractapiDailyLimit() {
    return envPositiveInt("ABSTRACTAPI_DAILY_LIMIT", ABSTRACTAPI_DEFAULT_DAILY_LIMIT);
}
export function intelCacheTtlHours() {
    return Number(process.env.IP_INTEL_CACHE_TTL_HOURS || 0);
}
export function intelSuccessTtlDays() {
    const hours = intelCacheTtlHours();
    if (hours > 0)
        return hours / 24;
    return envPositiveInt("IP_INTEL_SUCCESS_TTL_DAYS", 14);
}
export function intelErrorTtlHours() {
    return envPositiveInt("IP_INTEL_ERROR_TTL_HOURS", 12);
}
export function intelDnsTimeoutMs() {
    return envPositiveInt("IP_INTEL_DNS_TIMEOUT_MS", 1200);
}
export function intelAsnTimeoutMs() {
    return envPositiveInt("IP_INTEL_ASN_TIMEOUT_MS", 1500);
}
export function intelReverseDnsEnabled() {
    return envFlag("IP_INTEL_REVERSE_DNS_ENABLED");
}
/** Login/register reject VPN, proxy, Tor, relay, and Cloudflare WARP. Default on. */
export function authBlockVpnProxy() {
    return envFlag("AUTH_BLOCK_VPN_PROXY", "true");
}
/** Consensus floor for proxyDetected merge when multiple providers answered. */
export function ipIntelProxyMinHits() {
    return envPositiveInt("IP_INTEL_PROXY_MIN_HITS", IP_INTEL_PROXY_MIN_HITS_DEFAULT);
}
