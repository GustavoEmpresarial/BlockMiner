// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
import * as partnerGamesRepo from "./partner-games.repository.js";
import * as sessionSvc from "./partner-games.service.js";
import { PARTNER_GAMES_ERROR } from "./partner-games.errors.js";
const log = logger.child("partner-games.controller");
/** Public listing of partner games. Returns visible games + vote totals + viewer's own vote. */
export async function listPartnerGamesPublic(req, res) {
    const viewerId = req.user?.id ?? null;
    const games = await partnerGamesRepo.listVisiblePartnerGames();
    const ids = games.map((g) => g.id);
    const voteAgg = ids.length ? await partnerGamesRepo.groupVoteCountsForGames(ids) : [];
    const countsByGame = new Map();
    for (const id of ids)
        countsByGame.set(id, { likes: 0, dislikes: 0 });
    for (const row of voteAgg) {
        const bucket = countsByGame.get(row.partnerGameId);
        if (!bucket)
            continue;
        if (row.value === 1)
            bucket.likes = row._count._all;
        else if (row.value === -1)
            bucket.dislikes = row._count._all;
    }
    let myVotes = new Map();
    if (viewerId && ids.length) {
        const rows = await partnerGamesRepo.listUserVotesForGames(viewerId, ids);
        myVotes = new Map(rows.map((r) => [r.partnerGameId, r.value]));
    }
    const enriched = games.map((g) => {
        const counts = countsByGame.get(g.id) ?? { likes: 0, dislikes: 0 };
        return { ...g, likeCount: counts.likes, dislikeCount: counts.dislikes, myVote: myVotes.get(g.id) ?? 0 };
    });
    res.json({ ok: true, games: enriched });
}
export async function getPartnerGameBySlugPublic(req, res) {
    const slug = String(req.params.slug ?? "").trim();
    if (!slug) {
        res.status(400).json({ ok: false, message: "slug inválido." });
        return;
    }
    const game = await sessionSvc.getPartnerGameBySlug(slug);
    if (!game) {
        res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
        return;
    }
    res.json({ ok: true, game });
}
export async function startPartnerGameSessionHandler(req, res) {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ ok: false });
        return;
    }
    const slug = String(req.body?.slug ?? "").trim();
    if (!slug) {
        res.status(400).json({ ok: false, message: "slug é obrigatório." });
        return;
    }
    try {
        const result = await sessionSvc.startPartnerGameSession(userId, slug);
        res.json({ ok: true, ...result });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === PARTNER_GAMES_ERROR.PARTNER_GAME_NOT_FOUND) {
            res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
            return;
        }
        log.warn("session_start_failed", { userId, slug, err: msg });
        res.status(500).json({ ok: false, message: "Não foi possível iniciar a sessão." });
    }
}
export async function heartbeatPartnerGameSessionHandler(req, res) {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ ok: false });
        return;
    }
    const sessionId = String(req.params.sessionId ?? "");
    const body = (req.body ?? {});
    const active = body.active !== false;
    const iframeLoaded = body.iframeLoaded !== false;
    const playSurfaceReady = body.playSurfaceReady !== undefined ? body.playSurfaceReady !== false : iframeLoaded;
    try {
        const session = await sessionSvc.heartbeatPartnerGameSession(userId, sessionId, { active, iframeLoaded, playSurfaceReady });
        res.json({ ok: true, session });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === PARTNER_GAMES_ERROR.SESSION_NOT_FOUND) {
            res.status(404).json({ ok: false, message: "Sessão não encontrada." });
            return;
        }
        if (msg === PARTNER_GAMES_ERROR.SESSION_ENDED) {
            res.status(409).json({ ok: false, message: "Sessão encerrada." });
            return;
        }
        res.status(500).json({ ok: false, message: "Heartbeat falhou." });
    }
}
export async function endPartnerGameSessionHandler(req, res) {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ ok: false });
        return;
    }
    const sessionId = String(req.params.sessionId ?? "");
    const reason = String(req.body?.reason ?? "user_left");
    await sessionSvc.endPartnerGameSession(userId, sessionId, reason);
    res.json({ ok: true });
}
export async function getPartnerGameSessionStatsHandler(req, res) {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ ok: false });
        return;
    }
    const slug = String(req.params.slug ?? "").trim();
    try {
        const stats = await sessionSvc.getPartnerGameSessionStats(userId, slug);
        res.json({ ok: true, ...stats });
    }
    catch {
        res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
    }
}
/**
 * Vote on a partner game (like / dislike / remove). Toggle semantics:
 *  - value 1 or -1 with no existing vote → creates the vote
 *  - same value resent → toggle off
 *  - opposite value → updates
 *  - value 0 → removes any existing vote
 */
