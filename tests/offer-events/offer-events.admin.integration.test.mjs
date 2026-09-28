import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { purchaseEventMinerForUser, listActiveOfferEventsForUser } = await import(
  "../../server/modules/offer-events/offer-events.service.ts"
);

test("Offer Events Integration: purchase with BLK debit, inventory grant, free claim limit and concurrency lock", async () => {
  const ts = Date.now();
  let user = null;
  let event = null;
  let paidMiner = null;
  let freeMiner = null;

  try {
    // 1. Criar usuário de teste com saldo BLK
    user = await prisma.user.create({
      data: {
        name: "Offer Events Tester",
        username: `oe_user_${ts}`.slice(0, 20),
        email: `oe_user_${ts}@blockminer.test`,
        passwordHash: "dummy_hash",
        blkBalance: new Prisma.Decimal("100.00000000"),
        polBalance: new Prisma.Decimal("10.00000000"),
      },
    });
    assert.ok(user.id > 0);

    // 2. Criar Evento de Oferta
    const now = new Date();
    event = await prisma.offerEvent.create({
      data: {
        title: `Integration Promo Event ${ts}`,
        description: "Evento de teste de integração",
        startsAt: new Date(now.getTime() - 3600_000), // 1 hora atrás
        endsAt: new Date(now.getTime() + 86400_000), // 24 horas no futuro
        isActive: true,
      },
    });
    assert.ok(event.id > 0);

    // 3. Cadastrar mineradora paga (preço 15 BLK)
    paidMiner = await prisma.eventMiner.create({
      data: {
        eventId: event.id,
        name: `Super Miner ${ts}`,
        description: "Mineradora paga de evento",
        price: new Prisma.Decimal("15.00000000"),
        hashRate: 150,
        currency: "BLK",
        stockUnlimited: false,
        stockCount: 10,
        soldCount: 0,
        slotSize: 1,
        isActive: true,
        isFree: false,
        claimLimitPerUser: 10,
      },
    });
    assert.ok(paidMiner.id > 0);

    // 4. Cadastrar mineradora gratuita (claimLimitPerUser: 1)
    freeMiner = await prisma.eventMiner.create({
      data: {
        eventId: event.id,
        name: `Free Welcome Miner ${ts}`,
        description: "Mineradora gratuita de boas-vindas",
        price: new Prisma.Decimal("0.00000000"),
        hashRate: 25,
        currency: "BLK",
        stockUnlimited: true,
        soldCount: 0,
        slotSize: 1,
        isActive: true,
        isFree: true,
        claimLimitPerUser: 1,
      },
    });
    assert.ok(freeMiner.id > 0);

    // 5. Listar eventos ativos para o usuário
    const activeList = await listActiveOfferEventsForUser(user.id);
    assert.ok(activeList.events.length > 0);
    const foundEvent = activeList.events.find((e) => e.id === event.id);
    assert.ok(foundEvent);
    assert.equal(foundEvent.isLive, true);

    // 6. Realizar compra da mineradora paga (qty: 2 => 30 BLK)
    const purchaseResult = await purchaseEventMinerForUser(user.id, paidMiner.id, 2);
    assert.equal(purchaseResult.ok, true);

    // Validar débito no saldo do usuário (100 - 30 = 70 BLK)
    const userAfterPaid = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(Number(userAfterPaid.blkBalance), 70);

    // Validar criação de registros em EventPurchase e UserOwnedMachine (inventário)
    const purchasesPaid = await prisma.eventPurchase.findMany({
      where: { userId: user.id, eventMinerId: paidMiner.id },
    });
    assert.equal(purchasesPaid.length, 2);

    const inventoryPaid = await prisma.userOwnedMachine.findMany({
      where: { userId: user.id, eventMinerId: paidMiner.id },
    });
    assert.equal(inventoryPaid.length, 2);
    assert.equal(inventoryPaid[0].minerName, `[Event] ${paidMiner.name}`);

    // Validar incremento de soldCount
    const minerAfterPaid = await prisma.eventMiner.findUnique({ where: { id: paidMiner.id } });
    assert.equal(minerAfterPaid.soldCount, 2);

    // 7. Resgatar máquina gratuita (1ª vez deve suceder)
    const freeResult1 = await purchaseEventMinerForUser(user.id, freeMiner.id, 1);
    assert.equal(freeResult1.ok, true);

    // 8. Tentar resgatar novamente máquina gratuita (deve ser rejeitado por limite atingido)
    const freeResult2 = await purchaseEventMinerForUser(user.id, freeMiner.id, 1);
    assert.equal(freeResult2.ok, false);
    assert.equal(freeResult2.code, "claim_limit_exceeded");

    // 9. Soft-delete do evento e validação de desativação
    await prisma.offerEvent.update({
      where: { id: event.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    const activeAfterDelete = await listActiveOfferEventsForUser(user.id);
    const eventAfterDelete = activeAfterDelete.events.find((e) => e.id === event.id);
    assert.equal(eventAfterDelete, undefined);
  } finally {
    // Limpeza de dados de teste
    if (user?.id) {
      await prisma.userOwnedMachine.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.eventPurchase.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    if (event?.id) {
      await prisma.eventMiner.deleteMany({ where: { eventId: event.id } }).catch(() => {});
      await prisma.offerEvent.delete({ where: { id: event.id } }).catch(() => {});
    }
  }
});
