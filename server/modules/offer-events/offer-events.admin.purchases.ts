/**
 * Admin purchase list: one DB row = one unit (createMany × qty).
 * Collapse identical unit rows from the same checkout into one batch line.
 */
export type OfferEventPurchaseUnit = {
  id: number;
  userId: number;
  eventMinerId: number;
  pricePaid: number;
  currency: string;
  createdAt: string | Date;
  minerName?: string | null;
  user?: { id: number; email?: string | null; username?: string | null; name?: string | null } | null;
  /** Present when API already aggregated. */
  quantity?: number;
  totalPaid?: number;
};

export type OfferEventPurchaseBatch = {
  id: number;
  userId: number;
  eventMinerId: number;
  minerName?: string | null;
  user?: OfferEventPurchaseUnit["user"];
  currency: string;
  unitPrice: number;
  quantity: number;
  totalPaid: number;
  createdAt: string;
};

function createdAtKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

function batchKey(row: OfferEventPurchaseUnit): string {
  return [
    row.userId,
    row.eventMinerId,
    row.currency,
    Number(row.pricePaid),
    createdAtKey(row.createdAt),
  ].join("|");
}

/** Collapse unit purchase rows into checkout batches (same user/miner/price/timestamp). */
export function aggregateOfferEventPurchases(rows: OfferEventPurchaseUnit[]): OfferEventPurchaseBatch[] {
  if (!rows.length) return [];

  // Already aggregated by API — pass through.
  if (rows.every((r) => typeof r.quantity === "number" && r.quantity >= 1)) {
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      eventMinerId: r.eventMinerId,
      minerName: r.minerName ?? null,
      user: r.user ?? null,
      currency: r.currency,
      unitPrice: Number(r.pricePaid),
      quantity: r.quantity!,
      totalPaid: Number(r.totalPaid ?? Number(r.pricePaid) * r.quantity!),
      createdAt: createdAtKey(r.createdAt),
    }));
  }

  const order: string[] = [];
  const map = new Map<string, OfferEventPurchaseBatch>();

  for (const row of rows) {
    const key = batchKey(row);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.totalPaid = Number((existing.unitPrice * existing.quantity).toFixed(8));
      // Keep the lowest id as stable batch id (createMany inserts ascending).
      if (row.id < existing.id) existing.id = row.id;
      continue;
    }
    order.push(key);
    const unit = Number(row.pricePaid);
    map.set(key, {
      id: row.id,
      userId: row.userId,
      eventMinerId: row.eventMinerId,
      minerName: row.minerName ?? null,
      user: row.user ?? null,
      currency: row.currency,
      unitPrice: unit,
      quantity: 1,
      totalPaid: unit,
      createdAt: createdAtKey(row.createdAt),
    });
  }

  return order
    .map((k) => map.get(k)!)
    .sort((a, b) => b.id - a.id);
}
