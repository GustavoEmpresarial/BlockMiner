/**
 * WebP transcoding for the media upload pipeline. Raster images are stored as WebP — smaller than
 * PNG/JPEG at equivalent quality, universal browser support. Ported from
 * legacy/server/modules/media/media.webp.ts unchanged.
 */
import sharp from "sharp";

const WEBP_QUALITY = (() => {
  const n = Number.parseInt(String(process.env.MEDIA_WEBP_QUALITY || "82").trim(), 10);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 82;
})();

/** True for a raster mimetype we can transcode to WebP (png/jpeg/gif/webp/avif/tiff). Excludes svg + video. */
export function isTranscodableImage(mimetype: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|avif|tiff)$/i.test(mimetype);
}

/**
 * Transcode an image buffer to WebP. Animated GIFs are preserved as animated WebP. `sharp` fails
 * loudly on a non-image buffer, so callers should gate on mimetype (isTranscodableImage) first.
 */
export async function transcodeToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { animated: true })
    .rotate() // honour EXIF orientation before dropping the metadata
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
