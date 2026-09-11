/**
 * On-chain check-in payment verification.
 * Etherscan V2 primary; JSON-RPC fallback. Never fabricates confirmation.
 */
import { logger } from "../../core/logger/index.js";
import { etherscanRateLimitWait } from "../../shared/security/etherscanRateLimiter.js";

const log = logger.child("CheckinChain");

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
const DEFAULT_POLYGON_CHAIN_ID = 137;
const DEFAULT_POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com";

/** AbortSignal timeouts follow transport limits, not invented business delays. */
const ETHERSCAN_FETCH_TIMEOUT_MS = 20_000;
const RPC_FETCH_TIMEOUT_MS = 25_000;

type CodeError = Error & { code?: string };

export function normalizeAddr(a: unknown): string {
  if (!a || typeof a !== "string") return "";
  return a.trim().toLowerCase();
}

export function isValidTxHashFormat(txHash: unknown): boolean {
  return TX_HASH_RE.test(String(txHash ?? "").trim());
}

export function assertValidTxHash(txHash: unknown): string {
  const t = String(txHash ?? "").trim();
  if (!isValidTxHashFormat(t)) {
    const err: CodeError = new Error("Invalid transaction hash.");
    err.code = "INVALID_TX_HASH";
    throw err;
  }
  return t;
}

export function assertValidWalletAddress(wallet: unknown): string {
  const w = String(wallet ?? "").trim();
  if (!WALLET_RE.test(w)) {
    const err: CodeError = new Error("Invalid wallet address.");
    err.code = "INVALID_WALLET_ADDRESS";
    throw err;
  }
  return w;
}

export function getExpectedCheckinChainId(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CHECKIN_CHAIN_ID ?? env.POLYGON_CHAIN_ID ?? String(DEFAULT_POLYGON_CHAIN_ID);
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_POLYGON_CHAIN_ID;
}

export function resolveCheckinContractAddress(env: NodeJS.ProcessEnv = process.env): string {
  const c = String(env.CHECKIN_CONTRACT_ADDRESS ?? "").trim();
  if (!c) return "";
  const lower = normalizeAddr(c);
  if (!lower || lower === ZERO_ADDR) return "";
  return c;
}

export function resolveCheckinReceiverFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  for (const key of ["CHECKIN_RECEIVER", "DEPOSIT_WALLET_ADDRESS"] as const) {
    const r = String(env[key] ?? "").trim();
    if (r && r.toLowerCase() !== ZERO_ADDR) return r;
  }
  return "";
}

export function getReceiver(): string {
  return resolveCheckinReceiverFromEnv();
}

export function hasCheckinTreasury(): boolean {
  return Boolean(getReceiver()) || Boolean(resolveCheckinContractAddress());
}

