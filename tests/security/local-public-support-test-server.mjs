import express from "express";
import "../_env-test-overrides.mjs";
import { supportPublicRouter } from "../../server/modules/support/support.public.routes.ts";
import { supportAdminRouter } from "../../server/modules/support/support.admin.routes.ts";

const app = express();
app.use(express.json());

app.use("/api/public-support", supportPublicRouter);
app.use("/api/admin", supportAdminRouter);

const PORT = process.env.PORT || 5120;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Public Support test server listening on http://127.0.0.1:${PORT}`);
});
