/**
 * Guarda de regressão do item 96 (pentest social, achados A7/A8) — lógica pura, SEM banco.
 *  - A7: extractYoutubeId aceitava host arbitrário (regex sem âncora) e a videoUrl CRUA ia pro
 *        <a href> do feed público com a thumb legítima do YouTube ao lado.
 *  - A8: channelPhoto era string arbitrária num <img src> público (pixel de rastreio).
 */
import test from "node:test";
import assert from "node:assert/strict";

const social = await import("../../server/modules/social/social.errors.ts");
const socialService = await import("../../server/modules/social/social.service.ts");

// ─── A7: host do vídeo precisa ser mesmo do YouTube ────────────────────────

test("A7: URL de phishing carregando 'youtube.com/watch?v=' no query string é rejeitada", () => {
  assert.equal(
    social.extractYoutubeId("https://phishing.example/?x=youtube.com/watch?v=dQw4w9WgXcQ"),
    null,
  );
  assert.equal(social.extractYoutubeId("https://evil.com/youtu.be/dQw4w9WgXcQ"), null);
});

test("A7: protocolo não-http é rejeitado", () => {
  assert.equal(social.extractYoutubeId("javascript:x//youtu.be/dQw4w9WgXcQ"), null);
  assert.equal(social.extractYoutubeId("data:text/html,youtu.be/dQw4w9WgXcQ"), null);
  assert.equal(social.extractYoutubeId("não é uma url"), null);
});

test("A7: URLs legítimas continuam sendo aceitas", () => {
  assert.equal(social.extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(social.extractYoutubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30"), "dQw4w9WgXcQ");
  assert.equal(social.extractYoutubeId("https://youtu.be/dQw4w9WgXcQ?si=abc"), "dQw4w9WgXcQ");
  assert.equal(social.extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(social.extractYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("A7: canonicalYoutubeUrl deriva a URL só do id validado", () => {
  assert.equal(social.canonicalYoutubeUrl("dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
});

// ─── A8: allowlist de origem da foto do canal ──────────────────────────────

test("A8: channelPhoto de host externo (pixel de rastreio) é rejeitada", () => {
  assert.equal(socialService.validateChannelPhoto("https://tracker.evil.com/px.gif").ok, false);
  assert.equal(socialService.validateChannelPhoto("http://i.ytimg.com/foo.jpg").ok, false);
  assert.equal(socialService.validateChannelPhoto("javascript:alert(1)").ok, false);
  // protocol-relative NÃO é caminho local
  assert.equal(socialService.validateChannelPhoto("//tracker.evil.com/px.gif").ok, false);
});

test("A8: upload próprio e CDN de avatar do YouTube são aceitos", () => {
  assert.deepEqual(socialService.validateChannelPhoto("/media/social/yt_123.webp"), {
    ok: true,
    value: "/media/social/yt_123.webp",
  });
  assert.deepEqual(socialService.validateChannelPhoto("https://yt3.ggpht.com/abc=s88"), {
    ok: true,
    value: "https://yt3.ggpht.com/abc=s88",
  });
});

test("A8: undefined = não mexe no campo; vazio = limpa", () => {
  assert.deepEqual(socialService.validateChannelPhoto(undefined), { ok: true, value: undefined });
  assert.deepEqual(socialService.validateChannelPhoto("   "), { ok: true, value: null });
  assert.deepEqual(socialService.validateChannelPhoto(null), { ok: true, value: null });
});

// ─── A7/A8: linhas antigas são saneadas na leitura do feed ─────────────────

test("A7/A8: sanitizeFeedEntry neutraliza linha antiga com videoUrl crua e foto externa", () => {
  const sanitized = socialService.sanitizeFeedEntry({
    id: 1,
    videoId: "dQw4w9WgXcQ",
    videoUrl: "https://phishing.example/?x=youtube.com/watch?v=dQw4w9WgXcQ",
    profile: { channelName: "Fulano", channelPhoto: "https://tracker.evil.com/px.gif" },
  });
  assert.equal(sanitized.videoUrl, "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(sanitized.profile.channelPhoto, null);
  assert.equal(sanitized.profile.channelName, "Fulano");
});
