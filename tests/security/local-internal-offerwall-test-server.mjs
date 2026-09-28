import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { internalOfferwallRouter, internalOfferwallAdminRouter } from "../../server/modules/internal-offerwall/index.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/internal-offerwall", internalOfferwallRouter);
app.use("/api/admin", internalOfferwallAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5127;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Internal Offerwall test server listening on http://127.0.0.1:${PORT}`);
});
