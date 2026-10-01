import express from "express";
import "../_env-test-overrides.mjs";
import { usersAdminRouter } from "../../server/modules/users/users.admin.routes.ts";

const app = express();
app.use(express.json());
app.use("/api/admin", usersAdminRouter);

const PORT = process.env.PORT || 5133;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[UsersTestServer] Local Users test server listening on http://127.0.0.1:${PORT}`);
});
