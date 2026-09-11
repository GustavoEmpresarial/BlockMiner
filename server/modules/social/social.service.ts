/**
 * Ported from legacy social controllers.
 * Telegram video-moderation notify: writes a real row into notifications/'s telegram outbox
 * (Fase 8) AND, as of Fase 10i, also fans out immediately through the dedicated video-
 * subscription bot (telegram/notifiers/video.notifier.ts equivalent, now ported at
 * modules/notifications/video-telegram.notifier.ts) — mirrors legacy, where both mechanisms
 * fired independently in parallel. Honest no-op if VIDEO_TELEGRAM_BOT_TOKEN is not configured.
 */
import prisma from "../../core/database/prisma.js";
import { normalizePersistableMinerImageUrl } from "../inventory/inventory.types.js";
import { logger } from "../../core/logger/index.js";
import { canonicalYoutubeUrl, extractYoutubeId } from "./social.errors.js";
import * as socialRepo from "./social.repository.js";
import { escapeHtml } from "../../shared/utils/htmlEscape.js";
import {
  TELEGRAM_EVENT_TYPES,
  createGenericTelegramOutboxEvent,
  createRewardInboxEntry,
  notifyNewVideoSubmission,
} from "../notifications/index.js";

const log = logger.child("social.service");
const FEED_PAGE_SIZE = 20;

// item 95 (pentest A6): channelUrl não tinha nenhuma validação de protocolo/domínio antes —
// aceitava `javascript:`/qualquer string. Mesma família de domínio já esperada de um creator
// de YouTube.
const ALLOWED_CHANNEL_URL_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

/** `undefined` = campo não enviado (não mexe); `null` = campo limpo; string = valor válido. */
type ChannelUrlValidation = { ok: true; value: string | null | undefined } | { ok: false };

function validateChannelUrl(raw: unknown): ChannelUrlValidation {
  if (raw === undefined) return { ok: true, value: undefined };
  const trimmed = raw ? String(raw).trim() : "";
  if (!trimmed) return { ok: true, value: null };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !ALLOWED_CHANNEL_URL_HOSTS.has(url.hostname)) {
      return { ok: false };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false };
  }
}

// item 96 (pentest A8): channelPhoto era aceito como string arbitrária e vai direto pra um
// <img src> do feed PÚBLICO (ranking/components/socialTab.shared.tsx `ChannelAvatar`) — qualquer
// creator credenciado plantava um pixel de rastreio externo e colhia IP/user-agent de todo
// visitante. Mesma abordagem do channelUrl (item 95/A6): allowlist. Aqui a allowlist é
// "upload nosso" (caminho relativo servido pelo próprio domínio, ver media.service.ts
// `uploadedFileUrl`) OU CDN de avatar do YouTube.
const ALLOWED_CHANNEL_PHOTO_HOSTS = new Set([
  "yt3.ggpht.com",
  "yt3.googleusercontent.com",
  "lh3.googleusercontent.com",
  "i.ytimg.com",
  "img.youtube.com",
]);

/** Caminho relativo do nosso próprio storage. `//host` é URL protocol-relative, NÃO é relativo. */
function isOwnUploadPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

type ChannelPhotoValidation = { ok: true; value: string | null | undefined } | { ok: false };

/** Exportado só para o teste unitário de allowlist (tests/social/social.hardening.test.mjs). */
export function validateChannelPhoto(raw: unknown): ChannelPhotoValidation {
  if (raw === undefined) return { ok: true, value: undefined };
  const trimmed = raw ? String(raw).trim() : "";
  if (!trimmed) return { ok: true, value: null };
  if (isOwnUploadPath(trimmed)) return { ok: true, value: trimmed };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !ALLOWED_CHANNEL_PHOTO_HOSTS.has(url.hostname)) {
      return { ok: false };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false };
  }
}

/**
 * Saneamento de leitura do feed público (item 96, A7/A8): linhas ANTIGAS foram gravadas antes
 * das allowlists acima e ainda carregam videoUrl crua / channelPhoto externa. Em vez de uma
 * migration destrutiva, o feed sempre reconstrói a videoUrl a partir do videoId já validado e
 * descarta channelPhoto que não passe na allowlist (cai no avatar de fallback com a inicial).
 */
export function sanitizeFeedEntry<T extends { videoId: string; videoUrl: string; profile: { channelPhoto: string | null } }>(
  entry: T,
): T {
  const photoCheck = validateChannelPhoto(entry.profile.channelPhoto);
  return {
    ...entry,
    videoUrl: canonicalYoutubeUrl(entry.videoId),
    profile: {
      ...entry.profile,
      channelPhoto: photoCheck.ok ? (photoCheck.value ?? null) : null,
    },
  };
}

