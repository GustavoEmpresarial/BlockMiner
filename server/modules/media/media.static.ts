/**
 * Headers for public /media static files. Partner sites (genesisdao.tech, etc.) load
 * BlockMiner logos and miner images from cross-site contexts (iframe, hotlink). Without
 * `Cross-Origin-Resource-Policy: cross-origin`, browsers block the image when
 * `Sec-Fetch-Site: cross-site` even though the file returns HTTP 200.
 */
import type { RequestHandler } from "express";
import { parseCorsOriginsList } from "../../shared/http/corsConfig.js";

export function createMediaStaticHeadersMiddleware(): RequestHandler {
  const allowedOrigins = new Set(parseCorsOriginsList());

  return (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }

    next();
  };
}
