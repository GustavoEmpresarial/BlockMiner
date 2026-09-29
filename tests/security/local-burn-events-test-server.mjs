import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { burnEventsAdminRouter } from "../../server/modules/burn-events/burn-events.admin.routes.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/admin/burn-events", burnEventsAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5135;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Burn Events test server listening on http://127.0.0.1:${PORT}`);
});
