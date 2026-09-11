import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { findTournamentById } from "./tournaments.repository.js";
import { recordTournamentAction } from "./tournaments.actions.js";
import { TOURNAMENT_ACTION_PROVIDER } from "./tournaments.providers.js";
const log = logger.child("MinigameTournamentBackfill");
/** Import wins from game_session_logs into the tournament ledger (idempotent). */
export async function backfillMinigameTournamentFromLogs(tournamentId) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament || tournament.metric !== "MINIGAME_WINS")
        return 0;
    const now = new Date();
    const upper = tournament.endsAt < now ? tournament.endsAt : now;
    if (upper < tournament.startsAt)
        return 0;
    const logs = await prisma.gameSessionLog.findMany({
        where: {
            success: true,
            rewardGranted: true,
            createdAt: { gte: tournament.startsAt, lte: upper },
        },
        select: { id: true, userId: true, createdAt: true, gameSlug: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    let applied = 0;
    for (const logRow of logs) {
        try {
            await recordTournamentAction({
                userId: logRow.userId,
                provider: TOURNAMENT_ACTION_PROVIDER.MINIGAME,
                actionCount: 1,
                executedAtUTC: logRow.createdAt,
                providerEventId: `gsl:${logRow.id}`,
                metadata: {
                    gameSlug: logRow.gameSlug,
                    backfill: true,
                    gameSessionLogId: logRow.id,
                },
            });
            applied++;
        }
        catch (err) {
            log.warn("minigame.backfill.action_failed", {
                tournamentId,
                gameSessionLogId: logRow.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    if (applied > 0) {
        log.info("minigame.backfill.done", { tournamentId, applied, totalLogs: logs.length });
    }
    return applied;
}
export function resolveTournamentStatusForWindow(startsAt, endsAt, now = new Date()) {
    if (now < startsAt)
        return "SCHEDULED";
    if (now >= endsAt)
        return "ENDED";
    return "ACTIVE";
}
