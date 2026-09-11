import { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
import {
  insertTournamentAction,
  publishTournamentActionOutbox,
  type RecordTournamentActionInput,
} from "./tournaments.repository.js";
import { processTournamentOutboxBatch } from "./tournaments.outbox.js";
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

  if (duplicate) {
    log.info("tournament.action.dispatch.duplicate_replay", {
      provider: payload.provider,
      providerEventId: payload.sourceId,
      actionId: payload.actionId,
    });
  }

  await publishTournamentActionOutbox(payload);

  log.info("tournament.action.dispatch.inline_outbox", {
    provider: payload.provider,
    providerEventId: payload.sourceId,
  });
  await processTournamentOutboxBatch();
}
