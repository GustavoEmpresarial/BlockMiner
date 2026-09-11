/**
 * Telegram config + outbox — ported from legacy/server/modules/telegram/telegram.service.ts,
 * folded into notifications/ as a sub-namespace (Fase 8 scope: see AGENTS instructions / the
 * task that produced this file).
 *
 * SCOPE (read before touching): legacy's telegram/ module had two genuinely separate parts:
 *   1. Config (env-driven settings) + an outbox table (`telegram_outbox_events`) that other
 *      modules write pending events into. Ported here.
 *   2. A standalone worker process (`telegram/worker/telegramProofWorker.js`) that polls the
 *      outbox and actually calls the real Telegram Bot API. As of Fase 10c this poll+send+retry
 *      LOGIC is ported too — see telegram.worker.ts + server/cron/telegram-outbox.cron.ts — but
 *      adapted to run in-process (setInterval cron) instead of as a separate Docker process,
 *      per the "monólito modular simples" doctrine. The two long-polling COMMAND bots
 *      (`notifiers/support.notifier.ts`, `notifiers/video.notifier.ts` — inbound `getUpdates`
 *      loops that let admins reply from Telegram) remain unported and out of scope: only
 *      outbound sending exists in current/.
 *
 * `updateWithdrawalTelegramSettings` is intentionally NOT implemented as a real settings
 * writer: legacy itself made this env-only ("As configuracoes sensiveis do Telegram agora sao
 * definidas por env vars") and throws 400 on PUT/PATCH — same behavior preserved here. The
 * `WithdrawalTelegramSettings` Prisma model exists (ported to schema.prisma already) purely as
 * a legacy-compat read (`legacyDbTokenPresent`), never written to by current/.
 *
 * `retryTelegramOutboxEvent`: resets status back to "pending" / attempts to 0 / nextRunAt to now
 * — the running telegram-outbox cron (telegram.worker.ts) will pick it up on its next tick and
 * attempt a real send. This function itself does not send anything synchronously.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { TELEGRAM_EVENT_TYPES } from "./telegram.types.js";
import type { WithdrawalLike } from "./telegram.types.js";
import {
  boolFromEnv,
  cleanString,
  maskSecret,
  safeError,
  isValidPolygonTxHash,
  normalizeChatId,
  normalizeThreadId,
  normalizePolygonscanBaseUrl,
  snapshotUsername,
  publicPayloadForEvent,
} from "./telegram.helpers.js";
import { isTelegramOutboxWorkerRunning } from "./telegram.worker.js";

export { TELEGRAM_EVENT_TYPES } from "./telegram.types.js";
export type { WithdrawalLike, TelegramEventType } from "./telegram.types.js";

const SINGLETON_ID = 1;

function getEnvConfig() {
  const privateChatId = normalizeChatId(process.env.TELEGRAM_PRIVATE_WITHDRAWAL_ALERT_CHAT_ID, "chat privado");
  const publicChatId = normalizeChatId(process.env.TELEGRAM_PUBLIC_PROOF_CHAT_ID, "chat publico");
  const publicThreadId = normalizeThreadId(process.env.TELEGRAM_PUBLIC_PROOF_THREAD_ID);
  const token = cleanString(process.env.TELEGRAM_BOT_TOKEN);
  return {
    botToken: token,
    botTokenConfigured: Boolean(token),
    botTokenMasked: maskSecret(token),
    privateAlertsEnabled: boolFromEnv("TELEGRAM_WITHDRAWAL_ALERTS_ENABLED", false),
    publicProofsEnabled: boolFromEnv("TELEGRAM_PUBLIC_PROOFS_ENABLED", false),
    screenshotEnabled: boolFromEnv("TELEGRAM_POLYGONSCAN_SCREENSHOT_ENABLED", false),
    privateChatId,
    publicChatId,
    publicThreadId,
    polygonscanBaseUrl: normalizePolygonscanBaseUrl(),
  };
}

async function getLegacySettingsRow() {
  return prisma.withdrawalTelegramSettings.findUnique({ where: { id: SINGLETON_ID } }).catch(() => null);
}

export async function getWithdrawalTelegramSettings() {
  const env = getEnvConfig();
  const legacy = await getLegacySettingsRow();
  return {
    enabled: Boolean(env.privateAlertsEnabled || env.publicProofsEnabled),
    configSource: "env" as const,
    tokenConfigured: env.botTokenConfigured,
    botTokenConfigured: env.botTokenConfigured,
    botTokenMasked: env.botTokenMasked,
    legacyDbTokenPresent: Boolean(legacy?.privateBotToken || legacy?.publicBotToken),
    privateAlertsEnabled: env.privateAlertsEnabled,
    privateChatConfigured: Boolean(env.privateChatId),
    privateChatId: env.privateChatId || "",
    publicProofsEnabled: env.publicProofsEnabled,
    publicChatConfigured: Boolean(env.publicChatId),
    publicChatId: env.publicChatId || "",
    publicThreadConfigured: Boolean(env.publicThreadId),
    publicThreadId: env.publicThreadId ? String(env.publicThreadId) : "",
    screenshotEnabled: env.screenshotEnabled,
    captureEnabled: env.screenshotEnabled,
    polygonscanBaseUrl: env.polygonscanBaseUrl,
    // As of Fase 10c the poll+send+retry worker IS ported (telegram.worker.ts +
    // server/cron/telegram-outbox.cron.ts), running in-process instead of legacy's standalone
    // Docker process. Only the two inbound long-polling command bots remain unported.
    workerPorted: true,
    updatedAt: legacy?.updatedAt || null,
  };
}

export async function updateWithdrawalTelegramSettings(): Promise<never> {
  const error = new Error(
    "As configuracoes sensiveis do Telegram sao definidas por env vars no backend (nao ha worker de envio portado em current/).",
  );
  (error as Error & { statusCode?: number }).statusCode = 400;
  throw error;
}

export function isTelegramPrivateAlertsEnabled(): boolean {
  try {
    const cfg = getEnvConfig();
    return Boolean(cfg.botTokenConfigured && cfg.privateAlertsEnabled && cfg.privateChatId);
  } catch {
    return false;
  }
}

export function isTelegramPublicProofsEnabled(): boolean {
  try {
    const cfg = getEnvConfig();
    return Boolean(cfg.botTokenConfigured && cfg.publicProofsEnabled && cfg.publicChatId);
  } catch {
    return false;
  }
}

export type TelegramOutboxTx = Pick<Prisma.TransactionClient, "telegramOutboxEvent"> | typeof prisma;

export async function createTelegramOutboxEventTx(
  tx: TelegramOutboxTx,
  type: string,
  transaction: WithdrawalLike | null | undefined,
  extra: Record<string, unknown> = {},
) {
  if (!transaction?.id) return null;
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT && !isTelegramPrivateAlertsEnabled()) return null;
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isTelegramPublicProofsEnabled()) return null;
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_AUTO_SENT_PRIVATE_ALERT && !isTelegramPrivateAlertsEnabled()) return null;
  if (type === TELEGRAM_EVENT_TYPES.HOT_WALLET_LOW_BALANCE_ALERT && !isTelegramPrivateAlertsEnabled()) return null;

  const txHash = cleanString(extra.txHash || transaction.txHash);
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isValidPolygonTxHash(txHash)) return null;

  return tx.telegramOutboxEvent.upsert({
    where: { transactionId_type: { transactionId: transaction.id, type } },
    create: {
      type,
      status: "pending",
      transactionId: transaction.id,
      userId: transaction.userId,
      txHash,
      amount: transaction.amount == null ? "0" : String(transaction.amount),
      currency: "POL",
      destinationWallet: cleanString(transaction.address),
      usernameSnapshot: snapshotUsername(transaction),
      payload: publicPayloadForEvent(type, transaction, extra) as Prisma.InputJsonValue,
      nextRunAt: new Date(),
    },
    update: {},
  });
}

/**
 * Generic (non-withdrawal) outbox writer — current/-only addition. Legacy fed these events
 * (new support ticket, new video submission, ...) to two separate long-polling bots instead of
 * the outbox; here they share the same table/type-agnostic column since no worker consumes
 * either path anyway. transactionId/txHash/destinationWallet are always null for these types.
 */
