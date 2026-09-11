import type { Request, Response } from "express";
import { logger } from "../../../core/logger/index.js";
import { gatherAiHealthMetrics } from "./ai-health.metrics.js";
import { buildAiHealthPrompt } from "./ai-health.prompt.js";
import { callOpenCodeGo, AiHealthLlmError } from "./ai-health.llm.js";

const log = logger.child("AdminAiHealth");

export async function analyzeAiHealth(_req: Request, res: Response): Promise<void> {
  try {
    const metrics = await gatherAiHealthMetrics();
    const prompt = buildAiHealthPrompt(metrics);
    const report = await callOpenCodeGo(prompt);
    res.json({ ok: true, report, metrics, generatedAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof AiHealthLlmError ? error.message : "Erro ao gerar diagnóstico de saúde.";
    log.error("analyzeAiHealth failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(error instanceof AiHealthLlmError ? 502 : 500).json({ ok: false, message });
  }
}
