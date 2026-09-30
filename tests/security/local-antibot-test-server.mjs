import express from "express";
import "../_env-test-overrides.mjs";
import { antibotRouter, antibotAdminRouter } from "../../server/modules/antibot/antibot.routes.ts";

const app = express();
app.use(express.json());

app.use("/api/antibot", antibotRouter);
app.use("/api/admin/antibot", antibotAdminRouter);

const PORT = process.env.PORT || 5127;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[AntibotTestServer] Local Antibot test server listening on http://127.0.0.1:${PORT}`);
});
