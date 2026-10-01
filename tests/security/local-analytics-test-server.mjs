import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { analyticsAdminRouter } from "../../server/modules/analytics/analytics.admin.routes.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/admin", analyticsAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5143;
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`[LocalSecurityServer] Analytics test server listening on http://127.0.0.1:${PORT}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
