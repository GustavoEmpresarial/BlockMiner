/**
 * Ported from legacy/server/services/sidebarNavService.ts. Singleton row (id=1) in
 * SidebarNavConfig holds the admin-editable entries; paths/labels always come from
 * sidebar-nav.registry.ts (no arbitrary URLs from clients).
 */
import prisma from "../../core/database/prisma.js";
import { buildDefaultSidebarEntries, CATEGORY_TITLE_KEYS, coerceGamesInEarnSection, coerceInternalOfferwallEarnRoot, coerceParentLockedSidebarEntries, coerceYoutubeInEarnRewardsGroup, coerceZeradsHidden, mergeMissingSidebarRegistryEntries, SIDEBAR_ITEM_REGISTRY, SIDEBAR_SECTIONS, validateSidebarEntriesPayload, } from "./sidebar-nav.registry.js";
const SINGLETON_ID = 1;
export function buildResolvedCategories(entries) {
    const byId = new Map(entries.map((e) => [e.itemId, e]));
    // Hierarchical visibility: children under `rewards_group` are only shown when the
    // group itself is visible, mirroring legacy's isGroupVisible derivation.
    const isGroupVisible = byId.get("rewards_group")?.visible === true;
    function isShown(entry) {
        if (!entry.visible)
            return false;
        if (entry.parentItemId === "rewards_group")
            return isGroupVisible;
        return true;
    }
    const active = entries.filter(isShown);
    function rowsForSection(section) {
        const roots = active.filter((e) => e.section === section && e.parentItemId === null);
        roots.sort((a, b) => a.sortOrder - b.sortOrder);
        return roots.map((root) => {
            const def = SIDEBAR_ITEM_REGISTRY[root.itemId];
            if (def?.isGroup) {
                const children = active
                    .filter((e) => e.parentItemId === root.itemId)
                    .sort((a, b) => a.sortOrder - b.sortOrder);
                return {
                    itemId: root.itemId,
                    labelKey: def.labelKey,
                    icon: def.icon,
                    children: children.map((c) => {
                        const cdef = SIDEBAR_ITEM_REGISTRY[c.itemId];
                        return {
                            itemId: c.itemId,
                            labelKey: cdef.labelKey,
                            icon: cdef.icon,
                            path: cdef.path,
                        };
                    }),
                };
            }
            return {
                itemId: root.itemId,
                labelKey: def.labelKey,
                icon: def.icon,
                path: def.path,
            };
        });
    }
    return SIDEBAR_SECTIONS.map((section) => ({
        section,
        titleKey: CATEGORY_TITLE_KEYS[section],
        items: rowsForSection(section),
    }));
}
async function ensureRow() {
    let row = await prisma.sidebarNavConfig.findUnique({ where: { id: SINGLETON_ID } });
    if (!row) {
        const defaults = buildDefaultSidebarEntries();
        row = await prisma.sidebarNavConfig.create({
            data: { id: SINGLETON_ID, entries: defaults },
        });
    }
    return row;
}
export async function getSidebarNavForAdmin() {
    const row = await ensureRow();
    const raw = Array.isArray(row.entries) ? row.entries : [];
    const { entries: coerced, changed: lockedChanged } = coerceParentLockedSidebarEntries(raw);
    const { entries: coercedOfferwall, changed: offerwallChanged } = coerceInternalOfferwallEarnRoot(coerced);
    const { entries: coercedZerads, changed: zeradsChanged } = coerceZeradsHidden(coercedOfferwall);
    const { entries: coercedGames, changed: gamesChanged } = coerceGamesInEarnSection(coercedZerads);
    const { entries: coercedYoutube, changed: youtubeChanged } = coerceYoutubeInEarnRewardsGroup(coercedGames);
    if (lockedChanged || offerwallChanged || zeradsChanged || gamesChanged || youtubeChanged) {
        await prisma.sidebarNavConfig.update({
            where: { id: SINGLETON_ID },
            data: { entries: coercedYoutube },
        });
    }
    const { entries: merged, changed: mergeChanged } = mergeMissingSidebarRegistryEntries(coercedYoutube);
    if (mergeChanged) {
        await prisma.sidebarNavConfig.update({
            where: { id: SINGLETON_ID },
            data: { entries: merged },
        });
    }
    const parsed = validateSidebarEntriesPayload(merged);
    if (!parsed.ok) {
        const defaults = buildDefaultSidebarEntries();
        await prisma.sidebarNavConfig.update({
            where: { id: SINGLETON_ID },
            data: { entries: defaults },
        });
        return { entries: defaults, categories: buildResolvedCategories(defaults) };
    }
    return {
        entries: parsed.entries,
        categories: buildResolvedCategories(parsed.entries),
    };
}
export async function getSidebarNavCategoriesPublic() {
    const { categories } = await getSidebarNavForAdmin();
    return categories;
}
export async function saveSidebarNavEntries(bodyEntries) {
    const raw = Array.isArray(bodyEntries) ? bodyEntries : [];
    const { entries: afterLocked } = coerceParentLockedSidebarEntries(raw);
    const { entries: afterOfferwall } = coerceInternalOfferwallEarnRoot(afterLocked);
    const { entries: afterZerads } = coerceZeradsHidden(afterOfferwall);
    const { entries: coerced } = coerceGamesInEarnSection(afterZerads);
    const { entries: afterYoutube } = coerceYoutubeInEarnRewardsGroup(coerced);
    const v = validateSidebarEntriesPayload(afterYoutube);
    if (!v.ok)
        return { ok: false, code: v.code };
    await ensureRow();
    await prisma.sidebarNavConfig.update({
        where: { id: SINGLETON_ID },
        data: { entries: v.entries },
    });
    return { ok: true, entries: v.entries, categories: buildResolvedCategories(v.entries) };
}
/** Normalize app paths for comparison (matches client router paths). */
export function normalizeSidebarPath(path) {
    if (typeof path !== "string" || !path.startsWith("/"))
        return "";
    const base = path.split("?")[0] ?? "";
    if (base.length > 1 && base.endsWith("/"))
        return base.slice(0, -1);
    return base;
}
/** Collect visible user-app paths from resolved sidebar categories (public nav payload). */
export function collectVisiblePathsFromCategories(categories) {
    const paths = new Set();
    if (!Array.isArray(categories))
        return paths;
    for (const cat of categories) {
        for (const item of cat.items || []) {
            if (typeof item.path === "string") {
                const n = normalizeSidebarPath(item.path);
                if (n)
                    paths.add(n);
            }
            for (const child of item.children || []) {
                if (typeof child.path === "string") {
                    const n = normalizeSidebarPath(child.path);
                    if (n)
                        paths.add(n);
                }
            }
        }
    }
    return paths;
}
export async function getVisibleSidebarPaths() {
    const categories = await getSidebarNavCategoriesPublic();
    return collectVisiblePathsFromCategories(categories);
}
export async function isSidebarPathVisible(path) {
    const normalized = normalizeSidebarPath(path);
    if (!normalized)
        return false;
    const paths = await getVisibleSidebarPaths();
    return paths.has(normalized);
}
