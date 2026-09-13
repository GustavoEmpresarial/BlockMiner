// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache. It's the
// app entry point (node dist/server/bootstrap/server.js) so nothing in server/ imports it —
// it was invisible to the earlier import-graph-based recovery pass.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Fase 1 process entrypoint — Express app wiring auth/session/users/admin
 * routes only. No mining engine, sockets, cron or workers yet (Fase 2+).
 */
import "dotenv/config";
import http from "node:http";
import express from "express";
import { setupHttpStack } from "../core/http/setupHttpStack.js";
import { reportError } from "../core/errors/index.js";
import { attachSocketIO } from "../core/socket/index.js";
import { mediaAdminRouter, mediaRootDir, MEDIA_PUBLIC_PREFIX, seedBundledMedia, projectRoot, createMediaStaticHeadersMiddleware } from "../modules/media/index.js";
import { resolveClientDistPaths, attachClientDistStatic, attachSpaFallback, renderSpaIndex, } from "../shared/http/spaStatic.js";
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";
import { shutdownRedis } from "../core/redis/index.js";
import { authRouter, authAdminRouter } from "../modules/auth/index.js";
import { sessionRouter } from "../modules/session/index.js";
import { userRouter, usersAdminRouter } from "../modules/users/index.js";
import { adminRouter, bootstrapAdminUsers } from "../modules/admin/index.js";
import { walletRouter, walletAdminRouter, vaultRouter } from "../modules/wallet/index.js";
import { swapRouter } from "../modules/swap/index.js";
import { transparencyRouter, transparencyAdminRouter } from "../modules/transparency/index.js";
import { miningRouter, miningAdminRouter, bootstrapEngine } from "../modules/mining/index.js";
import { machinesRouter, machinesAdminRouter, racksRouter, minersAdminRouter } from "../modules/machines/index.js";
import { energyTaxRouter } from "../modules/energy-tax/index.js";
import { boostsRouter } from "../modules/boosts/index.js";
import { autoMiningRouter, autoMiningAdminRouter } from "../modules/auto-mining/index.js";
import { inventoryRouter } from "../modules/inventory/index.js";
import { shopRouter } from "../modules/shop/index.js";
import { gamesRouter } from "../modules/games/index.js";
import { checkinRouter, checkinAdminRouter } from "../modules/checkin/index.js";
import { tasksRouter, tasksAdminRouter } from "../modules/tasks/index.js";
import { faucetRouter, faucetAdminRouter } from "../modules/faucet/index.js";
import { readEarnRouter, readEarnAdminRouter } from "../modules/read-earn/index.js";
import { youtubeRouter } from "../modules/youtube/index.js";
import { partnerGamesRouter, partnerGamesAdminRouter } from "../modules/partner-games/index.js";
import { trafficRouter, trafficAdminRouter, clientErrorsAdminRouter } from "../modules/traffic/index.js";
import { shortlinksRouter } from "../modules/shortlinks/index.js";
import { ptcRouter, ptcAdminRouter } from "../modules/ptc/index.js";
import { bmCaptchaRouter } from "../modules/bm-captcha/index.js";
import { moneyRainRouter } from "../modules/moneyrain/index.js";
import { offerwallAdminRouter } from "../modules/offerwall/index.js";
import { offerwallMeRouter } from "../modules/offerwallme/index.js";
import { multiwallRouter } from "../modules/multiwall/index.js";
import { offerwallGgRouter } from "../modules/offerwallgg/index.js";
import { internalOfferwallRouter, internalOfferwallAdminRouter, applyInternalOfferwallStandardBlkReward } from "../modules/internal-offerwall/index.js";
import { zeradsRouter, zeradsCallbackHandler } from "../modules/zerads/index.js";
import { supportRouter, supportPublicRouter, supportAdminRouter } from "../modules/support/index.js";
import { socialRouter, socialAdminRouter } from "../modules/social/index.js";
import { roomsRouter } from "../modules/rooms/index.js";
import { notificationsRouter, broadcastRouter, broadcastAdminRouter, rewardInboxRouter, telegramAdminRouter, } from "../modules/notifications/index.js";
import { chatRouter } from "../modules/chat/index.js";
import { tournamentsRouter, tournamentsAdminRouter, rankingRouter, startTournamentsCron, } from "../modules/tournaments/index.js";
import { burnEventsRouter, burnEventsAdminRouter } from "../modules/burn-events/index.js";
import { offerEventsRouter, offerEventsAdminRouter } from "../modules/offer-events/index.js";
import { miniPassRouter, miniPassAdminRouter } from "../modules/mini-pass/index.js";
import { bannersRouter, bannersAdminRouter } from "../modules/banners/index.js";
import { publicStatsRouter } from "../modules/public-stats/index.js";
import { sidebarNavRouter, sidebarNavAdminRouter } from "../modules/sidebar-nav/index.js";
import { statsRouter } from "../modules/stats/index.js";
import { analyticsAdminRouter } from "../modules/analytics/index.js";
import { antibotRouter, antibotAdminRouter } from "../modules/antibot/index.js";
import { salaAdminRouter } from "../modules/sala/index.js";
import { createRateLimiter } from "../core/http/middleware/rateLimit.js";
import { createSiteMaintenanceMiddleware } from "../core/http/middleware/siteMaintenance.js";
import { startMiningCron } from "../cron/mining.cron.js";
import { startBlkRewardCron } from "../cron/blk-reward.cron.js";
import { startEnergyTaxCron } from "../cron/energy-tax.cron.js";
import { startAutoMiningSessionCleanupCron } from "../cron/auto-mining-session-cleanup.cron.js";
import { startCheckinCron } from "../cron/checkin.cron.js";
import { startDepositVerifierCron } from "../cron/deposit-verifier.cron.js";
import { startPolygonHdDepositScannerCron } from "../cron/polygon-hd-scan.cron.js";
import { startWithdrawalAutoSendCron } from "../cron/withdrawal-auto-send.cron.js";
import { startWalletSnapshotCron } from "../cron/wallet-snapshot.cron.js";
import { startTelegramOutboxCron } from "../cron/telegram-outbox.cron.js";
import { startTelegramSubscriptionBotsCron } from "../cron/telegram-subscription-bots.cron.js";
import { startOfferEventsExpireCron } from "../cron/offer-events-expire.cron.js";
import { startShortlinksPasteadExpireCron } from "../cron/shortlinks-pastead-expire.cron.js";
import { startShortlinksAdlinkflyExpireCron } from "../cron/shortlinks-adlinkfly-expire.cron.js";
import { startSecurityArtifactCleanupCron } from "../cron/security-artifact-cleanup.cron.js";
import { startNotificationsRetentionCron } from "../cron/notifications-retention.cron.js";
import { startSupportRetentionCron } from "../cron/support-retention.cron.js";
import { startExpiredPowersCleanupCron } from "../cron/expired-powers-cleanup.cron.js";
import { startUserCountSnapshotCron } from "../cron/user-count-snapshot.cron.js";
import { startEventOutboxPublisherCronFromBootstrap } from "../cron/event-outbox-publisher.cron.js";
const log = logger.child("Bootstrap");
export function createApp() {
    const app = express();
    setupHttpStack(app);
    // Site-wide maintenance (SITE_MAINTENANCE=1). Health + /admin* stay available.
    app.use(createSiteMaintenanceMiddleware());
    // item 100 (pentest achado #10): "phase" era metadado interno de migração, sem uso pelo
    // client — removido do health check público.
    app.get("/health", (_req, res) => res.json({ ok: true, service: "blockminer" }));
    app.use("/api/auth", authRouter);
    app.use("/api/admin/auth", authAdminRouter);
    app.use("/api/session", sessionRouter);
    // NOTE: mounted at /api/user (singular), matching legacy/backend/src/app/mount/
    // userApiRoutes.mount.ts:75 exactly — client/ (frozen) calls /user/*, not /users/* (confirmed
    // via client-parity audit; fixing the backend mount, not the client, per doctrine: client is
    // the locked contract, current/ must match it).
    app.use("/api/user", userRouter);
    app.use("/api/admin", adminRouter);
    app.use("/api/admin", usersAdminRouter);
    // Mounted early (before auto-mining/checkin/etc admin routers) so their bare `/:id`-style
    // wildcard routes at /api/admin don't swallow GET /api/admin/banners first (Express matches
    // in mount order; auto-mining-admin's `GET /:reward_id` at /api/admin previously shadowed it).
    app.use("/api/admin", bannersAdminRouter);
    // Same reasoning as bannersAdminRouter above — mount before auto-mining-admin's `/:reward_id`.
    app.use("/api/admin", sidebarNavAdminRouter);
    // Same reasoning again — GET /api/admin/stats must resolve here, not to
    // auto-mining-admin's GET /stats (also mounted bare at /api/admin further down).
    app.use("/api/admin", analyticsAdminRouter);
    app.use("/api/wallet", walletRouter);
    // Legacy client contract: /api/vault/* (also nested under /api/wallet/vault).
    app.use("/api/vault", vaultRouter);
    app.use("/api/admin", walletAdminRouter);
    app.use("/api/swap", swapRouter);
    app.use("/api/transparency", transparencyRouter);
    app.use("/api/admin", transparencyAdminRouter);
    app.use("/api/mining", miningRouter);
    app.use("/api/admin", miningAdminRouter);
    app.use("/api/machines", machinesRouter);
    app.use("/api/admin", machinesAdminRouter);
    app.use("/api/admin", minersAdminRouter);
    app.use("/api/racks", racksRouter);
    app.use("/api/energy-tax", energyTaxRouter);
    app.use("/api/boosts", boostsRouter);
    // Client contract (usePowerBoostActive): GET/POST /api/power-boost/* — same router as /api/boosts.
    app.use("/api/power-boost", boostsRouter);
    // NOTE: mounted at /api/auto-mining-gpu, matching legacy/backend/src/app/mount/
    // userApiRoutes.mount.ts:69 exactly — client/ (frozen) calls /auto-mining-gpu/v2/*, confirmed
    // via userDashboardNav.config.ts's own backendPrefixes list. Fixing the mount, not the client.
    app.use("/api/auto-mining-gpu", autoMiningRouter);
    // autoMiningAdminRouter mounts LAST among /api/admin routers — its `/:reward_id`
    // catch-all previously shadowed support/sala/burn-events/etc. Numeric guard also
    // calls next("router") for non-digit ids.
    app.use("/api/inventory", inventoryRouter);
    app.use("/api/shop", shopRouter);
    app.use("/api/games", gamesRouter);
    app.use("/api/checkin", checkinRouter);
    app.use("/api/admin", checkinAdminRouter);
    // Matches legacy backend/src/app/mount/userApiRoutes.mount.ts (app.use("/api/daily-tasks", ...)).
    app.use("/api/daily-tasks", tasksRouter);
    app.use("/api/admin", tasksAdminRouter);
    app.use("/api/faucet", faucetRouter);
    app.use("/api/admin", faucetAdminRouter);
    app.use("/api/read-earn", readEarnRouter);
    app.use("/api/admin", readEarnAdminRouter);
    app.use("/api/youtube", youtubeRouter);
    app.use("/api/partner-games", partnerGamesRouter);
    app.use("/api/admin", partnerGamesAdminRouter);
    // Mounted at /api/track (not /api/traffic) — matches legacy's
    // backend/src/app/mount/publicSurfaceRoutes.mount.ts, which the client already targets.
    app.use("/api/track", trafficRouter);
    app.use("/api/admin", trafficAdminRouter);
    app.use("/api/admin", clientErrorsAdminRouter);
    // Mounted at /api/shortlink (singular) — matches legacy userApiRoutes.mount.ts and the
    // client contract (/shortlink/status|start|complete-step). Module folder stays shortlinks/.
    app.use("/api/shortlink", shortlinksRouter);
    app.use("/api/ptc", ptcRouter);
    app.use("/api/admin", ptcAdminRouter);
    app.use("/api/moneyrain", moneyRainRouter);
    app.use("/api/offerwallme", offerwallMeRouter);
    app.use("/api/multiwall", multiwallRouter);
    app.use("/api/offerwallgg", offerwallGgRouter);
    app.use("/api/bm-captcha", bmCaptchaRouter);
    app.use("/api/admin", offerwallAdminRouter);
    app.use("/api/internal-offerwall", internalOfferwallRouter);
    app.use("/api/admin", internalOfferwallAdminRouter);
    app.use("/api/zerads", zeradsRouter);
    app.use("/api/support", supportRouter);
    app.use("/api/public-support", supportPublicRouter);
    app.use("/api/admin", supportAdminRouter);
    app.use("/api/social", socialRouter);
    app.use("/api/admin", socialAdminRouter);
    app.use("/api/rooms", roomsRouter);
    app.use("/api/chat", chatRouter);
    app.use("/api/notifications", notificationsRouter);
    app.use("/api/broadcast", broadcastRouter);
    app.use("/api/admin", broadcastAdminRouter);
    app.use("/api/reward-inbox", rewardInboxRouter);
    // Telegram config/outbox sub-namespace of notifications/ — see telegram.service.ts header:
    // no real Telegram worker is ported, this only exposes settings + outbox admin endpoints.
    app.use("/api/admin", telegramAdminRouter);
    app.use("/api/tournaments", tournamentsRouter);
    app.use("/api/admin/tournaments", tournamentsAdminRouter);
    app.use("/api/ranking", rankingRouter);
    app.use("/api/burn-events", burnEventsRouter);
    app.use("/api/admin/burn-events", burnEventsAdminRouter);
    app.use("/api/offer-events", offerEventsRouter);
    app.use("/api/admin", offerEventsAdminRouter);
    app.use("/api/mini-pass", miniPassRouter);
    app.use("/api/admin", miniPassAdminRouter);
    app.use("/api/admin", mediaAdminRouter);
    // Public, unauthenticated: GET /api/banners (active-now filter), GET /api/public-stats,
    // GET /api/public-feed, GET /api/live-server-stats — mounted bare at /api, same paths
    // as legacy's publicSurfaceRoutes.mount.ts.
    app.use("/api/banners", bannersRouter);
    app.use("/api", publicStatsRouter);
    // Public, unauthenticated: GET /api/sidebar/nav (resolved sidebar categories). Matches
    // legacy/backend/src/app/mount/userApiRoutes.mount.ts:76 (`app.use("/api/sidebar", ...)`)
    // exactly — a prior pass here mounted this at bare /api/nav after mistakenly concluding the
    // legacy route was "never mounted" (it only checked server/routes/, not backend/src/app/
    // mount/, where the real mount lives). client/ (frozen) calls /sidebar/nav — confirmed via
    // client-parity audit. Fixing the mount, not the client. Admin read/write of the underlying
    // config (requireAdminAuth inside the router) is mounted earlier, next to bannersAdminRouter.
    app.use("/api/sidebar", sidebarNavRouter);
    app.use("/api/stats", statsRouter);
    // Reduced-scope antibot module (telemetry collection + simplified admin overview only —
    // see server/modules/antibot/antibot.service.ts for the scope-reduction rationale).
    app.use("/api/antibot", antibotRouter);
    app.use("/api/admin/antibot", antibotAdminRouter);
    app.use("/api/admin/sala", salaAdminRouter);
    app.use("/api/admin", autoMiningAdminRouter);
    // All uploaded images/media are served from the persistent uploads/media/<category>/ tree —
    // see server/modules/media/media.config.ts for the on-disk resolution.
    app.use(MEDIA_PUBLIC_PREFIX, createMediaStaticHeadersMiddleware());
    // maxAge + immutable: every uploaded file gets a fresh, unique name (timestamp+hash, e.g.
    // miner-1779308014546-fa8dfa74a766ec02.webp) — nothing here is ever overwritten in place,
    // so it's always safe to tell the browser never to revalidate. Before this, express.static's
    // default (no Cache-Control at all) meant every single /inventory visit re-fetched every
    // machine/rack/fan image from scratch; found 2026-09-12 right after syncing real prod
    // uploads to staging made the tab noticeably heavier (dozens of real images loading where
    // most had previously 404'd to a lightweight placeholder).
    app.use(MEDIA_PUBLIC_PREFIX, express.static(mediaRootDir(), { maxAge: "30d", immutable: true }));
    // Public S2S callback (Zerads PTC provider) — root-level path, NOT under /api, matches
    // the exact URL configured on the provider's side. Auth is IP allowlist + password, not
    // session/CSRF (see zerads.controller.ts / zerads.service.ts). Rate-limited like legacy
    // publicSurfaceRoutes.mount.ts (30/min).
    const zeradsCallbackLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
    app.get("/zeradsptc.php", zeradsCallbackLimiter, zeradsCallbackHandler);
    // Public test redirect — no auth. Picks a random test user each hit (legacy parity).
    const ZERADS_TEST_USERS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
    app.get("/zerads", (_req, res) => {
        const u = ZERADS_TEST_USERS[Math.floor(Math.random() * ZERADS_TEST_USERS.length)];
        res.redirect(302, `https://zerads.com/ptc.php?ref=10776&user=${u}`);
    });
    // Serves the built client/ SPA from this same process — nginx just proxies everything to
    // it (see nginx/nginx.vm5000.conf). Must come after every /api/* mount above and before the
    // generic 404 below, since attachSpaFallback's own GET catch-all needs first refusal on
    // non-API paths. See shared/http/spaStatic.ts for the /api, /media, /socket.io, /assets
    // 404-differentiation (a bad API path must never get HTML back).
    const clientDist = resolveClientDistPaths(projectRoot());
    if (!clientDist.indexExists) {
        log.warn("client.dist.missing — frontend build not found, API-only mode", {
            distPath: clientDist.distPath,
        });
    }
    attachClientDistStatic(app, clientDist.distPath, clientDist.indexExists);
    attachSpaFallback(app, {
        indexPath: clientDist.indexPath,
        indexExists: clientDist.indexExists,
        renderIndex: renderSpaIndex,
    });
    app.use((req, res) => {
        res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Route not found." });
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err, req, res, _next) => {
        reportError({
            code: "UNHANDLED_HTTP_ERROR",
            category: "UNKNOWN",
            severity: "CRITICAL",
            module: "bootstrap.server",
            error: err,
            req,
            context: { path: req?.originalUrl, method: req?.method },
        });
        res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Internal server error." });
    });
    return app;
}
async function main() {
    // Copy versioned storage/media-seed → storage/uploads/media when files are missing.
    // Must run before the HTTP server accepts traffic so /media/* does not 404 on first paint.
    seedBundledMedia();
    await bootstrapAdminUsers().catch((err) => log.error("Admin bootstrap failed", { error: String(err) }));
    await bootstrapEngine().catch((err) => log.error("Mining engine bootstrap failed", { error: String(err) }));
    await applyInternalOfferwallStandardBlkReward().catch((err) => log.warn("Internal offerwall BLK reward sync failed", { error: String(err) }));
    const app = createApp();
    const httpServer = http.createServer(app);
    // Socket.IO core + miner/support/tournament/games realtime handlers (12c, 12i, 12j —
    // games.socket.ts covers memory/match-3/block-stack/sky-runner/cart-rush, all wired).
    attachSocketIO(httpServer);
    const port = Number(process.env.PORT || 3000);
    const server = httpServer.listen(port, () => {
        log.info(`Server listening on port ${port}`);
    });
    const miningCron = startMiningCron();
    const blkRewardCron = startBlkRewardCron();
    const energyTaxCron = startEnergyTaxCron();
    const autoMiningCleanupCron = startAutoMiningSessionCleanupCron();
    const checkinCron = startCheckinCron();
    const tournamentsCron = startTournamentsCron();
    const depositVerifierCron = startDepositVerifierCron();
    const polygonHdScanCron = startPolygonHdDepositScannerCron();
    const walletSnapshotCron = startWalletSnapshotCron();
    const withdrawalAutoSendCron = startWithdrawalAutoSendCron();
    const telegramOutboxCron = startTelegramOutboxCron();
    const telegramSubscriptionBotsCron = startTelegramSubscriptionBotsCron();
    const offerEventsExpireCron = startOfferEventsExpireCron();
    const shortlinksPasteadExpireCron = startShortlinksPasteadExpireCron();
    const shortlinksAdlinkflyExpireCron = startShortlinksAdlinkflyExpireCron();
    const securityArtifactCleanupCron = startSecurityArtifactCleanupCron();
    const notificationsRetentionCron = startNotificationsRetentionCron();
    const supportRetentionCron = startSupportRetentionCron();
    const expiredPowersCleanupCron = startExpiredPowersCleanupCron();
    const userCountSnapshotCron = startUserCountSnapshotCron();
    const eventOutboxPublisherCron = startEventOutboxPublisherCronFromBootstrap();
    async function shutdown(signal) {
        log.info(`Received ${signal}, shutting down`);
        miningCron.stop();
        blkRewardCron.stop();
        energyTaxCron.stop();
        autoMiningCleanupCron.stop();
        checkinCron.stop();
        tournamentsCron.stop();
        depositVerifierCron.stop();
        polygonHdScanCron.stop();
        walletSnapshotCron.stop();
        withdrawalAutoSendCron.stop();
        telegramOutboxCron.stop();
        telegramSubscriptionBotsCron.stop();
        offerEventsExpireCron.stop();
        shortlinksPasteadExpireCron.stop();
        shortlinksAdlinkflyExpireCron.stop();
        securityArtifactCleanupCron.stop();
        notificationsRetentionCron.stop();
        supportRetentionCron.stop();
        expiredPowersCleanupCron.stop();
        userCountSnapshotCron.stop();
        eventOutboxPublisherCron.stop();
        server.close(() => log.info("HTTP server closed"));
        await prisma.$disconnect().catch(() => undefined);
        await shutdownRedis().catch(() => undefined);
        process.exit(0);
    }
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
}
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    void main();
}
