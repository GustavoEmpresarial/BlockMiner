/**
 * Collapse admin purchase unit rows into checkout batches.
 * Mirrors server/modules/offer-events/offer-events.admin.purchases.ts
 */
export type OfferEventPurchaseUnit = {
  id: number;
  userId: number;
  eventMinerId: number;
  pricePaid: number;
  currency: string;
  createdAt: string;
  minerName?: string | null;
  quantity?: number;
  totalPaid?: number;
};

export type OfferEventPurchaseBatch = {
  id: number;
  userId: number;
  eventMinerId: number;
  minerName?: string | null;
  currency: string;
  unitPrice: number;
  quantity: number;
  totalPaid: number;
  createdAt: string;
};

function createdAtKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

export function aggregateOfferEventPurchases(rows: OfferEventPurchaseUnit[]): OfferEventPurchaseBatch[] {
  if (!rows.length) return [];

  if (rows.every((r) => typeof r.quantity === 'number' && r.quantity >= 1)) {
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      eventMinerId: r.eventMinerId,
      minerName: r.minerName ?? null,
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
    const key = [row.userId, row.eventMinerId, row.currency, Number(row.pricePaid), createdAtKey(row.createdAt)].join('|');
    const existing = map.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.totalPaid = Number((existing.unitPrice * existing.quantity).toFixed(8));
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
      currency: row.currency,
      unitPrice: unit,
      quantity: 1,
      totalPaid: unit,
      createdAt: createdAtKey(row.createdAt),
    });
  }

  return order.map((k) => map.get(k)!).sort((a, b) => b.id - a.id);
}
