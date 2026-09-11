// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
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
};
export function isGenericOwnedMachineLabel(name) {
    return GENERIC_LABELS.has(String(name ?? "").trim().toLowerCase());
}
function trimName(value) {
    const n = String(value ?? "").trim();
    return n || null;
}
function firstRealImage(...urls) {
    for (const url of urls) {
        const t = typeof url === "string" ? url.trim() : "";
        if (t)
            return t;
    }
    return null;
}
function eventDisplayName(eventName) {
    const raw = trimName(eventName);
    if (!raw)
        return null;
    return parseEventMinerDisplayName(raw) ? raw : `[Event] ${raw}`;
}
export function resolveOwnedMachineDisplay(input) {
    const eventLabel = eventDisplayName(input.eventName);
    const ranked = input.minerId != null
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
