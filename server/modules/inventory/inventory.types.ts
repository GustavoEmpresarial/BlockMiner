/**
 * Module-wide inventory types. Ported (trimmed) from
 * legacy/server/modules/inventory/domain/{inventory.dto,inventory.types}.ts +
 * legacy/server/utils/ownedMachineImage.ts (image resolution helpers).
 *
 * Deviation (documented): legacy also consults `eventMinerCatalogImage` (a live lookup
 * against `[Event] {name}`-prefixed catalog rows) when resolving the display image for
 * seasonal/event miners. That lookup table/service has not been ported into current/
 * yet and no other Fase 1-3 module needed it, so this module resolves images from
 * `miner.imageUrl` (current catalog) and the row/owned-machine snapshot only — event
 * miners fall back to their snapshot image instead of the live event catalog image.
 * Revisit once an events module lands.
 */
/** Max addressable rack slot (0..79), mirrors legacy inventory.controller install bound check. */
export const MAX_SLOT_INDEX = 80;
export function isValidSlotIndex(slotIndex) {
    return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < MAX_SLOT_INDEX;
}
export function isValidInventoryId(inventoryId) {
    return Number.isInteger(inventoryId) && inventoryId >= 1;
}
/** Ported from legacy inventory.service.ts `installInventoryItemForUser` (target slot range for a slotSize-N machine). */
export function computeTargetSlots(slotIndex, slotSize) {
    return Array.from({ length: slotSize }, (_, i) => slotIndex + i);
}
const STOCK_PLACEHOLDER_PATHS = new Set(["/media/brand/icon.webp"]);
function trimUrl(url) {
    return typeof url === "string" ? url.trim() : "";
}
export function isStockPlaceholderMinerImageUrl(url) {
    const t = trimUrl(url);
    if (!t)
        return false;
    const pathOnly = t.split("?")[0]?.toLowerCase() ?? "";
    return STOCK_PLACEHOLDER_PATHS.has(pathOnly);
}
/** Value safe to persist on UserOwnedMachine / inventory / rack rows (null if empty or stock placeholder). */
export function normalizePersistableMinerImageUrl(url) {
    const t = trimUrl(url);
    if (!t || isStockPlaceholderMinerImageUrl(t))
        return null;
    return t;
}
function firstRealImage(...urls) {
    for (const u of urls) {
        const t = trimUrl(u);
        if (t && !isStockPlaceholderMinerImageUrl(t))
            return t;
    }
    return null;
}
/** Ported from legacy utils/ownedMachineImage.ts `resolveOwnedMachineImageUrl` (event-catalog arg dropped, see module deviation note above). */
export function resolveOwnedMachineImageUrl(input) {
    const catalog = firstRealImage(input.catalogImageUrl);
    if (catalog)
        return { imageUrl: catalog, imageSource: "catalog_current" };
    const snapshot = firstRealImage(input.ownedMachineImageUrl, input.rowImageUrl);
    if (snapshot)
        return { imageUrl: snapshot, imageSource: "owned_snapshot" };
    return { imageUrl: null, imageSource: "none" };
}
