// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import * as repo from "./tasks.repository.js";
import { parseCreateDailyTaskDefinition, parsePatchDailyTaskDefinition } from "./tasks.admin.validation.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("tasks.admin.controller");
function prismaErrCode(e) {
    if (e !== null && typeof e === "object" && "code" in e) {
        const c = e.code;
        return typeof c === "string" ? c : undefined;
    }
    return undefined;
}
export async function listDefinitions(_req, res) {
    try {
        const rows = await repo.listDailyTaskDefinitions();
        res.json({ ok: true, definitions: rows });
    }
    catch (e) {
        log.error("listDefinitions", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to load daily task definitions." });
    }
}
export async function patchDefinition(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id < 1) {
            res.status(400).json({ ok: false, message: "Invalid task id." });
            return;
        }
        const parsed = parsePatchDailyTaskDefinition(req.body);
        if (!parsed.ok) {
            res.status(parsed.status).json({ ok: false, message: parsed.message });
            return;
        }
        const { data, needsMinerId, needsEventMinerId, needsOfferwallId } = parsed;
        if (needsMinerId != null) {
            const miner = await repo.findMinerById(needsMinerId);
            if (!miner) {
                res.status(400).json({ ok: false, message: "rewardMinerId does not exist." });
                return;
            }
        }
        if (needsEventMinerId != null) {
            const em = await repo.findEventMinerById(needsEventMinerId);
            if (!em) {
                res.status(400).json({ ok: false, message: "rewardEventMinerId does not exist." });
                return;
            }
        }
        if (needsOfferwallId != null) {
            const offer = await repo.findInternalOfferwallOfferById(needsOfferwallId);
            if (!offer) {
                res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." });
                return;
            }
        }
        await repo.updateDailyTaskDefinition(id, data);
        const row = await repo.findDailyTaskDefinitionById(id);
        res.json({ ok: true, definition: row });
    }
    catch (e) {
        if (prismaErrCode(e) === "P2025") {
            res.status(404).json({ ok: false, message: "Task definition not found." });
            return;
        }
        if (prismaErrCode(e) === "P2002") {
            res.status(409).json({ ok: false, message: "Slug already exists." });
            return;
        }
        log.error("patchDefinition", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to update daily task definition." });
    }
}
export async function createDefinition(req, res) {
    try {
        const parsed = parseCreateDailyTaskDefinition(req.body);
        if (!parsed.ok) {
            res.status(parsed.status).json({ ok: false, message: parsed.message });
            return;
        }
        const { data, autoSortOrder } = parsed;
        if (data.rewardMinerId) {
            const miner = await repo.findMinerById(data.rewardMinerId);
            if (!miner) {
                res.status(400).json({ ok: false, message: "rewardMinerId does not exist." });
                return;
            }
        }
        if (data.rewardEventMinerId) {
            const em = await repo.findEventMinerById(data.rewardEventMinerId);
            if (!em) {
                res.status(400).json({ ok: false, message: "rewardEventMinerId does not exist." });
                return;
            }
        }
        if (data.internalOfferwallOfferId) {
            const offer = await repo.findInternalOfferwallOfferById(data.internalOfferwallOfferId);
            if (!offer) {
                res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." });
                return;
            }
        }
        if (autoSortOrder) {
            const max = await repo.getMaxSortOrder();
            data.sortOrder = max + 10;
        }
        const row = await repo.createDailyTaskDefinition(data);
        res.status(201).json({ ok: true, definition: row });
    }
    catch (e) {
        if (prismaErrCode(e) === "P2002") {
            res.status(409).json({ ok: false, message: "Slug already exists." });
            return;
        }
        if (prismaErrCode(e) === "P2003") {
            res.status(400).json({ ok: false, message: "Invalid foreign key (miner or event miner)." });
            return;
        }
        log.error("createDefinition", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to create daily task definition." });
    }
}
export async function deleteDefinition(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id < 1) {
            res.status(400).json({ ok: false, message: "Invalid task id." });
            return;
        }
        await repo.deleteDailyTaskDefinition(id);
        res.json({ ok: true });
    }
    catch (e) {
        if (prismaErrCode(e) === "P2025") {
            res.status(404).json({ ok: false, message: "Task definition not found." });
            return;
        }
        log.error("deleteDefinition", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to delete daily task definition." });
    }
}
