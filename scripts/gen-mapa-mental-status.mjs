#!/usr/bin/env node
/**
 * Gera current/docs/mapa-mental.status.json a partir do filesystem real de
 * current/server/ — nada de manter badge ✅/⚪ na mão em toda fase.
 *
 * Uso: node scripts/gen-mapa-mental-status.mjs   (rodar de dentro de current/)
 *
 * O mapa-mental.html tenta buscar esse JSON via fetch ao carregar (só funciona
 * servido por http, não em file://) e aplica os badges "IMPLEMENTADO" em cima
 * da árvore estática, sem precisar de edição manual do HTML a cada módulo
 * novo. Rode este script sempre que uma fase terminar.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const currentRoot = join(__dirname, "..");
const modulesDir = join(currentRoot, "server", "modules");
const cronDir = join(currentRoot, "server", "cron");
const workersDir = join(currentRoot, "server", "workers");

function listDirs(path) {
  try {
    return readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory());
  } catch {
    return [];
  }
}

function listFiles(path) {
  try {
    return readdirSync(path).filter((name) => statSync(join(path, name)).isFile());
  } catch {
    return [];
  }
}

const implementedModules = listDirs(modulesDir).sort();
const implementedCron = listFiles(cronDir)
  .filter((f) => f.endsWith(".cron.ts"))
  .sort();
const implementedWorkers = listFiles(workersDir)
  .filter((f) => f.endsWith(".worker.ts"))
  .sort();

// Sub-módulos com pasta própria (ex: machines/racks/) — o mind-map também
// aplica badge nesses, então listamos separadamente.
const subModules = [];
for (const mod of implementedModules) {
  for (const sub of listDirs(join(modulesDir, mod))) {
    subModules.push(sub);
  }
}

const status = {
  generatedAt: new Date().toISOString(),
  generatedBy: "scripts/gen-mapa-mental-status.mjs",
  implementedModules: [...implementedModules, ...subModules].sort(),
  implementedCron,
  implementedWorkers,
};

const outPath = join(currentRoot, "docs", "mapa-mental.status.json");
writeFileSync(outPath, JSON.stringify(status, null, 2) + "\n");
console.log(`✅ ${outPath}`);
console.log(`   módulos: ${implementedModules.join(", ") || "(nenhum)"}`);
if (subModules.length) console.log(`   sub-módulos: ${subModules.join(", ")}`);
console.log(`   cron: ${implementedCron.join(", ") || "(nenhum)"}`);
