// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Shared multer factory for the media module. Two shapes are exposed:
 *  - `createCategoryUpload(category, opts)` — fixed-category uploader, used by other modules
 *    (partner-games, broadcast, social, support) through media/index.ts, so every caller gets the
 *    same WebP-transcoding storage engine, size limit and mimetype filter without re-implementing it.
 *  - `resolveQueryCategory` / the dynamic-dir storage used by media.routes.ts's generic
 *    /upload-image /upload-media admin endpoints, where the category comes from `?category=`
 *    (ported from legacy/server/modules/uploads/uploads.admin.routes.ts).
 */
import multer from "multer";
import { createMediaWebpStorage } from "./media.storage.js";
import { isMediaCategory, mediaDiskDir, mediaPublicPath } from "./media.config.js";
const IMAGE_MIME = /^image\/(jpeg|png|gif|webp)$/;
const IMAGE_OR_VIDEO_MIME = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|ogg|quicktime|x-msvideo))$/;
/** Fixed-category multer instance — the category is baked in, not read from the request. */
export function createCategoryUpload(category, opts = {}) {
    const allowVideo = opts.allowVideo ?? false;
    const allowedMime = allowVideo ? IMAGE_OR_VIDEO_MIME : IMAGE_MIME;
    return multer({
        storage: createMediaWebpStorage({ dir: mediaDiskDir(category), allowVideo, prefix: opts.prefix }),
        limits: { fileSize: opts.maxSizeBytes ?? 5 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (allowedMime.test(file.mimetype))
                cb(null, true);
            else
                cb(new Error(allowVideo ? "Formato não suportado. Use imagens ou vídeos." : "Somente imagens são permitidas."));
        },
    });
}
/** Public URL for an uploaded file already written under `category`. */
export function uploadedFileUrl(category, filename) {
    return mediaPublicPath(category, filename);
}
/** Resolve a validated media category from `?category=`, else the endpoint's default. Used by the
 * generic admin upload endpoints, where the category must be known before multer streams the file. */
export function resolveQueryCategory(req, fallback) {
    const raw = String(req.query.category ?? "").trim();
    return isMediaCategory(raw) ? raw : fallback;
}
function dynamicCategoryStorage(fallback, allowVideo = false) {
    return createMediaWebpStorage({
        dir: (req) => mediaDiskDir(resolveQueryCategory(req, fallback)),
        allowVideo,
    });
}
/** Generic admin uploader — category resolved per-request from `?category=`. Default "miners", 5 MB, images only. */
export const genericImageUpload = multer({
    storage: dynamicCategoryStorage("miners"),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (IMAGE_MIME.test(file.mimetype))
            cb(null, true);
        else
            cb(new Error("Somente imagens são permitidas."));
    },
});
/** Generic admin uploader — category resolved per-request from `?category=`. Default "banners", 100 MB, image+video. */
export const genericMediaUpload = multer({
    storage: dynamicCategoryStorage("banners", true),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (IMAGE_OR_VIDEO_MIME.test(file.mimetype))
            cb(null, true);
        else
            cb(new Error("Formato não suportado. Use imagens (PNG, JPG, GIF, WebP) ou vídeos (MP4, WebM)."));
    },
});
