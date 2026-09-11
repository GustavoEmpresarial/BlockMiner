export const SOCIAL_ERROR = {
    MEDIA_UPLOAD_NOT_PORTED: "MEDIA_UPLOAD_NOT_PORTED",
};
// item 96 (pentest A7): `extractYoutubeId` usava um regex SEM âncora e SEM validar o host —
// `https://phishing.example/?x=youtube.com/watch?v=dQw4w9WgXcQ` casava, o id saía correto e a
// videoUrl CRUA era persistida. No feed público o card renderizava a thumb legítima do
// img.youtube.com enquanto o <a href> levava pro domínio do atacante. Agora o parse passa
// obrigatoriamente por `new URL` + allowlist de host, e o consumidor persiste a URL canônica
// (canonicalYoutubeUrl) em vez de texto controlado pelo creator.
const ALLOWED_VIDEO_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
]);
/** Ids do YouTube são sempre 11 chars do alfabeto base64url. */
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
/** Caminhos de player que carregam o id no primeiro segmento (`/embed/ID`, `/shorts/ID`, ...). */
const PATH_VIDEO_RE = /^\/(?:embed|shorts|v|live)\/([^/?#]+)/;
/**
 * Extract YouTube video id from common watch/embed/shorts/youtu.be URLs.
 * Só aceita URLs http(s) hospedadas em domínio do YouTube — ver item 96 acima.
 */
export function extractYoutubeId(url) {
    let parsed;
    try {
        parsed = new URL(String(url).trim());
    }
    catch {
        return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        return null;
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_VIDEO_HOSTS.has(host))
        return null;
    let candidate = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
        candidate = parsed.pathname.slice(1).split("/")[0] ?? null;
    }
    else if (parsed.pathname === "/watch") {
        candidate = parsed.searchParams.get("v");
    }
    else {
        candidate = parsed.pathname.match(PATH_VIDEO_RE)?.[1] ?? null;
    }
    return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
}
/**
 * URL canônica derivada só do id já validado — é ISSO que vai pro banco/feed público,
 * nunca a string enviada pelo creator (item 96, pentest A7).
 */
export function canonicalYoutubeUrl(videoId) {
    return `https://youtu.be/${videoId}`;
}
export function isYoutubeUrl(url) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}
