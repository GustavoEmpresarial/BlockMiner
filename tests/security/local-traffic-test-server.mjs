import express from "express";
import "../_env-test-overrides.mjs";
import { trafficAdminRouter } from "../../server/modules/traffic/traffic.admin.routes.ts";

const app = express();
app.use(express.json());
app.use("/api/admin", trafficAdminRouter);

const PORT = process.env.PORT || 5142;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[TrafficTestServer] Local Traffic test server listening on http://127.0.0.1:${PORT}`);
});
