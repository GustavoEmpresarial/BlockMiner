/**
 * Dedicated Polygon HD deposit microservice — separate process entrypoint (Docker service
 * `phd`, see docker-compose.yml). Ported from legacy/server/phdServer.ts.
 *
 * SECURITY: this is the ONLY process in the whole stack that ever holds POLYGON_HD_MNEMONIC.
 * It is not reachable from the internet — no nginx route, no published host port, only the
 * `app` container can reach it over the internal Docker network (http://phd:3847), and every
 * request must present PHD_INTERNAL_TOKEN. See docs/PROGRESSO.txt for the full rationale.
 *
 * Restored 2026-10-16 from the compiled dist (the .ts had never been committed, so a clean
 * build dropped the entrypoint and the container crash-looped on MODULE_NOT_FOUND).
 */
import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import prisma from "../core/database/prisma.js";
import { logger } from "../core/logger/index.js";
import { allocatePolygonHdAddress } from "../shared/blockchain/polygonHdWallet.js";
import { sweepHdDepositAddressesOnce } from "./polygonHdSweep.js";

const log = logger.child("PhdServer");

function parsePositiveUserId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  const s = String(value ?? "").trim();
  if (!/^\d{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

function timingSafeEqualToken(a: unknown, b: unknown): boolean {
  const aa = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

const port = Number.parseInt(process.env.PHD_PORT || "3847", 10);
const expectedToken = (process.env.PHD_INTERNAL_TOKEN || "").trim();
const mnemonic = (process.env.POLYGON_HD_MNEMONIC || "").trim();

const app = express();
app.use(express.json({ limit: "8kb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "polygon-hd-deposit" });
});

app.post("/internal/hd/addresses", async (req, res) => {
  try {
    if (!expectedToken) {
      res.status(503).json({ ok: false, message: "PHD_INTERNAL_TOKEN is not set." });
      return;
    }
    if (!mnemonic) {
      res.status(503).json({ ok: false, message: "POLYGON_HD_MNEMONIC is not set." });
      return;
    }
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!timingSafeEqualToken(token, expectedToken)) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = parsePositiveUserId(req.body?.userId);
    if (userId == null) {
      res.status(400).json({ ok: false, message: "Invalid userId." });
      return;
    }
    const row = await allocatePolygonHdAddress(prisma, mnemonic, userId);
    res.json({
      ok: true,
      address: row.address,
      derivationIndex: row.derivationIndex,
      derivationPath: row.derivationPath,
    });
  } catch (err) {
    log.error("internal/hd/addresses failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to allocate address." });
  }
});

const server = http.createServer(app);
server.listen(port, "0.0.0.0", () => {
  log.info(`Polygon HD deposit service listening on ${port}`);
  // Consolidating balances to treasury is a SEPARATE, later, explicit decision — same safety
  // posture as WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE. Off unless POLYGON_HD_AUTO_SWEEP=1 is set.
  if (process.env.POLYGON_HD_AUTO_SWEEP === "1") {
    const sweepIntervalMs = Math.max(60_000, Number(process.env.POLYGON_HD_SWEEP_CRON_MS || 300_000));
    const runSweep = () => {
      sweepHdDepositAddressesOnce(prisma, mnemonic).catch((err) =>
        log.warn("HD sweep run error", { error: err instanceof Error ? err.message : String(err) }),
      );
    };
    runSweep();
    const handle = setInterval(runSweep, sweepIntervalMs);
    handle.unref?.();
    log.info(`POLYGON_HD_AUTO_SWEEP=1 — sweep interval ${sweepIntervalMs}ms`);
  } else {
    log.warn("POLYGON_HD_AUTO_SWEEP is disabled; HD wallets will not auto-send to treasury.");
  }
});
