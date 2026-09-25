import express from "express";
import "../_env-test-overrides.mjs";
import { bannersRouter, bannersAdminRouter } from "../../server/modules/banners/index.js";

const app = express();
app.use(express.json());
app.use("/api/banners", bannersRouter);
app.use("/api/admin", bannersAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5106;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PentestServer] Running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
