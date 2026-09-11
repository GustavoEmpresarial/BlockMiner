// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import * as depositRepo from "./deposit.repository.js";
import * as depositService from "./deposit.service.js";
export async function getDeposits(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const rows = await depositRepo.listDepositsForUser(user.id);
        const normalized = rows.map((tx) => ({ ...tx, amount: Number(tx.amount), fee: tx.fee != null ? Number(tx.fee) : null }));
        res.json({ ok: true, deposits: normalized });
    }
    catch {
        res.status(500).json({ ok: false, message: "Unable to get deposits." });
    }
}
export async function getPendingDeposits(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const rows = await depositRepo.listRecentDepositsForStatusPoll(user.id);
        const mapped = rows.map((d) => ({
            id: d.id,
            txHash: d.txHash,
            amount: Number(d.amount),
            status: d.status,
            verifyAttempts: d.verifyAttempts,
            createdAt: d.createdAt,
            completedAt: d.completedAt,
        }));
        res.json({ ok: true, deposits: mapped });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao buscar depósitos." });
    }
}
export async function postDepositEstimateGas(req, res) {
    try {
        const { from, to, valueHex, data } = req.body;
        const result = await depositService.estimateDepositGas({ from, to, valueHex, data });
        res.json({ ok: true, ...result });
    }
    catch {
        res.json({ ok: true, gasLimit: "0x5208", fallback: true });
    }
}
export async function submitDeposit(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const { txHash, claimedAmount } = req.body;
        const outcome = await depositService.submitDepositForVerification(user.id, txHash, claimedAmount);
        switch (outcome.kind) {
            case "missing_hash":
                res.status(400).json({ ok: false, message: "Hash da transação obrigatório." });
                return;
            case "invalid_hash_format":
                res.status(400).json({ ok: false, message: "Hash inválido. Formato esperado: 0x seguido de 64 caracteres hexadecimais." });
                return;
            case "invalid_amount":
                res.status(400).json({ ok: false, message: "Valor inválido." });
                return;
            case "already_completed":
                res.status(409).json({ ok: false, code: "ALREADY_CREDITED", message: "Esta transação já foi processada e creditada." });
                return;
            case "already_pending":
                res.json({ ok: true, deposit: { id: outcome.depositId, status: "pending_verification" }, message: "Depósito já está em verificação." });
                return;
            case "hash_claimed":
                res.status(409).json({
                    ok: false,
                    code: "HASH_CLAIMED",
                    message: outcome.reason === "anti_fraud" ? "Esta transação já foi reivindicada por outra conta." : "Esta transação já foi registada por outra conta.",
                });
                return;
            case "created":
                res.json({
                    ok: true,
                    deposit: { id: outcome.depositId, txHash: outcome.txHash, status: "pending_verification" },
                    message: "Depósito enviado! Verificando na blockchain em segundo plano.",
                });
                return;
        }
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao registrar depósito." });
    }
}
