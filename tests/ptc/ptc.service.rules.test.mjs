import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const svc = await import("../../server/modules/ptc/ptc.service.ts");
const { PTC_ERROR_MESSAGE } = await import("../../server/modules/ptc/ptc.errors.ts");

test("PTC Service Business Rules & Edge Cases", async (t) => {
  const timestamp = Date.now();
  let user1 = null;
  let user2 = null;
  let tier = null;
  let adId = null;

  try {
    user1 = await prisma.user.create({
      data: {
        email: `svc-u1-${timestamp}@blockminer.test`,
        name: "User One",
        username: `u1_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholder12345678901234567890",
        shibBalance: new Prisma.Decimal("100000"),
      },
    });

    user2 = await prisma.user.create({
      data: {
        email: `svc-u2-${timestamp}@blockminer.test`,
        name: "User Two",
        username: `u2_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholder12345678901234567890",
        shibBalance: new Prisma.Decimal("0"),
      },
    });

    tier = await svc.createTier({
      label: `Svc Tier ${timestamp}`,
      adType: "window",
      durationSeconds: 10,
      pricePerViewShib: 2,
      rewardPerViewShib: 1,
      isActive: true,
      sortOrder: 5,
    });

    // ── Settings ─────────────────────────────────────────────────────────────
    await t.test("getSettings and updateSettings", async () => {
      const s = await svc.getSettings();
      assert.ok(s, "Configurações devem existir");

      await svc.updateSettings({ minViews: 50, maxViews: 500000 });
      const updated = await svc.getSettings();
      assert.equal(updated.minViews, 50);
      assert.equal(updated.maxViews, 500000);
    });

    // ── Tier Management ───────────────────────────────────────────────────────
    await t.test("getTiers, getActiveTiers, updateTier, deleteTier errors", async () => {
      const allTiers = await svc.getTiers();
      assert.ok(allTiers.length > 0);

      const activeTiers = await svc.getActiveTiers();
      assert.ok(activeTiers.some((x) => x.id === tier.id));

      await svc.updateTier(tier.id, { label: "Updated Tier Label" });
      const updated = await prisma.ptcAdTier.findUnique({ where: { id: tier.id } });
      assert.equal(updated.label, "Updated Tier Label");

      await assert.rejects(() => svc.deleteTier(999999), {
        message: PTC_ERROR_MESSAGE.TIER_NOT_FOUND,
      });
    });

    // ── createCampaign validation ─────────────────────────────────────────────
    await t.test("createCampaign: falha com saldo insuficiente", async () => {
      await assert.rejects(
        () =>
          svc.createCampaign(user2.id, {
            title: "Sem Saldo",
            description: "",
            url: "https://example.com",
            tierId: tier.id,
            targetViews: 100,
          }),
        { message: PTC_ERROR_MESSAGE.INSUFFICIENT_BALANCE },
      );
    });

    await t.test("createCampaign: falha com views fora do range", async () => {
      await assert.rejects(
        () =>
          svc.createCampaign(user1.id, {
            title: "Poucas views",
            description: "",
            url: "https://example.com",
            tierId: tier.id,
            targetViews: 10, // minViews configurado como 50
          }),
        /Views must be between/,
      );
    });

    await t.test("createCampaign: sucesso cria anúncio e debita saldo", async () => {
      const ad = await svc.createCampaign(user1.id, {
        title: "Campanha Regras",
        description: "Testando regras",
        url: "https://example.com/rules",
        tierId: tier.id,
        targetViews: 100, // Custo: 100 * 2 = 200 SHIB
      });

      const dbAd = await prisma.ptpAd.findFirst({ where: { userId: user1.id, title: "Campanha Regras" } });
      assert.ok(dbAd);
      adId = dbAd.id;
      assert.equal(dbAd.status, "pending_approval");
    });

    // ── editCampaign ─────────────────────────────────────────────────────────
    await t.test("editCampaign: edita título e descrição", async () => {
      await svc.editCampaign(user1.id, adId, { title: "Novo Titulo", description: "Nova Desc" });
      const updated = await prisma.ptpAd.findUnique({ where: { id: adId } });
      assert.equal(updated.title, "Novo Titulo");
      assert.equal(updated.description, "Nova Desc");
    });

    await t.test("editCampaign: impede edição por usuário diferente", async () => {
      await assert.rejects(
        () => svc.editCampaign(user2.id, adId, { title: "Hacked" }),
        { message: PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND },
      );
    });

    // ── addViews & removeViews ────────────────────────────────────────────────
    await t.test("addViews: adiciona visualizações com cobrança em SHIB", async () => {
      const uBefore = await prisma.user.findUnique({ where: { id: user1.id } });
      await svc.addViews(user1.id, adId, 50); // 50 * 2 = 100 SHIB

      const adAfter = await prisma.ptpAd.findUnique({ where: { id: adId } });
      assert.equal(adAfter.targetViews, 150);

      const uAfter = await prisma.user.findUnique({ where: { id: user1.id } });
      assert.equal(Number(uBefore.shibBalance) - Number(uAfter.shibBalance), 100);
    });

    await t.test("removeViews: remove visualizações não entregues com estorno", async () => {
      const uBefore = await prisma.user.findUnique({ where: { id: user1.id } });
      await svc.removeViews(user1.id, adId, 50); // 50 views reembolsadas

      const adAfter = await prisma.ptpAd.findUnique({ where: { id: adId } });
      assert.equal(adAfter.targetViews, 100);

      const uAfter = await prisma.user.findUnique({ where: { id: user1.id } });
      assert.equal(Number(uAfter.shibBalance) - Number(uBefore.shibBalance), 100);
    });

    await t.test("removeViews: impede reduzir abaixo do minViews", async () => {
      await assert.rejects(
        () => svc.removeViews(user1.id, adId, 80), // 100 - 80 = 20 < minViews (50)
        /Min views is/,
      );
    });

    // ── Sessions & Anti-cheat ─────────────────────────────────────────────────
    await t.test("startSession: impede visualizar o próprio anúncio", async () => {
      // Ativa anúncio para permitir teste de sessão
      await prisma.ptpAd.update({ where: { id: adId }, data: { status: "active" } });

      await assert.rejects(
        () => svc.startSession(user1.id, adId),
        { message: PTC_ERROR_MESSAGE.CANNOT_VIEW_OWN_AD },
      );
    });

    await t.test("pauseSession e cancelSession", async () => {
      const sess = await svc.startSession(user2.id, adId);
      assert.ok(sess.id);

      const paused = await svc.pauseSession(sess.id, user2.id);
      assert.ok(paused);

      await svc.cancelSession(sess.id, user2.id, "user_cancelled");
      const cancelled = await prisma.ptpSession.findUnique({ where: { id: sess.id } });
      assert.equal(cancelled.status, "cancelled");
    });

    // ── Getters ───────────────────────────────────────────────────────────────
    await t.test("getMyCampaigns e getAvailableAds", async () => {
      const my = await svc.getMyCampaigns(user1.id);
      assert.ok(my.length > 0);

      const avail = await svc.getAvailableAds(user2.id);
      assert.ok(avail.ads !== undefined);
      assert.ok(avail.daily.utcDate !== undefined);
    });
  } finally {
    // Cleanup
    if (adId) {
      await prisma.ptpSession.deleteMany({ where: { adId } });
      await prisma.ptpView.deleteMany({ where: { adId } });
      await prisma.ptpAd.delete({ where: { id: adId } }).catch(() => {});
    }
    if (tier) {
      await svc.deleteTier(tier.id).catch(() => {});
    }
    if (user1) {
      await prisma.telegramOutboxEvent.deleteMany({ where: { userId: user1.id } });
      await prisma.user.delete({ where: { id: user1.id } }).catch(() => {});
    }
    if (user2) {
      await prisma.user.delete({ where: { id: user2.id } }).catch(() => {});
    }
  }
});
