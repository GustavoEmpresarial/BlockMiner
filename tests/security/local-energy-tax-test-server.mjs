import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import prisma from "../../server/core/database/prisma.ts";
import { energyTaxRouter } from "../../server/modules/energy-tax/energy-tax.routes.ts";
import { signAccessToken } from "../../server/shared/security/authTokens.ts";
import * as energyTaxService from "../../server/modules/energy-tax/energy-tax.service.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/energy-tax", energyTaxRouter);

const PORT = 5119;

async function start() {
  const suffix = `pentest_etax_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      name: "Kali Energy Tax Pentest User",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      polBalance: 50,
      shibBalance: 1000000,
      blkBalance: 10,
    },
  });

  // Seed yesterday's mining rewards so there is a taxable base
  const now = new Date();
  const taxedDay = energyTaxService.lastClosedMiningPeriodStart(now);
  await prisma.zeradsCallback.create({
    data: {
      userId: user.id,
      username: user.username,
      amountZer: 50,
      exchangeRate: 1,
      payoutAmount: 2.0,
      clicks: 1,
      callbackHash: `k6_cb_sec_${Date.now()}_${Math.random()}`,
      callbackAt: new Date(taxedDay.getTime() + 3600 * 1000),
    },
  });

  const token = signAccessToken({ id: user.id, name: user.name, email: user.email });

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[EnergyTaxPentestServer] Running on http://127.0.0.1:${PORT}`);
    console.log(`[EnergyTaxPentestServer] USER_TOKEN:${token}`);
    console.log(`[EnergyTaxPentestServer] USER_ID:${user.id}`);
  });

  const cleanup = async () => {
    console.log("\n[EnergyTaxPentestServer] Cleaning up test user and shutting down...");
    try {
      await prisma.energyTaxCharge.deleteMany({ where: { userId: user.id } });
      await prisma.zeradsCallback.deleteMany({ where: { userId: user.id } });
      await prisma.transaction.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    } catch {}
    await prisma.$disconnect();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

start().catch((err) => {
  console.error("Failed to start energy tax pentest server:", err);
  process.exit(1);
});
