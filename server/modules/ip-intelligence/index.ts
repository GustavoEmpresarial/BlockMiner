/**
 * Public boundary of the ip-intelligence module. Other modules must import ONLY from here.
 *
 * Free/freemium proxy providers are registered in ip-intelligence.providers.ts.
 * Each degrades to provider_not_configured with no network call when its key/flag is off.
 * Daily budgets reset 00:00 UTC. Lookups run in parallel; merge is OR (any true wins).
 */
export {
  normalizeIp,
  isIpInCidr,
  isInfrastructureIp,
  isTrustedProxyAddress,
  resolveClientIp,
  getClientIpFromResolver,
  deriveDefaultNetworkCidr,
} from "./ip-address.js";
export {
  getCachedIpIntelligence,
  lookupProxycheck,
  lookupVpnapi,
  lookupGetipintel,
  lookupIplogs,
  lookupIpapiis,
  lookupIphub,
  lookupIpqs,
  lookupVpnblocker,
  lookupAbstractapi,
  lookupAsn,
  proxycheckEnabled,
  vpnapiEnabled,
  getipintelEnabled,
  iplogsEnabled,
  ipapiisEnabled,
  iphubEnabled,
  ipqsEnabled,
  vpnblockerEnabled,
  abstractapiEnabled,
} from "./ip-intelligence.service.js";
export { parseVpnapiResponse } from "./ip-intelligence.vpnapi.js";
export { parseGetipintelResponse } from "./ip-intelligence.getipintel.js";
export { parseIplogsResponse } from "./ip-intelligence.iplogs.js";
export { parseIpapiisResponse } from "./ip-intelligence.ipapiis.js";
export { parseIphubResponse } from "./ip-intelligence.iphub.js";
export { parseIpqsResponse } from "./ip-intelligence.ipqs.js";
export { parseVpnblockerResponse } from "./ip-intelligence.vpnblocker.js";
export { parseAbstractapiResponse } from "./ip-intelligence.abstractapi.js";
export { mergeProxyLookups, listEnabledProxyProviders, PROXY_PROVIDERS } from "./ip-intelligence.providers.js";
export { evaluateAnonymousIp } from "./ip-intelligence.policy.js";
export { authBlockVpnProxy, CLOUDFLARE_WARP_ASN } from "./ip-intelligence.config.js";
export { ipIntelligenceAdminRouter } from "./ip-intelligence.routes.js";
export { IP_INTEL_ERROR, type IpIntelErrorCode } from "./ip-intelligence.errors.js";
export type {
  ClientIpSource,
  ResolvedClientIp,
  IpIntelligenceRequestLike,
  IpIntelligenceResult,
} from "./ip-intelligence.types.js";
