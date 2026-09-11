/**
 * Client IP resolution. Simplified from legacy's ip-intelligence module (ASN/CIDR
 * classification is a future module) — trusts Express' `req.ip` (respects
 * `app.set("trust proxy", ...)`), falling back to X-Real-IP/X-Forwarded-For.
 */
import type { Request } from "express";

export function getRequestIp(req: Request): string {
  const xReal = req.headers["x-real-ip"];
  if (typeof xReal === "string" && xReal.trim()) return xReal.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0]!.trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export const getClientIp = getRequestIp;
