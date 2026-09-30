import express from "express";
import "../_env-test-overrides.mjs";
import { fraudSignalsAdminRouter } from "../../server/modules/admin/admin.fraud-signals.routes.ts";

const app = express();
app.use(express.json());
app.use("/api/admin/fraud-signals", fraudSignalsAdminRouter);

const PORT = process.env.PORT || 5130;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[FraudSignalsTestServer] Local Fraud Signals test server listening on http://127.0.0.1:${PORT}`);
});
