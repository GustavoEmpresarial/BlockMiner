/**
 * Ported from legacy/server/modules/banners/banner.controller.ts.
 * Image upload itself is NOT handled here — banners reuse the generic
 * POST /api/admin/upload-image?category=banners endpoint from the media module
 * (see server/modules/media/index.ts); this controller only persists the resulting
 * imageUrl string, same as legacy.
 */
import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import * as bannersRepo from "./banners.repository.js";
import { parseBannerUtcMidnight, type BannerWriteBody } from "./banners.types.js";

const log = logger.child("banners.controller");

export async function getActiveBanners(_req: Request, res: Response): Promise<void> {
  try {
    const banners = await bannersRepo.listActiveBannersNow(new Date());
    res.json({ ok: true, banners });
  } catch (err: unknown) {
    log.error("getActiveBanners failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao buscar banners." });
  }
}

export async function adminList(_req: Request, res: Response): Promise<void> {
  try {
    const banners = await bannersRepo.listAllBanners();
    res.json({ ok: true, banners });
  } catch (err: unknown) {
    log.error("adminList failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao listar banners." });
  }
}

export async function adminCreate(req: Request<unknown, unknown, BannerWriteBody>, res: Response): Promise<void> {
  try {
    const { title, message, imageUrl, type, link, linkLabel, isActive, startsAt, endsAt } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ ok: false, message: "Título é obrigatório." });
      return;
    }
    const banner = await bannersRepo.createBanner({
      title: title.trim(),
      message: message?.trim() || "",
      imageUrl: imageUrl?.trim() || null,
      type: type || "info",
      link: link?.trim() || null,
      linkLabel: linkLabel?.trim() || null,
      isActive: isActive !== false,
      startsAt: parseBannerUtcMidnight(startsAt),
      endsAt: parseBannerUtcMidnight(endsAt),
    });
    res.json({ ok: true, banner });
  } catch (err: unknown) {
    log.error("adminCreate failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao criar banner." });
  }
}

type IdParams = { id: string };

export async function adminUpdate(req: Request<IdParams, unknown, BannerWriteBody>, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, message, imageUrl, type, link, linkLabel, isActive, startsAt, endsAt } = req.body;
    const banner = await bannersRepo.updateBanner(id, {
      ...(title !== undefined && { title: title.trim() }),
      ...(message !== undefined && { message: message.trim() }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
      ...(type !== undefined && { type }),
      link: link?.trim() || null,
      linkLabel: linkLabel?.trim() || null,
      ...(isActive !== undefined && { isActive }),
      startsAt: parseBannerUtcMidnight(startsAt),
      endsAt: parseBannerUtcMidnight(endsAt),
    });
    res.json({ ok: true, banner });
  } catch (err: unknown) {
    log.error("adminUpdate failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao atualizar banner." });
  }
}

export async function adminDelete(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    await bannersRepo.deleteBanner(id);
    res.json({ ok: true });
  } catch (err: unknown) {
    log.error("adminDelete failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao excluir banner." });
  }
}
