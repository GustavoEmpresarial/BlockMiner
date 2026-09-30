import type { Request, Response } from "express";
import { buildAdminItemMeta } from "./sidebar-nav.registry.js";
import { SIDEBAR_NAV_ERROR } from "./sidebar-nav.errors.js";
import {
  getSidebarNavCategoriesPublic,
  getSidebarNavForAdmin,
  saveSidebarNavEntries,
} from "./sidebar-nav.service.js";
import { putSidebarNavSchema } from "./sidebar-nav.schemas.js";
import { logAdminAction } from "../admin/index.js";

export async function getPublicNav(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await getSidebarNavCategoriesPublic();
    res.json({ ok: true, categories });
  } catch {
    res.status(500).json({ ok: false, code: SIDEBAR_NAV_ERROR.LOAD_FAILED });
  }
}

export async function getAdminNav(_req: Request, res: Response): Promise<void> {
  try {
    const { entries, categories } = await getSidebarNavForAdmin();
    res.json({
      ok: true,
      entries,
      categories,
      itemMeta: buildAdminItemMeta(),
    });
  } catch {
    res.status(500).json({ ok: false, code: SIDEBAR_NAV_ERROR.LOAD_FAILED });
  }
}

export async function putAdminNav(req: Request, res: Response): Promise<void> {
  const parsed = putSidebarNavSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      code: "validation_error",
      errors: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await saveSidebarNavEntries(parsed.data.entries);
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.code });
      return;
    }

    void logAdminAction({
      adminId: req.admin?.adminId ?? null,
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_UPDATE_SIDEBAR_NAV",
      module: "sidebar_nav",
      resource: "SidebarNavConfig",
      resourceId: "1",
      ip: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      newValue: { count: result.entries.length },
    });

    res.json({
      ok: true,
      entries: result.entries,
      categories: result.categories,
    });
  } catch {
    res.status(500).json({ ok: false, code: SIDEBAR_NAV_ERROR.SAVE_FAILED });
  }
}


