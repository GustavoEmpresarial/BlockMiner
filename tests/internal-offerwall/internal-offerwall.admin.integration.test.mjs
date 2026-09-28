import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const service = await import("../../server/modules/internal-offerwall/internal-offerwall.service.ts");
const {
  OFFER_KIND_PTC_IFRAME,
  OFFER_KIND_GENERAL_TASK,
  COMPLETION_ADMIN_APPROVAL,
  COMPLETION_USER_SELF_CLAIM,
  REWARD_BLK,
  RESET_TYPE_DAILY,
} = await import("../../server/modules/internal-offerwall/internal-offerwall.config.ts");

test("Internal Offerwall Integration: full lifecycle of offer creation, self-claim, review queue and approval", async () => {
  const ts = Date.now();
  let user = null;
  let offerSelf = null;
  let offerReview = null;
  let frameHost = null;

  try {
    // 1. Criar usuário de teste
    user = await prisma.user.create({
      data: {
        name: "Offerwall Integration User",
        username: `ow_user_${ts}`.slice(0, 20),
        email: `ow_user_${ts}@blockminer.test`,
        passwordHash: "dummy",
        blkBalance: new Prisma.Decimal("0.00000000"),
      },
    });

    // 2. Admin cria oferta de auto-resgate (PTC)
    const parsedSelf = await service.parseAdminOfferBody(prisma, {
      kind: OFFER_KIND_PTC_IFRAME,
      title: `Test PTC Offer ${ts}`,
      description: "Visite e ganhe BLK instantâneo",
      iframeUrl: "https://zerads.com/test-ad",
      minViewSeconds: 0, // 0 para testes imediatos
      rewardKind: REWARD_BLK,
      rewardBlkAmount: 0.05,
      completionMode: COMPLETION_USER_SELF_CLAIM,
      dailyLimitPerUser: 5,
    });
    assert.equal(parsedSelf.ok, true);
    offerSelf = await service.adminCreateOffer(parsedSelf.data);
    assert.ok(offerSelf.id > 0);
    assert.equal(offerSelf.rewardKind, REWARD_BLK);

    // 3. Admin atualiza oferta (PUT / PATCH)
    const patched = await service.adminPatchOffer(offerSelf.id, {
      title: `Updated PTC Offer ${ts}`,
      sortOrder: 10,
    });
    assert.equal(patched.title, `Updated PTC Offer ${ts}`);
    assert.equal(patched.sortOrder, 10);

    // 4. Usuário inicia a oferta de auto-resgate
    const startRes = await service.userStartOffer(user.id, offerSelf.id);
    assert.equal(startRes.ok, true);
    assert.ok(startRes.attempt.id > 0);
    assert.equal(startRes.attempt.status, "STARTED");

    // 5. Usuário registra abertura do parceiro
    const partnerRes = await service.userMarkPartnerOpened(user.id, startRes.attempt.id);
    assert.equal(partnerRes.ok, true);
    assert.ok(partnerRes.partnerOpenedAt);

    // 6. Usuário submete e recebe recompensa instantânea
    const submitRes = await service.userSubmitAttempt(user.id, startRes.attempt.id);
    assert.equal(submitRes.ok, true);
    assert.equal(submitRes.status, "COMPLETED");

    // Validar saldo creditado no banco
    const userAfterSelf = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(Number(userAfterSelf.blkBalance), 0.05);

    // 7. Admin cria oferta com aprovação manual (GENERAL_TASK)
    const parsedReview = await service.parseAdminOfferBody(prisma, {
      kind: OFFER_KIND_GENERAL_TASK,
      title: `Manual Review Task ${ts}`,
      description: "Tarefa com revisão administrativa",
      minViewSeconds: 0,
      rewardKind: REWARD_BLK,
      rewardBlkAmount: 0.1,
      completionMode: COMPLETION_ADMIN_APPROVAL,
      dailyLimitPerUser: 2,
    });
    assert.equal(parsedReview.ok, true);
    offerReview = await service.adminCreateOffer(parsedReview.data);

    // 8. Usuário executa e submete para revisão
    const startReview = await service.userStartOffer(user.id, offerReview.id);
    assert.equal(startReview.ok, true);

    const submitReview = await service.userSubmitAttempt(user.id, startReview.attempt.id);
    assert.equal(submitReview.ok, true);
    assert.equal(submitReview.status, "PENDING_REVIEW");

    // O saldo ainda NÃO deve ter mudado
    const userPending = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(Number(userPending.blkBalance), 0.05);

    // 9. Admin aprova tentativa
    const approveRes = await service.adminApproveAttempt(startReview.attempt.id);
    assert.equal(approveRes.ok, true);

    // Saldo agora deve incluir os 0.1 BLK adicionais (total 0.15 BLK)
    const userAfterApprove = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(Number(userAfterApprove.blkBalance), 0.15);

    // 10. Testar fluxo de rejeição
    const startReject = await service.userStartOffer(user.id, offerReview.id);
    assert.equal(startReject.ok, true);
    await service.userSubmitAttempt(user.id, startReject.attempt.id);

    const rejectRes = await service.adminRejectAttempt(startReject.attempt.id, "Comprovante inválido");
    assert.equal(rejectRes.ok, true);

    const rejectedAttempt = await prisma.internalOfferwallAttempt.findUnique({
      where: { id: startReject.attempt.id },
    });
    assert.equal(rejectedAttempt.status, "REJECTED");
    assert.equal(rejectedAttempt.adminNote, "Comprovante inválido");

    // 11. Testar auto-registro e desativação de Frame Host
    frameHost = await prisma.internalOfferwallFrameHost.create({
      data: { hostname: `integration-host-${ts}.test.org`, isActive: true },
    });
    assert.equal(frameHost.isActive, true);

    const deactRes = await service.adminDeactivateFrameHostById(frameHost.id);
    assert.equal(deactRes.ok, true);

    const updatedHost = await prisma.internalOfferwallFrameHost.findUnique({
      where: { id: frameHost.id },
    });
    assert.equal(updatedHost.isActive, false);
  } finally {
    // Limpeza de registros de teste
    if (user?.id) {
      await prisma.internalOfferwallAttempt.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    if (offerSelf?.id) {
      await prisma.internalOfferwallOffer.delete({ where: { id: offerSelf.id } }).catch(() => {});
    }
    if (offerReview?.id) {
      await prisma.internalOfferwallOffer.delete({ where: { id: offerReview.id } }).catch(() => {});
    }
    if (frameHost?.id) {
      await prisma.internalOfferwallFrameHost.delete({ where: { id: frameHost.id } }).catch(() => {});
    }
  }
});
