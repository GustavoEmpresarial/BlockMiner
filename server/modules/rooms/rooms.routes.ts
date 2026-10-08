import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../core/http/middleware/idempotency.js";
import {
  listRooms,
  buyRoom,
  installMiner,
  uninstallMiner,
  uninstallMinerBatch,
  getSlotsSummary,
  listVisualPlacements,
  setVisualPlacement,
  listFanPlacements,
  setFanPlacement,
} from "./rooms.controller.js";

export const roomsRouter = express.Router();

roomsRouter.use(requireAuth);

const roomsWriteLimiter = createDistributedRateLimiter({ windowMs: 60_000, max: 40, name: "rooms_write" });

roomsRouter.get("/", listRooms);
roomsRouter.post("/buy", roomsWriteLimiter, buyRoom);
roomsRouter.post(
  "/rack/install",
  roomsWriteLimiter,
  requireCriticalIdempotency({ scope: "rooms_rack_install" }),
  installMiner,
);
roomsRouter.post(
  "/rack/uninstall",
  roomsWriteLimiter,
  requireCriticalIdempotency({ scope: "rooms_rack_uninstall" }),
  uninstallMiner,
);
roomsRouter.post(
  "/rack/uninstall-batch",
  roomsWriteLimiter,
  requireCriticalIdempotency({ scope: "rooms_rack_uninstall_batch" }),
  uninstallMinerBatch,
);
roomsRouter.get("/slots", getSlotsSummary);
roomsRouter.get("/visual-placements", listVisualPlacements);
roomsRouter.post("/visual-placements", roomsWriteLimiter, setVisualPlacement);
roomsRouter.get("/fan-placements", listFanPlacements);
roomsRouter.post("/fan-placements", roomsWriteLimiter, setFanPlacement);
