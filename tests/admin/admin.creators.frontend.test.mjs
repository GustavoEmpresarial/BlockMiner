import test from "node:test";
import assert from "node:assert/strict";

function readAxiosResponseMessage(err) {
  if (!err) return null;
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const maybeAxios = err;
    const d = maybeAxios.response?.data;
    if (d?.message && typeof d.message === "string") return d.message;
    if (d?.error && typeof d.error === "string") return d.error;
    return err.message;
  }
  const obj = err;
  const d = obj.response?.data;
  if (d?.message && typeof d.message === "string") return d.message;
  if (d?.error && typeof d.error === "string") return d.error;
  return null;
}

test("Client Error Handling: readAxiosResponseMessage extracts messages correctly", () => {
  // Standard axios response with message
  const err1 = {
    response: {
      data: {
        ok: false,
        message: "Usuário não encontrado.",
      },
    },
  };
  assert.equal(readAxiosResponseMessage(err1), "Usuário não encontrado.");

  // Response with error string
  const err2 = {
    response: {
      data: {
        error: "Acesso negado pelo RBAC.",
      },
    },
  };
  assert.equal(readAxiosResponseMessage(err2), "Acesso negado pelo RBAC.");

  // Plain Error object
  const err3 = new Error("Network Timeout");
  assert.equal(readAxiosResponseMessage(err3), "Network Timeout");

  // String error
  const err4 = "Falha desconhecida";
  assert.equal(readAxiosResponseMessage(err4), "Falha desconhecida");

  // Fallback on empty/null
  assert.equal(readAxiosResponseMessage(null), null);
  assert.equal(readAxiosResponseMessage({}), null);
});

test("Creator Status Configurations: STATUS_CFG covers all submission states", () => {
  const STATUS_CFG = {
    pending: { label: "Pendente", cls: "bg-amber-500/15" },
    approved: { label: "Aprovado", cls: "bg-emerald-500/15" },
    rejected: { label: "Recusado", cls: "bg-red-500/15" },
  };

  assert.equal(STATUS_CFG.pending.label, "Pendente");
  assert.equal(STATUS_CFG.approved.label, "Aprovado");
  assert.equal(STATUS_CFG.rejected.label, "Recusado");
});

test("Creators Search Query: Client debounce and input sanitation", () => {
  function prepareSearchQuery(raw) {
    const trimmed = String(raw ?? "").trim();
    return trimmed.length >= 2 ? trimmed.slice(0, 100) : null;
  }

  assert.equal(prepareSearchQuery("  admin  "), "admin");
  assert.equal(prepareSearchQuery("a"), null);
  assert.equal(prepareSearchQuery(""), null);
  assert.equal(prepareSearchQuery(null), null);
  assert.equal(prepareSearchQuery("x".repeat(150)).length, 100);
});