export async function createGenericTelegramOutboxEvent(
  type: string,
  payload: Record<string, unknown>,
  opts: { userId?: number | null; usernameSnapshot?: string | null } = {},
) {
  return prisma.telegramOutboxEvent.create({
    data: {
      type,
      status: "pending",
      transactionId: null,
      userId: opts.userId ?? null,
      txHash: null,
      amount: null,
      currency: "POL",
      destinationWallet: null,
      usernameSnapshot: opts.usernameSnapshot ?? null,
      payload: payload as Prisma.InputJsonValue,
      nextRunAt: new Date(),
    },
    select: { id: true, type: true, status: true, createdAt: true },
  });
}

export async function notifyWithdrawalRequested(withdrawal: WithdrawalLike) {
  return createTelegramOutboxEventTx(prisma, TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT, withdrawal);
}

export async function notifyWithdrawalCompleted(withdrawal: WithdrawalLike) {
  return createTelegramOutboxEventTx(prisma, TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF, withdrawal, {
    txHash: withdrawal?.txHash,
  });
}

export async function notifyAutoWithdrawalSent(
  withdrawal: WithdrawalLike,
  extra: { via?: "hotwallet" | "coinex"; txHash?: string | null } = {},
) {
  return createTelegramOutboxEventTx(prisma, TELEGRAM_EVENT_TYPES.WITHDRAWAL_AUTO_SENT_PRIVATE_ALERT, withdrawal, {
    via: extra.via ?? "hotwallet",
    txHash: extra.txHash ?? withdrawal?.txHash,
  });
}

