import { z } from "zod";
import { parseSupportPayload, toPublicSupportReply } from "./support.payload.js";

export type TicketRow = Record<string, unknown>;

export const attachmentSchema = z
  .object({
    url: z.string().min(1).max(512),
    mimeType: z.string().max(120).optional(),
  })
  .strict();

export const supportTicketIdParamSchema = z
  .object({
    id: z.coerce
      .number()
      .int()
      .positive("ID deve ser um número inteiro positivo.")
      .max(2_147_483_647, "ID excede o limite máximo permitido de 32 bits."),
  })
  .strict();

export const createMessageSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(12000),
    attachments: z.array(attachmentSchema).max(5).optional(),
  })
  .strict();

export const replySchema = z
  .object({
    message: z.string().trim().min(1).max(12000),
    attachments: z.array(attachmentSchema).max(5).optional(),
  })
  .strict();

export const creditPolSchema = z
  .object({
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
  })
  .strict();

export const adminReplySchema = z
  .object({
    reply: z.string().trim().min(1).max(12000).optional(),
    message: z.string().trim().min(1).max(12000).optional(),
    attachments: z.array(attachmentSchema).max(5).optional(),
    closeTicket: z.boolean().optional().default(false),
  })
  .strict()
  .refine(
    (data) => Boolean((data.reply && data.reply.length > 0) || (data.message && data.message.length > 0)),
    {
      message: "Reply content is required.",
      path: ["reply"],
    }
  );

export const adminSupportListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    userId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
    archived: z.union([z.boolean(), z.enum(["0", "1", "true", "false", ""])]).optional().default(""),
    status: z.enum(["all", "pending", "unread", "replied", "archived"]).optional().default("all"),
  })
  .strict()
  .transform((data) => ({
    page: data.page,
    limit: data.limit,
    userId: data.userId ?? null,
    archived: data.archived === true || data.archived === "1" || data.archived === "true",
    status: data.status,
  }));

export const adminSupportArchiveSchema = z
  .object({
    archived: z.boolean().default(true),
  })
  .strict();

export const adminSupportDossierQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(10).max(80).default(30),
    depositsPage: z.coerce.number().int().positive().default(1),
    ccpaymentPage: z.coerce.number().int().positive().default(1),
    withdrawalsPage: z.coerce.number().int().positive().default(1),
    payoutsPage: z.coerce.number().int().positive().default(1),
    minersPage: z.coerce.number().int().positive().default(1),
    inventoryPage: z.coerce.number().int().positive().default(1),
    vaultPage: z.coerce.number().int().positive().default(1),
  })
  .strict();

export type SupportTicketIdParam = z.infer<typeof supportTicketIdParamSchema>;
export type AdminSupportListQuery = z.infer<typeof adminSupportListQuerySchema>;
export type AdminSupportArchiveInput = z.infer<typeof adminSupportArchiveSchema>;
export type AdminSupportDossierQuery = z.infer<typeof adminSupportDossierQuerySchema>;
export type CreditPolInput = z.infer<typeof creditPolSchema>;
export type AdminReplyInput = z.infer<typeof adminReplySchema>;

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

