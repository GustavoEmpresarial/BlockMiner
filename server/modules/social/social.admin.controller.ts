import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { isYoutubeUrl } from "./social.errors.js";
import * as socialRepo from "./social.repository.js";
import * as socialService from "./social.service.js";

const log = logger.child("social.admin.controller");

export async function listProfiles(_req: Request, res: Response): Promise<void> {
  const profiles = await socialRepo.listAllProfiles();
  res.json({ ok: true, profiles });
}

export async function createProfile(req: Request, res: Response): Promise<void> {
  const { userId, channelName, channelPhoto, channelUrl, bio, isCredentialed } =
    req.body as Record<string, unknown>;

  if (!userId || !channelName) {
    res.status(400).json({ ok: false, message: "userId e channelName são obrigatórios." });
    return;
  }

  try {
    const profile = await socialRepo.createProfile({
      userId: Number(userId),
      channelName: String(channelName).trim().slice(0, 100),
      channelPhoto: channelPhoto ? String(channelPhoto).trim() : null,
      channelUrl: channelUrl ? String(channelUrl).trim() : null,
      bio: bio ? String(bio).trim().slice(0, 500) : null,
      isCredentialed: isCredentialed !== false,
    });
    res.json({ ok: true, profile });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") && msg.includes("user_id")) {
      res.status(409).json({ ok: false, message: "Usuário já possui um perfil." });
      return;
    }
    res.status(400).json({ ok: false, message: msg });
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  const { channelName, channelPhoto, channelUrl, bio, isCredentialed } =
    req.body as Record<string, unknown>;

  const profile = await socialRepo.updateProfileById(id, {
    ...(channelName != null && { channelName: String(channelName).trim().slice(0, 100) }),
    ...(channelPhoto !== undefined && { channelPhoto: channelPhoto ? String(channelPhoto).trim() : null }),
    ...(channelUrl !== undefined && { channelUrl: channelUrl ? String(channelUrl).trim() : null }),
    ...(bio !== undefined && { bio: bio ? String(bio).trim().slice(0, 500) : null }),
    ...(isCredentialed !== undefined && { isCredentialed: Boolean(isCredentialed) }),
  });
  res.json({ ok: true, profile });
}

export async function deleteProfile(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  await socialRepo.deleteProfile(id);
  res.json({ ok: true });
}

export async function listCredentialRequests(_req: Request, res: Response): Promise<void> {
  const profiles = await socialRepo.listPendingCredentialRequests();
  res.json({ ok: true, profiles });
}

export async function approveCredential(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  const profile = await socialRepo.updateProfileById(id, {
    isCredentialed: true,
    credentialRequestStatus: "approved",
    credentialRejectNote: null,
  });
  log.info("social.credential_approved", { profileId: id, userId: (profile as { userId: number }).userId });
  res.json({ ok: true, profile });
}

export async function rejectCredential(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  const { rejectNote } = req.body as { rejectNote?: string };
  const profile = await socialRepo.updateProfileById(id, {
    credentialRequestStatus: "rejected",
    credentialRejectNote: rejectNote ? String(rejectNote).trim().slice(0, 500) : null,
  });
  log.info("social.credential_rejected", { profileId: id, userId: (profile as { userId: number }).userId });
  res.json({ ok: true, profile });
}

export async function listSubmissions(req: Request, res: Response): Promise<void> {
  const status = String(req.query.status ?? "pending");
  const where = status === "all" ? {} : { status };
  const submissions = await socialRepo.listSubmissionsByStatus(where);
  res.json({ ok: true, submissions });
}

export async function approveSubmission(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  const adminId = req.admin?.adminId ?? null;
  const result = await socialService.approveSubmission(id, adminId);
  if (!result.ok) {
    res.status(result.status).json({ ok: false, message: result.message });
    return;
  }
  res.json({ ok: true, rewardGranted: result.rewardGranted, rewardMinerName: result.rewardMinerName });
}

export async function rejectSubmission(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  const submission = await socialRepo.findSubmissionById(id);
  if (!submission) {
    res.status(404).json({ ok: false, message: "Submissão não encontrada." });
    return;
  }
  if (submission.status !== "pending") {
    res.status(409).json({ ok: false, message: "Submissão já foi revisada." });
    return;
  }
  const { reviewNote } = req.body as { reviewNote?: string };
  const adminId = req.admin?.adminId ?? null;
  await socialRepo.updateSubmissionStatus(id, {
    status: "rejected",
    reviewedBy: adminId,
    reviewedAt: new Date(),
    reviewNote: reviewNote ? String(reviewNote).trim().slice(0, 500) : null,
  });
  log.info("social.submission_rejected", { submissionId: id, userId: submission.userId, adminId });
  res.json({ ok: true });
}

export async function deleteSubmission(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  const submission = await socialRepo.findSubmissionById(id);
  if (!submission) {
    res.status(404).json({ ok: false, message: "Submissão não encontrada." });
    return;
  }
  const adminId = req.admin?.adminId ?? null;
  await socialRepo.deleteSubmission(id);
  log.info("social.submission_deleted", {
    submissionId: id,
    userId: submission.userId,
    status: submission.status,
    adminId,
  });
  res.json({ ok: true });
}

export async function getRewardSettings(_req: Request, res: Response): Promise<void> {
  const settings = await socialRepo.findRewardSettingsWithMiner();
  res.json({ ok: true, minerId: settings?.minerId ?? null, miner: settings?.miner ?? null });
}

export async function setRewardSettings(req: Request, res: Response): Promise<void> {
  const { minerId } = req.body as { minerId?: number | null };
  await socialRepo.upsertRewardSettings(minerId ?? null);
  const miner = minerId ? await socialRepo.findMinerSummary(minerId) : null;
  res.json({ ok: true, minerId: minerId ?? null, miner });
}

// ─── Creators ─────────────────────────────────────────────────────────────────

export async function adminListCreators(_req: Request, res: Response): Promise<void> {
  try {
    const creators = await socialRepo.listCreatorUsers();
    res.json({ ok: true, creators });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao listar criadores." });
  }
}

export async function adminSearchCreators(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ ok: true, users: [] });
    return;
  }
  try {
    const users = await socialRepo.searchUsersByUsername(q, 10);
    res.json({ ok: true, users });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar usuários." });
  }
}

export async function adminUpsertCreator(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  const { youtubeUrl } = req.body as { youtubeUrl?: string | null };
  if (youtubeUrl && !isYoutubeUrl(youtubeUrl)) {
    res.status(400).json({ ok: false, message: "URL deve ser do YouTube." });
    return;
  }
  try {
    await socialRepo.setUserAsCreator(id, youtubeUrl || null);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao credenciar criador." });
  }
}

export async function adminRemoveCreator(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await socialRepo.removeUserCreatorCredential(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover credencial." });
  }
}
