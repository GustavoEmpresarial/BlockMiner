import { spawn } from "node:child_process";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { transparencyRouter } from "../../server/modules/transparency/transparency.routes.ts";
import { transparencyAdminRouter } from "../../server/modules/transparency/transparency.admin.routes.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/transparency", transparencyRouter);
app.use("/api/admin", transparencyAdminRouter);

const PORT = 5136;
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`[LoadTest] Local Transparency Investments test server running on http://127.0.0.1:${PORT}`);
  runK6();
});

function runK6() {
  const jwtSecret = process.env.JWT_SECRET || "default_test_secret_for_local_ci";
  const adminToken = jwt.sign(
    { role: "admin", type: "admin_session", permissions: ["*"] },
    jwtSecret,
    { issuer: "blockminer-admin", algorithm: "HS256", expiresIn: "1h" },
  );

  console.log("[LoadTest] Spawning k6 against local Transparency server...");

  const k6 = spawn(
    "k6",
    ["run", "tests/performance/admin-transparency-investments-load.k6.js"],
    {
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${PORT}`,
        ADMIN_TOKEN: adminToken,
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
