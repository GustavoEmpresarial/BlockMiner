import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { isYoutubeUrl } from "./social.errors.js";
import { validateChannelPhoto, validateChannelUrl } from "./social.service.js";
import * as socialRepo from "./social.repository.js";
import * as socialService from "./social.service.js";

const log = logger.child("social.admin.controller");

function parseIdParam(raw: unknown): number | null {
  const num = parseInt(String(raw), 10);
  return Number.isInteger(num) && num > 0 ? num : null;
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function listProfiles(_req: Request, res: Response): Promise<void> {
  try {
    const profiles = await socialRepo.listAllProfiles();
    res.json({ ok: true, profiles });
  } catch (error) {
    log.error("listProfiles error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao listar perfis de criadores." });
  }
}

export async function createProfile(req: Request, res: Response): Promise<void> {
  const { userId, channelName, channelPhoto, channelUrl, bio, isCredentialed } =
    req.body as Record<string, unknown>;

  const parsedUserId = parseIdParam(userId);
  if (!parsedUserId) {
    res.status(400).json({ ok: false, message: "userId deve ser um ID de usuário válido." });
    return;
  }

  const trimmedChannelName = String(channelName ?? "").trim();
  if (!trimmedChannelName) {
    res.status(400).json({ ok: false, message: "channelName é obrigatório." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { id: true, username: true },
    });
    if (!user) {
      res.status(404).json({ ok: false, message: "Usuário não encontrado." });
      return;
    }

    // Validação de segurança (SSRF e tracking pixels)
    const urlValidation = validateChannelUrl(channelUrl);
    if (!urlValidation.ok) {
      res.status(400).json({ ok: false, message: "URL do canal inválida. Deve ser uma URL HTTPS do YouTube." });
      return;
    }

    const photoValidation = validateChannelPhoto(channelPhoto);
    if (!photoValidation.ok) {
      res.status(400).json({
        ok: false,
        message: "Foto do canal inválida. Deve ser um caminho local ou CDN oficial do YouTube.",
      });
      return;
    }

    const profile = await socialRepo.createProfile({
      userId: parsedUserId,
      channelName: trimmedChannelName.slice(0, 100),
      channelPhoto: photoValidation.value ?? null,
      channelUrl: urlValidation.value ?? null,
      bio: bio ? String(bio).trim().slice(0, 500) : null,
      isCredentialed: isCredentialed !== false,
    });

    log.info("social.profile_created_by_admin", { profileId: profile.id, userId: parsedUserId });
    res.json({ ok: true, profile });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") || msg.includes("P2002")) {
      res.status(409).json({ ok: false, message: "Usuário já possui um perfil cadastrado." });
      return;
    }
    log.error("createProfile error", { error: msg });
    res.status(400).json({ ok: false, message: "Erro ao criar perfil de criador." });
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    const existing = await prisma.youtuberProfile.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Perfil não encontrado." });
      return;
    }

    const { channelName, channelPhoto, channelUrl, bio, isCredentialed } =
      req.body as Record<string, unknown>;

    let validatedUrl: string | null | undefined = undefined;
    if (channelUrl !== undefined) {
      const urlCheck = validateChannelUrl(channelUrl);
      if (!urlCheck.ok) {
        res.status(400).json({ ok: false, message: "URL do canal inválida. Deve ser HTTPS do YouTube." });
        return;
      }
      validatedUrl = urlCheck.value ?? null;
    }

    let validatedPhoto: string | null | undefined = undefined;
    if (channelPhoto !== undefined) {
      const photoCheck = validateChannelPhoto(channelPhoto);
      if (!photoCheck.ok) {
        res.status(400).json({
          ok: false,
          message: "Foto do canal inválida. Deve ser caminho local ou CDN oficial do YouTube.",
        });
        return;
      }
      validatedPhoto = photoCheck.value ?? null;
    }

    const profile = await socialRepo.updateProfileById(id, {
      ...(channelName != null && { channelName: String(channelName).trim().slice(0, 100) }),
      ...(channelPhoto !== undefined && { channelPhoto: validatedPhoto }),
      ...(channelUrl !== undefined && { channelUrl: validatedUrl }),
      ...(bio !== undefined && { bio: bio ? String(bio).trim().slice(0, 500) : null }),
      ...(isCredentialed !== undefined && { isCredentialed: Boolean(isCredentialed) }),
    });

    log.info("social.profile_updated_by_admin", { profileId: id });
    res.json({ ok: true, profile });
  } catch (error) {
    log.error("updateProfile error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao atualizar perfil." });
  }
}

export async function deleteProfile(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    const existing = await prisma.youtuberProfile.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Perfil não encontrado." });
      return;
    }

    await socialRepo.deleteProfile(id);
    log.info("social.profile_deleted_by_admin", { profileId: id, userId: existing.userId });
    res.json({ ok: true });
  } catch (error) {
    log.error("deleteProfile error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao remover perfil." });
  }
}

// ─── Credential Requests ───────────────────────────────────────────────────────

export async function listCredentialRequests(_req: Request, res: Response): Promise<void> {
  try {
    const profiles = await socialRepo.listPendingCredentialRequests();
    res.json({ ok: true, profiles });
  } catch (error) {
    log.error("listCredentialRequests error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao listar solicitações de credenciamento." });
  }
}

export async function approveCredential(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    const existing = await prisma.youtuberProfile.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Solicitação ou perfil não encontrado." });
      return;
    }

    const profile = await socialRepo.updateProfileById(id, {
      isCredentialed: true,
      credentialRequestStatus: "approved",
      credentialRejectNote: null,
    });
    log.info("social.credential_approved", { profileId: id, userId: existing.userId });
    res.json({ ok: true, profile });
  } catch (error) {
    log.error("approveCredential error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao aprovar credenciamento." });
  }
}

