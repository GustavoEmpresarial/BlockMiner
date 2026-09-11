/**
 * CoinEx withdrawal API client — ported from legacy/server/services/coinexService.ts.
 *
 * IMPORTANT — same honest-degradation contract as ip-intelligence's ProxyCheck.io lookup
 * (see server/modules/ip-intelligence/ip-intelligence.service.ts header): this route is
 * OFF by default (`WITHDRAWAL_VIA_COINEX` unset/false in prod) and UNTESTED against the
 * real CoinEx API in this environment — no `COINEX_ACCESS_ID` / `COINEX_SECRET` are
 * configured here. When unconfigured, `submitCoinExWithdrawal` / `getCoinExWithdrawalStatus`
 * throw a clear, typed "not configured" error instead of ever fabricating a fake success
 * response. Callers (withdrawal.auto-send.ts) must treat that as "skip, retry later" — never
 * as "sent".
 */
import crypto from "node:crypto";

const COINEX_BASE_URL = "https://api.coinex.com";

export class CoinExNotConfiguredError extends Error {
  constructor() {
    super("CoinEx API not configured (COINEX_ACCESS_ID / COINEX_SECRET missing)");
    this.name = "CoinExNotConfiguredError";
  }
}

export function isCoinExConfigured(): boolean {
  return Boolean(String(process.env.COINEX_ACCESS_ID || "").trim()) && Boolean(String(process.env.COINEX_SECRET || "").trim());
}

function coinexAccessId(): string {
  const id = String(process.env.COINEX_ACCESS_ID || "").trim();
  if (!id) throw new CoinExNotConfiguredError();
  return id;
}

function coinexSecret(): string {
  const key = String(process.env.COINEX_SECRET || "").trim();
  if (!key) throw new CoinExNotConfiguredError();
  return key;
}

function buildHeaders(method: string, path: string, queryString: string, body: string): Record<string, string> {
  const timestampMs = String(Date.now());
  const params = queryString || body;
  const message = `${method}${path}${params}${timestampMs}`;
  const signature = crypto.createHmac("sha256", coinexSecret()).update(message).digest("hex");
  return {
    "Content-Type": "application/json",
    "X-COINEX-KEY": coinexAccessId(),
    "X-COINEX-SIGN": signature,
    "X-COINEX-TIMESTAMP": timestampMs,
  };
}

async function coinexFetch(
  method: "GET" | "POST",
  path: string,
  queryString: string,
  body: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<unknown> {
  if (!isCoinExConfigured()) throw new CoinExNotConfiguredError();
  const url = queryString ? `${COINEX_BASE_URL}${path}?${queryString}` : `${COINEX_BASE_URL}${path}`;
  const headers = buildHeaders(method, path, queryString, body);
  const res = await fetchImpl(url, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { code: number; message: string; data: unknown };
  if (json.code !== 0) throw new Error(`CoinEx API error ${json.code}: ${json.message}`);
  return json.data;
}

export interface CoinExWithdrawResult {
  withdrawId: number;
}

export interface CoinExWithdrawStatus {
  txHash: string | null;
  status: string;
}

export async function submitCoinExWithdrawal(
  address: string,
  amountStr: string,
  transactionId: number,
  fetchImpl?: typeof fetch,
): Promise<CoinExWithdrawResult> {
  const path = "/v2/assets/withdraw";
  const body = JSON.stringify({
    ccy: "POL",
    chain: "MATIC",
    to_address: address,
    amount: amountStr,
    remark: `BlockMiner #${transactionId}`,
  });
  const data = (await coinexFetch("POST", path, "", body, fetchImpl)) as { withdraw_id: number };
  return { withdrawId: data.withdraw_id };
}

export async function getCoinExWithdrawalStatus(withdrawId: number, fetchImpl?: typeof fetch): Promise<CoinExWithdrawStatus> {
  const path = "/v2/assets/withdraw";
  const queryString = `withdraw_id=${withdrawId}`;
  const data = (await coinexFetch("GET", path, queryString, "", fetchImpl)) as { tx_hash: string; status: string };
  const txHash = data.tx_hash && data.tx_hash.startsWith("0x") ? data.tx_hash : null;
  return { txHash, status: data.status };
}