export async function getPublicFeed(page: number, viewerId: number | null) {
  const skip = (page - 1) * FEED_PAGE_SIZE;
  const [submissions, total] = await Promise.all([
    socialRepo.listApprovedSubmissionsPage(skip, FEED_PAGE_SIZE),
    socialRepo.countApprovedSubmissions(),
  ]);

  const submissionIds = submissions.map((s) => s.id);
  const voteAgg = submissionIds.length
    ? await socialRepo.groupVoteCountsForSubmissions(submissionIds)
    : [];

  const countsBySubmission = new Map<number, { likes: number; dislikes: number }>();
  for (const id of submissionIds) countsBySubmission.set(id, { likes: 0, dislikes: 0 });
  for (const row of voteAgg) {
    const bucket = countsBySubmission.get(row.submissionId);
    if (!bucket) continue;
    if (row.value === 1) bucket.likes = row._count._all;
    else if (row.value === -1) bucket.dislikes = row._count._all;
  }

  let myVotes = new Map<number, 1 | -1>();
  if (viewerId && submissionIds.length) {
    const rows = await socialRepo.listUserVotesForSubmissions(viewerId, submissionIds);
    myVotes = new Map(rows.map((r) => [r.submissionId, r.value as 1 | -1]));
  }

  const entries = submissions.map((raw) => {
    const s = sanitizeFeedEntry(raw);
    const counts = countsBySubmission.get(s.id) ?? { likes: 0, dislikes: 0 };
    return {
      ...s,
      likeCount: counts.likes,
      dislikeCount: counts.dislikes,
      myVote: myVotes.get(s.id) ?? 0,
    };
  });

  return {
    entries,
    total,
    page,
    pageSize: FEED_PAGE_SIZE,
    totalPages: Math.ceil(total / FEED_PAGE_SIZE),
  };
}

export async function getMyProfile(userId: number) {
  return socialRepo.findYoutuberProfile(userId);
}

export async function getMySubmissions(userId: number) {
  return socialRepo.listUserSubmissions(userId, 50);
}

export type CredentialResult =
  | { ok: true; profile: Awaited<ReturnType<typeof socialRepo.findYoutuberProfile>> }
  | { ok: false; status: number; message: string };

export async function requestCredential(
  userId: number,
  input: { channelName: string; channelUrl?: unknown; channelPhoto?: unknown; bio?: unknown },
): Promise<CredentialResult> {
  // item 95 (pentest A5): channelName/bio escapados antes de salvar — antes ficavam raw no
  // banco e voltavam sem escape em qualquer consumidor futuro (chat já fazia isso, perfil não).
  const channelName = escapeHtml(input.channelName.trim().slice(0, 100));
  if (!channelName) return { ok: false, status: 400, message: "Nome do canal é obrigatório." };

  const urlCheck = validateChannelUrl(input.channelUrl);
  if (!urlCheck.ok) return { ok: false, status: 400, message: "URL do canal inválida." };
  const channelUrl = urlCheck.value ?? null;
  // item 96 (pentest A8): mesma allowlist do channelUrl, agora na foto — ver validateChannelPhoto.
  const photoCheck = validateChannelPhoto(input.channelPhoto);
  if (!photoCheck.ok) return { ok: false, status: 400, message: "Foto do canal inválida." };
  const channelPhoto = photoCheck.value ?? null;
  const bio = input.bio ? escapeHtml(String(input.bio).trim().slice(0, 500)) : null;

  const existing = await socialRepo.findYoutuberProfile(userId);
  if (existing) {
    if (existing.isCredentialed) {
      return { ok: false, status: 409, message: "Você já é um criador credenciado." };
    }
    if (existing.credentialRequestStatus === "pending") {
      return { ok: false, status: 409, message: "Solicitação já enviada. Aguarde a revisão." };
    }
    const updated = await socialRepo.updateYoutuberProfileForResubmit(userId, {
      channelName,
      channelPhoto,
      channelUrl,
      bio,
      credentialRequestStatus: "pending",
      credentialRejectNote: null,
    });
    log.info("social.credential_resubmitted", { userId });
    return { ok: true, profile: updated };
  }

  const profile = await socialRepo.createYoutuberProfile({
    userId,
    channelName,
    channelPhoto,
    channelUrl,
    bio,
    isCredentialed: false,
    credentialRequestStatus: "pending",
  });
  log.info("social.credential_requested", { userId, profileId: profile.id });
  return { ok: true, profile };
}

