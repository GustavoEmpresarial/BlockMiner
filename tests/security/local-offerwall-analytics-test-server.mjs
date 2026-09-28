import express from "express";
import "../_env-test-overrides.mjs";
import { offerwallAdminRouter } from "../../server/modules/offerwall/index.ts";

const app = express();
app.use(express.json());
app.use("/api/admin", offerwallAdminRouter);

const PORT = Number(process.env.PORT || 5125);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[OfferwallAnalyticsSecurityServer] Running on http://127.0.0.1:${PORT}`);
});
