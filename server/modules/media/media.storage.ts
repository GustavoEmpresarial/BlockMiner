/**
 * A multer StorageEngine that transcodes uploaded images to WebP on the way to disk, so every
 * upload path produces `.webp` with no per-handler duplication. Videos (when allowed) are written
 * through untouched. Ported from legacy/server/modules/media/media.storage.ts unchanged.
 */
import type { Request } from "express";
import type { StorageEngine } from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { isTranscodableImage, transcodeToWebp } from "./media.webp.js";

type DirResolver = string | ((req: Request) => string);

export interface MediaWebpStorageOptions {
  /** Destination directory (absolute), or a per-request resolver (e.g. by category). */
  dir: DirResolver;
  /** Filename prefix, e.g. "miner", "pg", "bc"; empty string for none. */
  prefix?: string;
  /** When true, non-image files (video) are stored raw instead of rejected. */
  allowVideo?: boolean;
}

function resolveDir(dir: DirResolver, req: Request): string {
  return typeof dir === "function" ? dir(req) : dir;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export function createMediaWebpStorage(opts: MediaWebpStorageOptions): StorageEngine {
  const prefix = opts.prefix ? `${opts.prefix}-` : "";
  return {
    async _handleFile(req, file, cb) {
      try {
        const input = await readStream(file.stream);
        const dir = resolveDir(opts.dir, req as Request);
        fs.mkdirSync(dir, { recursive: true });
        const id = `${prefix}${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;

        let filename: string;
        let output: Buffer;
        if (isTranscodableImage(file.mimetype)) {
          filename = `${id}.webp`;
          output = await transcodeToWebp(input);
        } else if (opts.allowVideo) {
          const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
          filename = `${id}${ext}`;
          output = input;
        } else {
          cb(new Error("Somente imagens são permitidas."));
          return;
        }

        const dest = path.join(dir, filename);
        await fs.promises.writeFile(dest, output);
        cb(null, { destination: dir, filename, path: dest, size: output.length });
      } catch (err) {
        cb(err instanceof Error ? err : new Error(String(err)));
      }
    },
    _removeFile(_req, file, cb) {
      fs.unlink(file.path, () => cb(null));
    },
  };
}
