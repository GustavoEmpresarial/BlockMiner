import type { AppPrisma } from "../../core/database/prisma.js";
import { parseEventMinerDisplayName } from "./eventMinerDisplayName.js";

const GENERIC_LABELS = new Set(
  ["máquina", "maquina", "máquina custom", "maquina custom", "miner", "unknown miner", "gpu 1 ghs"],
);
const LOCATIONS = new Set(["RACK", "INVENTORY", "WAREHOUSE"]);

export type OrphanMachineTypeRow = {
  minerName: string;
  inventoryCount: number;
  rackCount: number;
  vaultCount: number;
  totalCount: number;
  kind: "orphan" | "event" | "generic";
  eventMinerId: number | null;
  catalogMinerId: number | null;
  catalogMinerName: string | null;
  hint: string;
};

export type BrokenMachineGroup = {
  minerName: string;
  hashRate: number;
  location: "RACK" | "INVENTORY" | "WAREHOUSE";
  count: number;
  isEvent: boolean;
  autoMinerId: number | null;
  autoMinerName: string | null;
  catalogMatches: { id: number; name: string; baseHashRate: number }[];
  eventMatches: { id: number; name: string; hashRate: number }[];
};

type RepairResult = { ok: boolean; assigned: number; message: string };

function emptyRelink(minerName: string, message: string) {
  return {
    ok: false,
    minerName,
    catalogMinerId: null,
    catalogMinerName: null,
    counts: { inventory: 0, racks: 0, vault: 0, ownedMachines: 0 },
    message,
  };
}

export async function listOrphanMachineTypes(prisma: AppPrisma, limit = 60): Promise<OrphanMachineTypeRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{ miner_name: string; inventory_count: bigint; rack_count: bigint; vault_count: bigint }>
  >`
    SELECT miner_name,
      COUNT(*) FILTER (WHERE src = 'inv')::bigint AS inventory_count,
      COUNT(*) FILTER (WHERE src = 'rack')::bigint AS rack_count,
      COUNT(*) FILTER (WHERE src = 'vault')::bigint AS vault_count
    FROM (
      SELECT i.miner_name, 'inv' AS src FROM user_inventory i
        LEFT JOIN user_owned_machines o ON o.id = i.owned_machine_id
        WHERE i.miner_id IS NULL AND o.event_miner_id IS NULL
      UNION ALL
      SELECT uom.miner_name, 'rack' AS src FROM user_miners um
        INNER JOIN user_owned_machines uom ON uom.id = um.owned_machine_id
        WHERE um.miner_id IS NULL AND uom.event_miner_id IS NULL
      UNION ALL
      SELECT v.miner_name, 'vault' AS src FROM user_vault v
        LEFT JOIN user_owned_machines o ON o.id = v.owned_machine_id
        WHERE v.miner_id IS NULL AND o.event_miner_id IS NULL
      UNION ALL
      SELECT miner_name, 'owned' AS src FROM user_owned_machines
        WHERE miner_id IS NULL AND event_miner_id IS NULL
    ) orphan_rows
    GROUP BY miner_name
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;
  const [eventMiners, catalogMiners] = await Promise.all([
    prisma.eventMiner.findMany({ select: { id: true, name: true }, orderBy: { updatedAt: "desc" } }),
    prisma.miner.findMany({ select: { id: true, name: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const eventByName = new Map(eventMiners.map((miner) => [miner.name.trim().toLowerCase(), miner]));
  const catalogByName = new Map(catalogMiners.map((miner) => [miner.name.trim().toLowerCase(), miner]));

  return rows.flatMap((row) => {
    const minerName = String(row.miner_name ?? "").trim();
    const inventoryCount = Number(row.inventory_count) || 0;
    const rackCount = Number(row.rack_count) || 0;
    const vaultCount = Number(row.vault_count) || 0;
    const totalCount = inventoryCount + rackCount + vaultCount;
    if (!minerName || totalCount === 0) return [];

    const eventLabel = parseEventMinerDisplayName(minerName);
    const lookupName = (eventLabel ?? minerName).trim().toLowerCase();
    const eventMatch = eventByName.get(lookupName) ?? null;
    const catalogMatch = catalogByName.get(lookupName) ?? null;
    const kind = GENERIC_LABELS.has(lookupName) ? "generic" : eventLabel || eventMatch ? "event" : "orphan";
    const hint = catalogMatch
      ? `Catalog match: ${catalogMatch.name} (#${catalogMatch.id}).`
      : kind === "event"
        ? eventMatch ? `Event match: ${eventMatch.name} (#${eventMatch.id}).` : "No matching event miner."
        : kind === "generic" ? "Legacy generic label; frozen. Do not assign by hashrate." : "No catalog miner with this name.";

    return [{
      minerName, inventoryCount, rackCount, vaultCount, totalCount, kind,
      eventMinerId: eventMatch?.id ?? null,
      catalogMinerId: catalogMatch?.id ?? null,
      catalogMinerName: catalogMatch?.name ?? null,
      hint,
    }];
  });
}

