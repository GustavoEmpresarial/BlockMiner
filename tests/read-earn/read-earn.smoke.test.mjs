import test from "node:test";
import assert from "node:assert/strict";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const {
  hashReadEarnCode,
  listPublicReadEarnCampaigns,
  redeemReadEarnCampaign,
} = await import("../../server/modules/read-earn/read-earn.service.ts");
const {
  createCampaign,
  countRedemptionsForCampaign,
  deleteCampaign,
  listRedemptionsForCampaign,
} = await import("../../server/modules/read-earn/read-earn.admin.repository.ts");
const {
  REDEEM_ALREADY,
  REDEEM_GENERIC,
  READ_EARN_BLK,
} = await import("../../server/modules/read-earn/read-earn.errors.ts");

test("Read & Earn End-to-End Smoke Test", async (t) => {
  const testEmail = `smoke-read-earn-${Date.now()}@blockminer.test`;
  let testUser = null;
  let testCampaign = null;

  try {
    // 1. Setup usuário de teste
    testUser = await prisma.user.create({
      data: {
        email: testEmail,
        name: "Smoke ReadEarn User",
        username: `smoke_re_${Date.now()}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholderforreadearnsmoke1234567890",
      },
    });
    assert.ok(testUser.id > 0, "Usuário de teste deve ser criado");

    const initialBlk = Number(testUser.blkBalance || 0);

    // 2. Admin cria campanha de teste
    const plainCode = "SMOKETEST_CODE_2026";
    const codeHash = await hashReadEarnCode(plainCode);
    const now = new Date();
    const startsAt = new Date(now.getTime() - 60_000);
    const expiresAt = new Date(now.getTime() + 86_400_000);

    testCampaign = await createCampaign({
      title: "Campanha Smoke Test",
      partnerUrl: "https://blockminer.space/smoke-test",
      codeHash,
      rewardType: READ_EARN_BLK,
      rewardAmount: 5.5,
      startsAt,
      expiresAt,
      isActive: true,
      sortOrder: 1,
    });
    assert.ok(testCampaign.id > 0, "Campanha deve ser criada no banco");
    assert.equal(testCampaign.title, "Campanha Smoke Test");

    // 3. Verifica listagem pública
    await t.test("listPublicReadEarnCampaigns: lista campanha ativa e oculta hash secreto", async () => {
      const publicCampaigns = await listPublicReadEarnCampaigns();
      const found = publicCampaigns.find((c) => c.id === testCampaign.id);
      assert.ok(found, "Campanha recém criada deve constar na listagem pública");
      assert.equal("codeHash" in found, false, "codeHash NÃO deve ser exposto publicamente");
      assert.equal(found.title, "Campanha Smoke Test");
    });

    // 4. Teste negativo: código incorreto
    await t.test("redeemReadEarnCampaign: rejeita código incorreto", async () => {
      const wrongRes = await redeemReadEarnCampaign({
        userId: testUser.id,
        campaignId: testCampaign.id,
        rawCode: "INCORRECT_CODE_XYZ",
        ip: "127.0.0.1",
        userAgent: "SmokeTestAgent/1.0",
      });
      assert.equal(wrongRes.ok, false);
      assert.equal(wrongRes.code, REDEEM_GENERIC);
    });

    // 5. Teste positivo: resgate com sucesso
    await t.test("redeemReadEarnCampaign: resgata recompensa com sucesso e credita saldo", async () => {
      const successRes = await redeemReadEarnCampaign({
        userId: testUser.id,
        campaignId: testCampaign.id,
        rawCode: plainCode,
        ip: "192.168.1.100",
        userAgent: "SmokeTestAgent/1.0",
      });

      assert.equal(successRes.ok, true);
      assert.equal(successRes.code, "OK");
      assert.equal(successRes.reward?.rewardType, "blk");
      assert.equal(successRes.reward?.rewardAmount, 5.5);

      // Verifica saldo do usuário
      const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
      const currentBlk = Number(updatedUser.blkBalance);
      assert.equal(currentBlk, initialBlk + 5.5, "Saldo BLK deve ser creditado");

      // Verifica registro de redenção
      const redemption = await prisma.readEarnRedemption.findUnique({
        where: { userId_campaignId: { userId: testUser.id, campaignId: testCampaign.id } },
      });
      assert.ok(redemption, "Registro ReadEarnRedemption deve existir");
      assert.equal(redemption.ip, "192.168.1.100");
    });

    // 6. Teste anti-replay: segundo resgate pela mesma conta
    await t.test("redeemReadEarnCampaign: impede resgate duplicado (anti-replay)", async () => {
      const duplicateRes = await redeemReadEarnCampaign({
        userId: testUser.id,
        campaignId: testCampaign.id,
        rawCode: plainCode,
      });

      assert.equal(duplicateRes.ok, false);
      assert.equal(duplicateRes.code, REDEEM_ALREADY);
    });

    // 7. Admin consulta histórico de resgates
    await t.test("listRedemptionsForCampaign: retorna histórico com dados do usuário", async () => {
      const { rows, total } = await listRedemptionsForCampaign(testCampaign.id, 0, 50);
      assert.equal(total, 1);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].userId, testUser.id);
      assert.equal(rows[0].user?.email, testEmail);
    });

    // 8. Proteção contra exclusão de campanha com resgates
    await t.test("countRedemptionsForCampaign: impede exclusão de campanha com resgates", async () => {
      const count = await countRedemptionsForCampaign(testCampaign.id);
      assert.equal(count, 1, "Campanha deve acusar 1 resgate");
    });
  } finally {
    // Cleanup cuidadoso
    if (testCampaign) {
      await prisma.readEarnRedemption.deleteMany({ where: { campaignId: testCampaign.id } });
      await deleteCampaign(testCampaign.id).catch(() => {});
    }
    if (testUser) {
      await prisma.notification.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
  }
});
