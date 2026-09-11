/**
 * Ported from legacy/server/modules/partnerGames/partnerGames.controller.ts (admin section).
 * Deviation (documented): the embed-probe classifier was dropped as admin-UX-only (see
 * partner-games.launch-mode.ts header) — admins set `launchMode` directly via the JSON body.
 * `uploadPartnerGameCover` now uses the media module (Fase 8) — category "partner-games".
 */
import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { createCategoryUpload, uploadedFileUrl } from "../media/index.js";
import * as partnerGamesRepo from "./partner-games.repository.js";
import { slugifyPartnerGameTitle } from "./partner-games.service.js";
import { inferPartnerLaunchMode, parsePartnerLaunchMode } from "./partner-games.launch-mode.js";
import { registerPartnerGameFrameHosts, refreshFrameAllowlistBestEffort } from "./partner-games.frame-host.js";

const log = logger.child("partner-games.admin.controller");

const partnerGameCoverUpload = createCategoryUpload("partner-games", { prefix: "pg" });

/** Admin cover upload — field "cover", stored under media category "partner-games". */
export function uploadPartnerGameCover(req: Request, res: Response): void {
  partnerGameCoverUpload.single("cover")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "Upload inválido." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
      return;
    }
    res.json({ ok: true, url: uploadedFileUrl("partner-games", req.file.filename) });
  });
}

function refreshFrameAllowlistAfterMutation(iframeUrl: string, extras: Array<string | null | undefined> = []) {
  void registerPartnerGameFrameHosts(prisma, [iframeUrl, ...extras]).then(() => {
    refreshFrameAllowlistBestEffort(prisma);
  });
}

function parseGameInput(body: unknown): {
  title?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  iframeUrl?: string;
  fallbackUrl?: string | null;
  partnerUrl?: string | null;
  isVisible?: boolean;
  sortOrder?: number;
  slug?: string;
  launchMode?: string;
} {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof b.title === "string" && b.title.trim()) out.title = b.title.trim().slice(0, 200);
  if (b.description !== undefined) out.description = b.description ? String(b.description).trim().slice(0, 1000) || null : null;
  if (b.coverImageUrl !== undefined) out.coverImageUrl = b.coverImageUrl ? String(b.coverImageUrl).trim() || null : null;
  if (typeof b.iframeUrl === "string" && b.iframeUrl.trim()) out.iframeUrl = b.iframeUrl.trim();
  if (b.fallbackUrl !== undefined) out.fallbackUrl = b.fallbackUrl ? String(b.fallbackUrl).trim() || null : null;
  if (b.partnerUrl !== undefined) out.partnerUrl = b.partnerUrl ? String(b.partnerUrl).trim() || null : null;
  if (b.isVisible !== undefined) out.isVisible = Boolean(b.isVisible);
  if (b.sortOrder !== undefined) {
    const n = Number(b.sortOrder);
    if (Number.isFinite(n)) out.sortOrder = Math.trunc(n);
  }
  if (typeof b.slug === "string" && b.slug.trim()) out.slug = slugifyPartnerGameTitle(b.slug.trim());
  if (b.launchMode !== undefined) {
    const mode = parsePartnerLaunchMode(b.launchMode);
    if (mode) out.launchMode = mode;
  }
  return out;
}

function validateUrlOrNull(value: unknown): string | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "INVALID";
    return s;
  } catch {
    return "INVALID";
  }
}

export async function adminListPartnerGames(_req: Request, res: Response): Promise<void> {
  const games = await partnerGamesRepo.listAllPartnerGamesAdmin();
  res.json({ ok: true, games });
}

