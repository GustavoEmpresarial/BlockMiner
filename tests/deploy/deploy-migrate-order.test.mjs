import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function stack(composeFile, healthPort) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import importlib.util
spec = importlib.util.spec_from_file_location("deploy", "storage/scripts/deploy/deploy.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod._docker_stack(${JSON.stringify(composeFile)}, ${healthPort}))
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function assertOrder(script, { startsDb }) {
  const migrate = script.indexOf("prisma migrate deploy");
  const recreate = script.indexOf("up -d --force-recreate --no-deps app");
  assert.ok(migrate > 0);
  assert.ok(recreate > migrate);
  assert.equal(script.includes("migrate deploy --schema=prisma/schema.prisma || true"), false);
  assert.equal(script.includes("compose exec -T app npx prisma migrate deploy"), false);
  assert.match(script, /compose run --rm --no-deps --entrypoint npx app prisma migrate deploy/);
  assert.match(script, /exit 1/);
  assert.equal(script.includes("\ncompose up -d db\n"), startsDb);
  const syntax = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
}

test("prod migrates before recreate and does not start the local-db profile", () => {
  assertOrder(stack("docker-compose.yml", 5102), { startsDb: false });
});

test("staging starts its db service before the same migrate step", () => {
  assertOrder(stack("docker-compose.staging.yml", 3001), { startsDb: true });
});
