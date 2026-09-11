// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
export const SIDEBAR_ITEM_REGISTRY = {
    dashboard: {
        path: "/dashboard",
        labelKey: "sidebar.dashboard",
        icon: "LayoutDashboard",
        section: "main",
        defaultParentItemId: null,
    },
    power_stats: {
        path: "/power-stats",
        labelKey: "sidebar.power_stats",
        icon: "BarChart3",
        section: "main",
        defaultParentItemId: null,
    },
    machines: {
        path: "/inventory",
        labelKey: "sidebar.machines",
        icon: "Cpu",
        section: "main",
        defaultParentItemId: null,
    },
    inventario: {
        path: "/inventario",
        labelKey: "sidebar.inventario",
        icon: "Package",
        section: "main",
        defaultParentItemId: null,
    },
    shop: {
        path: "/shop",
        labelKey: "sidebar.shop",
        icon: "ShoppingCart",
        section: "main",
        defaultParentItemId: null,
    },
    offers: {
        path: "/offers",
        labelKey: "sidebar.offers",
        icon: "Tag",
        section: "main",
        defaultParentItemId: null,
    },
    wallet: {
        path: "/wallet",
        labelKey: "sidebar.wallet",
        icon: "Wallet",
        section: "main",
        defaultParentItemId: null,
    },
    taxes: {
        path: "/taxes",
        labelKey: "sidebar.taxes",
        icon: "Receipt",
        section: "main",
        defaultParentItemId: null,
    },
    support: {
        path: "/support",
        labelKey: "sidebar.support",
        icon: "LifeBuoy",
        section: "main",
        defaultParentItemId: null,
    },
    checkin: {
        path: "/checkin",
        labelKey: "sidebar.checkin",
        icon: "Calendar",
        section: "earn",
        defaultParentItemId: null,
        parentLocked: true,
    },
    mini_pass: {
        path: "/mini-pass",
        labelKey: "sidebar.mini_pass",
        icon: "Trophy",
        section: "earn",
        defaultParentItemId: null,
        parentLocked: true,
    },
    rewards_group: {
        path: null,
        labelKey: "sidebar.rewards",
        icon: "Folder",
        section: "earn",
        defaultParentItemId: null,
        isGroup: true,
        parentLocked: true,
    },
    faucet: {
        path: "/faucet",
        labelKey: "sidebar.faucet",
        icon: "Gift",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    shortlinks: {
        path: "/shortlinks",
        labelKey: "sidebar.shortlinks",
        icon: "Link",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    auto_mining: {
        path: "/auto-mining",
        labelKey: "sidebar.auto_mining",
        icon: "Zap",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    youtube: {
        path: "/youtube",
        labelKey: "sidebar.youtube",
        icon: "Youtube",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    read_earn: {
        path: "/read-earn",
        labelKey: "sidebar.read_earn",
        icon: "Sparkles",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    internal_offerwall: {
        path: "/internal-offerwall",
        labelKey: "sidebar.internal_offerwall",
        icon: "LayoutGrid",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    offerwall: {
        path: "/offerwall",
        labelKey: "sidebar.offerwall",
        icon: "Globe",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    zerads: {
        path: "/zerads",
        labelKey: "sidebar.zerads",
        icon: "MousePointerClick",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    ptc_earn: {
        path: "/ptc",
        labelKey: "sidebar.ptc_earn",
        icon: "Eye",
        section: "earn",
        defaultParentItemId: "rewards_group",
    },
    daily_tasks: {
        path: "/tasks",
        labelKey: "sidebar.daily_tasks",
        icon: "ListChecks",
        section: "earn",
        defaultParentItemId: null,
        parentLocked: true,
    },
    games: {
        path: "/games",
        labelKey: "sidebar.games",
        icon: "Gamepad2",
        section: "earn",
        defaultParentItemId: null,
        parentLocked: true,
    },
    manual: {
        path: "/manual",
        labelKey: "sidebar.manual",
        icon: "BookOpen",
        section: "social",
        defaultParentItemId: null,
    },
    social_feed: {
        path: "/social",
        labelKey: "sidebar.social_feed",
        icon: "Youtube",
        section: "social",
        defaultParentItemId: null,
        parentLocked: true,
    },
    creator: {
        path: "/creator",
        labelKey: "sidebar.creator",
        icon: "Star",
        section: "social",
        defaultParentItemId: null,
        parentLocked: true,
    },
    ranking: {
        path: "/ranking",
        labelKey: "sidebar.ranking",
        icon: "Trophy",
        section: "social",
        defaultParentItemId: null,
    },
    roadmap: {
        path: "/roadmap",
        labelKey: "sidebar.roadmap",
        icon: "Map",
        section: "social",
        defaultParentItemId: null,
    },
    transparency: {
        path: "/transparency",
        labelKey: "sidebar.transparency",
        icon: "Eye",
        section: "social",
        defaultParentItemId: null,
    },
    referrals: {
        path: "/referrals",
        labelKey: "sidebar.referrals",
        icon: "UserPlus",
        section: "social",
        defaultParentItemId: null,
        parentLocked: true,
    },
    tournaments: {
        path: "/tournaments",
        labelKey: "sidebar.tournaments",
        icon: "Crosshair",
        section: "earn",
        defaultParentItemId: null,
        parentLocked: true,
    },
    burn: {
        path: "/burn",
        labelKey: "sidebar.burn",
        icon: "Flame",
        section: "earn",
        defaultParentItemId: null,
        parentLocked: true,
    },
};
export const ALLOWED_ITEM_IDS = new Set(Object.keys(SIDEBAR_ITEM_REGISTRY));
export const SIDEBAR_SECTIONS = ["main", "earn", "social"];
export const CATEGORY_TITLE_KEYS = {
    main: "sidebar.categories.main",
    earn: "sidebar.categories.earn",
    social: "sidebar.categories.social",
};
/** Metadata for admin editor (no paths — client resolves labels via i18n `labelKey`). */
export function buildAdminItemMeta() {
    return Object.fromEntries(Object.entries(SIDEBAR_ITEM_REGISTRY).map(([itemId, def]) => [
        itemId,
        {
            labelKey: def.labelKey,
            icon: def.icon,
            section: def.section,
            parentLocked: Boolean(def.parentLocked),
            defaultParentItemId: def.defaultParentItemId,
            isGroup: Boolean(def.isGroup),
        },
    ]));
}
function asRows(entries) {
    return Array.isArray(entries);
}
/**
 * Aligns internal offerwall `parentItemId` with the registry default (under rewards_group; legacy rows may have null).
 */
export function coerceInternalOfferwallEarnRoot(entries) {
    if (!asRows(entries))
        return { entries: entries, changed: false };
    const want = SIDEBAR_ITEM_REGISTRY.internal_offerwall?.defaultParentItemId ?? null;
    let changed = false;
    const next = entries.map((e) => {
        if (!e || typeof e !== "object")
            return e;
        const row = e;
        if (row.itemId !== "internal_offerwall")
            return e;
        const cur = row.parentItemId ?? null;
        if (cur !== want) {
            changed = true;
            return { ...row, parentItemId: want, section: "earn" };
        }
        return e;
    });
    return { entries: next, changed };
}
/**
 * Migrates `games` from the old `social` section to `earn`.
 */
export function coerceGamesInEarnSection(entries) {
    if (!asRows(entries))
        return { entries: entries, changed: false };
    let changed = false;
    const next = entries.map((e) => {
        if (!e || typeof e !== "object")
            return e;
        const row = e;
        if (row.itemId !== "games")
            return e;
        if (row.section !== "earn" || (row.parentItemId ?? null) !== null) {
            changed = true;
            return { ...row, section: "earn", parentItemId: null };
        }
        return e;
    });
    return { entries: next, changed };
}
/**
 * Migrates `youtube` back under Recompensas (earn) after mistaken Social & Fun placement.
 */
export function coerceYoutubeInEarnRewardsGroup(entries) {
    if (!asRows(entries))
        return { entries: entries, changed: false };
    let changed = false;
    const next = entries.map((e) => {
        if (!e || typeof e !== "object")
            return e;
        const row = e;
        if (row.itemId !== "youtube")
            return e;
        if (row.section !== "earn" || (row.parentItemId ?? null) !== "rewards_group") {
            changed = true;
            return { ...row, section: "earn", parentItemId: "rewards_group" };
        }
        return e;
    });
    return { entries: next, changed };
}
/**
 * Forces `zerads` to `visible: false` so it no longer appears in the sidebar
 * now that it is embedded inside the Offerwall page. INTENTIONAL hardcoded override
 * — do not "fix" this into a normal admin-editable item.
 */
export function coerceZeradsHidden(entries) {
    if (!asRows(entries))
        return { entries: entries, changed: false };
    let changed = false;
    const next = entries.map((e) => {
        if (!e || typeof e !== "object")
            return e;
        const row = e;
        if (row.itemId === "zerads" && row.visible !== false) {
            changed = true;
            return { ...row, visible: false };
        }
        return e;
    });
    return { entries: next, changed };
}
export function coerceParentLockedSidebarEntries(entries) {
    if (!asRows(entries))
        return { entries: entries, changed: false };
    let changed = false;
    const next = entries.map((e) => {
        if (!e || typeof e !== "object")
            return e;
        const row = e;
        const def = row.itemId ? SIDEBAR_ITEM_REGISTRY[row.itemId] : undefined;
        if (!def?.parentLocked)
            return e;
        const want = def.defaultParentItemId ?? null;
        const cur = row.parentItemId ?? null;
        if (cur !== want) {
            changed = true;
            return { ...row, parentItemId: want };
        }
        return e;
    });
    return { entries: next, changed };
}
/**
 * Appends rows for any new `SIDEBAR_ITEM_REGISTRY` ids missing from stored nav (survives DB
 * snapshots from older builds), and prunes any entries whose itemId was removed from the registry.
 */
export function mergeMissingSidebarRegistryEntries(entries) {
    if (!asRows(entries)) {
        return { entries: buildDefaultSidebarEntries(), changed: true };
    }
    const pruned = entries.filter((e) => e && typeof e === "object" && ALLOWED_ITEM_IDS.has(String(e.itemId || "")));
    const prunedCount = entries.length - pruned.length;
    let changed = prunedCount > 0;
    const present = new Set(pruned.map((e) => String(e.itemId || "").trim()).filter(Boolean));
    const defaults = buildDefaultSidebarEntries();
    const next = [...pruned];
    for (const row of defaults) {
        if (!present.has(row.itemId)) {
            next.push({ ...row });
            present.add(row.itemId);
            changed = true;
        }
    }
    return { entries: next, changed };
}
export function buildDefaultSidebarEntries() {
    return [
        { itemId: "dashboard", visible: true, sortOrder: 10, section: "main", parentItemId: null },
        { itemId: "power_stats", visible: true, sortOrder: 20, section: "main", parentItemId: null },
        { itemId: "machines", visible: true, sortOrder: 30, section: "main", parentItemId: null },
        { itemId: "inventario", visible: true, sortOrder: 35, section: "main", parentItemId: null },
        { itemId: "shop", visible: true, sortOrder: 40, section: "main", parentItemId: null },
        { itemId: "offers", visible: true, sortOrder: 50, section: "main", parentItemId: null },
        { itemId: "wallet", visible: true, sortOrder: 60, section: "main", parentItemId: null },
        { itemId: "taxes", visible: true, sortOrder: 65, section: "main", parentItemId: null },
        { itemId: "support", visible: true, sortOrder: 70, section: "main", parentItemId: null },
        { itemId: "tournaments", visible: true, sortOrder: 105, section: "earn", parentItemId: null },
        { itemId: "checkin", visible: true, sortOrder: 110, section: "earn", parentItemId: null },
        { itemId: "daily_tasks", visible: true, sortOrder: 115, section: "earn", parentItemId: null },
        { itemId: "mini_pass", visible: true, sortOrder: 118, section: "earn", parentItemId: null },
        { itemId: "burn", visible: true, sortOrder: 119, section: "earn", parentItemId: null },
        { itemId: "games", visible: true, sortOrder: 121, section: "earn", parentItemId: null },
        { itemId: "rewards_group", visible: true, sortOrder: 130, section: "earn", parentItemId: null },
        { itemId: "faucet", visible: true, sortOrder: 135, section: "earn", parentItemId: "rewards_group" },
        { itemId: "internal_offerwall", visible: true, sortOrder: 137, section: "earn", parentItemId: "rewards_group" },
        { itemId: "offerwall", visible: true, sortOrder: 138, section: "earn", parentItemId: "rewards_group" },
        { itemId: "zerads", visible: false, sortOrder: 139, section: "earn", parentItemId: "rewards_group" },
        { itemId: "ptc_earn", visible: true, sortOrder: 140, section: "earn", parentItemId: "rewards_group" },
        { itemId: "shortlinks", visible: true, sortOrder: 150, section: "earn", parentItemId: "rewards_group" },
        { itemId: "read_earn", visible: true, sortOrder: 160, section: "earn", parentItemId: "rewards_group" },
        { itemId: "youtube", visible: true, sortOrder: 170, section: "earn", parentItemId: "rewards_group" },
        { itemId: "auto_mining", visible: true, sortOrder: 180, section: "earn", parentItemId: "rewards_group" },
        { itemId: "social_feed", visible: true, sortOrder: 210, section: "social", parentItemId: null },
        { itemId: "creator", visible: true, sortOrder: 215, section: "social", parentItemId: null },
        { itemId: "referrals", visible: true, sortOrder: 218, section: "social", parentItemId: null },
        { itemId: "manual", visible: true, sortOrder: 220, section: "social", parentItemId: null },
        { itemId: "ranking", visible: true, sortOrder: 230, section: "social", parentItemId: null },
        { itemId: "transparency", visible: true, sortOrder: 240, section: "social", parentItemId: null },
        { itemId: "roadmap", visible: true, sortOrder: 250, section: "social", parentItemId: null },
    ];
}
export function validationErrorForEntry(raw) {
    if (!raw || typeof raw !== "object")
        return "invalid_entry_shape";
    const { itemId, visible, sortOrder, section, parentItemId } = raw;
    if (typeof itemId !== "string" || !ALLOWED_ITEM_IDS.has(itemId))
        return "unknown_item_id";
    if (typeof visible !== "boolean")
        return "invalid_visible";
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder))
        return "invalid_sort_order";
    if (section !== "main" && section !== "earn" && section !== "social")
        return "invalid_section";
    if (parentItemId !== null && parentItemId !== "rewards_group")
        return "invalid_parent";
    const def = SIDEBAR_ITEM_REGISTRY[itemId];
    if (def.section !== section)
        return "section_mismatch";
    if (def.parentLocked && parentItemId !== def.defaultParentItemId)
        return "parent_locked";
    if (def.section === "main" || def.section === "social") {
        if (parentItemId !== null)
            return "main_social_parent_must_be_null";
    }
    if (def.section === "earn" && itemId !== "rewards_group") {
        if (parentItemId === "rewards_group" && def.defaultParentItemId !== "rewards_group") {
            return "cannot_nest_item";
        }
    }
    if (itemId === "rewards_group" && parentItemId !== null)
        return "group_must_be_root";
    return null;
}
export function validateSidebarEntriesPayload(entries) {
    if (!Array.isArray(entries))
        return { ok: false, code: "entries_not_array" };
    const seen = new Set();
    for (const e of entries) {
        const err = validationErrorForEntry(e);
        if (err)
            return { ok: false, code: err };
        const id = e.itemId;
        if (seen.has(id))
            return { ok: false, code: "duplicate_item_id" };
        seen.add(id);
    }
    if (seen.size !== ALLOWED_ITEM_IDS.size)
        return { ok: false, code: "incomplete_item_set" };
    const hasGroup = entries.some((x) => x.itemId === "rewards_group");
    const childOfGroup = entries.filter((x) => x.parentItemId === "rewards_group");
    if (childOfGroup.length > 0 && !hasGroup)
        return { ok: false, code: "rewards_group_required" };
    const typed = entries.map((e) => {
        const r = e;
        return {
            itemId: String(r.itemId),
            visible: Boolean(r.visible),
            sortOrder: Number(r.sortOrder),
            section: r.section,
            parentItemId: r.parentItemId == null ? null : String(r.parentItemId),
        };
    });
    return { ok: true, entries: typed };
}