export function parseOptionalChainIdFromBody(body: unknown): number | null {
  const b = body as { chainId?: unknown } | null;
  const raw = b?.chainId;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function getPolygonscanApiKey(): string {
  return (process.env.POLYGONSCAN_API_KEY || "").trim();
}

function getCheckinRpcUrl(): string {
  const aether = (process.env.AETHER_RPC_URL || "").trim();
  if (aether) return aether;
  return (process.env.POLYGON_RPC_URL || "").trim() || DEFAULT_POLYGON_RPC;
}

async function etherscanV2Fetch(params: Record<string, string>): Promise<{
  message?: string;
  result?: unknown;
}> {
  await etherscanRateLimitWait();
  const apiKey = getPolygonscanApiKey();
  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", String(DEFAULT_POLYGON_CHAIN_ID));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (apiKey) url.searchParams.set("apikey", apiKey);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(ETHERSCAN_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`Etherscan V2 HTTP ${res.status}`), { code: "ESCAN_HTTP" });
  const json = (await res.json()) as { message?: string; result?: unknown };
  if (json.message === "NOTOK" && json.result !== "No transactions found") {
    throw Object.assign(new Error(String(json.result || "Etherscan V2 error")), { code: "ESCAN_ERROR" });
  }
  return json;
}

async function etherscanGetTx(txHash: string): Promise<Record<string, unknown> | null> {
  const json = await etherscanV2Fetch({ module: "proxy", action: "eth_getTransactionByHash", txhash: txHash });
  return (json.result as Record<string, unknown>) || null;
}

async function etherscanGetReceipt(txHash: string): Promise<Record<string, unknown> | null> {
  const json = await etherscanV2Fetch({ module: "proxy", action: "eth_getTransactionReceipt", txhash: txHash });
  return (json.result as Record<string, unknown>) || null;
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const url = getCheckinRpcUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw Object.assign(new Error(`RPC HTTP ${response.status}`), { code: "RPC_HTTP" });
  const payload = (await response.json()) as { error?: { message?: string }; result?: unknown };
  if (payload.error) throw Object.assign(new Error(payload.error.message || "RPC error"), { code: "RPC_ERROR" });
  return payload.result;
}

async function getTxWithFallback(txHash: string): Promise<{
  tx: Record<string, unknown> | null;
  source: "etherscan" | "rpc";
}> {
  if (getPolygonscanApiKey()) {
    try {
      return { tx: await etherscanGetTx(txHash), source: "etherscan" };
    } catch (e) {
      log.warn("Etherscan V2 getTx failed, falling back to RPC", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { tx: (await rpcCall("eth_getTransactionByHash", [txHash])) as Record<string, unknown> | null, source: "rpc" };
}

async function getReceiptWithFallback(
  txHash: string,
  source: "etherscan" | "rpc",
): Promise<Record<string, unknown> | null> {
  if (source === "etherscan" && getPolygonscanApiKey()) {
    try {
      return await etherscanGetReceipt(txHash);
    } catch (e) {
      log.warn("Etherscan V2 getReceipt failed, falling back to RPC", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return (await rpcCall("eth_getTransactionReceipt", [txHash])) as Record<string, unknown> | null;
}

export function receiptSucceeded(receipt: Record<string, unknown> | null | undefined): boolean {
  if (!receipt) return false;
  const s = receipt.status;
  if (s === true || s === 1) return true;
  if (typeof s === "string") {
    try {
      return BigInt(s) === 1n;
    } catch {
      return false;
    }
  }
  return false;
}

export type CheckinPaymentEval = {
  ok: boolean;
  state: "pending" | "confirmed" | "failed";
  reason?: string;
};

export async function evaluateCheckinPayment(args: {
  txHash: string;
  userWalletLower: string;
  receiverLower: string;
  minValueWei: bigint;
  missingTxBehavior?: "pending" | "failed";
}): Promise<CheckinPaymentEval> {
  const { txHash, userWalletLower, receiverLower, minValueWei, missingTxBehavior = "pending" } = args;
  const { tx, source } = await getTxWithFallback(txHash);
  if (!tx) {
    if (missingTxBehavior === "failed") {
      return {
        ok: false,
        state: "failed",
        reason: "Transaction not found on-chain. Wait a few seconds after sending and try again, or verify the hash.",
      };
    }
    return { ok: true, state: "pending" };
  }
  const from = normalizeAddr(tx.from);
  if (from !== userWalletLower) {
    return { ok: false, state: "failed", reason: "Transaction sender does not match your linked wallet." };
  }
  const to = normalizeAddr(tx.to);
  if (!to || to === ZERO_ADDR) {
    return { ok: false, state: "failed", reason: "Invalid transaction (no recipient)." };
  }
  if (to !== receiverLower) {
    return { ok: false, state: "failed", reason: "Payment must go to the official check-in address." };
  }
  let valueWei: bigint;
  try {
    valueWei = BigInt((tx.value as string) || "0x0");
  } catch {
    return { ok: false, state: "failed", reason: "Invalid transaction value." };
  }
  if (valueWei < minValueWei) {
    return { ok: false, state: "failed", reason: "Amount sent is below the required check-in payment." };
  }
  const receipt = await getReceiptWithFallback(txHash, source);
  if (!receipt) {
    return { ok: true, state: "pending" };
  }
  if (!receiptSucceeded(receipt)) {
    return { ok: false, state: "failed", reason: "Transaction failed on-chain (reverted or out of gas)." };
  }
  return { ok: true, state: "confirmed" };
}
