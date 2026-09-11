/** Ported from legacy/server/modules/racks/racks.controller.ts (RACK_NAME_REGEX + inline checks). */
export const RACK_NAME_REGEX = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 -]*$/;
export function isValidRackIndex(rackIndex) {
    return Number.isInteger(rackIndex) && rackIndex >= 1;
}
export function isValidRackName(customName) {
    if (typeof customName !== "string")
        return false;
    const trimmed = customName.trim();
    return trimmed.length > 0 && trimmed.length <= 30 && RACK_NAME_REGEX.test(trimmed);
}
