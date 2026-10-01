import express from "express";
import "../_env-test-overrides.mjs";
import { adminRouter } from "../../server/modules/admin/admin.routes.ts";

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);

const PORT = process.env.PORT || 5137;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[MetricsTestServer] Local Metrics test server listening on http://127.0.0.1:${PORT}`);
});
