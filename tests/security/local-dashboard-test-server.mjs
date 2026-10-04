import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { walletRouter } from "../../server/modules/wallet/index.js";
import { miningRouter } from "../../server/modules/mining/index.js";
import { roomsRouter } from "../../server/modules/rooms/index.js";
import { bannersRouter } from "../../server/modules/banners/index.js";
import { energyTaxRouter } from "../../server/modules/energy-tax/index.js";
import { userRouter } from "../../server/modules/users/index.js";

const app = express();
app.use(express.json());
app.use(cookieParser());

// Mount routes consumed by dashboard feature
app.use("/api/wallet", walletRouter);
app.use("/api/mining", miningRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/banners", bannersRouter);
app.use("/api/energy-tax", energyTaxRouter);
app.use("/api/user", userRouter);

const PORT = process.env.PORT || 5138;
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`[DashboardSecurity] Local test server running on http://127.0.0.1:${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
