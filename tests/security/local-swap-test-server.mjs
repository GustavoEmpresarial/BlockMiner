import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import prisma from "../../server/core/database/prisma.ts";
import { swapRouter } from "../../server/modules/swap/index.ts";
import { signAccessToken } from "../../server/shared/security/authTokens.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/swap", swapRouter);

const PORT = 5117;

async function start() {
  const suffix = `pentest_swap_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      name: "Kali Swap Pentest User",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      polBalance: 50,
      shibBalance: 1000000,
      blkBalance: 10,
    },
  });

  const token = signAccessToken({ id: user.id, name: user.name, email: user.email });

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[SwapPentestServer] Running on http://127.0.0.1:${PORT}`);
    console.log(`[SwapPentestServer] USER_TOKEN:${token}`);
    console.log(`[SwapPentestServer] USER_ID:${user.id}`);
  });

  const cleanup = async () => {
    console.log("\n[SwapPentestServer] Cleaning up test user and shutting down...");
    try {
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
  console.error("Failed to start pentest server:", err);
  process.exit(1);
});
