import express from "express";
import "../_env-test-overrides.mjs";
import { tasksRouter, tasksAdminRouter } from "../../server/modules/tasks/index.ts";

const app = express();
app.use(express.json());
app.use("/api/daily-tasks", tasksRouter);
app.use("/api/admin", tasksAdminRouter);

const PORT = Number(process.env.PORT || 5123);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`[TasksSecurityServer] Running on http://127.0.0.1:${PORT}`);
});
