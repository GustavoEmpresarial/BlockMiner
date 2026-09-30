import express from "express";
import "../_env-test-overrides.mjs";
import { sidebarNavRouter } from "../../server/modules/sidebar-nav/sidebar-nav.routes.ts";
import { sidebarNavAdminRouter } from "../../server/modules/sidebar-nav/sidebar-nav.admin.routes.ts";
import { requireVisibleSidebarPath } from "../../server/modules/sidebar-nav/sidebar-nav.gate.ts";

const app = express();
app.use(express.json());

app.use("/api/sidebar", sidebarNavRouter);
app.use("/api/admin", sidebarNavAdminRouter);

// Mount a dummy gated test route to verify the kill switch directly
app.get("/api/test-gate/faucet", requireVisibleSidebarPath("/faucet"), (_req, res) => {
  res.json({ ok: true, message: "faucet feature is active" });
});

const PORT = process.env.PORT || 5119;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PentestServer] Local Sidebar Nav test server listening on http://127.0.0.1:${PORT}`);
});
