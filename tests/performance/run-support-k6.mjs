import { spawn } from "node:child_process";
import express from "express";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { supportRouter } from "../../server/modules/support/support.routes.ts";
import { supportAdminRouter } from "../../server/modules/support/support.admin.routes.ts";

const app = express();
app.use(express.json());
app.use("/api/support", supportRouter);
app.use("/api/admin", supportAdminRouter);

const PORT = 5124;
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`[LoadTest] Local support test server running on http://127.0.0.1:${PORT}`);
  runK6();
});

function runK6() {
  const jwtSecret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const adminToken = jwt.sign(
    { role: "admin", type: "admin_session", permissions: ["*"] },
    jwtSecret,
    { issuer: "blockminer-admin", algorithm: "HS256", expiresIn: "1h" },
  );

  const userToken = jwt.sign(
    { sub: "1", type: "access_token", sessionVersion: 1 },
    jwtSecret,
    { algorithm: "HS256", expiresIn: "1h" },
  );

  console.log("[LoadTest] Spawning k6 against local test server...");

  const k6 = spawn(
    "/home/gustavo/.local/bin/k6",
    ["run", "tests/performance/admin-support-load.k6.js"],
    {
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${PORT}`,
        ADMIN_TOKEN: adminToken,
        USER_TOKEN: userToken,
        VUS: "15",
      },
      stdio: "inherit",
    },
  );

  k6.on("close", (code) => {
    console.log(`[LoadTest] k6 finished with exit code ${code}`);
    server.close(() => {
      console.log("[LoadTest] Local server closed.");
      process.exit(code);
    });
  });
}
