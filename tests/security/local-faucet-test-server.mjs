import express from "express";
import "../_env-test-overrides.mjs";
import { faucetRouter, faucetAdminRouter } from "../../server/modules/faucet/index.ts";

const app = express();
app.use(express.json());
app.use("/api/faucet", faucetRouter);
app.use("/api/admin", faucetAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5116;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PentestServer] Local faucet server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
