import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { transparencyRouter } from "../../server/modules/transparency/transparency.routes.ts";
import { transparencyAdminRouter } from "../../server/modules/transparency/transparency.admin.routes.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/transparency", transparencyRouter);
app.use("/api/admin", transparencyAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5136;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Transparency test server listening on http://127.0.0.1:${PORT}`);
});
