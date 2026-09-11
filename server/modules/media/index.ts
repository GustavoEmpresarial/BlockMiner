// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Public boundary of the media module. Other modules (partner-games, notifications/broadcast,
 * social, support) MUST import only from here — never from media.config.ts/media.service.ts/etc
 * directly — so the module can be reorganized internally without breaking callers.
 */
export { MEDIA_CATEGORIES, MEDIA_PUBLIC_PREFIX, isMediaCategory, mediaRootDir, mediaDiskDir, mediaPublicPath, projectRoot, } from "./media.config.js";
export { createCategoryUpload, uploadedFileUrl } from "./media.service.js";
export { mediaUploadErrorHandler } from "./media.controller.js";
export { mediaAdminRouter } from "./media.admin.routes.js";
export { MEDIA_ERROR } from "./media.errors.js";
export { seedBundledMedia } from "./media.seed.js";
export { createMediaStaticHeadersMiddleware } from "./media.static.js";
