import express from "express";
import "../_env-test-overrides.mjs";
import { tournamentsRouter, tournamentsAdminRouter } from "../../server/modules/tournaments/index.js";

const app = express();
app.use(express.json());
app.use("/api/tournaments", tournamentsRouter);
app.use("/api/admin/tournaments", tournamentsAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5108;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[PentestServer] Tournaments server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
