import test from "node:test";
import assert from "node:assert/strict";

const { hostMatchesIframeAllowlist, expandCspFrameSrcHostSources, validateIframeUrl } = await import(
  "../../server/modules/internal-offerwall/internal-offerwall.iframe-validate.ts"
);
const { validateFrameHostnameForStorage } = await import(
  "../../server/modules/internal-offerwall/internal-offerwall.iframe-allowlist.ts"
);

// ─── 1. Correspondência de Allowlist de Iframe ──────────────────────────────

test("hostMatchesIframeAllowlist: identifica domínios exatos e subdomínios válidos", () => {
  const allowlist = new Set(["zerads.com", "blockminer.space"]);

  assert.equal(hostMatchesIframeAllowlist("zerads.com", allowlist), true);
  assert.equal(hostMatchesIframeAllowlist("ads.zerads.com", allowlist), true);
  assert.equal(hostMatchesIframeAllowlist("sub.portal.blockminer.space", allowlist), true);

  // Não deve coincidir com extensões ou nomes parecidos
  assert.equal(hostMatchesIframeAllowlist("evilzerads.com", allowlist), false);
  assert.equal(hostMatchesIframeAllowlist("zerads.com.attacker.com", allowlist), false);
  assert.equal(hostMatchesIframeAllowlist("google.com", allowlist), false);
});

// ─── 2. Expansão de Fontes para Cabeçalho CSP ────────────────────────────────

test("expandCspFrameSrcHostSources: gera diretivas https:// e https://*. para cada host", () => {
  const hosts = ["zerads.com", "youtube.com"];
  const expanded = expandCspFrameSrcHostSources(hosts);

  assert.ok(expanded.includes("https://zerads.com"));
  assert.ok(expanded.includes("https://*.zerads.com"));
  assert.ok(expanded.includes("https://youtube.com"));
  assert.ok(expanded.includes("https://*.youtube.com"));
});

test("expandCspFrameSrcHostSources: descarta portas ou caracteres maliciosos", () => {
  const hosts = ["zerads.com:8080", "validhost.org"];
  const expanded = expandCspFrameSrcHostSources(hosts);

  assert.equal(expanded.some((h) => h.includes(":8080")), false);
  assert.ok(expanded.includes("https://validhost.org"));
});

// ─── 3. Validação de URL de Iframe (Anti-SSRF & Esquemas) ────────────────────

test("validateIframeUrl: exige protocolo https:// em produção", () => {
  const allowed = new Set(["zerads.com"]);
  const resHttp = validateIframeUrl("http://zerads.com/ad", { allowHttp: false, allowedHosts: allowed });
  assert.equal(resHttp.ok, false);
  assert.equal(resHttp.code, "IFRAME_URL_SCHEME");

  const resHttps = validateIframeUrl("https://zerads.com/ad", { allowHttp: false, allowedHosts: allowed });
  assert.equal(resHttps.ok, true);
});

test("validateIframeUrl: rejeita localhost ou esquemas javascript:", () => {
  const allowed = new Set(["zerads.com", "localhost"]);
  const resLocal = validateIframeUrl("https://localhost/ad", { allowHttp: false, allowedHosts: allowed });
  assert.equal(resLocal.ok, false);
  assert.equal(resLocal.code, "IFRAME_URL_HOST");

  const resJs = validateIframeUrl("javascript:alert(1)", { allowHttp: false, allowedHosts: allowed });
  assert.equal(resJs.ok, false);
});

test("validateIframeUrl: rejeita host fora da allowlist", () => {
  const allowed = new Set(["zerads.com"]);
  const res = validateIframeUrl("https://unauthorized-domain.com/ad", { allowHttp: false, allowedHosts: allowed });
  assert.equal(res.ok, false);
  assert.equal(res.code, "IFRAME_URL_NOT_ALLOWED");
  assert.equal(res.host, "unauthorized-domain.com");
});

// ─── 4. Validação de Hostnames para Armazenamento ────────────────────────────

test("validateFrameHostnameForStorage: bloqueia endereços IP literais e nomes inválidos", () => {
  const resIp = validateFrameHostnameForStorage("192.168.1.1");
  assert.equal(resIp.ok, false);
  assert.ok(resIp.message.includes("IP addresses"));

  const resLocal = validateFrameHostnameForStorage("localhost");
  assert.equal(resLocal.ok, false);

  const resValid = validateFrameHostnameForStorage("ads.partner-network.com");
  assert.equal(resValid.ok, true);
  assert.equal(resValid.hostname, "ads.partner-network.com");
});