export async function votePartnerGame(req, res) {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ ok: false });
        return;
    }
    const partnerGameId = parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isInteger(partnerGameId) || partnerGameId <= 0) {
        res.status(400).json({ ok: false, message: "partnerGameId inválido." });
        return;
    }
    const value = Number(req.body?.value);
    if (![1, -1, 0].includes(value)) {
        res.status(400).json({ ok: false, message: "value deve ser 1, -1 ou 0." });
        return;
    }
    const game = await partnerGamesRepo.findVisiblePartnerGameById(partnerGameId);
    if (!game || !game.isVisible) {
        res.status(404).json({ ok: false, message: "Jogo parceiro não disponível." });
        return;
    }
    const existing = await partnerGamesRepo.findVote(userId, partnerGameId);
    let myVote = 0;
    if (value === 0) {
        if (existing)
            await partnerGamesRepo.deleteVote(existing.id);
        myVote = 0;
    }
    else if (!existing) {
        await partnerGamesRepo.createVote(userId, partnerGameId, value);
        myVote = value;
    }
    else if (existing.value === value) {
        await partnerGamesRepo.deleteVote(existing.id);
        myVote = 0;
    }
    else {
        await partnerGamesRepo.updateVote(existing.id, value);
        myVote = value;
    }
    const counts = await partnerGamesRepo.groupVoteCountsForGame(partnerGameId);
    let likeCount = 0;
    let dislikeCount = 0;
    for (const c of counts) {
        if (c.value === 1)
            likeCount = c._count._all;
        else if (c.value === -1)
            dislikeCount = c._count._all;
    }
    log.info("voted", { userId, partnerGameId, value: myVote });
    res.json({ ok: true, partnerGameId, likeCount, dislikeCount, myVote });
}
const PROXY_ALLOWED_HOSTS = new Set(["blockminer.space"]);
/**
 * GET /api/partner-games/proxy-image?url=<encoded_https_url>
 * Deviation from legacy: legacy checks the shared internal-offerwall iframe-host
 * allowlist (dynamic, DB-backed). Reusing that here read-only via a lazy import
 * to avoid a static cross-module dependency in this hot path.
 */
export async function proxyPartnerGameImage(req, res) {
    const raw = typeof req.query.url === "string" ? req.query.url.trim() : "";
    if (!raw || raw.length > 2048) {
        res.status(400).json({ ok: false, message: "url required (max 2048 chars)" });
        return;
    }
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        res.status(400).json({ ok: false, message: "Invalid URL" });
        return;
    }
    if (parsed.protocol !== "https:") {
        res.status(400).json({ ok: false, message: "Only HTTPS URLs allowed" });
        return;
    }
    const hostname = parsed.hostname.toLowerCase();
    const { getIframeHostAllowlistCachedSync } = await import("../internal-offerwall/internal-offerwall.iframe-allowlist.js");
    const allowlist = getIframeHostAllowlistCachedSync();
    if (!allowlist.has(hostname) && !PROXY_ALLOWED_HOSTS.has(hostname)) {
        res.status(403).json({ ok: false, message: "Domain not in partner allowlist" });
        return;
    }
    const PROXY_MAX_BYTES = 5 * 1024 * 1024;
    const PROXY_TIMEOUT_MS = 10_000;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
        const upstream = await fetch(parsed.toString(), {
            signal: controller.signal,
            headers: { "User-Agent": "BlockMiner-ImageProxy/1.0" },
            redirect: "follow",
        });
        clearTimeout(timer);
        if (!upstream.ok) {
            res.status(502).json({ ok: false, message: "Upstream error" });
            return;
        }
        const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
        if (!contentType.startsWith("image/")) {
            res.status(400).json({ ok: false, message: "Upstream did not return an image" });
            return;
        }
        const buffer = await upstream.arrayBuffer();
        if (buffer.byteLength > PROXY_MAX_BYTES) {
            res.status(413).json({ ok: false, message: "Image too large (max 5MB)" });
            return;
        }
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
        res.setHeader("Content-Length", String(buffer.byteLength));
        res.end(Buffer.from(buffer));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "fetch failed";
        log.warn("proxy_image_failed", { hostname, message: msg });
        res.status(502).json({ ok: false, message: "Failed to fetch image" });
    }
}