export type SubmitVideoResult =
  | { ok: true; submission: Awaited<ReturnType<typeof socialRepo.createVideoSubmission>> }
  | { ok: false; status: number; message: string };

export async function submitVideo(
  userId: number,
  videoUrlRaw: string,
  title?: string,
): Promise<SubmitVideoResult> {
  // item 96 (pentest A7): extractYoutubeId agora valida host de verdade, e o que persiste é a
  // URL CANÔNICA derivada do id — nunca o texto do creator. Sem isso o card do feed mostrava a
  // thumb legítima (img.youtube.com/vi/<videoId>) com o <a href> apontando pro domínio dele.
  const videoId = extractYoutubeId(videoUrlRaw.trim());
  if (!videoId) return { ok: false, status: 400, message: "URL do YouTube inválida." };
  const videoUrl = canonicalYoutubeUrl(videoId);

  const profile = await socialRepo.findYoutuberProfile(userId);
  if (!profile || !profile.isCredentialed) {
    return { ok: false, status: 403, message: "Usuário não é um YouTuber credenciado." };
  }

  const submission = await socialRepo.createVideoSubmission({
    userId,
    profileId: profile.id,
    videoUrl,
    videoId,
    title: typeof title === "string" ? title.trim().slice(0, 200) || null : null,
  });

  log.info("social.video_submitted", { userId, videoId, submissionId: submission.id });
  void createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.VIDEO_SUBMISSION_NEW,
    { submissionId: submission.id, userId, videoId, title: submission.title ?? null },
    { userId },
  ).catch((err) => log.warn("telegram outbox write failed (video submission)", { error: String(err) }));

  void (async () => {
    try {
      const u = await socialRepo.findUsernameById(userId);
      notifyNewVideoSubmission({
        id: submission.id,
        userId,
        username: u?.username ?? null,
        videoId,
        videoUrl,
        title: submission.title,
      });
    } catch (err) {
      log.warn("video-subscription telegram notify failed", { error: String(err) });
    }
  })();

  return { ok: true, submission };
}

export type UpdateProfileResult =
  | { ok: true; profile: Awaited<ReturnType<typeof socialRepo.updateYoutuberProfile>> }
  | { ok: false; status: number; message: string };

export async function updateMyProfile(
  userId: number,
  body: Record<string, unknown>,
): Promise<UpdateProfileResult> {
  const profile = await socialRepo.findYoutuberProfile(userId);
  if (!profile) {
    return { ok: false, status: 404, message: "Perfil não encontrado. Solicite credenciamento primeiro." };
  }
  if (!profile.isCredentialed) {
    return { ok: false, status: 403, message: "Você ainda não é um criador credenciado." };
  }

  const { channelName, channelUrl, channelPhoto, bio } = body;
  const data: Record<string, unknown> = {};
  // item 95 (pentest A5/A6): mesmo tratamento de requestCredential — escapeHtml em
  // channelName/bio, allowlist de protocolo/domínio em channelUrl.
  if (typeof channelName === "string" && channelName.trim()) {
    data.channelName = escapeHtml(channelName.trim().slice(0, 100));
  }
  if (channelUrl !== undefined) {
    const urlCheck = validateChannelUrl(channelUrl);
    if (!urlCheck.ok) return { ok: false, status: 400, message: "URL do canal inválida." };
    data.channelUrl = urlCheck.value ?? null;
  }
  if (channelPhoto !== undefined) {
    // item 96 (pentest A8): allowlist de origem — sem isso o campo virava pixel de rastreio
    // no <img src> do feed público.
    const photoCheck = validateChannelPhoto(channelPhoto);
    if (!photoCheck.ok) {
      // Creator legado: a foto externa já estava salva ANTES da allowlist existir. Reenviar o
      // form sem mexer no campo não pode virar 400 — nesse caso zera em silêncio (o feed já
      // descarta a foto na leitura via sanitizeFeedEntry, então nada regride em segurança).
      // Só rejeita quando o valor é NOVO, isto é, uma tentativa real de plantar host externo.
      const unchanged = typeof channelPhoto === "string" && channelPhoto.trim() === (profile.channelPhoto ?? "").trim();
      if (!unchanged) return { ok: false, status: 400, message: "Foto do canal inválida." };
      data.channelPhoto = null;
    } else {
      data.channelPhoto = photoCheck.value ?? null;
    }
  }
  if (bio !== undefined) {
    data.bio = bio ? escapeHtml(String(bio).trim().slice(0, 500)) || null : null;
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, status: 400, message: "Nenhum campo para atualizar." };
  }

  const updated = await socialRepo.updateYoutuberProfile(userId, data);
  log.info("social.profile_updated", { userId, profileId: profile.id, fields: Object.keys(data) });
  return { ok: true, profile: updated };
}

