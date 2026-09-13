// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { requireSessionUser, readHttpStatus, readErrorCode, readErrorMessage } from "../../../shared/errors/httpStatusError.js";
import { resolveCriticalMutation, finalizeCriticalMutationSuccess, cancelCriticalMutation } from "../../../core/http/middleware/idempotency.js";
import { reportError } from "../../../core/errors/error-reporter.js";
import * as vaultService from "./vault.service.js";
/**
 * Structured error reporting was entirely absent here before this pass — getVault's
 * catch discarded the error object completely (bare `catch { ... }`, not even a
 * console.error), and the mutation paths' generic-500 fallback never reported
 * anything either. Same "página que mais dá problema" pattern already fixed for
 * inventory/rooms (see server/modules/inventory/inventory.controller.ts).
 *
 * API CONTRACT FIX (found 2026-09-13): every 400 from vault.service.ts (INVALID_RACK_REF,
 * INVALID_SELECTION, INVALID_VAULT_ITEM, INVALID_SLOT) used to get collapsed here into one
 * generic `{ code: "INVALID_STATE" }` — meanwhile the client's i18n catalogs (pt-BR/en/es
 * vault.errors) had translations for codes the server NEVER sent (VAULT_RACK_LINK,
 * VAULT_BAD_REQUEST, VAULT_BAD_ITEM, VAULT_BAD_SOURCE, VAULT_BAD_DESTINATION,
 * VAULT_ALREADY_STORED — leftover from the legacy vault implementation this was ported
 * from, which used different error codes) and NO translation at all for the one code the
 * server actually sent. Every validation failure silently fell through to the generic
 * "Falha ao retirar máquina do cofre." toast instead of a specific, actionable message.
 * Fixed by forwarding the service's own specific reason as the client-facing code (see
 * docs/vault-cofre-de-mineradores.md#api-contract) and updating the i18n catalogs to match
 * what the server actually sends, instead of the stale legacy code list.
 */
const KNOWN_VAULT_VALIDATION_REASONS = new Set(["INVALID_RACK_REF", "INVALID_SELECTION", "INVALID_VAULT_ITEM", "INVALID_SLOT"]);
/** Exported for tests/wallet/vault.controller.errorContract.test.mjs — verifies the
 * client-facing error contract without needing a live DB or full request/response mocking. */
export function respondVaultError(res, error, req, module, context) {
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
    if (http === 400) {
        const specificCode = KNOWN_VAULT_VALIDATION_REASONS.has(msg) ? `VAULT_${msg}` : "VAULT_INVALID_STATE";
        res.status(400).json({ ok: false, code: specificCode, message: "Invalid selection." });
        return;
    }
    reportError({
        code: `VAULT_${module.toUpperCase()}_FAILED`,
        category: "DATABASE",
        severity: "ERROR",
        module: `vault.${module}`,
        error,
        req,
        context,
    });
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
    catch (error) {
        reportError({
            code: "VAULT_LIST_FAILED",
            category: "DATABASE",
            severity: "ERROR",
            module: "vault.list",
            error,
            req,
        });
        res.status(500).json({ ok: false, code: "VAULT_LIST_UNAVAILABLE", message: "Unable to load vault." });
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
        respondVaultError(res, error, req, "move", { userId: user.id, source: req.body?.source });
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
        respondVaultError(res, error, req, "retrieve", { userId: user.id, destination: req.body?.destination });
    }
}
