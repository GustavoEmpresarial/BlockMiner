import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import test from "node:test";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function readyGate({ timeoutSec, pollSec, port }) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import importlib.util
spec = importlib.util.spec_from_file_location("deploy", "storage/scripts/deploy/deploy.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod._app_ready_gate("blockminer-current-app", ${port}, ${timeoutSec}, ${pollSec}))
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const MOCK = String.raw`
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys
mode = sys.argv[1]
port = int(sys.argv[2])
hits = {"n": 0}
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        hits["n"] += 1
        ready = mode == "immediate" or (mode == "slow" and hits["n"] >= 3)
        body = b'{"ok":true,"ready":true}' if ready else b'{"ok":false,"ready":false}'
        self.send_response(200 if ready else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, fmt, *args):
        return
HTTPServer(("127.0.0.1", port), Handler).serve_forever()
`;

function startMock(mode, port) {
  const child = spawn("python3", ["-c", MOCK, mode, String(port)], { stdio: "ignore" });
  return child;
}

async function waitForMock(port) {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    const probe = spawnSync("curl", ["-sS", "--max-time", "1", `http://127.0.0.1:${port}/health/ready`], { encoding: "utf8" });
    if (probe.status === 0 || probe.stdout.includes("ready")) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("mock ready server did not start");
}

function runBash(script) {
  return spawnSync("bash", ["-c", script], { encoding: "utf8" });
}

test("ready true on the first probe finishes and prints the elapsed seconds", async () => {
  const port = await freePort();
  const mock = startMock("immediate", port);
  try {
    await waitForMock(port);
    const script = `set -euo pipefail
docker() { echo running; }
${readyGate({ timeoutSec: 5, pollSec: 1, port })}
`;
    const result = runBash(script);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\/health\/ready true em \d+s/);
    assert.equal(result.stderr.includes("revertido"), false);
  } finally {
    mock.kill();
  }
});

test("ready stays false and then becomes true", async () => {
  const port = await freePort();
  const mock = startMock("slow", port);
  try {
    await waitForMock(port);
    const script = `set -euo pipefail
docker() { echo running; }
${readyGate({ timeoutSec: 10, pollSec: 1, port })}
`;
    const result = runBash(script);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\/health\/ready true em \d+s/);
  } finally {
    mock.kill();
  }
});

test("ready never becomes true fails without rolling back", async () => {
  const port = await freePort();
  const mock = startMock("never", port);
  try {
    await waitForMock(port);
    const script = `set -euo pipefail
docker() { echo running; }
${readyGate({ timeoutSec: 2, pollSec: 1, port })}
`;
    const result = runBash(script);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ALERTA: \/health\/ready nao ficou true em 2s/);
    assert.match(result.stderr, /O deploy NAO foi revertido/);
    assert.match(result.stderr, /docker inspect/);
    assert.match(result.stderr, /\/health\/ready/);
    assert.match(result.stderr, /docker logs --tail 200/);
    assert.equal(result.stderr.includes("git reset"), false);
  } finally {
    mock.kill();
  }
});

test("a container left created fails before waiting for ready", async () => {
  const port = await freePort();
  const script = `set -euo pipefail
docker() { echo created; }
${readyGate({ timeoutSec: 30, pollSec: 5, port })}
`;
  const started = Date.now();
  const result = runBash(script);
  assert.ok(Date.now() - started < 5000);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /estado: created/);
  assert.match(result.stderr, /O deploy NAO foi revertido/);
  assert.match(result.stderr, /docker logs --tail 200/);
});
