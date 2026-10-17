/**
 * Deploy must never swap the dist/ or client/dist/ directories the running app has bind-mounted
 * (that took the site down ~10 min per deploy). These tests run the generated shell snippets
 * against a temp APP_ROOT and check directory inodes, contents and step order.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function py(expr) {
  const r = spawnSync(
    "python3",
    [
      "-c",
      `
import importlib.util
spec = importlib.util.spec_from_file_location("deploy", "storage/scripts/deploy/deploy.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(${expr})
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function sh(script, env) {
  const r = spawnSync("bash", ["-euo", "pipefail", "-c", script], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return r.stdout;
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const ino = (p) => fs.statSync(p).ino;

test("install copies the fresh build into the live directories without replacing them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bm-deploy-"));
  try {
    write(`${root}/dist/server/bootstrap/server.js`, "old server");
    write(`${root}/dist/server/old-only.js`, "kept");
    write(`${root}/client/dist/index.html`, "<script src=/assets/old.js>");
    write(`${root}/client/dist/assets/old.js`, "old chunk");
    write(`${root}/.build-next/dist/server/bootstrap/server.js`, "new server");
    write(`${root}/client/dist.next/index.html`, "<script src=/assets/new.js>");
    write(`${root}/client/dist.next/assets/new.js`, "new chunk");
    const distIno = ino(`${root}/dist`);
    const clientIno = ino(`${root}/client/dist`);

    const out = sh(py("mod._install_built_artifacts()"), { APP_ROOT: root });

    assert.equal(ino(`${root}/dist`), distIno, "dist/ is the same directory (bind mount stays valid)");
    assert.equal(ino(`${root}/client/dist`), clientIno, "client/dist/ is the same directory");
    assert.equal(fs.readFileSync(`${root}/dist/server/bootstrap/server.js`, "utf8"), "new server");
    assert.equal(fs.readFileSync(`${root}/client/dist/index.html`, "utf8"), "<script src=/assets/new.js>");
    assert.equal(fs.readFileSync(`${root}/client/dist/assets/new.js`, "utf8"), "new chunk");
    assert.equal(fs.existsSync(`${root}/.build-next`), false, "staging dirs cleaned");
    assert.equal(fs.existsSync(`${root}/client/dist.next`), false);
    assert.match(out, /server dist installed in place/);
    assert.match(out, /client dist installed in place/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("install is a no-op when nothing was built (SKIP_*_BUILD or a failed build)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bm-deploy-"));
  try {
    write(`${root}/dist/server/bootstrap/server.js`, "old server");
    write(`${root}/client/dist/index.html`, "old index");
    sh(py("mod._install_built_artifacts()"), { APP_ROOT: root });
    assert.equal(fs.readFileSync(`${root}/dist/server/bootstrap/server.js`, "utf8"), "old server");
    assert.equal(fs.readFileSync(`${root}/client/dist/index.html`, "utf8"), "old index");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("restore never replaces a dist that is still in place, and restores one that is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bm-deploy-"));
  const keep = fs.mkdtempSync(path.join(os.tmpdir(), "bm-keep-"));
  try {
    write(`${root}/dist/a.js`, "live");
    write(`${keep}/dist/a.js`, "preserved copy");
    write(`${keep}/client/dist/index.html`, "preserved index");
    const distIno = ino(`${root}/dist`);
    sh(py("mod._restore_runtime_artifacts()"), { APP_ROOT: root, BM_KEEP: keep });
    assert.equal(ino(`${root}/dist`), distIno, "live dist untouched");
    assert.equal(fs.readFileSync(`${root}/dist/a.js`, "utf8"), "live");
    assert.equal(fs.readFileSync(`${root}/client/dist/index.html`, "utf8"), "preserved index", "missing client/dist restored");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(keep, { recursive: true, force: true });
  }
});

test("prod stack: image built from the fresh dirs, live dirs installed after migrate and right before recreate", () => {
  const script = py('mod._docker_stack("docker-compose.yml", 5102, "blockminer-current-app")');
  const build = script.indexOf("compose build");
  const migrate = script.indexOf("prisma migrate deploy");
  const install = script.indexOf("server dist installed in place");
  const recreate = script.indexOf("up -d --force-recreate --no-deps app");
  assert.ok(build > 0 && migrate > build && install > migrate && recreate > install, "build → migrate → install → recreate");
  assert.match(script, /--build-arg SERVER_DIST=\.build-next\/dist/);
  assert.match(script, /--build-arg CLIENT_DIST=client\/dist\.next/);
  const syntax = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("the full remote script never removes or moves the live client/dist or dist", () => {
  const script = py('mod._remote_git_script("/root/blockminer-current", "https://github.com/x/y.git", "main", compose_file="docker-compose.yml", container_app="blockminer-current-app", health_port=5102)');
  assert.equal(/rm -rf "\$APP_ROOT\/client\/dist"(\s|$)/m.test(script), false);
  assert.equal(/rm -rf "\$APP_ROOT\/dist"(\s|$)/m.test(script), false);
  assert.equal(script.includes('mv "$APP_ROOT/client/dist.next" "$APP_ROOT/client/dist"'), false);
  const syntax = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("Dockerfile defaults keep the old COPY paths when no build args are passed", () => {
  const df = fs.readFileSync("Dockerfile", "utf8");
  assert.match(df, /ARG CLIENT_DIST=client\/dist\nWORKDIR \/app\/client\nCOPY \$\{CLIENT_DIST\} \.\/dist/);
  assert.match(df, /ARG SERVER_DIST=dist\nWORKDIR \/app\nCOPY \$\{SERVER_DIST\} \.\/dist/);
});
