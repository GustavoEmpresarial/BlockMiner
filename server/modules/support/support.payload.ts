/**
 * Support ticket message encoding: optional image attachments without extra DB columns.
 * Ported from legacy/server/utils/supportMessagePayload.ts.
 */

const PAYLOAD_PREFIX = "__BM_SPT1__\n";
const MAX_ATTACHMENTS = 5;
const MAX_URL_LENGTH = 512;
const MAX_BODY_LENGTH = 12000;

export function isAllowedUploadUrl(url: unknown): boolean {
  const u = String(url || "").trim();
  if (!u.startsWith("/media/")) return false;
  if (u.includes("..") || u.includes("\\")) return false;
  if (u.length > MAX_URL_LENGTH) return false;
  return true;
}

function sanitizeAttachment(attachment: unknown): { url: string; mimeType?: string } | null {
  if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) return null;
  const a = attachment as Record<string, unknown>;
  const url = typeof a.url === "string" ? a.url.trim() : "";
  if (!isAllowedUploadUrl(url)) return null;
  const mimeType = typeof a.mimeType === "string" ? a.mimeType.trim().slice(0, 120) : undefined;
  return mimeType ? { url, mimeType } : { url };
}

export function serializeSupportPayload(
  body: unknown,
  attachments: Array<{ url: string; mimeType?: string }> = [],
): string {
  const trimmed = String(body ?? "").slice(0, MAX_BODY_LENGTH).trimEnd();
  const list = Array.isArray(attachments) ? attachments.slice(0, MAX_ATTACHMENTS) : [];
  const safe = list.map(sanitizeAttachment).filter(Boolean) as Array<{ url: string; mimeType?: string }>;
  if (safe.length === 0) return trimmed;
  return PAYLOAD_PREFIX + JSON.stringify({ v: 1, body: trimmed, attachments: safe });
}

export function parseSupportPayload(raw: unknown): {
  body: string;
  attachments: Array<{ url: string; mimeType?: string }>;
} {
  const s = String(raw ?? "");
  if (!s.startsWith(PAYLOAD_PREFIX)) {
    return { body: s, attachments: [] };
  }
  try {
    const data = JSON.parse(s.slice(PAYLOAD_PREFIX.length)) as {
      v?: number;
      body?: unknown;
      attachments?: unknown;
    };
    if (data?.v !== 1 || typeof data.body !== "string") {
      return { body: s, attachments: [] };
    }
    const attachments = Array.isArray(data.attachments)
      ? (data.attachments.map(sanitizeAttachment).filter(Boolean) as Array<{ url: string; mimeType?: string }>)
      : [];
    return { body: data.body.slice(0, MAX_BODY_LENGTH), attachments };
  } catch {
    return { body: s, attachments: [] };
  }
}

export type PublicSupportReply = {
  id: number;
  supportMessageId: number;
  senderId: number | null;
  isAdmin: boolean;
  createdAt: Date;
  body: string;
  attachments: Array<{ url: string; mimeType?: string }>;
  /** @deprecated Use `body`; kept for older clients */
  message: string;
};

export function toPublicSupportReply(row: {
  id: number;
  supportMessageId: number;
  senderId: number | null;
  isAdmin: boolean;
  createdAt: Date;
  message: string;
} | null): PublicSupportReply | null {
  if (!row) return null;
  const { body, attachments } = parseSupportPayload(row.message);
  return {
    id: row.id,
    supportMessageId: row.supportMessageId,
    senderId: row.senderId,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
    body,
    attachments,
    message: body,
  };
}

