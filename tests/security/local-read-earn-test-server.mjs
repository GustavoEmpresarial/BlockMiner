import express from "express";
import "../_env-test-overrides.mjs";
import { readEarnRouter, readEarnAdminRouter } from "../../server/modules/read-earn/index.ts";

const app = express();
app.use(express.json());
app.use("/api/read-earn", readEarnRouter);
app.use("/api/admin", readEarnAdminRouter);

const PORT = Number(process.env.PORT || 5119);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[ReadEarnSecurityServer] Running on http://127.0.0.1:${PORT}`);
});
