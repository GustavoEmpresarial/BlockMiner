import type { Request, Response } from "express";
import { buildAdminItemMeta } from "./sidebar-nav.registry.js";
import { SIDEBAR_NAV_ERROR } from "./sidebar-nav.errors.js";
import {
  getSidebarNavCategoriesPublic,
  getSidebarNavForAdmin,
  saveSidebarNavEntries,
} from "./sidebar-nav.service.js";

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
  const bodyEntries = (req.body as { entries?: unknown } | undefined)?.entries;
  try {
    const result = await saveSidebarNavEntries(bodyEntries);
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.code });
      return;
    }
    res.json({
      ok: true,
      entries: result.entries,
      categories: result.categories,
    });
  } catch {
    res.status(500).json({ ok: false, code: SIDEBAR_NAV_ERROR.SAVE_FAILED });
  }
}

