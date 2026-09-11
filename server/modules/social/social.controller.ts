import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { createCategoryUpload, uploadedFileUrl } from "../media/index.js";
import * as socialService from "./social.service.js";

const channelPhotoUpload = createCategoryUpload("social", { prefix: "yt" });

export async function getPublicFeed(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const viewerId = req.user?.id ?? null;
  const feed = await socialService.getPublicFeed(page, viewerId);
  res.json({ ok: true, ...feed });
}

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const profile = await socialService.getMyProfile(user.id);
  res.json({ ok: true, profile: profile ?? null });
}

export async function getMySubmissions(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const submissions = await socialService.getMySubmissions(user.id);
  res.json({ ok: true, submissions });
}

export async function requestCredential(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { channelName, channelUrl, channelPhoto, bio } = req.body as Record<string, unknown>;
  if (!channelName || typeof channelName !== "string") {
    res.status(400).json({ ok: false, message: "Nome do canal é obrigatório." });
    return;
  }
  const result = await socialService.requestCredential(user.id, { channelName, channelUrl, channelPhoto, bio });
  if (!result.ok) {
    res.status(result.status).json({ ok: false, message: result.message });
    return;
  }
  res.json({ ok: true, profile: result.profile });
}

export async function submitVideo(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const { videoUrl, title } = req.body as { videoUrl?: string; title?: string };
  if (!videoUrl || typeof videoUrl !== "string") {
    res.status(400).json({ ok: false, message: "URL do vídeo é obrigatória." });
    return;
  }
  const result = await socialService.submitVideo(user.id, videoUrl, title);
  if (!result.ok) {
    res.status(result.status).json({ ok: false, message: result.message });
    return;
  }
  res.json({ ok: true, submission: result.submission });
}

/** Channel photo upload — field "photo", stored under media category "social". */
export async function uploadChannelPhoto(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  channelPhotoUpload.single("photo")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "Upload inválido." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
      return;
    }
    res.json({ ok: true, url: uploadedFileUrl("social", req.file.filename) });
  });
}

export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const result = await socialService.updateMyProfile(user.id, req.body as Record<string, unknown>);
  if (!result.ok) {
    res.status(result.status).json({ ok: false, message: result.message });
    return;
  }
  res.json({ ok: true, profile: result.profile });
}

export async function voteVideo(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const submissionId = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    res.status(400).json({ ok: false, message: "submissionId inválido." });
    return;
  }

  const rawValue = (req.body as { value?: unknown })?.value;
  const value = Number(rawValue);
  if (![1, -1, 0].includes(value)) {
    res.status(400).json({ ok: false, message: "value deve ser 1 (like), -1 (dislike) ou 0 (remover)." });
    return;
  }

  const result = await socialService.voteVideo(user.id, submissionId, value);
  if (!result.ok) {
    res.status(result.status).json({ ok: false, message: result.message });
    return;
  }
  res.json({
    ok: true,
    submissionId: result.submissionId,
    likeCount: result.likeCount,
    dislikeCount: result.dislikeCount,
    myVote: result.myVote,
  });
}
