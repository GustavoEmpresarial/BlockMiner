import express from "express";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { minersAdminRouter } from "../../server/modules/machines/miners.admin.routes.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/admin", minersAdminRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5134;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Miners test server listening on http://127.0.0.1:${PORT}`);
});
