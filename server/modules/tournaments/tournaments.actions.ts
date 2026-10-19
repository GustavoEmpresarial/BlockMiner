import { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
import {
  insertTournamentAction,
  publishTournamentActionOutbox,
  type RecordTournamentActionInput,
} from "./tournaments.repository.js";
import { processTournamentOutboxBatch } from "./tournaments.outbox.js";
import { applyContribution } from "./tournaments.projection.js";
import { contributionSourceId } from "./tournaments.providers.js";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("TournamentActionDispatch");

export type { RecordTournamentActionInput } from "./tournaments.repository.js";
export {
  TOURNAMENT_ACTION_PROVIDER,
  type TournamentActionProvider,
} from "./tournaments.providers.js";

/**
 * Persist a normalized action and project via outbox.
 * Always drains the outbox inline (no BullMQ/Redis in current/).
 * Idempotent: duplicate provider events still trigger outbox drain (recovery path).
 */
export async function recordTournamentAction(
  input: RecordTournamentActionInput & { sourceId?: string },
): Promise<void> {
  if (!isTournamentIncrementalScoringEnabled()) return;

  const { payload, duplicate } = await insertTournamentAction(input);
  if (!payload) return;

  if (!duplicate) {
    void import("../tasks/index.js")
      .then(({ notifyDailyTaskAction }) =>
        notifyDailyTaskAction(payload.userId, payload.provider, payload.sourceId, payload.actionCount),
      )
      .catch((err) => log.warn("tournament.action.daily_task_hook_failed", { provider: payload.provider, error: String(err) }));
  }

  if (duplicate) {
    log.info("tournament.action.dispatch.duplicate_replay", {
      provider: payload.provider,
      providerEventId: payload.sourceId,
      actionId: payload.actionId,
    });
  }

  await publishTournamentActionOutbox(payload);

  log.debug("tournament.action.dispatch.inline_outbox", {
    provider: payload.provider,
    providerEventId: payload.sourceId,
  });
  await processTournamentOutboxBatch();
}

export const TOURNAMENT_REVERSAL_SOURCE_TYPE = "action_reversal";

/**
 * Undo a provider event (partner chargeback): the action stops being tournament-eligible
 * (reconcile and late outbox drains skip it) and every ACTIVE tournament that already scored it
 * gets an idempotent negative contribution. Closed tournaments keep their final ranking.
 */
export async function reverseTournamentAction(input: {
  provider: string;
  providerEventId: string;
}): Promise<{ reversedIn: number[]; closedIn: number[] }> {
  const { provider, providerEventId } = input;
  await prisma.tournamentAction.updateMany({
    where: { provider, sourceId: providerEventId },
    data: { tournamentEligible: false },
  });

  const sourceId = contributionSourceId(provider, providerEventId);
  const contributions = await prisma.tournamentScoreContribution.findMany({
    where: { sourceType: "action", sourceId },
    select: {
      tournamentId: true,
      userId: true,
      metricValue: true,
      eventAt: true,
      tournament: { select: { status: true } },
    },
  });

  const reversedIn: number[] = [];
  const closedIn: number[] = [];
  for (const c of contributions) {
    if (c.tournament.status !== "ACTIVE") {
      closedIn.push(c.tournamentId);
      log.warn("tournament.action.reversal_after_close", {
        tournamentId: c.tournamentId,
        tournamentStatus: c.tournament.status,
        userId: c.userId,
        provider,
        providerEventId,
      });
      continue;
    }
    const result = await applyContribution(c.tournamentId, {
      userId: c.userId,
      sourceType: TOURNAMENT_REVERSAL_SOURCE_TYPE,
      sourceId,
      metricValue: -Number(c.metricValue),
      eventAt: c.eventAt,
      metadata: { provider, reversedProviderEventId: providerEventId },
    });
    if (result.applied) reversedIn.push(c.tournamentId);
  }

  log.info("tournament.action.reversed", { provider, providerEventId, reversedIn, closedIn });
  return { reversedIn, closedIn };
}
