import prisma from "../../core/database/prisma.js";
export async function listApprovedSubmissionsPage(skip, take) {
    return prisma.youtubeVideoSubmission.findMany({
        where: { status: "approved" },
        orderBy: { reviewedAt: "desc" },
        skip,
        take,
        select: {
            id: true,
            videoId: true,
            videoUrl: true,
            title: true,
            reviewedAt: true,
            profile: {
                select: {
                    channelName: true,
                    channelPhoto: true,
                    channelUrl: true,
                },
            },
        },
    });
}
export async function countApprovedSubmissions() {
    return prisma.youtubeVideoSubmission.count({ where: { status: "approved" } });
}
export async function groupVoteCountsForSubmissions(submissionIds) {
    return prisma.youtubeVideoVote.groupBy({
        by: ["submissionId", "value"],
        where: { submissionId: { in: submissionIds } },
        _count: { _all: true },
    });
}
export async function listUserVotesForSubmissions(userId, submissionIds) {
    return prisma.youtubeVideoVote.findMany({
        where: { userId, submissionId: { in: submissionIds } },
        select: { submissionId: true, value: true },
    });
}
export async function findYoutuberProfile(userId) {
    return prisma.youtuberProfile.findUnique({ where: { userId } });
}
export async function listUserSubmissions(userId, take) {
    return prisma.youtubeVideoSubmission.findMany({
        where: { userId },
        orderBy: { submittedAt: "desc" },
        take,
        select: {
            id: true,
            videoId: true,
            videoUrl: true,
            title: true,
            status: true,
            reviewNote: true,
            rewardGranted: true,
            submittedAt: true,
            reviewedAt: true,
        },
    });
}
export async function updateYoutuberProfileForResubmit(userId, data) {
    return prisma.youtuberProfile.update({ where: { userId }, data });
}
export async function createYoutuberProfile(data) {
    return prisma.youtuberProfile.create({ data });
}
export async function createVideoSubmission(data) {
    return prisma.youtubeVideoSubmission.create({ data });
}
export async function findUsernameById(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
}
export async function updateYoutuberProfile(userId, data) {
    return prisma.youtuberProfile.update({ where: { userId }, data });
}
export async function findApprovedSubmissionStatus(submissionId) {
    return prisma.youtubeVideoSubmission.findUnique({
        where: { id: submissionId },
        select: { id: true, status: true },
    });
}
export async function findVote(userId, submissionId) {
    return prisma.youtubeVideoVote.findUnique({
        where: { userId_submissionId: { userId, submissionId } },
    });
}
export async function deleteVote(id) {
    await prisma.youtubeVideoVote.delete({ where: { id } });
}
export async function createVote(userId, submissionId, value) {
    await prisma.youtubeVideoVote.create({ data: { userId, submissionId, value } });
}
export async function updateVote(id, value) {
    await prisma.youtubeVideoVote.update({ where: { id }, data: { value } });
}
export async function groupVoteCountsForSubmission(submissionId) {
    return prisma.youtubeVideoVote.groupBy({
        by: ["value"],
        where: { submissionId },
        _count: { _all: true },
    });
}
// ─── Admin social ─────────────────────────────────────────────────────────────
export async function listAllProfiles() {
    return prisma.youtuberProfile.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            user: { select: { id: true, username: true, name: true, email: true } },
            _count: { select: { submissions: true } },
        },
    });
}
export async function createProfile(data) {
    return prisma.youtuberProfile.create({ data });
}
export async function updateProfileById(id, data) {
    return prisma.youtuberProfile.update({ where: { id }, data });
}
export async function deleteProfile(id) {
    await prisma.youtuberProfile.delete({ where: { id } });
}
export async function listPendingCredentialRequests() {
    return prisma.youtuberProfile.findMany({
        where: { credentialRequestStatus: "pending" },
        orderBy: { createdAt: "asc" },
        include: {
            user: { select: { id: true, username: true, name: true, email: true } },
        },
    });
}
export async function listSubmissionsByStatus(where) {
    return prisma.youtubeVideoSubmission.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        take: 200,
        include: {
            user: { select: { id: true, username: true, name: true } },
            profile: { select: { channelName: true, channelPhoto: true, channelUrl: true } },
            miner: { select: { id: true, name: true, imageUrl: true } },
        },
    });
}
export async function findSubmissionById(id) {
    return prisma.youtubeVideoSubmission.findUnique({ where: { id } });
}
export async function findRewardSettings() {
    return prisma.youtuberRewardSettings.findUnique({ where: { id: 1 } });
}
export async function findMinerById(id) {
    return prisma.miner.findUnique({ where: { id } });
}
/**
 * Flip atômico pending -> approved (item 96, pentest A10). Devolve `false` quando outra
 * aprovação concorrente já pegou a linha — o `where` inclui `status: "pending"`, então só UMA
 * das transações vê count === 1 e só ela concede o miner de recompensa. Mesmo padrão de
 * `claimWithdrawalForSend` (withdrawal.repository.ts) e do débito condicional em
 * youtube.repository.ts `claimRewardTx`.
 */
export async function claimSubmissionForApprovalTx(tx, id, data) {
    const result = await tx.youtubeVideoSubmission.updateMany({
        where: { id, status: "pending" },
        data,
    });
    return result.count === 1;
}
export async function updateSubmissionStatus(id, data) {
    await prisma.youtubeVideoSubmission.update({ where: { id }, data });
}
export async function deleteSubmission(id) {
    await prisma.youtubeVideoSubmission.delete({ where: { id } });
}
export async function findRewardSettingsWithMiner() {
    return prisma.youtuberRewardSettings.findUnique({
        where: { id: 1 },
        include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } },
    });
}
export async function upsertRewardSettings(minerId) {
    await prisma.youtuberRewardSettings.upsert({
        where: { id: 1 },
        create: { id: 1, minerId },
        update: { minerId },
    });
}
export async function findMinerSummary(id) {
    return prisma.miner.findUnique({
        where: { id },
        select: { id: true, name: true, imageUrl: true, baseHashRate: true },
    });
}
export async function createAuditLogBestEffort(data) {
    await prisma.auditLog
        .create({
        data: {
            userId: data.userId,
            action: data.action,
            source: data.source,
            severity: data.severity,
            detailsJson: JSON.stringify(data.details),
        },
    })
        .catch(() => undefined);
}
// ─── Creators admin ───────────────────────────────────────────────────────────
export async function listCreatorUsers() {
    return prisma.user.findMany({
        where: { isCreator: true },
        select: {
            id: true,
            username: true,
            name: true,
            youtubeUrl: true,
            createdAt: true,
            youtuberProfile: {
                select: { channelName: true, channelPhoto: true, channelUrl: true },
            },
        },
        orderBy: { username: "asc" },
    });
}
export async function searchUsersByUsername(q, take) {
    return prisma.user.findMany({
        where: { username: { contains: q, mode: "insensitive" } },
        select: { id: true, username: true, name: true, isCreator: true, youtubeUrl: true },
        take,
    });
}
export async function setUserAsCreator(id, youtubeUrl) {
    await prisma.user.update({
        where: { id },
        data: { isCreator: true, youtubeUrl },
    });
}
export async function removeUserCreatorCredential(id) {
    await prisma.user.update({
        where: { id },
        data: { isCreator: false, youtubeUrl: null },
    });
}
