import { spawn } from "node:child_process";
import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import prisma from "../../server/core/database/prisma.ts";
import { signAccessToken } from "../../server/shared/security/authTokens.ts";
import { walletRouter } from "../../server/modules/wallet/index.js";
import { miningRouter } from "../../server/modules/mining/index.js";
import { roomsRouter } from "../../server/modules/rooms/index.js";
import { bannersRouter } from "../../server/modules/banners/index.js";
import { energyTaxRouter } from "../../server/modules/energy-tax/index.js";

const app = express();
app.use(express.json());
app.use(cookieParser());

// Mount the real routes consumed by the dashboard
app.use("/api/wallet", walletRouter);
app.use("/api/mining", miningRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/banners", bannersRouter);
app.use("/api/energy-tax", energyTaxRouter);

const PORT = 5137;
let testUserId = null;

async function setupTestUser() {
  let user = await prisma.user.findFirst({
    where: { email: { contains: "loadtest" } },
  });

  if (!user) {
    const suffix = `k6_dash_${Date.now()}`;
    user = await prisma.user.create({
      data: {
        name: "k6 Dashboard Runner",
        username: suffix,
        email: `${suffix}@blockminer.test`,
        passwordHash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        polBalance: 125.5,
        shibBalance: 500000,
        blkBalance: 1500,
      },
    });
  }

  testUserId = user.id;
  const token = signAccessToken({ id: user.id, name: user.name, email: user.email });
  return token;
}

const server = app.listen(PORT, "127.0.0.1", async () => {
  console.log(`[LoadTest] Local dashboard test server running on http://127.0.0.1:${PORT}`);
  try {
    const userToken = await setupTestUser();
    runK6(userToken);
  } catch (err) {
    console.error("[LoadTest] Setup failed:", err);
    server.close(() => process.exit(1));
  }
});

function runK6(token) {
  const k6Bin = "/home/gustavo/.local/bin/k6";
  console.log(`[LoadTest] Spawning ${k6Bin} with 10 VUs for 15s against http://127.0.0.1:${PORT}...`);

  const k6 = spawn(
    k6Bin,
    ["run", "tests/performance/dashboard.k6.js"],
    {
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${PORT}`,
        AUTH_TOKEN: token,
        VUS: "3",
        DURATION: "15s",
      },
      stdio: "inherit",
    },
  );

  k6.on("close", (code) => {
    console.log(`[LoadTest] k6 finished with exit code ${code}`);
    server.close(() => {
      console.log("[LoadTest] Local test server closed.");
      process.exit(code);
    });
  });
}
