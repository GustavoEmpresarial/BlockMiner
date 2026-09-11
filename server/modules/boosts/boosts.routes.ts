import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as ctrl from "./boosts.controller.js";

export const boostsRouter = express.Router();

boostsRouter.get("/status", requireAuth, ctrl.getStatus);
boostsRouter.post("/activate", requireAuth, ctrl.activate);

// Mounted in bootstrap as BOTH:
//   app.use("/api/boosts", boostsRouter)
//   app.use("/api/power-boost", boostsRouter)  // client usePowerBoostActive contract

