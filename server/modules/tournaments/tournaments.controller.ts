import type { Request, Response } from "express";
import {
  listActiveTournaments,
  getTournamentWithLeaderboard,
  getUserTournamentHistory,
  getMyTournamentScoreBreakdown,
} from "./tournaments.service.js";

type AuthedRequest = Request & { user?: { id: number } };

export async function listTournaments(_req: Request, res: Response): Promise<void> {
  try {
    const tournaments = await listActiveTournaments();
    res.json({ ok: true, tournaments });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to load tournaments" });
  }
}

export async function getTournament(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const userId = (req as AuthedRequest).user?.id;
  try {
    const data = await getTournamentWithLeaderboard(id, userId);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to load tournament" });
  }
}

export async function myRank(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  const userId = (req as AuthedRequest).user!.id;
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const data = await getTournamentWithLeaderboard(id, userId);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found" });
      return;
    }
    res.json({ ok: true, myEntry: data.myEntry, myRankLive: data.myRankLive });
  } catch {
    res.status(500).json({ ok: false, message: "Failed" });
  }
}

export async function myHistory(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).user!.id;
  try {
    const history = await getUserTournamentHistory(userId);
    res.json({ ok: true, history });
  } catch {
    res.status(500).json({ ok: false, message: "Failed" });
  }
}

export async function myScoreBreakdown(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  const userId = (req as AuthedRequest).user?.id;
  if (!id || !userId) {
    res.status(400).json({ ok: false, message: "Invalid request" });
    return;
  }
  try {
    const data = await getMyTournamentScoreBreakdown(id, userId);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found or metric has no score breakdown" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch {
    res.status(500).json({ ok: false, message: "Failed" });
  }
}
