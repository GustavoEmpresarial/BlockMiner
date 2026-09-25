import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { reportError } from "../../core/errors/index.js";
import { logAdminAction } from "../admin/admin.audit-log.service.js";
import * as bannersRepo from "./banners.repository.js";
import { BANNER_ERROR } from "./banners.errors.js";
import { parseBannerUtcMidnight } from "./banners.types.js";
import {
  bannerIdParamSchema,
  createBannerSchema,
  updateBannerSchema,
} from "./banners.schemas.js";

const log = logger.child("banners.controller");

export async function getActiveBanners(_req: Request, res: Response): Promise<void> {
  try {
    const banners = await bannersRepo.listActiveBannersNow(new Date());
    res.json({ ok: true, banners });
  } catch (err: unknown) {
    log.error("getActiveBanners failed", { error: String(err) });
    reportError({
      code: "BANNERS_LIST_ACTIVE_FAILED",
      category: "DATABASE",
      severity: "ERROR",
      module: "banners.active",
      error: err,
    });
    res.status(500).json({
      ok: false,
      code: BANNER_ERROR.INTERNAL_ERROR,
      message: "Erro ao buscar banners ativos.",
    });
  }
}

export async function adminList(_req: Request, res: Response): Promise<void> {
  try {
    const banners = await bannersRepo.listAllBanners();
    res.json({ ok: true, banners });
  } catch (err: unknown) {
    log.error("adminList failed", { error: String(err) });
    reportError({
      code: "BANNERS_ADMIN_LIST_FAILED",
      category: "DATABASE",
      severity: "ERROR",
      module: "banners.admin_list",
      error: err,
    });
    res.status(500).json({
      ok: false,
      code: BANNER_ERROR.INTERNAL_ERROR,
      message: "Erro ao listar banners administrativos.",
    });
  }
}

export async function adminCreate(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createBannerSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      res.status(400).json({
        ok: false,
        code: BANNER_ERROR.VALIDATION_ERROR,
        message: issue?.message || "Dados do banner inválidos.",
        errors: parsed.error.format(),
      });
      return;
    }

    const data = parsed.data;
    const banner = await bannersRepo.createBanner({
      title: data.title,
      message: data.message || "",
      imageUrl: data.imageUrl || null,
      type: data.type,
      link: data.link || null,
      linkLabel: data.linkLabel || null,
      isActive: data.isActive,
      startsAt: parseBannerUtcMidnight(data.startsAt),
      endsAt: parseBannerUtcMidnight(data.endsAt),
    });

    const adminUser = (req as unknown as { admin?: { id?: number; email?: string } }).admin;
    await logAdminAction({
      adminId: adminUser?.id,
      adminEmail: adminUser?.email,
      action: "admin_banner_created",
      module: "banners",
      resource: "dashboard_banner",
      resourceId: String(banner.id),
      newValue: banner,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
      success: true,
    });

    res.status(201).json({ ok: true, banner });
  } catch (err: unknown) {
    log.error("adminCreate failed", { error: String(err) });
    reportError({
      code: "BANNERS_ADMIN_CREATE_FAILED",
      category: "DATABASE",
      severity: "ERROR",
      module: "banners.admin_create",
      error: err,
      req,
    });
    res.status(500).json({
      ok: false,
      code: BANNER_ERROR.INTERNAL_ERROR,
      message: "Erro ao criar banner.",
    });
  }
}

export async function adminUpdate(req: Request, res: Response): Promise<void> {
  try {
    const parsedParams = bannerIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        ok: false,
        code: BANNER_ERROR.INVALID_ID,
        message: parsedParams.error.issues[0]?.message || "ID de banner inválido.",
      });
      return;
    }

    const { id } = parsedParams.data;
    const existing = await bannersRepo.findBannerById(id);
    if (!existing) {
      res.status(404).json({
        ok: false,
        code: BANNER_ERROR.NOT_FOUND,
        message: "Banner não encontrado.",
      });
      return;
    }

    const parsedBody = updateBannerSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0];
      res.status(400).json({
        ok: false,
        code: BANNER_ERROR.VALIDATION_ERROR,
        message: issue?.message || "Dados de atualização inválidos.",
        errors: parsedBody.error.format(),
      });
      return;
    }

    const data = parsedBody.data;
    const banner = await bannersRepo.updateBanner(id, {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.message !== undefined && { message: data.message }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.link !== undefined && { link: data.link || null }),
      ...(data.linkLabel !== undefined && { linkLabel: data.linkLabel || null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.startsAt !== undefined && { startsAt: parseBannerUtcMidnight(data.startsAt) }),
      ...(data.endsAt !== undefined && { endsAt: parseBannerUtcMidnight(data.endsAt) }),
    });

    const adminUser = (req as unknown as { admin?: { id?: number; email?: string } }).admin;
    await logAdminAction({
      adminId: adminUser?.id,
      adminEmail: adminUser?.email,
      action: "admin_banner_updated",
      module: "banners",
      resource: "dashboard_banner",
      resourceId: String(banner.id),
      oldValue: existing,
      newValue: banner,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
      success: true,
    });

    res.json({ ok: true, banner });
  } catch (err: unknown) {
    log.error("adminUpdate failed", { error: String(err) });
    reportError({
      code: "BANNERS_ADMIN_UPDATE_FAILED",
      category: "DATABASE",
      severity: "ERROR",
      module: "banners.admin_update",
      error: err,
      req,
    });
    res.status(500).json({
      ok: false,
      code: BANNER_ERROR.INTERNAL_ERROR,
      message: "Erro ao atualizar banner.",
    });
  }
}

export async function adminDelete(req: Request, res: Response): Promise<void> {
  try {
    const parsedParams = bannerIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        ok: false,
        code: BANNER_ERROR.INVALID_ID,
        message: parsedParams.error.issues[0]?.message || "ID de banner inválido.",
      });
      return;
    }

    const { id } = parsedParams.data;
    const existing = await bannersRepo.findBannerById(id);
    if (!existing) {
      res.status(404).json({
        ok: false,
        code: BANNER_ERROR.NOT_FOUND,
        message: "Banner não encontrado.",
      });
      return;
    }

    await bannersRepo.deleteBanner(id);

    const adminUser = (req as unknown as { admin?: { id?: number; email?: string } }).admin;
    await logAdminAction({
      adminId: adminUser?.id,
      adminEmail: adminUser?.email,
      action: "admin_banner_deleted",
      module: "banners",
      resource: "dashboard_banner",
      resourceId: String(id),
      oldValue: existing,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
      success: true,
    });

    res.json({ ok: true });
  } catch (err: unknown) {
    log.error("adminDelete failed", { error: String(err) });
    reportError({
      code: "BANNERS_ADMIN_DELETE_FAILED",
      category: "DATABASE",
      severity: "ERROR",
      module: "banners.admin_delete",
      error: err,
      req,
    });
    res.status(500).json({
      ok: false,
      code: BANNER_ERROR.INTERNAL_ERROR,
      message: "Erro ao excluir banner.",
    });
  }
}
