import type { TxClient } from "../../core/database/prisma.js";

const EVENT_PREFIX_RE = /^\[event\]\s*/i;

export function parseEventMinerDisplayName(minerName: string | null | undefined): string | null {
  const raw = String(minerName ?? "").trim();
  if (!raw || !EVENT_PREFIX_RE.test(raw)) return null;
  const name = raw.replace(EVENT_PREFIX_RE, "").trim();
  return name || null;
}

/**
 * Persist event identity on UserOwnedMachine. Catalog miners (minerId set) skip lookup.
 * New `[Event] *` grants throw when the EventMiner name is missing or duplicated.
 * Legacy ensure/backfill paths pass `{ strict: false }` so an ambiguous name stays untyped.
 */
export async function resolveGrantEventMinerId(
  tx: TxClient,
  template: { minerId: number | null; minerName: string; eventMinerId?: number | null },
  options?: { strict?: boolean },
): Promise<number | null> {
  if (Number.isInteger(template.eventMinerId) && Number(template.eventMinerId) > 0) {
    return Number(template.eventMinerId);
  }
  if (template.minerId != null) return null;
  const parsed = parseEventMinerDisplayName(template.minerName);
  const lookup = (parsed ?? template.minerName).trim();
  if (!lookup) return null;
  const matches = await tx.eventMiner.findMany({
    where: { name: { equals: lookup, mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });
  if (matches.length === 1) return matches[0]!.id;
  if (parsed && options?.strict !== false) {
    throw Object.assign(new Error("EVENT_MINER_IDENTITY_REQUIRED"), { code: "EVENT_MINER_IDENTITY_REQUIRED" });
  }
  return null;
}
