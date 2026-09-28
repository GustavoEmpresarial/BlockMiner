import { parseEventMinerDisplayName } from "./eventMinerDisplayName.js";

const GENERIC_LABELS = new Set([
  "miner",
  "máquina",
  "maquina",
  "máquina custom",
  "maquina custom",
  "unknown miner",
]);

export const ownedMachineDisplaySelect = {
  minerName: true,
  imageUrl: true,
  eventMinerId: true,
  eventMiner: { select: { name: true, imageUrl: true } },
} as const;

export function isGenericOwnedMachineLabel(name: unknown): boolean {
  return GENERIC_LABELS.has(String(name ?? "").trim().toLowerCase());
}

function trimName(value: unknown): string | null {
  const n = String(value ?? "").trim();
  return n || null;
}

function firstRealImage(...urls: (string | null | undefined)[]): string | null {
  for (const url of urls) {
    const t = typeof url === "string" ? url.trim() : "";
    if (t) return t;
  }
  return null;
}

function eventDisplayName(eventName: unknown): string | null {
  const raw = trimName(eventName);
  if (!raw) return null;
  return parseEventMinerDisplayName(raw) ? raw : `[Event] ${raw}`;
}

export interface ResolveOwnedMachineDisplayInput {
  minerId?: number | null;
  eventName?: string | null;
  catalogName?: string | null;
  ownedName?: string | null;
  rowName?: string | null;
  eventImageUrl?: string | null;
  ownedImageUrl?: string | null;
  rowImageUrl?: string | null;
  catalogImageUrl?: string | null;
}

export interface ResolvedOwnedMachineDisplay {
  minerName: string;
  imageUrl: string | null;
}

export function resolveOwnedMachineDisplay(input: ResolveOwnedMachineDisplayInput): ResolvedOwnedMachineDisplay {
  const eventLabel = eventDisplayName(input.eventName);
  const ranked =
    input.minerId != null
      ? [input.catalogName, input.ownedName, input.rowName, eventLabel]
      : [eventLabel, input.ownedName, input.rowName, input.catalogName];
  let minerName = "Miner";
  for (const candidate of ranked) {
    const name = trimName(candidate);
    if (name && !isGenericOwnedMachineLabel(name)) {
      minerName = name;
      break;
    }
  }
  return {
    minerName,
    imageUrl: firstRealImage(input.eventImageUrl, input.ownedImageUrl, input.rowImageUrl, input.catalogImageUrl),
  };
}
