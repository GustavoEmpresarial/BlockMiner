// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
import * as machinesRepo from "./machines.repository.js";
const log = logger.child("machines.admin.controller");
export async function adminListUserMachines(req, res) {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isFinite(userId)) {
            res.status(400).json({ ok: false, message: "Invalid user id." });
            return;
        }
        const machines = await machinesRepo.listUserMachines(userId);
        res.json({ ok: true, machines });
    }
    catch (error) {
        log.error("Error loading machines for admin:", { error: String(error) });
        res.status(500).json({ ok: false, message: "Unable to load machines." });
    }
}
