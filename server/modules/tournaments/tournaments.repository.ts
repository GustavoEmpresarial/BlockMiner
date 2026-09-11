// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
import { tournamentActionIdempotencyKey, tournamentActionOutboxPayload, TOURNAMENT_EVENT_ACTION_RECORDED, TOURNAMENT_EVENT_DEPOSIT_CONFIRMED, depositConfirmedIdempotencyKey, } from "./tournaments.types.js";
import { logger } from "../../core/logger/index.js";

// TODO: was a type-only export erased from the compiled dist/ this file was
// reconstructed from — placeholder `any` shape just restores buildability;
// someone should tighten this to the real insertTournamentAction() input shape.
export type RecordTournamentActionInput = any;

const log = logger.child("TournamentAction");
function normalizeInput(input) {
    const providerEventId = input.providerEventId ??
        ("sourceId" in input ? input.sourceId : undefined);
    if (!providerEventId) {
        throw new Error("providerEventId is required");
    }
    return { ...input, providerEventId };
}
export async function findActiveTournamentsByMetrics(metrics) {
    return prisma.tournament.findMany({
        where: { status: "ACTIVE", metric: { in: metrics } },
        select: {
            id: true,
            name: true,
            metric: true,
            startsAt: true,
            endsAt: true,
            status: true,
        },
    });
}
export async function findTournamentById(tournamentId) {
    return prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: {
            id: true,
            name: true,
            metric: true,
            startsAt: true,
            endsAt: true,
            status: true,
        },
    });
}
export async function findActiveTournaments() {
    return prisma.tournament.findMany({
        where: { status: "ACTIVE" },
        select: {
            id: true,
            name: true,
            metric: true,
            startsAt: true,
            endsAt: true,
            status: true,
        },
    });
}
export async function touchScoresReconciledAt(tournamentId) {
    await prisma.tournament.update({
        where: { id: tournamentId },
        data: { scoresReconciledAt: new Date() },
    });
}
export async function insertContributionIdempotent(tournamentId, delta, tx = undefined) {
    const client = tx ?? prisma;
    try {
        await client.tournamentScoreContribution.create({
            data: {
                tournamentId,
                userId: delta.userId,
                sourceType: delta.sourceType,
                sourceId: delta.sourceId,
                metricValue: delta.metricValue.toString(),
                eventAt: delta.eventAt,
                metadata: delta.metadata ?? undefined,
            },
        });
        return "inserted";
    }
    catch (err) {
        const code = err?.code;
        if (code === "P2002")
            return "duplicate";
        throw err;
    }
}
export async function applyScoreDelta(tournamentId, userId, delta, eventAt, tx) {
    const client = tx ?? prisma;
    const existing = await client.tournamentEntry.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (existing) {
        await client.tournamentEntry.update({
            where: { id: existing.id },
            data: {
                score: { increment: delta },
                firstContributionAt: existing.firstContributionAt ?? eventAt,
            },
        });
        return;
    }
    try {
        await client.tournamentEntry.create({
            data: {
                tournamentId,
                userId,
                score: delta,
                firstContributionAt: eventAt,
            },
        });
    }
    catch (err) {
        const code = err?.code;
        if (code !== "P2002")
            throw err;
        await client.tournamentEntry.update({
            where: { tournamentId_userId: { tournamentId, userId } },
            data: {
                score: { increment: delta },
                firstContributionAt: eventAt,
            },
        });
    }
}
export async function batchUpsertEntriesFromReconcile(tournamentId, rows) {
    const active = rows.filter((r) => r.score > 0);
    const activeIds = active.map((r) => r.userId);
    if (activeIds.length === 0) {
        await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
        return;
    }
    await prisma.tournamentEntry.deleteMany({
        where: { tournamentId, userId: { notIn: activeIds } },
    });
    for (let i = 0; i < active.length; i += 100) {
        const chunk = active.slice(i, i + 100);
        await Promise.all(chunk.map(({ userId, score }) => prisma.tournamentEntry.upsert({
            where: { tournamentId_userId: { tournamentId, userId } },
            update: { score },
            create: { tournamentId, userId, score },
        })));
    }
}
export async function getEntryScores(tournamentId) {
    const entries = await prisma.tournamentEntry.findMany({
        where: { tournamentId },
        select: { userId: true, score: true },
    });
    const map = new Map();
    for (const e of entries)
        map.set(e.userId, Number(e.score));
    return map;
}
export async function findTournamentActionByProviderEvent(provider, providerEventId) {
    return prisma.tournamentAction.findUnique({
        where: {
            provider_sourceId: { provider, sourceId: providerEventId },
        },
    });
}
export async function insertTournamentAction(input) {
    const normalized = normalizeInput(input);
    const actionCount = Math.trunc(normalized.actionCount);
    if (actionCount <= 0) {
        return { payload: null, duplicate: false };
    }
    try {
        const row = await prisma.tournamentAction.create({
            data: {
                userId: normalized.userId,
                provider: normalized.provider,
                actionCount,
                executedAtUTC: normalized.executedAtUTC,
                sourceId: normalized.providerEventId,
                tournamentEligible: normalized.tournamentEligible !== false,
                metadata: normalized.metadata ?? undefined,
            },
        });
        const payload = tournamentActionOutboxPayload(row);
        log.info("tournament.action.created", {
            actionId: payload.actionId,
            userId: payload.userId,
            provider: payload.provider,
            providerEventId: payload.sourceId,
            actionCount: payload.actionCount,
            executedAtUTC: payload.executedAtUTC,
        });
        return { payload, duplicate: false };
    }
    catch (err) {
        const code = err?.code;
        if (code === "P2002") {
            const existing = await findTournamentActionByProviderEvent(normalized.provider, normalized.providerEventId);
            if (!existing) {
                return { payload: null, duplicate: true };
            }
            const payload = tournamentActionOutboxPayload(existing);
            log.info("tournament.action.duplicate", {
                actionId: payload.actionId,
                userId: payload.userId,
                provider: payload.provider,
                providerEventId: payload.sourceId,
            });
            return { payload, duplicate: true };
        }
        throw err;
    }
}
export async function publishTournamentActionOutbox(payload, tx = undefined) {
    const client = tx ?? prisma;
    const idempotencyKey = tournamentActionIdempotencyKey(payload.provider, payload.sourceId);
    try {
        await client.tournamentDomainOutbox.create({
            data: {
                eventType: TOURNAMENT_EVENT_ACTION_RECORDED,
                payload,
                status: "pending",
                idempotencyKey,
                nextRunAt: new Date(),
            },
        });
        return true;
    }
    catch (err) {
        const code = err?.code;
        if (code === "P2002") {
            log.info("tournament.outbox.duplicate", {
                provider: payload.provider,
                providerEventId: payload.sourceId,
                idempotencyKey,
            });
            return false;
        }
        throw err;
    }
}
export async function publishDepositConfirmedOutbox(payload, tx = undefined) {
    const client = tx ?? prisma;
    const idempotencyKey = depositConfirmedIdempotencyKey(payload.transactionId);
    try {
        await client.tournamentDomainOutbox.create({
            data: {
                eventType: TOURNAMENT_EVENT_DEPOSIT_CONFIRMED,
                payload,
                status: "pending",
                idempotencyKey,
                nextRunAt: new Date(),
            },
        });
    }
    catch (err) {
        const code = err?.code;
        if (code === "P2002")
            return;
        throw err;
    }
}