export async function notifyHotWalletLowBalance(params: {
  balance: string;
  required: string;
  pendingCount: number;
  cooldownHours?: number;
}): Promise<boolean> {
  if (!isTelegramPrivateAlertsEnabled()) return false;

  const cooldownHours = Math.max(1, Number(params.cooldownHours ?? 6));
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const since = new Date(Date.now() - cooldownMs);

  try {
    const recent = await prisma.telegramOutboxEvent.findFirst({
      where: {
        type: TELEGRAM_EVENT_TYPES.HOT_WALLET_LOW_BALANCE_ALERT,
        createdAt: { gte: since },
        status: { in: ["pending", "processing", "failed", "sent"] },
      },
      select: { id: true },
    });
    if (recent) return false;

    await prisma.telegramOutboxEvent.create({
      data: {
        type: TELEGRAM_EVENT_TYPES.HOT_WALLET_LOW_BALANCE_ALERT,
        status: "pending",
        transactionId: null,
        userId: null,
        txHash: null,
        amount: params.required ? String(params.required) : null,
        currency: "POL",
        destinationWallet: null,
        usernameSnapshot: "system",
        payload: {
          balance: params.balance,
          required: params.required,
          pendingCount: params.pendingCount,
          cooldownHours,
          triggeredAt: new Date().toISOString(),
        },
        nextRunAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function listTelegramOutboxEvents(opts: { page?: unknown; limit?: unknown } = {}) {
  const { page = 1, limit = 25 } = opts;
  const take = Math.min(100, Math.max(1, Number(limit) || 25));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;
  const [events, total] = await Promise.all([
    prisma.telegramOutboxEvent.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        type: true,
        status: true,
        transactionId: true,
        userId: true,
        txHash: true,
        amount: true,
        currency: true,
        attempts: true,
        lastError: true,
        nextRunAt: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.telegramOutboxEvent.count(),
  ]);
  return {
    events: events.map((event) => ({
      ...event,
      amount: event.amount == null ? null : Number(event.amount),
      lastError: safeError(event.lastError),
    })),
    total,
  };
}

export async function retryTelegramOutboxEvent(id: unknown) {
  const eventId = Number(id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    const error = new Error("Evento invalido.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  const event = await prisma.telegramOutboxEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  if (!["failed", "dead"].includes(event.status)) {
    const error = new Error("Apenas eventos failed/dead podem ser reenviados manualmente.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  // No worker consumes this outbox in current/ — "retry" only resets status/attempts so a
  // future worker would pick it up; it does not itself deliver anything to Telegram.
  return prisma.telegramOutboxEvent.update({
    where: { id: eventId },
    data: {
      status: "pending",
      attempts: 0,
      lastError: null,
      nextRunAt: new Date(),
      sentAt: null,
    },
    select: { id: true, type: true, status: true, attempts: true, nextRunAt: true },
  });
}

/**
 * Admin "test alert" endpoints. Legacy's worker would have picked these up and actually
 * called the Telegram Bot API; current/ has no such worker, so this only queues a test event
 * in the outbox and is documented as such at the controller layer (response includes
 * `delivered: false` + an explanatory note) — it never simulates a successful Telegram send.
 */
export async function createTelegramTestEvent(type: string, payload: Record<string, unknown> = {}) {
  const txHash = cleanString(payload.txHash);
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isValidPolygonTxHash(txHash)) {
    const error = new Error("txHash invalido.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT && !isTelegramPrivateAlertsEnabled()) {
    const error = new Error("Alerta privado Telegram nao configurado.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isTelegramPublicProofsEnabled()) {
    const error = new Error("Prova publica Telegram nao configurada.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  return prisma.telegramOutboxEvent.create({
    data: {
      type,
      status: "pending",
      txHash,
      amount: String(payload.amount ?? "0"),
      currency: "POL",
      destinationWallet: cleanString(payload.destinationWallet),
      usernameSnapshot: cleanString(payload.username) || "admin-test",
      payload: {
        isTest: true,
        username: cleanString(payload.username) || "admin-test",
        txHash,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      nextRunAt: new Date(),
    },
    select: { id: true, type: true, status: true, createdAt: true },
  });
}

export async function getTelegramWorkerHealth() {
  const settings = await getWithdrawalTelegramSettings();
  const [pending, processing, failed, dead, lastSent] = await Promise.all([
    prisma.telegramOutboxEvent.count({ where: { status: "pending" } }),
    prisma.telegramOutboxEvent.count({ where: { status: "processing" } }),
    prisma.telegramOutboxEvent.count({ where: { status: "failed" } }),
    prisma.telegramOutboxEvent.count({ where: { status: "dead" } }),
    prisma.telegramOutboxEvent.findFirst({
      where: { status: "sent" },
      orderBy: { sentAt: "desc" },
      select: { id: true, sentAt: true },
    }),
  ]);
  return {
    ok: true,
    // True once server/cron/telegram-outbox.cron.ts has started polling (see
    // telegram.worker.ts) — this reflects that the outbox IS being processed, independent of
    // whether it can actually deliver (see botTokenConfigured below). Do not conflate the two:
    // the worker can be running and still fail every send if no real token is configured.
    workerRunning: isTelegramOutboxWorkerRunning(),
    botTokenConfigured: settings.botTokenConfigured,
    configured: settings.botTokenConfigured && (settings.privateChatConfigured || settings.publicChatConfigured),
    settings,
    queue: { pending, processing, failed, dead, lastSent },
  };
}
