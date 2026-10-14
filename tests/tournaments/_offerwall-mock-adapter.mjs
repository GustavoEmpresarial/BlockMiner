/**
 * Offerwall scoring reads event rows (findMany) so it can time-stamp ties.
 * Older coverage tests configure per-user counts via `groupBy` mocks (and set
 * them again mid-test); this adapter wraps the mock so `findMany` expands the
 * *current* groupBy counts into rows with the same totals. Tests that set
 * `findMany` themselves (Zerads) keep working unchanged.
 */
const COUNT_TABLES = {
  internalOfferwallAttempt: "completedAt",
  offerwallMeCallback: "createdAt",
  moneyRainCallback: "createdAt",
  multiwallCallback: "createdAt",
  offerwallGgCallback: "createdAt",
};

function expandGroupBy(delegate, timeField) {
  return async (args) => {
    if (typeof delegate.groupBy !== "function") return [];
    const grouped = await delegate.groupBy(args);
    const at = args?.where?.[timeField]?.gte ?? new Date(0);
    const rows = [];
    for (const g of grouped ?? []) {
      const n = Number(g?._count?.id ?? 0);
      for (let i = 0; i < n; i++) rows.push({ userId: g.userId, [timeField]: at, status: 1 });
    }
    return rows;
  };
}

export function withOfferwallFindMany(prismaMock) {
  for (const [model, timeField] of Object.entries(COUNT_TABLES)) {
    const delegate = prismaMock[model];
    if (!delegate || typeof delegate.findMany === "function") continue;
    delegate.findMany = expandGroupBy(delegate, timeField);
  }
  const entries = prismaMock.tournamentEntry;
  if (entries) {
    entries.updateMany ??= async (args) => {
      if (typeof entries.upsert === "function") {
        const { tournamentId, userId } = args.where;
        await entries.upsert({
          where: { tournamentId_userId: { tournamentId, userId } },
          update: args.data,
          create: { ...args.data, tournamentId, userId },
        });
      }
      return { count: 1 };
    };
    entries.createMany ??= async () => ({ count: 0 });
  }
  return prismaMock;
}
