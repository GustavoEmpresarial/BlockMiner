// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { requireSessionUser, readHttpStatus, readErrorCode, readErrorMessage } from "../../../shared/errors/httpStatusError.js";
import { resolveCriticalMutation, finalizeCriticalMutationSuccess, cancelCriticalMutation } from "../../../core/http/middleware/idempotency.js";
import * as vaultService from "./vault.service.js";
function respondVaultError(res, error) {
    const http = readHttpStatus(error);
    const code = readErrorCode(error);
    const msg = readErrorMessage(error);
    if (http === 404 || msg === "NOT_FOUND") {
        res.status(404).json({ ok: false, code: "VAULT_NOT_FOUND", message: "Item not found." });
        return;
    }
    if (http === 501) {
        res.status(501).json({ ok: false, code: code || "NOT_IMPLEMENTED", message: msg });
        return;
    }
    if (http === 400 || msg === "INVALID_SELECTION") {
        res.status(400).json({ ok: false, code: "INVALID_STATE", message: "Invalid selection." });
        return;
    }
    res.status(500).json({ ok: false, code: "VAULT_UNAVAILABLE", message: "Could not complete vault operation." });
}
export async function getVault(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const vault = await vaultService.listVaultForUser(user.id);
        res.json({ ok: true, vault });
    }
    catch {
        res.status(500).json({ ok: false, message: "Unable to load vault." });
    }
}
export async function moveToVault(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    const idem = await resolveCriticalMutation(req, res);
    if (!idem)
        return;
    try {
        const result = await vaultService.moveToVaultForUser(user.id, req.body);
        const payload = { ok: true, message: "Machine moved to vault successfully!", movedCount: result.movedCount };
        await finalizeCriticalMutationSuccess(idem.lease, { requestHash: idem.ci.requestHash, responseJson: payload });
        res.json(payload);
    }
    catch (error) {
        await cancelCriticalMutation(idem.lease);
        respondVaultError(res, error);
    }
}
export async function retrieveFromVault(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    const idem = await resolveCriticalMutation(req, res);
    if (!idem)
        return;
    try {
        const result = await vaultService.retrieveFromVaultForUser(user.id, req.body);
        const payload = { ok: true, message: "Machine retrieved from vault successfully!", movedCount: result.movedCount };
        await finalizeCriticalMutationSuccess(idem.lease, { requestHash: idem.ci.requestHash, responseJson: payload });
        res.json(payload);
    }
    catch (error) {
        await cancelCriticalMutation(idem.lease);
        respondVaultError(res, error);
    }
}
