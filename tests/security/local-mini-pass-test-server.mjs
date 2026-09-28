import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { miniPassRouter, miniPassAdminRouter } from "../../server/modules/mini-pass/index.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/mini-pass", miniPassRouter);
app.use("/api/admin", miniPassAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5133;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Mini Pass test server listening on http://127.0.0.1:${PORT}`);
});
