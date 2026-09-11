/**
 * Minimal hashrate aggregation for ranking + HASHRATE tournaments.
 * Ported from legacy networkHashrateService (subset).
 */
import prisma from "../../core/database/prisma.js";
export const CHECKIN_BONUS_GAME_SLUG = "checkin-streak-bonus";
export function aggregateUserHashrates(user, opts = {}) {
    const onlyActive = opts.onlyActiveMiners !== false;
    const miners = user.miners || [];
    const machineHr = miners
        .filter((m) => (onlyActive ? m.isActive !== false : true))
        .reduce((s, m) => s + (Number(m.hashRate) || 0), 0);
    const gameRows = user.gamePowers || [];
    let gameMinigameHr = 0;
    let gameCheckinHr = 0;
    for (const g of gameRows) {
        const slug = g.game?.slug || "";
        const hr = Number(g.hashRate) || 0;
        if (slug === CHECKIN_BONUS_GAME_SLUG)
            gameCheckinHr += hr;
        else
            gameMinigameHr += hr;
    }
    const ytHr = (user.ytPowers || []).reduce((s, y) => s + (Number(y.hashRate) || 0), 0);
    const legacyGpuHr = (user.gpuAccess || []).reduce((s, p) => s + (Number(p.gpuHashRate) || 0), 0);
    const v2GpuHr = (user.autoMiningV2Grants || []).reduce((s, g) => s + (Number(g.hashRate) || 0), 0);
    const gpuHr = legacyGpuHr + v2GpuHr;
    const temporaryHr = gameMinigameHr + gameCheckinHr + ytHr + gpuHr;
    const totalHr = machineHr + temporaryHr;
    return {
        permanentHashrate: machineHr,
        temporaryMinigameHashrate: gameMinigameHr,
        temporaryCheckinHashrate: gameCheckinHr,
        temporaryYoutubeHashrate: ytHr,
        temporaryAutoMiningHashrate: gpuHr,
        temporaryHashrate: temporaryHr,
        totalHashrate: totalHr,
    };
}
export function rankingUserSelect(now, opts = {}) {
    const includeV2 = opts.includeAutoMiningV2 !== false;
    const base = {
        id: true,
        username: true,
        name: true,
        isCreator: true,
        youtubeUrl: true,
        miners: {
            where: { isActive: true },
            select: { hashRate: true, isActive: true },
        },
        gamePowers: {
            where: { expiresAt: { gt: now } },
            select: {
                hashRate: true,
                game: { select: { slug: true, name: true } },
            },
        },
        ytPowers: {
            where: { expiresAt: { gt: now } },
            select: { hashRate: true },
        },
        gpuAccess: {
            where: { isClaimed: true, expiresAt: { gt: now } },
            select: { gpuHashRate: true },
        },
    };
    if (!includeV2)
        return base;
    return {
        ...base,
        autoMiningV2Grants: {
            where: { expiresAt: { gt: now } },
            select: { hashRate: true },
        },
    };
}
export function buildRankingRows(users) {
    const rows = users.map((u) => {
        const agg = aggregateUserHashrates(u);
        return {
            id: u.id,
            username: u.username || "Miner",
            name: u.name,
            isCreator: u.isCreator,
            youtubeUrl: u.youtubeUrl,
            totalHashRate: agg.totalHashrate,
            baseHashRate: agg.permanentHashrate,
            gameHashRate: agg.temporaryHashrate,
        };
    });
    rows.sort((a, b) => b.totalHashRate - a.totalHashRate);
    return rows;
}
const POWER_STATS_RANKING_USER_CAP = 400;
const POWER_STATS_RANKING_ACTIVE_MS = 7 * 86400000;
/** Bounded active-user sample for HASHRATE tournament scoring. */
export async function loadUsersForHashrateTournament(now, v2SchemaOk) {
    const activeSince = new Date(now.getTime() - POWER_STATS_RANKING_ACTIVE_MS);
    return prisma.user.findMany({
        where: {
            isBanned: false,
            OR: [{ lastHeartbeatAt: { gte: activeSince } }, { lastLoginAt: { gte: activeSince } }],
        },
        orderBy: [{ lastHeartbeatAt: "desc" }, { id: "asc" }],
        take: POWER_STATS_RANKING_USER_CAP,
        select: rankingUserSelect(now, { includeAutoMiningV2: v2SchemaOk }),
    });
}
/**
 * item 91: cache do leaderboard global de hashrate.
 *
 * Por quê: `GET /api/stats/power` (a aba "Estatísticas e poder") só usa esse ranking pra
 * descobrir a POSIÇÃO do usuário na rede — um `findIndex` num array que é IDÊNTICO pra
 * todos os viewers. Mas montá-lo custava ~1s e carregava ~400 usuários com dezenas de
 * milhares de linhas de poder aninhadas (games, yt, auto-mining, máquinas) do Postgres —
 * A CADA abertura da tela, por CADA usuário. Era o gargalo real da página.
 *
 * Como: computa uma vez, serve do cache em memória por `RANKING_CACHE_TTL_MS`. O leaderboard
 * não muda por viewer, então cachear a lista ordenada é seguro; o `computeUserRank`
 * (findIndex por usuário) continua fora do cache, sempre exato contra a lista corrente.
 * Refresh assíncrono: quando o cache vence, devolve o valor velho imediatamente e recomputa
 * em background — nenhum request fica pagando o 1s da recomputação (o primeiro request após
 * o boot é o único que espera, e só se ninguém tiver populado ainda).
 */
const RANKING_CACHE_TTL_MS = Number(process.env.POWER_STATS_RANKING_CACHE_TTL_MS || 60_000);
let rankingCache = null;
let rankingRefreshInFlight = null;
async function computeRankingRows(now, v2SchemaOk) {
    const users = await loadUsersForHashrateTournament(now, v2SchemaOk);
    const rows = buildRankingRows(users);
    rankingCache = { rows, computedAt: Date.now() };
    return rows;
}
/**
 * Leaderboard ordenado, com cache. Retorna sempre uma lista utilizável:
 * - cache fresco → serve na hora;
 * - cache vencido → serve o velho e recomputa em background (stale-while-revalidate);
 * - sem cache (primeiro acesso após boot) → computa e espera essa vez.
 */
export async function getCachedRankingRows(now, v2SchemaOk) {
    const fresh = rankingCache && Date.now() - rankingCache.computedAt < RANKING_CACHE_TTL_MS;
    if (rankingCache && fresh)
        return rankingCache.rows;
    if (rankingCache) {
        // Stale: dispara refresh em background (deduplicado) e devolve o velho já.
        if (!rankingRefreshInFlight) {
            rankingRefreshInFlight = computeRankingRows(now, v2SchemaOk).finally(() => {
                rankingRefreshInFlight = null;
            });
            rankingRefreshInFlight.catch(() => {
                /* mantém o cache velho se a recomputação falhar — melhor stale que erro */
            });
        }
        return rankingCache.rows;
    }
    // Primeiro acesso após o boot: precisa esperar uma vez (deduplicado entre requests).
    if (!rankingRefreshInFlight) {
        rankingRefreshInFlight = computeRankingRows(now, v2SchemaOk).finally(() => {
            rankingRefreshInFlight = null;
        });
    }
    return rankingRefreshInFlight;
}
