import test from "node:test";
import assert from "node:assert/strict";

function formatLogDetails(log) {
  const raw = log.detailsJson ?? log.metadata;
  if (raw == null || raw === "") return log.description || "—";
  let val = raw;
  if (typeof raw === "string") {
    try {
      val = JSON.parse(raw);
    } catch {
      val = raw;
    }
  }
  if (typeof val !== "object" || Array.isArray(val)) return String(val);
  const pairs = Object.entries(val)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return pairs.length ? pairs.join(" · ") : log.description || "—";
}

function severityBadge(sev) {
  switch (sev?.toLowerCase()) {
    case "error":
      return "bg-red-500/10 text-red-400 border border-red-500/30";
    case "warn":
      return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
    case "info":
    default:
      return "bg-blue-500/10 text-blue-400 border border-blue-500/30";
  }
}

function sourceBadgeClass(src) {
  switch (src?.toLowerCase()) {
    case "database":
      return "bg-purple-500/10 text-purple-400 border border-purple-500/30";
    case "user":
      return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30";
    case "system":
      return "bg-violet-500/10 text-violet-300 border border-violet-500/30";
    case "client":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
    default:
      return "bg-slate-800 text-slate-300 border border-slate-700";
  }
}

test("AdminLogs Frontend: formatLogDetails formats JSON object correctly", () => {
  const log = {
    detailsJson: JSON.stringify({ amount: 10.5, token: "POL", status: "success" }),
  };
  const result = formatLogDetails(log);
  assert.equal(result, "amount: 10.5 · token: POL · status: success");
});

test("AdminLogs Frontend: formatLogDetails falls back to description or dash", () => {
  assert.equal(formatLogDetails({ description: "Backup completed" }), "Backup completed");
  assert.equal(formatLogDetails({}), "—");
});

test("AdminLogs Frontend: severityBadge maps severities to correct styling", () => {
  assert.ok(severityBadge("error").includes("text-red-400"));
  assert.ok(severityBadge("warn").includes("text-amber-400"));
  assert.ok(severityBadge("info").includes("text-blue-400"));
  assert.ok(severityBadge(null).includes("text-blue-400"));
});

test("AdminLogs Frontend: sourceBadgeClass maps sources to distinct badges", () => {
  assert.ok(sourceBadgeClass("database").includes("text-purple-400"));
  assert.ok(sourceBadgeClass("user").includes("text-cyan-400"));
  assert.ok(sourceBadgeClass("system").includes("text-violet-300"));
  assert.ok(sourceBadgeClass("client").includes("text-emerald-400"));
  assert.ok(sourceBadgeClass("unknown").includes("text-slate-300"));
});