export async function rejectCredential(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    const existing = await prisma.youtuberProfile.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Solicitação ou perfil não encontrado." });
      return;
    }

    const { rejectNote } = req.body as { rejectNote?: string };
    const profile = await socialRepo.updateProfileById(id, {
      credentialRequestStatus: "rejected",
      credentialRejectNote: rejectNote ? String(rejectNote).trim().slice(0, 500) : null,
    });
    log.info("social.credential_rejected", { profileId: id, userId: existing.userId });
    res.json({ ok: true, profile });
  } catch (error) {
    log.error("rejectCredential error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao recusar credenciamento." });
  }
}

// ─── Submissions ───────────────────────────────────────────────────────────────

export async function listSubmissions(req: Request, res: Response): Promise<void> {
  try {
    const rawStatus = String(req.query.status ?? "pending").toLowerCase();
    const validStatuses = new Set(["pending", "approved", "rejected", "all"]);
    const status = validStatuses.has(rawStatus) ? rawStatus : "pending";
    const where = status === "all" ? {} : { status };
    const submissions = await socialRepo.listSubmissionsByStatus(where);
    res.json({ ok: true, submissions });
  } catch (error) {
    log.error("listSubmissions error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao listar submissões de vídeos." });
  }
}

export async function approveSubmission(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    const adminId = req.admin?.adminId ?? null;
    const result = await socialService.approveSubmission(id, adminId);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, message: result.message });
      return;
    }
    res.json({ ok: true, rewardGranted: result.rewardGranted, rewardMinerName: result.rewardMinerName });
  } catch (error) {
    log.error("approveSubmission error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao aprovar submissão de vídeo." });
  }
}

export async function rejectSubmission(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
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
  } catch (error) {
    log.error("rejectSubmission error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao recusar submissão." });
  }
}

export async function deleteSubmission(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
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
  } catch (error) {
    log.error("deleteSubmission error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao remover submissão." });
  }
}

// ─── Reward Settings ──────────────────────────────────────────────────────────

export async function getRewardSettings(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await socialRepo.findRewardSettingsWithMiner();
    res.json({ ok: true, minerId: settings?.minerId ?? null, miner: settings?.miner ?? null });
  } catch (error) {
    log.error("getRewardSettings error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao carregar configurações de recompensa." });
  }
}

export async function setRewardSettings(req: Request, res: Response): Promise<void> {
  const { minerId } = req.body as { minerId?: unknown };

  let validatedMinerId: number | null = null;
  if (minerId !== null && minerId !== undefined) {
    const parsed = parseIdParam(minerId);
    if (!parsed) {
      res.status(400).json({ ok: false, message: "minerId deve ser um ID válido ou null." });
      return;
    }
    const minerExists = await socialRepo.findMinerSummary(parsed);
    if (!minerExists) {
      res.status(404).json({ ok: false, message: "Máquina de mineração não encontrada." });
      return;
    }
    validatedMinerId = parsed;
  }

  try {
    await socialRepo.upsertRewardSettings(validatedMinerId);
    const miner = validatedMinerId ? await socialRepo.findMinerSummary(validatedMinerId) : null;
    log.info("social.reward_settings_updated", { minerId: validatedMinerId });
    res.json({ ok: true, minerId: validatedMinerId, miner });
  } catch (error) {
    log.error("setRewardSettings error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao atualizar configurações de recompensa." });
  }
}

// ─── Creators ─────────────────────────────────────────────────────────────────

export async function adminListCreators(_req: Request, res: Response): Promise<void> {
  try {
    const creators = await socialRepo.listCreatorUsers();
    res.json({ ok: true, creators });
  } catch (error) {
    log.error("adminListCreators error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao listar criadores." });
  }
}

export async function adminSearchCreators(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  if (q.length < 2) {
    res.json({ ok: true, users: [] });
    return;
  }
  try {
    const users = await socialRepo.searchUsersByUsername(q, 10);
    res.json({ ok: true, users });
  } catch (error) {
    log.error("adminSearchCreators error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao buscar usuários." });
  }
}

export async function adminUpsertCreator(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });
    if (!user) {
      res.status(404).json({ ok: false, message: "Usuário não encontrado." });
      return;
    }

    const { youtubeUrl } = req.body as { youtubeUrl?: unknown };
    let validatedUrl: string | null = null;
    if (youtubeUrl !== undefined && youtubeUrl !== null) {
      const trimmed = String(youtubeUrl).trim();
      if (trimmed.length > 0) {
        if (!isYoutubeUrl(trimmed)) {
          res.status(400).json({ ok: false, message: "URL deve ser um link válido do YouTube." });
          return;
        }
        validatedUrl = trimmed;
      }
    }

    await socialRepo.setUserAsCreator(id, validatedUrl);
    log.info("social.user_set_as_creator", { userId: id, username: user.username, youtubeUrl: validatedUrl });
    res.json({ ok: true });
  } catch (error) {
    log.error("adminUpsertCreator error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao credenciar criador." });
  }
}

export async function adminRemoveCreator(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });
    if (!user) {
      res.status(404).json({ ok: false, message: "Usuário não encontrado." });
      return;
    }

    await socialRepo.removeUserCreatorCredential(id);
    log.info("social.creator_flag_removed", { userId: id, username: user.username });
    res.json({ ok: true });
  } catch (error) {
    log.error("adminRemoveCreator error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao remover credencial." });
  }
}
