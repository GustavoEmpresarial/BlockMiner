import { spawn } from "node:child_process";
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

const PORT = 5118;
let testUserId = null;

async function setupTestUser() {
  const suffix = `k6_etax_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      name: "k6 Energy Tax Runner",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      polBalance: 500,
      shibBalance: 1000000,
      blkBalance: 100,
    },
  });
  testUserId = user.id;

  // Seed yesterday's mining rewards so there is a taxable base
  const now = new Date();
  const taxedDay = energyTaxService.lastClosedMiningPeriodStart(now);
  await prisma.zeradsCallback.create({
    data: {
      userId: user.id,
      username: user.username,
      amountZer: 50,
      exchangeRate: 1,
      payoutAmount: 2.0, // 2 POL rewards yesterday
      clicks: 1,
      callbackHash: `k6_cb_${Date.now()}_${Math.random()}`,
      callbackAt: new Date(taxedDay.getTime() + 3600 * 1000),
    },
  });

  const token = signAccessToken({ id: user.id, name: user.name, email: user.email });
  return token;
}

const server = app.listen(PORT, "127.0.0.1", async () => {
  console.log(`[LoadTest] Local energy-tax test server running on http://127.0.0.1:${PORT}`);
  try {
    const userToken = await setupTestUser();
    runK6(userToken);
  } catch (err) {
    console.error("[LoadTest] Setup failed:", err);
    server.close(() => process.exit(1));
  }
});

function runK6(userToken) {
  console.log("[LoadTest] Spawning /home/gustavo/.local/bin/k6 against local test server...");

  const k6Bin = "/home/gustavo/.local/bin/k6";
  const k6 = spawn(
    k6Bin,
    ["run", "tests/load/energy-tax-load.k6.js"],
    {
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${PORT}`,
        USER_TOKEN: userToken,
        VUS: "10",
      },
      stdio: "inherit",
    },
  );

  k6.on("close", async (code) => {
    console.log(`[LoadTest] k6 finished with exit code ${code}`);
    if (testUserId) {
      try {
        await prisma.energyTaxCharge.deleteMany({ where: { userId: testUserId } });
        await prisma.zeradsCallback.deleteMany({ where: { userId: testUserId } });
        await prisma.transaction.deleteMany({ where: { userId: testUserId } });
        await prisma.user.delete({ where: { id: testUserId } });
        console.log("[LoadTest] Cleaned up test user.");
      } catch (e) {
        console.error("[LoadTest] Cleanup error:", e);
      }
    }
    await prisma.$disconnect();
    server.close(() => {
      console.log("[LoadTest] Local server closed.");
      process.exit(code);
    });
  });
}
