import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const svc = await import("../../server/modules/ptc/ptc.service.ts");

test("PTC Multi-Currency Test Suite (POL, BLK, SHIB)", async (t) => {
  const timestamp = Date.now();
  let advUser = null;
  let viewerUser = null;
  let polTier = null;
  let blkTier = null;
  let polAd = null;
  let blkAd = null;

  try {
    // 1. Setup usuários de teste com saldos em POL, BLK e SHIB
    advUser = await prisma.user.create({
      data: {
        email: `adv-multi-${timestamp}@blockminer.test`,
        name: "Advertiser Multi",
        username: `adv_multi_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholderforptcsmoke1234567890",
        shibBalance: new Prisma.Decimal("10000"),
        polBalance: new Prisma.Decimal("1.00000000"),
        blkBalance: new Prisma.Decimal("50.00000000"),
      },
    });

    viewerUser = await prisma.user.create({
      data: {
        email: `view-multi-${timestamp}@blockminer.test`,
        name: "Viewer Multi",
        username: `view_multi_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholderforptcsmoke1234567890",
        shibBalance: new Prisma.Decimal("0"),
        polBalance: new Prisma.Decimal("0"),
        blkBalance: new Prisma.Decimal("0"),
      },
    });

    // 2. Setup tiers em POL e BLK
    polTier = await svc.createTier({
      label: `POL Test 5s ${timestamp}`,
      adType: "window",
      durationSeconds: 1,
      pricePerViewShib: 0.000200, // 0.0002 POL/view (0.20 POL / 1k views)
      rewardPerViewShib: 0.000160, // 0.00016 POL/view (0.16 POL / 1k views)
      currency: "POL",
      isActive: true,
      sortOrder: 10,
    });
    assert.equal(polTier.currency, "POL");

    blkTier = await svc.createTier({
      label: `BLK Test 5s ${timestamp}`,
      adType: "window",
      durationSeconds: 1,
      pricePerViewShib: 0.000060, // 0.000060 BLK/view (0.06 BLK / 1k views)
      rewardPerViewShib: 0.000050, // 0.000050 BLK/view (0.05 BLK / 1k views)
      currency: "BLK",
      isActive: true,
      sortOrder: 20,
    });
    assert.equal(blkTier.currency, "BLK");

    // ── POL Campaign Flow ──────────────────────────────────────────────────────
    await t.test("createCampaign (POL): falha por saldo insuficiente e sucesso com débito em polBalance", async () => {
      // Falha quando requer mais POL do que o saldo
      await assert.rejects(
        () =>
          svc.createCampaign(advUser.id, {
            title: "Campanha POL Saldo Insuficiente",
            description: "desc",
            url: "https://example.com/pol-insuf",
            tierId: polTier.id,
            targetViews: 100000, // Custo: 100000 * 0.0002 = 20 POL (saldo é 1.0)
          }),
        { message: "Insufficient POL balance" },
      );

      // Sucesso: 100 views * 0.0002 = 0.02000000 POL
      polAd = await svc.createCampaign(advUser.id, {
        title: "Campanha POL Sucesso",
        description: "desc",
        url: "https://example.com/pol-ok",
        tierId: polTier.id,
        targetViews: 100,
      });

      assert.equal(polAd.asset, "POL");
      const updatedAdv = await prisma.user.findUnique({ where: { id: advUser.id } });
      assert.equal(Number(updatedAdv.polBalance), 0.98); // 1.0 - 0.02 = 0.98
    });

    await t.test("addViews e removeViews (POL): debita e estorna em polBalance", async () => {
      // Adiciona 50 views -> 50 * 0.0002 = 0.01000000 POL
      await svc.addViews(advUser.id, polAd.id, 50);
      let adv = await prisma.user.findUnique({ where: { id: advUser.id } });
      assert.equal(Number(adv.polBalance), 0.97); // 0.98 - 0.01 = 0.97

      // Remove 50 views -> estorna 0.01000000 POL
      await svc.removeViews(advUser.id, polAd.id, 50);
      adv = await prisma.user.findUnique({ where: { id: advUser.id } });
      assert.equal(Number(adv.polBalance), 0.98); // 0.97 + 0.01 = 0.98
    });

    await t.test("claimSession (POL): credita recompensa em polBalance do viewer", async () => {
      // Aprova campanha
      await svc.approveCampaign(polAd.id);

      // Viewer inicia sessão e faz claim
      const session = await svc.startSession(viewerUser.id, polAd.id);
      await svc.heartbeat(session.id, viewerUser.id);
      await new Promise((r) => setTimeout(r, 1100));
      await svc.heartbeat(session.id, viewerUser.id);
      await svc.claimSession(session.id, viewerUser.id);

      // Checa saldo do viewer (deve ter 0.000160 POL)
      const updatedViewer = await prisma.user.findUnique({ where: { id: viewerUser.id } });
      assert.equal(Number(updatedViewer.polBalance), 0.00016);
      assert.equal(Number(updatedViewer.shibBalance), 0);
      assert.equal(Number(updatedViewer.blkBalance), 0);
    });

    // ── BLK Campaign Flow ──────────────────────────────────────────────────────
    await t.test("createCampaign (BLK): sucesso com débito em blkBalance e rejectCampaign com estorno em blkBalance", async () => {
      // 100 views * 0.000060 = 0.006 BLK
      blkAd = await svc.createCampaign(advUser.id, {
        title: "Campanha BLK Rejeição",
        description: "desc",
        url: "https://example.com/blk-reject",
        tierId: blkTier.id,
        targetViews: 100,
      });

      assert.equal(blkAd.asset, "BLK");
      let adv = await prisma.user.findUnique({ where: { id: advUser.id } });
      assert.equal(Number(adv.blkBalance), 49.994); // 50.0 - 0.006 = 49.994

      // Admin rejeita e estorna BLK
      await svc.rejectCampaign(blkAd.id, "Conteúdo fora das diretrizes");
      adv = await prisma.user.findUnique({ where: { id: advUser.id } });
      assert.equal(Number(adv.blkBalance), 50.0); // 49.994 + 0.006 = 50.0

      const rejectedAd = await prisma.ptpAd.findUnique({ where: { id: blkAd.id } });
      assert.equal(rejectedAd.status, "rejected");
      assert.equal(rejectedAd.rejectionReason, "Conteúdo fora das diretrizes");
    });
  } finally {
    // Cleanup
    if (polAd?.id) {
      await prisma.ptpSession.deleteMany({ where: { adId: polAd.id } });
      await prisma.ptpView.deleteMany({ where: { adId: polAd.id } });
      await prisma.ptpAd.delete({ where: { id: polAd.id } }).catch(() => {});
    }
    if (blkAd?.id) {
      await prisma.ptpSession.deleteMany({ where: { adId: blkAd.id } });
      await prisma.ptpView.deleteMany({ where: { adId: blkAd.id } });
      await prisma.ptpAd.delete({ where: { id: blkAd.id } }).catch(() => {});
    }
    if (polTier?.id) {
      await svc.deleteTier(polTier.id).catch(() => {});
    }
    if (blkTier?.id) {
      await svc.deleteTier(blkTier.id).catch(() => {});
    }
    if (advUser?.id) {
      await prisma.telegramOutboxEvent.deleteMany({ where: { userId: advUser.id } });
      await prisma.user.delete({ where: { id: advUser.id } }).catch(() => {});
    }
    if (viewerUser?.id) {
      await prisma.ptpEarning.deleteMany({ where: { userId: viewerUser.id } });
      await prisma.user.delete({ where: { id: viewerUser.id } }).catch(() => {});
    }
  }
});
