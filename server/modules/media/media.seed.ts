/**
 * Boot-time failsafe that populates the media volume with the images that ship in the repo
 * (crypto game icons, stock miner images, brand, 3D models). Versioned copies in
 * `storage/media-seed/<category>/` are copied into `storage/uploads/media/<category>/` on startup
 * when absent. Idempotent: a file already present in the volume is never overwritten (admin edits win).
 *
 * Ported from legacy/server/modules/media/media.seed.ts.
 */

import path from "path";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "fs";
import { logger } from "../../core/logger/index.js";
import { isMediaCategory, mediaDiskDir, projectRoot } from "./media.config.js";

const log = logger.child("MediaSeed");

export function seedBundledMedia(): { copied: number; skipped: number } {
  let copied = 0;
  let skipped = 0;
  try {
    const seedRoot = path.join(projectRoot(), "storage", "media-seed");
    if (!existsSync(seedRoot)) {
      log.info("media seed root absent — nothing to copy", { seedRoot });
      return { copied, skipped };
    }
    for (const category of readdirSync(seedRoot)) {
      const srcDir = path.join(seedRoot, category);
      if (!statSync(srcDir).isDirectory() || !isMediaCategory(category)) continue;
      const destDir = mediaDiskDir(category);
      mkdirSync(destDir, { recursive: true });
      for (const file of readdirSync(srcDir)) {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (!statSync(src).isFile()) continue;
        if (existsSync(dest)) {
          skipped += 1;
          continue;
        }
        copyFileSync(src, dest);
        copied += 1;
      }
    }
    if (copied > 0) log.info("media seed complete", { copied, skipped });
  } catch (err) {
    // A seed failure must never crash boot — the images simply 404 until re-seeded.
    log.error("media seed failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return { copied, skipped };
}