export async function voteVideo(userId: number, submissionId: number, value: number) {
  const submission = await socialRepo.findApprovedSubmissionStatus(submissionId);
  if (!submission || submission.status !== "approved") {
    return { ok: false as const, status: 404, message: "Vídeo não disponível para votação." };
  }

  const existing = await socialRepo.findVote(userId, submissionId);
  let myVote: 1 | -1 | 0 = 0;

  if (value === 0) {
    if (existing) await socialRepo.deleteVote(existing.id);
    myVote = 0;
  } else if (!existing) {
    await socialRepo.createVote(userId, submissionId, value);
    myVote = value as 1 | -1;
  } else if (existing.value === value) {
    await socialRepo.deleteVote(existing.id);
    myVote = 0;
  } else {
    await socialRepo.updateVote(existing.id, value);
    myVote = value as 1 | -1;
  }

  const counts = await socialRepo.groupVoteCountsForSubmission(submissionId);
  let likeCount = 0;
  let dislikeCount = 0;
  for (const c of counts) {
    if (c.value === 1) likeCount = c._count._all;
    else if (c.value === -1) dislikeCount = c._count._all;
  }

  log.info("social.video_voted", { userId, submissionId, value: myVote });
  return { ok: true as const, submissionId, likeCount, dislikeCount, myVote };
}

export async function approveSubmission(id: number, adminId: number | null) {
  const submission = await socialRepo.findSubmissionById(id);
  if (!submission) return { ok: false as const, status: 404, message: "Submissão não encontrada." };
  // Pré-checagem só pra devolver 409 barato; a guarda de verdade é o flip condicional lá dentro.
  if (submission.status !== "pending") {
    return { ok: false as const, status: 409, message: "Submissão já foi revisada." };
  }

  const now = new Date();

  // item 96 (pentest A10): antes, o `status !== "pending"` acima era a ÚNICA guarda e as leituras
  // de settings/miner ficavam fora da transação — dois cliques (ou dois admins) passavam os dois
  // pela checagem e o grant rodava DUAS vezes, dobrando a recompensa. Agora tudo que decide a
  // concessão acontece dentro da transação e o pending -> approved é um updateMany condicional
  // cujo count é checado (claimSubmissionForApprovalTx). Máquina vai para a Caixa de Entrada
  // (createRewardInboxEntry); o user coleta em /inventario → Minhas Máquinas.
  const outcome = await prisma.$transaction(async (tx) => {
    const settings = await socialRepo.findRewardSettings();
    const rewardMinerId = settings?.minerId ?? null;
    const rewardMiner = rewardMinerId ? await socialRepo.findMinerById(rewardMinerId) : null;

    const claimed = await socialRepo.claimSubmissionForApprovalTx(tx, id, {
      status: "approved",
      reviewedBy: adminId,
      reviewedAt: now,
      rewardMinerId: rewardMiner?.id ?? null,
      rewardGranted: rewardMiner != null,
    });
    if (!claimed) return { claimed: false as const };

    if (rewardMiner) {
      await createRewardInboxEntry(tx, {
        userId: submission.userId,
        source: "youtuber_reward",
        rewardType: "machine",
        rewardValue: Number(rewardMiner.baseHashRate ?? 0),
        minerId: rewardMiner.id,
        minerName: rewardMiner.name,
        minerImageUrl: normalizePersistableMinerImageUrl(rewardMiner.imageUrl),
        slotSize: rewardMiner.slotSize ?? 1,
        metaJson: { submissionId: id, minerId: rewardMiner.id },
      });
    }

    return { claimed: true as const, rewardMiner };
  });

  if (!outcome.claimed) {
    log.warn("social.submission_approve_race", { submissionId: id, adminId });
    return { ok: false as const, status: 409, message: "Submissão já foi revisada." };
  }

  const rewardMiner = outcome.rewardMiner;

  if (rewardMiner) {
    void socialRepo.createAuditLogBestEffort({
      userId: submission.userId,
      action: "youtuber_reward_granted",
      source: "admin",
      severity: "info",
      details: { submissionId: id, minerId: rewardMiner.id, minerName: rewardMiner.name },
    });
  }

  log.info("social.submission_approved", {
    submissionId: id,
    userId: submission.userId,
    rewardMiner: rewardMiner?.name ?? null,
    adminId,
  });

  return {
    ok: true as const,
    rewardGranted: rewardMiner != null,
    rewardMinerName: rewardMiner?.name ?? null,
  };
}