export async function adminCreatePartnerGame(req: Request, res: Response): Promise<void> {
  const input = parseGameInput(req.body);
  if (!input.title) {
    res.status(400).json({ ok: false, message: "title é obrigatório." });
    return;
  }
  if (!input.iframeUrl) {
    res.status(400).json({ ok: false, message: "iframeUrl é obrigatório." });
    return;
  }
  const iframeOk = validateUrlOrNull(input.iframeUrl);
  if (iframeOk === "INVALID" || iframeOk === null) {
    res.status(400).json({ ok: false, message: "iframeUrl inválida." });
    return;
  }
  const fallbackOk = validateUrlOrNull(input.fallbackUrl ?? null);
  if (fallbackOk === "INVALID") {
    res.status(400).json({ ok: false, message: "fallbackUrl inválida." });
    return;
  }
  const partnerOk = validateUrlOrNull(input.partnerUrl ?? null);
  if (partnerOk === "INVALID") {
    res.status(400).json({ ok: false, message: "partnerUrl inválida." });
    return;
  }

  const launchMode = parsePartnerLaunchMode(input.launchMode) ?? inferPartnerLaunchMode(iframeOk);

  const game = await partnerGamesRepo.createPartnerGame({
    slug: input.slug ?? slugifyPartnerGameTitle(input.title),
    title: input.title,
    description: input.description ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    iframeUrl: iframeOk,
    fallbackUrl: fallbackOk,
    partnerUrl: partnerOk,
    launchMode,
    isVisible: input.isVisible ?? true,
    sortOrder: input.sortOrder ?? 0,
  });
  log.info("admin_created", { id: game.id, title: game.title });
  refreshFrameAllowlistAfterMutation(iframeOk, [fallbackOk, partnerOk]);
  const refreshed = await partnerGamesRepo.findPartnerGameById(game.id);
  res.json({ ok: true, game: refreshed });
}

export async function adminUpdatePartnerGame(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "id inválido." });
    return;
  }
  const existing = await partnerGamesRepo.findPartnerGameById(id);
  if (!existing) {
    res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
    return;
  }

  const input = parseGameInput(req.body);
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;

  if (input.iframeUrl !== undefined) {
    const ok = validateUrlOrNull(input.iframeUrl);
    if (ok === "INVALID" || ok === null) {
      res.status(400).json({ ok: false, message: "iframeUrl inválida." });
      return;
    }
    data.iframeUrl = ok;
  }
  if (input.fallbackUrl !== undefined) {
    const ok = validateUrlOrNull(input.fallbackUrl);
    if (ok === "INVALID") {
      res.status(400).json({ ok: false, message: "fallbackUrl inválida." });
      return;
    }
    data.fallbackUrl = ok;
  }
  if (input.partnerUrl !== undefined) {
    const ok = validateUrlOrNull(input.partnerUrl);
    if (ok === "INVALID") {
      res.status(400).json({ ok: false, message: "partnerUrl inválida." });
      return;
    }
    data.partnerUrl = ok;
  }
  if (input.isVisible !== undefined) data.isVisible = input.isVisible;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.launchMode !== undefined) {
    const mode = parsePartnerLaunchMode(input.launchMode);
    if (mode) data.launchMode = mode;
  } else if (typeof data.iframeUrl === "string") {
    data.launchMode = inferPartnerLaunchMode(data.iframeUrl);
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ ok: false, message: "Nenhum campo para atualizar." });
    return;
  }

  await partnerGamesRepo.updatePartnerGame(id, data);
  log.info("admin_updated", { id, fields: Object.keys(data) });
  const iframeForHost = typeof data.iframeUrl === "string" ? data.iframeUrl : existing.iframeUrl;
  refreshFrameAllowlistAfterMutation(iframeForHost, [
    typeof data.fallbackUrl === "string" ? data.fallbackUrl : existing.fallbackUrl,
    typeof data.partnerUrl === "string" ? data.partnerUrl : existing.partnerUrl,
  ]);
  const refreshed = await partnerGamesRepo.findPartnerGameById(id);
  res.json({ ok: true, game: refreshed });
}

export async function adminDeletePartnerGame(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "id inválido." });
    return;
  }
  const existing = await partnerGamesRepo.findPartnerGameById(id);
  if (!existing) {
    res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
    return;
  }
  await partnerGamesRepo.deletePartnerGame(id);
  log.info("admin_deleted", { id });
  refreshFrameAllowlistBestEffort(prisma);
  res.json({ ok: true });
}
