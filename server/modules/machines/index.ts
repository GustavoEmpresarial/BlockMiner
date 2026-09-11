export { machinesRouter } from "./machines.routes.js";
export { machinesAdminRouter } from "./machines.admin.routes.js";
export { minersAdminRouter } from "./miners.admin.routes.js";
export { racksRouter } from "./racks/index.js";
export { MAX_SLOT_INDEX } from "./machines.types.js";
export { MACHINES_ERROR, MachineNotFoundError, InvalidSlotError } from "./machines.errors.js";

// Rack <-> vault composition surface — consumed by wallet/vault/ so it can move a
// machine directly between a mining rack slot and the warehouse inside its own
// transaction, without duplicating UserMiner/UserRack logic. See machines.service.ts.
export {
  findRackMinerForUserTx,
  releaseRackReferencesTx,
  ensureOwnedMachineForRackMinerTx,
  syncOwnedMachineLocationForVaultTx,
  deleteRackMinerTx,
  placeIntoRackSlotTx,
  displaceRackMinerToInventoryTx,
} from "./machines.service.js";
export type { RackMinerForVault } from "./machines.service.js";
