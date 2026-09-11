import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { resolveQueryCategory, uploadedFileUrl } from "./media.service.js";

/** POST /api/admin/upload-image — default category "miners", 5 MB, images only. */
export function uploadImage(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
    return;
  }
  const url = uploadedFileUrl(resolveQueryCategory(req, "miners"), req.file.filename);
  res.json({ ok: true, url });
}

/** POST /api/admin/upload-media — default category "banners", 100 MB, images + video. */
export function uploadMedia(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
    return;
  }
  const url = uploadedFileUrl(resolveQueryCategory(req, "banners"), req.file.filename);
  res.json({ ok: true, url });
}

/** Turns multer/storage-engine errors (bad mimetype, over size limit) into the same 400 JSON shape
 * legacy returned, instead of falling through to the generic 500 handler. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function mediaUploadErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (!err) {
    next();
    return;
  }
  if (err instanceof multer.MulterError || err instanceof Error) {
    res.status(400).json({ ok: false, message: err.message });
    return;
  }
  res.status(400).json({ ok: false, message: "Upload failed." });
}
