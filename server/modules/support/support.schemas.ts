// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { z } from "zod";
import { parseSupportPayload, toPublicSupportReply } from "./support.payload.js";

// TODO: was a type-only export erased from the compiled dist/ this file was
// reconstructed from — placeholder `any` shape just restores buildability;
// someone should tighten this to the real support-ticket row shape.
export type TicketRow = any;
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
export function parseSupportPagination(req, opts) {
    const limit = Math.min(opts.maxLimit, Math.max(1, parseInt(String(req.query.limit), 10) || opts.defaultLimit));
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const skip = (page - 1) * limit;
    return { limit, page, skip };
}
export function enrichTicket(row) {
    const { message: rawBody, replies, ...rest } = row;
    const root = parseSupportPayload(rawBody);
    const publicReplies = (replies ?? []).map((r) => toPublicSupportReply(r)).filter(Boolean);
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
export function sanitizeStr(v, max) {
    if (typeof v !== "string")
        return "";
    return v.trim().slice(0, max);
}
export function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
export function sanitizeImageUrl(v) {
    const s = sanitizeStr(v, PS_MAX_URL_LEN);
    if (!s)
        return null;
    if (!/^\/uploads\/[\w\-.]+$/.test(s) && !/^\/media\/[\w\-./]+$/.test(s))
        return null;
    return s;
}
