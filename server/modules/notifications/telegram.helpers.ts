/** Ported 1:1 from legacy/server/modules/telegram/telegram.helpers.ts. */
import { TELEGRAM_EVENT_TYPES } from "./telegram.types.js";
import type { WithdrawalLike } from "./telegram.types.js";

const CHAT_ID_PATTERN = /^-?\d{5,30}$/;
const THREAD_ID_PATTERN = /^\d{1,12}$/;
const MAX_LAST_ERROR = 500;

export function cleanString(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

export function boolFromEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export function maskSecret(value: unknown): string {
  const s = cleanString(value);
  if (!s) return "";
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

export function safeError(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.replace(/bot\d{6,}:[A-Za-z0-9_-]+/g, "bot[redacted]").slice(0, MAX_LAST_ERROR);
}

export function isValidPolygonTxHash(value: unknown): boolean {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

export function normalizeChatId(value: unknown, label = "chat_id"): string | null {
  const next = cleanString(value);
  if (!next) return null;
  if (!CHAT_ID_PATTERN.test(next)) {
    const error = new Error(`${label} invalido.`);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  return next;
}

export function normalizeThreadId(value: unknown): number | null {
  const next = cleanString(value);
  if (!next) return null;
  if (!THREAD_ID_PATTERN.test(next)) {
    const error = new Error("message_thread_id invalido.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  const numeric = Number(next);
  if (!Number.isSafeInteger(numeric) || numeric < 1) {
    const error = new Error("message_thread_id invalido.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  return numeric;
}

export function normalizePolygonscanBaseUrl(value: unknown = process.env.POLYGONSCAN_BASE_URL): string {
  const raw = cleanString(value) || "https://polygonscan.com";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    const error = new Error("POLYGONSCAN_BASE_URL invalida.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  if (url.protocol !== "https:" || !/(^|\.)polygonscan\.com$/i.test(url.hostname)) {
    const error = new Error("POLYGONSCAN_BASE_URL precisa usar HTTPS em dominio polygonscan.com.");
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export function maskEmail(value: unknown): string | null {
  const email = cleanString(value);
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  const prefix = local.slice(0, 2);
  return `${prefix}${local.length > 2 ? "•••" : "•"}@${domain}`;
}

export function snapshotUsername(transaction: WithdrawalLike | null | undefined): string | null {
  return (
    cleanString(transaction?.user?.username) ||
    cleanString(transaction?.user?.email) ||
    (transaction?.userId ? `user-${transaction.userId}` : null)
  );
}

export function publicPayloadForEvent(
  type: string,
  transaction: WithdrawalLike | null | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const user = transaction?.user;
  const base = {
    transactionId: transaction?.id ?? null,
    userId: transaction?.userId ?? user?.id ?? null,
    username: cleanString(user?.username) || null,
    emailMasked: maskEmail(user?.email),
    status: transaction?.status || null,
    createdAt: transaction?.createdAt ?? null,
    completedAt: transaction?.completedAt || null,
  };
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT) {
    return {
      ...base,
      destinationWallet: cleanString(transaction?.address),
      registrationIp: cleanString(user?.registrationIp),
      lastIp: cleanString(user?.ip),
      ...extra,
    };
  }
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_AUTO_SENT_PRIVATE_ALERT) {
    return {
      ...base,
      destinationWallet: cleanString(transaction?.address),
      via: cleanString(extra.via) || "hotwallet",
      auto: true,
      ...extra,
    };
  }
  return { ...base, ...extra };
}
