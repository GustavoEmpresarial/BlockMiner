import express from "express";
import "../_env-test-overrides.mjs";
import { supportRouter } from "../../server/modules/support/support.routes.ts";
import { supportAdminRouter } from "../../server/modules/support/support.admin.routes.ts";
import { supportPublicRouter } from "../../server/modules/support/support.public.routes.ts";

const app = express();
app.use(express.json());

app.use("/api/support", supportRouter);
app.use("/api/public-support", supportPublicRouter);
app.use("/api/admin", supportAdminRouter);

const PORT = process.env.PORT || 5122;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[SupportTestServer] Local Support test server listening on http://127.0.0.1:${PORT}`);
});
