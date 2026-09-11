/**
 * Ported from legacy/server/services/supportPlayerDossierService.ts
 * (`getSupportTicketPlayerDossier`), scoped to what current/'s schema supports.
 *
 * Read-only aggregation for admin support tooling — no mutations. Each data slice
 * is loaded independently so one failing table/query does not fail the whole
 * dossier (partial results for admins), matching legacy's `loadDossierSlice`.
 *
 * Deviation (documented): legacy also cross-references `accountCollisions` via
 * `adminAccountCollisionService` (shared-IP / shared-wallet clustering across
 * accounts) — that service has not been ported into current/ (it is a separate,
 * fairly large module in its own right, out of scope for this dossier gap). The
 * dossier response omits that field rather than fabricating it; a future port of
 * adminAccountCollisionService can wire it back in here.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("support.dossier");

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadDossierSlice<T>(sliceName: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err: unknown) {
    log.warn(`Dossier slice skipped: ${sliceName}`, {
      message: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    });
    return null;
  }
}

function primaryWalletList(walletAddress: string | null): string[] {
  if (!walletAddress) return [];
  const t = walletAddress.trim();
  return t ? [t] : [];
}

async function collectKnownWalletAddresses(userId: number, primaryWallet: string | null, sampleSize = 400): Promise<string[]> {
  const set = new Map<string, string>();
  const add = (addr: string | null | undefined) => {
    if (!addr) return;
    const t = addr.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (!set.has(key)) set.set(key, t);
  };
  add(primaryWallet);
  const txRows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: sampleSize,
    select: { address: true, fromAddress: true },
  });
  for (const r of txRows) {
    add(r.address);
    add(r.fromAddress);
  }
  return Array.from(set.values());
}

export type DossierPaginationQuery = {
  limit?: unknown;
  depositsPage?: unknown;
  ccpaymentPage?: unknown;
  withdrawalsPage?: unknown;
  payoutsPage?: unknown;
  minersPage?: unknown;
  inventoryPage?: unknown;
  vaultPage?: unknown;
};

export function parseDossierPagination(q: DossierPaginationQuery) {
  const limit = Math.min(80, Math.max(10, parseInt(String(q?.limit ?? "30"), 10) || 30));
  const page = (key: keyof DossierPaginationQuery, def = 1): number => {
    const n = parseInt(String(q?.[key] ?? def), 10);
    return !Number.isFinite(n) || n < 1 ? 1 : n;
  };
  return {
    limit,
    depositsPage: page("depositsPage"),
    ccpaymentPage: page("ccpaymentPage"),
    withdrawalsPage: page("withdrawalsPage"),
    payoutsPage: page("payoutsPage"),
    minersPage: page("minersPage"),
    inventoryPage: page("inventoryPage"),
    vaultPage: page("vaultPage"),
  };
}

function skipFor(page: number, limit: number): number {
  return (page - 1) * limit;
}

export type DossierResult =
  | { ok: false; code: "NOT_FOUND" }
  | { ok: true; linked: false; ticket: { id: number; name: string; email: string }; dossier: null }
  | {
      ok: true;
      linked: true;
      userId: number;
      ticket: { id: number; name: string; email: string };
      dossier: null;
      orphanTicket: true;
    }
  | {
      ok: true;
      linked: true;
      userId: number;
      ticket: { id: number; name: string; email: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dossier: Record<string, any>;
    };

export async function getSupportTicketPlayerDossier(ticketId: number, query: DossierPaginationQuery): Promise<DossierResult> {
  const ticket = await prisma.supportMessage.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, name: true, email: true },
  });

  if (!ticket) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const ticketPublic = { id: ticket.id, name: ticket.name, email: ticket.email };

  if (ticket.userId == null) {
    return { ok: true, linked: false, ticket: ticketPublic, dossier: null };
  }

  const userId = ticket.userId;
  const p = parseDossierPagination(query);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      walletAddress: true,
      registrationIp: true,
      ip: true,
      isBanned: true,
      createdAt: true,
      lastLoginAt: true,
      polBalance: true,
      blkBalance: true,
    },
  });

  if (!user) {
    return { ok: true, linked: true, userId, ticket: ticketPublic, dossier: null, orphanTicket: true };
  }

  const [walletAddresses, depositSplit, withdrawalSplit, ccpaymentSplit, payoutsSplit, minersSplit, inventorySplit, vaultSplit] =
    await Promise.all([
      loadDossierSlice("walletAddresses", () => collectKnownWalletAddresses(userId, user.walletAddress, 400)),
      loadDossierSlice("depositTransactions", async () => {
        const [total, rows] = await Promise.all([
          prisma.transaction.count({ where: { userId, type: "deposit" } }),
          prisma.transaction.findMany({
            where: { userId, type: "deposit" },
            orderBy: { createdAt: "desc" },
            skip: skipFor(p.depositsPage, p.limit),
            take: p.limit,
            select: {
              id: true,
              amount: true,
              fee: true,
              status: true,
              txHash: true,
              address: true,
              fromAddress: true,
              createdAt: true,
              completedAt: true,
            },
          }),
        ]);
        return { total, rows };
      }),
      loadDossierSlice("withdrawalTransactions", async () => {
        const [total, rows] = await Promise.all([
          prisma.transaction.count({ where: { userId, type: "withdrawal" } }),
          prisma.transaction.findMany({
            where: { userId, type: "withdrawal" },
            orderBy: { createdAt: "desc" },
            skip: skipFor(p.withdrawalsPage, p.limit),
            take: p.limit,
            select: {
              id: true,
              amount: true,
              fee: true,
              status: true,
              txHash: true,
              address: true,
              createdAt: true,
              completedAt: true,
            },
          }),
        ]);
        return { total, rows };
      }),
      loadDossierSlice("ccpaymentDeposits", async () => {
        const [total, rows] = await Promise.all([
          prisma.ccpaymentDepositEvent.count({ where: { userId } }),
          prisma.ccpaymentDepositEvent.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip: skipFor(p.ccpaymentPage, p.limit),
            take: p.limit,
            select: { id: true, recordId: true, amountPol: true, payStatus: true, credited: true, txHash: true, createdAt: true },
          }),
        ]);
        return { total, rows };
      }),
      loadDossierSlice("payouts", async () => {
        const [total, rows] = await Promise.all([
          prisma.payout.count({ where: { userId } }),
          prisma.payout.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip: skipFor(p.payoutsPage, p.limit),
            take: p.limit,
            select: { id: true, amountPol: true, source: true, txHash: true, createdAt: true },
          }),
        ]);
        return { total, rows };
      }),
      loadDossierSlice("userMiners", async () => {
        const [total, rows] = await Promise.all([
          prisma.userMiner.count({ where: { userId } }),
          prisma.userMiner.findMany({
            where: { userId },
            orderBy: { slotIndex: "asc" },
            skip: skipFor(p.minersPage, p.limit),
            take: p.limit,
            include: { miner: { select: { name: true, slug: true, imageUrl: true } } },
          }),
        ]);
        return { total, rows };
      }),
      loadDossierSlice("userInventory", async () => {
        const [total, rows] = await Promise.all([
          prisma.userInventory.count({ where: { userId } }),
          prisma.userInventory.findMany({
            where: { userId },
            orderBy: { acquiredAt: "desc" },
            skip: skipFor(p.inventoryPage, p.limit),
            take: p.limit,
            include: { miner: { select: { name: true, slug: true, imageUrl: true } } },
          }),
        ]);
        return { total, rows };
      }),
      loadDossierSlice("userVault", async () => {
        const [total, rows] = await Promise.all([
          prisma.userVault.count({ where: { userId } }),
          prisma.userVault.findMany({
            where: { userId },
            orderBy: { storedAt: "desc" },
            skip: skipFor(p.vaultPage, p.limit),
            take: p.limit,
            include: { miner: { select: { name: true, slug: true, imageUrl: true } } },
          }),
        ]);
        return { total, rows };
      }),
    ]);

  const walletAddressesResolved = walletAddresses ?? primaryWalletList(user.walletAddress);

  const depositTxRows = depositSplit?.rows ?? [];
  const withdrawalTxRows = withdrawalSplit?.rows ?? [];
  const ccpaymentRows = ccpaymentSplit?.rows ?? [];
  const payoutsRows = payoutsSplit?.rows ?? [];
  const minersRows = minersSplit?.rows ?? [];
  const inventoryRows = inventorySplit?.rows ?? [];
  const vaultRows = vaultSplit?.rows ?? [];

  const mapTx = (t: { amount: unknown; fee: unknown; [k: string]: unknown }) => ({
    ...t,
    amount: toNumberOrNull(t.amount),
    fee: t.fee != null ? toNumberOrNull(t.fee) : null,
  });
  const mapCcp = (c: { amountPol: unknown; [k: string]: unknown }) => ({
    ...c,
    amountPol: c.amountPol != null ? toNumberOrNull(c.amountPol) : null,
  });

  const miners = minersRows.map((m) => ({
    id: m.id,
    slotIndex: m.slotIndex,
    level: m.level,
    hashRate: m.hashRate,
    slotSize: m.slotSize,
    isActive: m.isActive,
    purchasedAt: m.purchasedAt,
    minerId: m.minerId,
    displayName: m.miner?.name ?? "Miner",
    slug: m.miner?.slug ?? null,
    imageUrl: m.imageUrl || m.miner?.imageUrl || null,
  }));

  const inventoryMachines = inventoryRows.map((row) => ({
    id: row.id,
    level: row.level,
    hashRate: row.hashRate,
    slotSize: row.slotSize,
    minerId: row.minerId,
    displayName: row.miner?.name || row.minerName || "Miner",
    slug: row.miner?.slug ?? null,
    imageUrl: row.imageUrl || row.miner?.imageUrl || null,
    acquiredAt: row.acquiredAt,
    expiresAt: row.expiresAt,
  }));

  const vaultMachines = vaultRows.map((row) => ({
    id: row.id,
    level: row.level,
    hashRate: row.hashRate,
    slotSize: row.slotSize,
    minerId: row.minerId,
    displayName: row.miner?.name || row.minerName || "Miner",
    slug: row.miner?.slug ?? null,
    imageUrl: row.imageUrl || row.miner?.imageUrl || null,
    storedAt: row.storedAt,
  }));

  return {
    ok: true,
    linked: true,
    userId,
    ticket: ticketPublic,
    dossier: {
      summary: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        registrationIp: user.registrationIp,
        lastIp: user.ip,
        isBanned: user.isBanned,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        polBalance: toNumberOrNull(user.polBalance),
        blkBalance: toNumberOrNull(user.blkBalance),
      },
      walletAddresses: walletAddressesResolved,
      depositTransactions: { rows: depositTxRows.map(mapTx), total: depositSplit?.total ?? 0, page: p.depositsPage, limit: p.limit },
      ccpaymentDeposits: { rows: ccpaymentRows.map(mapCcp), total: ccpaymentSplit?.total ?? 0, page: p.ccpaymentPage, limit: p.limit },
      withdrawalTransactions: {
        rows: withdrawalTxRows.map(mapTx),
        total: withdrawalSplit?.total ?? 0,
        page: p.withdrawalsPage,
        limit: p.limit,
      },
      payouts: { rows: payoutsRows, total: payoutsSplit?.total ?? 0, page: p.payoutsPage, limit: p.limit },
      miners: { rows: miners, total: minersSplit?.total ?? 0, page: p.minersPage, limit: p.limit },
      inventory: { rows: inventoryMachines, total: inventorySplit?.total ?? 0, page: p.inventoryPage, limit: p.limit },
      vault: { rows: vaultMachines, total: vaultSplit?.total ?? 0, page: p.vaultPage, limit: p.limit },
    },
  };
}