export async function relinkOrphanMachineTypeToCatalog(prisma: AppPrisma, minerName: string) {
  const label = String(minerName ?? "").trim();
  if (!label) return emptyRelink(label, "Miner name is required.");
  const lookupName = (parseEventMinerDisplayName(label) ?? label).trim();
  if (GENERIC_LABELS.has(lookupName.toLowerCase())) {
    return emptyRelink(label, "Generic labels cannot be auto-relinked. Assign a catalog miner by hand.");
  }

  const eventMatches = await prisma.eventMiner.findMany({
    where: { name: { equals: lookupName, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (parseEventMinerDisplayName(label) || eventMatches.length === 1) {
    if (eventMatches.length !== 1) {
      return emptyRelink(label, eventMatches.length === 0
        ? "No event miner has this name."
        : "Multiple event miners share this name. Relink is blocked.");
    }
    const event = eventMatches[0]!;
    const where = { minerId: null, eventMinerId: null, minerName: label };
    const counts = await prisma.userOwnedMachine.updateMany({
      where,
      data: { eventMinerId: event.id },
    });
    return {
      ok: counts.count > 0,
      minerName: label,
      catalogMinerId: null,
      catalogMinerName: null,
      counts: { inventory: 0, racks: 0, vault: 0, ownedMachines: counts.count },
      message: counts.count
        ? `${counts.count} machine instance(s) linked to event ${event.name}.`
        : "No untyped instances found for this name.",
    };
  }

  const catalog = await prisma.miner.findFirst({
    where: { name: { equals: lookupName, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!catalog) return emptyRelink(label, "No catalog miner has this name.");

  const where = { minerId: null, eventMinerId: null, minerName: label };
  const ownedIds = (await prisma.userOwnedMachine.findMany({ where, select: { id: true } })).map((row) => row.id);
  const counts = await prisma.$transaction(async (tx) => {
    const data = { minerId: catalog.id, minerName: catalog.name };
    const [inventory, vault, ownedMachines] = await Promise.all([
      tx.userInventory.updateMany({ where: { minerId: null, minerName: label }, data }),
      tx.userVault.updateMany({ where: { minerId: null, minerName: label }, data }),
      tx.userOwnedMachine.updateMany({ where, data }),
    ]);
    const racks = ownedIds.length
      ? await tx.userMiner.updateMany({ where: { ownedMachineId: { in: ownedIds } }, data: { minerId: catalog.id } })
      : { count: 0 };
    return { inventory: inventory.count, racks: racks.count, vault: vault.count, ownedMachines: ownedMachines.count };
  });
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    ok: total > 0, minerName: label, catalogMinerId: catalog.id, catalogMinerName: catalog.name, counts,
    message: total ? `${total} machine instance(s) linked to ${catalog.name}.` : "No orphan instances found for this name.",
  };
}

export async function listBrokenMachineGroups(prisma: AppPrisma): Promise<BrokenMachineGroup[]> {
  const rows = await prisma.$queryRaw<Array<{ miner_name: string; hash_rate: number; location: string; cnt: bigint }>>`
    SELECT miner_name, hash_rate, location, COUNT(*)::bigint AS cnt
    FROM user_owned_machines WHERE miner_id IS NULL AND event_miner_id IS NULL
    GROUP BY miner_name, hash_rate, location
    ORDER BY cnt DESC, miner_name, hash_rate LIMIT 200
  `;
  const hashRates = [...new Set(rows.map((row) => row.hash_rate))];
  const [catalogMiners, eventMiners] = await Promise.all([
    prisma.miner.findMany({ where: { baseHashRate: { in: hashRates } }, select: { id: true, name: true, baseHashRate: true } }),
    prisma.eventMiner.findMany({ where: { hashRate: { in: hashRates } }, select: { id: true, name: true, hashRate: true } }),
  ]);
  const catalogByRate = new Map<number, typeof catalogMiners>();
  const eventByRate = new Map<number, typeof eventMiners>();
  for (const miner of catalogMiners) catalogByRate.set(miner.baseHashRate, [...(catalogByRate.get(miner.baseHashRate) ?? []), miner]);
  for (const miner of eventMiners) eventByRate.set(miner.hashRate, [...(eventByRate.get(miner.hashRate) ?? []), miner]);
  const knownEventNames = new Set(eventMiners.map((miner) => miner.name.trim().toLowerCase()));

  return rows.flatMap((row) => {
    if (!LOCATIONS.has(row.location)) return [];
    const minerName = String(row.miner_name ?? "");
    const eventName = parseEventMinerDisplayName(minerName);
    if (eventName && knownEventNames.has(eventName.toLowerCase())) return [];
    const catalogMatches = eventName ? [] : (catalogByRate.get(row.hash_rate) ?? []);
    const autoMiner = catalogMatches.length === 1 ? catalogMatches[0] : null;
    return [{
      minerName, hashRate: Number(row.hash_rate), location: row.location as BrokenMachineGroup["location"],
      count: Number(row.cnt), isEvent: Boolean(eventName), autoMinerId: autoMiner?.id ?? null,
      autoMinerName: autoMiner?.name ?? null, catalogMatches, eventMatches: eventByRate.get(row.hash_rate) ?? [],
    }];
  });
}

function validLocation(location: string): location is BrokenMachineGroup["location"] {
  return LOCATIONS.has(location);
}

async function findOwnedIds(prisma: AppPrisma, minerName: string, hashRate: number, location: string) {
  if (!validLocation(location)) return [];
  return (await prisma.userOwnedMachine.findMany({
    where: { minerId: null, eventMinerId: null, minerName, hashRate, location },
    select: { id: true },
  })).map((row) => row.id);
}

export async function assignCatalogMinerToBrokenGroup(
  prisma: AppPrisma, input: { minerName: string; hashRate: number; location: string; catalogMinerId: number },
): Promise<RepairResult> {
  const [catalog, ownedIds] = await Promise.all([
    prisma.miner.findUnique({ where: { id: input.catalogMinerId }, select: { id: true, name: true } }),
    findOwnedIds(prisma, input.minerName, input.hashRate, input.location),
  ]);
  if (GENERIC_LABELS.has(input.minerName.trim().toLowerCase())) {
    return { ok: false, assigned: 0, message: "Generic Miner labels cannot be assigned by guess. Identify the grant path first." };
  }
  if (parseEventMinerDisplayName(input.minerName)) {
    return { ok: false, assigned: 0, message: "Event machines cannot be assigned to the shop catalog." };
  }
  if (!catalog) return { ok: false, assigned: 0, message: "Catalog miner not found." };
  if (!ownedIds.length || !validLocation(input.location)) return { ok: false, assigned: 0, message: "No machines match this group." };
  await prisma.$transaction(async (tx) => {
    await tx.userOwnedMachine.updateMany({ where: { id: { in: ownedIds } }, data: { minerId: catalog.id, minerName: catalog.name } });
    if (input.location === "RACK") await tx.userMiner.updateMany({ where: { ownedMachineId: { in: ownedIds } }, data: { minerId: catalog.id } });
    if (input.location === "INVENTORY") await tx.userInventory.updateMany({ where: { ownedMachineId: { in: ownedIds } }, data: { minerId: catalog.id, minerName: catalog.name } });
    if (input.location === "WAREHOUSE") await tx.userVault.updateMany({ where: { ownedMachineId: { in: ownedIds } }, data: { minerId: catalog.id, minerName: catalog.name } });
  });
  return { ok: true, assigned: ownedIds.length, message: `${ownedIds.length} machine(s) assigned to ${catalog.name}.` };
}

export async function assignEventMinerToBrokenGroup(
  prisma: AppPrisma, input: { minerName: string; hashRate: number; location: string; eventMinerId: number },
): Promise<RepairResult> {
  const [event, ownedIds] = await Promise.all([
    prisma.eventMiner.findUnique({ where: { id: input.eventMinerId }, select: { id: true, name: true, imageUrl: true } }),
    findOwnedIds(prisma, input.minerName, input.hashRate, input.location),
  ]);
  if (!event) return { ok: false, assigned: 0, message: "Event miner not found." };
  if (!ownedIds.length || !validLocation(input.location)) return { ok: false, assigned: 0, message: "No machines match this group." };
  const minerName = `[Event] ${event.name}`;
  const imageUrl = event.imageUrl ?? null;
  await prisma.$transaction(async (tx) => {
    await tx.userOwnedMachine.updateMany({ where: { id: { in: ownedIds } }, data: { eventMinerId: event.id, minerName, imageUrl } });
    if (input.location === "RACK") await tx.userMiner.updateMany({ where: { ownedMachineId: { in: ownedIds } }, data: { imageUrl } });
    if (input.location === "INVENTORY") await tx.userInventory.updateMany({ where: { ownedMachineId: { in: ownedIds } }, data: { minerName, imageUrl } });
    if (input.location === "WAREHOUSE") await tx.userVault.updateMany({ where: { ownedMachineId: { in: ownedIds } }, data: { minerName, imageUrl } });
  });
  return { ok: true, assigned: ownedIds.length, message: `${ownedIds.length} machine(s) assigned to event ${event.name}.` };
}

export async function autoAssignBrokenMachines(_prisma: AppPrisma) {
  return {
    ok: false,
    assigned: 0,
    skipped: 0,
    message: "Auto-assign is disabled. Hashrate match is not identity.",
  };
}
