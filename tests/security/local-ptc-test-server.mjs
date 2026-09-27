import express from "express";
import "../_env-test-overrides.mjs";
import { ptcRouter, ptcAdminRouter } from "../../server/modules/ptc/index.ts";

const app = express();
app.use(express.json());
app.use("/api/ptc", ptcRouter);
app.use("/api/admin", ptcAdminRouter);

const PORT = Number(process.env.PORT || 5121);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PtcSecurityServer] Running on http://127.0.0.1:${PORT}`);
});
