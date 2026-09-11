import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { isAutoMiningV2SchemaAvailable } from "../auto-mining/index.js";
import { getTopRanking, getUserRoomRankingProfile } from "./ranking.service.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("ranking");
export const rankingRouter = express.Router();
function routeParamUsername(v) {
    if (v == null)
        return "";
    return typeof v === "string" ? v : (v[0] ?? "");
}
rankingRouter.get("/", requireAuth, async (_req, res) => {
    try {
        const v2Ok = await isAutoMiningV2SchemaAvailable();
        const ranking = await getTopRanking(50, v2Ok);
        res.json({ ok: true, ranking });
    }
    catch (error) {
        log.error("Ranking aggregation error:", { error: String(error) });
        res.status(500).json({ ok: false, message: "Unable to load ranking." });
    }
});
rankingRouter.get("/room/:username", requireAuth, async (req, res) => {
    try {
        const username = routeParamUsername(req.params.username).trim();
        if (!username) {
            res.status(400).json({ ok: false, message: "Username required" });
            return;
        }
        const user = await getUserRoomRankingProfile(username);
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found" });
            return;
        }
        res.json({ ok: true, user });
    }
    catch (error) {
        log.error("Error fetching room data:", { error: String(error) });
        res.status(500).json({ ok: false, message: "Server error" });
    }
});
