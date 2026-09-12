// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { ZodError } from "zod";
import { cancelCriticalMutation, finalizeCriticalMutationSuccess, resolveCriticalMutation, } from "../../core/http/middleware/idempotency.js";
import { reportError } from "../../core/errors/error-reporter.js";
import { readErrorCode, readErrorMessage, readHttpStatus, requireSessionUser, } from "../../shared/errors/httpStatusError.js";
import { installMinerBodySchema, normalizeRackIds, uninstallMinerBatchBodySchema, uninstallMinerBodySchema, } from "./rooms.schemas.js";
import * as roomsService from "./rooms.service.js";
import * as visualPlacements from "./rooms.visualPlacements.js";
import * as fanPlacements from "./rooms.fanPlacements.js";

/** `.strict()` Zod schemas reject unknown body fields too — same mass-assignment
 * hardening auth/'s controllers already apply (see server/modules/auth/README.md). */
function zodValidationErrorResponse(res, err) {
  res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid request body." });
}
export async function listRooms(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const payload = await roomsService.listRoomsForUser(user.id);
        res.json(payload);
    }
    catch (err) {
        reportError({ code: "ROOMS_LIST_FAILED", category: "DATABASE", severity: "ERROR", module: "rooms.list", error: err, req });
        res.status(500).json({ ok: false, message: "Erro ao listar salas." });
    }
}
export async function buyRoom(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const result = await roomsService.buyRoomForUser(user.id);
        if (!result.ok) {
            const body = { ok: false, message: result.message };
            if (result.code)
                body.code = result.code;
            res.status(result.status).json(body);
            return;
        }
        res.json({
            ok: true,
            roomNumber: result.roomNumber,
            roomId: result.roomId,
            message: result.message,
        });
    }
    catch (err) {
        reportError({ code: "ROOMS_BUY_FAILED", category: "BUSINESS", severity: "ERROR", module: "rooms.buy", error: err, req });
        res.status(500).json({ ok: false, message: "Erro ao comprar sala." });
    }
}
export async function installMiner(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        let rackId, inventoryId;
        try {
            ({ rackId, inventoryId } = installMinerBodySchema.parse(req.body));
        }
        catch (validationErr) {
            if (validationErr instanceof ZodError) {
                zodValidationErrorResponse(res, validationErr);
                return;
            }
            throw validationErr;
        }
        const installPreflight = await roomsService.preflightInstallMiner(user.id, rackId, inventoryId);
        if (installPreflight) {
            const body = { ok: false, message: installPreflight.message };
            if (installPreflight.code)
                body.code = installPreflight.code;
            res.status(installPreflight.status).json(body);
            return;
        }
        const idem = await resolveCriticalMutation(req, res);
        if (!idem)
            return;
        const { lease, ci } = idem;
        try {
            const result = await roomsService.installMinerForUser(user.id, rackId, inventoryId);
            if ("status" in result) {
                await cancelCriticalMutation(lease);
                const body = { ok: false, message: result.message };
                if (result.code)
                    body.code = result.code;
                res.status(result.status).json(body);
                return;
            }
            const payload = { ok: true, message: "Máquina instalada com sucesso!" };
            await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
            res.json(payload);
        }
        catch (err) {
            await cancelCriticalMutation(lease);
            if (readErrorCode(err) === "DISTRIBUTED_LOCK_BUSY" || readErrorCode(err) === "P2034") {
                res.status(409).json({
                    ok: false,
                    code: "RACE_CONDITION_DETECTED",
                    message: "This action conflicted with another request. Refresh the page and try again.",
                });
                return;
            }
            reportError({
                code: "ROOMS_INSTALL_MINER_FAILED",
                category: "DATABASE",
                severity: "ERROR",
                module: "rooms.install",
                error: err,
                req,
                context: { userId: user.id, rackId, inventoryId },
            });
            res.status(500).json({ ok: false, message: "Erro ao instalar máquina." });
        }
    }
    catch (err) {
        reportError({
            code: "ROOMS_INSTALL_MINER_UNEXPECTED",
            category: "UNKNOWN",
            severity: "ERROR",
            module: "rooms.install",
            error: err,
            req,
        });
        res.status(500).json({ ok: false, message: "Erro ao instalar máquina." });
    }
}
export async function uninstallMiner(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        let rackId;
        try {
            ({ rackId } = uninstallMinerBodySchema.parse(req.body));
        }
        catch (validationErr) {
            if (validationErr instanceof ZodError) {
                zodValidationErrorResponse(res, validationErr);
                return;
            }
            throw validationErr;
        }
        const uninstallPreflight = await roomsService.preflightUninstallMiner(user.id, rackId);
        if (uninstallPreflight) {
            const body = { ok: false, message: uninstallPreflight.message };
            if (uninstallPreflight.code)
                body.code = uninstallPreflight.code;
            res.status(uninstallPreflight.status).json(body);
            return;
        }
        const idem = await resolveCriticalMutation(req, res);
        if (!idem)
            return;
        const { lease, ci } = idem;
        try {
            await roomsService.uninstallMinerForUser(user.id, rackId);
            const payload = { ok: true, message: "Máquina removida do rack com sucesso!" };
            await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
            res.json(payload);
        }
        catch (err) {
            await cancelCriticalMutation(lease);
            const errCode = readErrorCode(err);
            if (errCode === "DISTRIBUTED_LOCK_BUSY" || errCode === "P2034") {
                res.status(409).json({
                    ok: false,
                    code: "RACE_CONDITION_DETECTED",
                    message: "This action conflicted with another request. Refresh the page and try again.",
                });
                return;
            }
            const msg = readErrorMessage(err);
            const http = readHttpStatus(err);
            if (msg === "RACK_NOT_FOUND" || http === 404) {
                res.status(404).json({ ok: false, message: "Rack não encontrado." });
                return;
            }
            if (msg === "RACK_EMPTY" || errCode === "RACK_EMPTY") {
                res.status(400).json({ ok: false, code: "RACK_EMPTY", message: "Este rack não tem máquina instalada." });
                return;
            }
            reportError({
                code: "ROOMS_UNINSTALL_MINER_FAILED",
                category: "DATABASE",
                severity: "ERROR",
                module: "rooms.uninstall",
                error: err,
                req,
                context: { userId: user.id, rackId },
            });
            res.status(500).json({ ok: false, message: "Erro ao remover máquina." });
        }
    }
    catch (err) {
        reportError({
            code: "ROOMS_UNINSTALL_MINER_UNEXPECTED",
            category: "UNKNOWN",
            severity: "ERROR",
            module: "rooms.uninstall",
            error: err,
            req,
        });
        res.status(500).json({ ok: false, message: "Erro ao remover máquina." });
    }
}
export async function uninstallMinerBatch(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        let rackIds;
        try {
            const body = uninstallMinerBatchBodySchema.parse(req.body);
            rackIds = normalizeRackIds(body.rackIds);
        }
        catch (validationErr) {
            if (validationErr instanceof ZodError) {
                zodValidationErrorResponse(res, validationErr);
                return;
            }
            throw validationErr;
        }
        if (rackIds.length === 0) {
            res.status(400).json({ ok: false, message: "rackIds inválidos." });
            return;
        }
        const idem = await resolveCriticalMutation(req, res);
        if (!idem)
            return;
        const { lease, ci } = idem;
        try {
            await roomsService.uninstallMinerBatchForUser(user.id, rackIds);
            const payload = {
                ok: true,
                movedCount: rackIds.length,
                message: "Máquinas removidas do rack com sucesso!",
            };
            await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
            res.json(payload);
        }
        catch (err) {
            await cancelCriticalMutation(lease);
            const errCode = readErrorCode(err);
            if (errCode === "DISTRIBUTED_LOCK_BUSY" || errCode === "P2034") {
                res.status(409).json({
                    ok: false,
                    code: "RACE_CONDITION_DETECTED",
                    message: "This action conflicted with another request. Refresh the page and try again.",
                });
                return;
            }
            const msg = readErrorMessage(err);
            const http = readHttpStatus(err);
            if (msg === "RACK_NOT_FOUND" || http === 404) {
                res.status(404).json({ ok: false, message: "Rack não encontrado." });
                return;
            }
            if (msg === "RACK_EMPTY" || errCode === "RACK_EMPTY") {
                res.status(400).json({
                    ok: false,
                    code: "RACK_EMPTY",
                    message: "Um dos racks não tem máquina instalada.",
                });
                return;
            }
            reportError({
                code: "ROOMS_UNINSTALL_BATCH_FAILED",
                category: "DATABASE",
                severity: "ERROR",
                module: "rooms.uninstall_batch",
                error: err,
                req,
                context: { userId: user.id, rackCount: rackIds.length },
            });
            res.status(500).json({ ok: false, message: "Erro ao remover máquinas." });
        }
    }
    catch (err) {
        reportError({
            code: "ROOMS_UNINSTALL_BATCH_UNEXPECTED",
            category: "UNKNOWN",
            severity: "ERROR",
            module: "rooms.uninstall_batch",
            error: err,
            req,
        });
        res.status(500).json({ ok: false, message: "Erro ao remover máquinas." });
    }
}
export async function getSlotsSummary(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const payload = await roomsService.getSlotsSummaryForUser(user.id);
        res.json(payload);
    }
    catch (err) {
        reportError({ code: "ROOMS_SLOTS_SUMMARY_FAILED", category: "DATABASE", severity: "ERROR", module: "rooms.slots_summary", error: err, req });
        res.status(500).json({ ok: false, message: "Erro ao buscar slots." });
    }
}
export async function listVisualPlacements(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const payload = await visualPlacements.listVisualPlacementsForUser(user.id);
        res.json(payload);
    }
    catch (err) {
        reportError({ code: "ROOMS_LIST_VISUAL_PLACEMENTS_FAILED", category: "DATABASE", severity: "ERROR", module: "rooms.visual_placements", error: err, req });
        res.status(500).json({ ok: false, message: "Erro ao carregar racks." });
    }
}
export async function setVisualPlacement(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const roomNumber = Number(req.body?.roomNumber);
        const fromCredit = Boolean(req.body?.fromCredit);
        const visualIndex = req.body?.visualIndex == null || req.body?.visualIndex === ""
            ? null
            : Number(req.body?.visualIndex);
        const rawFloor = req.body?.floorSlot;
        const floorSlot = rawFloor == null || rawFloor === "" ? null : Number(rawFloor);
        const payload = await visualPlacements.setVisualPlacementForUser(user.id, roomNumber, visualIndex, floorSlot, fromCredit);
        res.json(payload);
    }
    catch (err) {
        const http = readHttpStatus(err);
        const msg = readErrorMessage(err);
        const code = readErrorCode(err);
        if (http && http < 500) {
            res.status(http).json({ ok: false, code, message: msg });
            return;
        }
        reportError({ code: "ROOMS_SET_VISUAL_PLACEMENT_FAILED", category: "DATABASE", severity: "ERROR", module: "rooms.visual_placements", error: err, req });
        res.status(500).json({ ok: false, message: "Erro ao mover rack." });
    }
}
export async function listFanPlacements(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const payload = await fanPlacements.listFanPlacementsForUser(user.id);
        res.json(payload);
    }
    catch (err) {
        reportError({ code: "ROOMS_LIST_FAN_PLACEMENTS_FAILED", category: "DATABASE", severity: "ERROR", module: "rooms.fan_placements", error: err, req });
        res.status(500).json({ ok: false, message: "Erro ao carregar ventiladores." });
    }
}
export async function setFanPlacement(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const roomNumber = Number(req.body?.roomNumber);
        const visualIndex = Number(req.body?.visualIndex);
        const mounted = req.body?.mounted !== false && req.body?.mounted !== "false";
        const rawFrom = req.body?.fromVisualIndex;
        const fromVisualIndex = rawFrom == null || rawFrom === "" ? null : Number(rawFrom);
        const payload = await fanPlacements.setFanPlacementForUser(user.id, roomNumber, visualIndex, Boolean(mounted), fromVisualIndex);
        res.json(payload);
    }
    catch (err) {
        const http = readHttpStatus(err);
        const msg = readErrorMessage(err);
        const code = readErrorCode(err);
        if (http && http < 500) {
            res.status(http).json({ ok: false, code, message: msg });
            return;
        }
        reportError({ code: "ROOMS_SET_FAN_PLACEMENT_FAILED", category: "DATABASE", severity: "ERROR", module: "rooms.fan_placements", error: err, req });
        res.status(500).json({ ok: false, message: "Erro ao mover ventilador." });
    }
}
