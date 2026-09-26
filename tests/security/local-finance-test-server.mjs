import express from "express";
import "../_env-test-overrides.mjs";
import { walletAdminRouter } from "../../server/modules/wallet/wallet.admin.routes.ts";

const app = express();
app.use(express.json());
app.use("/api/admin", walletAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5118;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PentestServer] Local finance server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
