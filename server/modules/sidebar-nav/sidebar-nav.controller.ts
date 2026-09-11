// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { buildAdminItemMeta } from "./sidebar-nav.registry.js";
import { SIDEBAR_NAV_ERROR } from "./sidebar-nav.errors.js";
import { getSidebarNavCategoriesPublic, getSidebarNavForAdmin, saveSidebarNavEntries, } from "./sidebar-nav.service.js";
export async function getPublicNav(_req, res) {
    try {
        const categories = await getSidebarNavCategoriesPublic();
        res.json({ ok: true, categories });
    }
    catch {
        res.status(500).json({ ok: false, code: SIDEBAR_NAV_ERROR.LOAD_FAILED });
    }
}
export async function getAdminNav(_req, res) {
    try {
        const { entries, categories } = await getSidebarNavForAdmin();
        res.json({
            ok: true,
            entries,
            categories,
            itemMeta: buildAdminItemMeta(),
        });
    }
    catch {
        res.status(500).json({ ok: false, code: SIDEBAR_NAV_ERROR.LOAD_FAILED });
    }
}
export async function putAdminNav(req, res) {
    const bodyEntries = req.body?.entries;
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
    }
    catch {
        res.status(500).json({ ok: false, code: SIDEBAR_NAV_ERROR.SAVE_FAILED });
    }
}
