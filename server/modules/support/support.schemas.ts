import { z } from "zod";
import { parseSupportPayload, toPublicSupportReply } from "./support.payload.js";

export type TicketRow = Record<string, unknown>;

export const attachmentSchema = z.object({
  url: z.string().min(1).max(512),
  mimeType: z.string().max(120).optional(),
});

export const createMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(12000),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

export const replySchema = z.object({
  message: z.string().trim().min(1).max(12000),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

export const creditPolSchema = z.object({
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    })
    .refine((n) => Number.isFinite(n) && n > 0 && n <= 1000, {
      message: "Amount must be a positive number up to 1000.",
    }),
  reason: z.string().trim().min(3).max(500),
});

export const adminReplySchema = z.object({
  reply: z.string().trim().min(1).max(12000).optional(),
  message: z.string().trim().min(1).max(12000).optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

export interface SupportPaginationOpts {
  defaultLimit: number;
  maxLimit: number;
}

export function parseSupportPagination(
  req: { query: Record<string, unknown> },
  opts: SupportPaginationOpts
): { limit: number; page: number; skip: number } {
  const limit = Math.min(
    opts.maxLimit,
    Math.max(1, parseInt(String(req.query.limit), 10) || opts.defaultLimit)
  );
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

export function enrichTicket(row: Record<string, unknown>): Record<string, unknown> {
  const { message: rawBody, replies, ...rest } = row;
  const root = parseSupportPayload(typeof rawBody === "string" ? rawBody : "");
  const publicReplies = (Array.isArray(replies) ? replies : [])
    .map((r) => toPublicSupportReply(r as Parameters<typeof toPublicSupportReply>[0]))
    .filter(Boolean);
  return {
    ...rest,
    body: root.body,
    attachments: root.attachments,
    message: root.body,
    replies: publicReplies,
  };
}

/** Public-support (guest) sanitize helpers — ported from legacy publicSupport.controller. */
export const PS_MAX_SUBJECT_LEN = 120;
export const PS_MAX_MSG_LEN = 2000;
export const PS_MAX_NAME_LEN = 80;
export const PS_MAX_URL_LEN = 512;

export function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export function isValidEmail(s: unknown): boolean {
  if (typeof s !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function sanitizeImageUrl(v: unknown): string | null {
  const s = sanitizeStr(v, PS_MAX_URL_LEN);
  if (!s) return null;
  if (!/^\/uploads\/[\w\-.]+$/.test(s) && !/^\/media\/[\w\-./]+$/.test(s)) return null;
  return s;
}

