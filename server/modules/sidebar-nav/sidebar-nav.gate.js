import { isSidebarPathVisible } from "./sidebar-nav.service.js";
/**
 * Sidebar registry entries may be typed as `string | null`. Routes need a concrete
 * string for `requireVisibleSidebarPath`; throw if a feature is mounted without a path.
 */
export function sidebarRegistryPath(path, featureKey) {
    if (path == null || path === "") {
        throw new Error(`Missing sidebar path for feature "${featureKey}"`);
    }
    return path;
}
export function requireVisibleSidebarPath(requiredPath) {
    return async (_req, res, next) => {
        try {
            const allowed = await isSidebarPathVisible(requiredPath);
            if (!allowed) {
                res.status(403).json({
                    ok: false,
                    code: "feature_disabled",
                    message: "This feature is not available.",
                });
                return;
            }
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
