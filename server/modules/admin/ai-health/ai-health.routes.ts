// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import { analyzeAiHealth } from "./ai-health.controller.js";
export const adminAiHealthRouter = express.Router();
adminAiHealthRouter.post("/analyze", (req, res) => analyzeAiHealth(req, res));
