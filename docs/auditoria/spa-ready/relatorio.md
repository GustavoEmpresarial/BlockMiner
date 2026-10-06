# SPA que nascia em modo API-only

Branch `fix/spa-ready` a partir de `origin/main` @ `75b989b`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-spa-ready`.
O checkout compartilhado não foi trocado.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: `resolveClientDistPaths` em `server/shared/http/spaStatic.ts` gravava `indexExists` com `existsSync` uma vez. `attachClientDistStatic` retornava sem montar o `express.static` quando o booleano era falso. `attachSpaFallback` respondia 503 com esse mesmo booleano. `GET /health` em `server/bootstrap/server.ts` devolve `{ ok: true, service: "blockminer" }` e não olha `client/dist`. O healthcheck do serviço `app` em `docker-compose.yml` chamava `/health`.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: trocar o booleano por uma sonda com cache de `SPA_INDEX_PROBE_TTL_MS` (5000, com leitor `SPA_INDEX_PROBE_TTL_MS`). Montar o static sempre e decidir por requisição. `GET /health/ready` devolve 503 sem o index e 200 com ele. `/health` continua liveness. O healthcheck do `app` em `docker-compose.yml` passa a `/health/ready`. `docker cp` no deploy loga em stderr e não aborta. Teste novo em `tests/http/spaStatic.test.mjs`.
- Pendências: nenhuma
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: `server/shared/http/spaStatic.ts`, `server/bootstrap/server.ts`, `docker-compose.yml`, `storage/scripts/deploy/deploy.py`, `server/core/http/middleware/siteMaintenance.ts`.
- Evidências: a sonda reutiliza o resultado enquanto `now - checkedAt < ttl`. O static e o fallback chamam a sonda. `/health/ready` usa `sendSpaReadiness`. `/health` não mudou. O healthcheck do `app` aponta para `http://127.0.0.1:3000/health/ready`. O `docker cp` que falha imprime `ALERTA` em stderr e o script segue, porque o deploy usa `set -euo pipefail` e o `if !` não aborta. `/health/ready` entrou na allowlist de manutenção, senão `SITE_MAINTENANCE=1` devolvia 503 e o Docker reiniciava um processo que está de pé de propósito.
- Pendências: `docker-compose.staging.yml` linhas 107-112 continuam em `/health`. O arquivo não foi editado. Não há staging nesta VM. Ficou divergente de propósito.
- Commit: `f6335df`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: `tests/http/spaStatic.test.mjs` (3 testes). `tests/core/siteMaintenance.test.mjs` ganhou `/health/ready` na allowlist.
- Evidências: `tsx --test` desses dois arquivos: 13 passaram, 0 falharam. Os 3 novos cobrem o ttl nomeado, o cache que não relê o disco dentro da janela, index ausente com 503, index criado depois com 200 sem reiniciar o processo, `/api/*` em JSON, e `/assets/*` ausente em 404 JSON. A suíte do client, `npx vitest run`: 1094 passaram, 130 arquivos. O número não subiu porque o teste novo é `node:test` na raiz, não vitest do client.
- Pendências: nenhuma
- Commit: `f6335df`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma em `client/`
- Evidências: `cd client && npx vite build` verde, 37.59s. `tsc --noEmit`: 61 erros. Nenhum em arquivo deste lote. Baseline 61.
- Pendências: nenhuma
- Commit: `f6335df`

### Fase 5 — Processo no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma no produto durante a medição. `client/dist` do worktree vazio, sem `index.html`. Servidor `npx tsx server/bootstrap/server.ts` com cwd no worktree, `NODE_ENV=development`, `PORT=3000`, `SITE_MAINTENANCE=0`, Turnstile removido do processo. Banco local `blockminer` em `127.0.0.1`. Nenhuma conta criada. Nenhum token forjado. O `index.html` de laboratório foi apagado ao final e o processo foi encerrado.
- Evidências: antes de criar o arquivo, `GET /` 503 `Frontend build unavailable.`, `GET /health/ready` 503 `{ ok: false, ready: false }`, `GET /health` 200 `{ ok: true, service: "blockminer" }`. O arquivo foi criado com o mesmo processo no ar. `/` e `/health/ready` viraram 200 em 5060 ms, contados da escrita do arquivo. O corpo de `/` foi o HTML escrito. Não houve restart.
- Pendências: nenhuma
- Commit: `f6335df`

### Fase 6 — Carga
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: o endpoint novo é readiness, não uma rota de produto. k6 não foi executado. Não houve chamada a blockminer.space.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 7 — Kali
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: Kali não foi executado. Lab só em localhost.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 8 — Relato
- Estado: VERIFICADO
- Mudanças: este arquivo
- Evidências: fases 0 a 7 acima. Nada publicado. `docker-compose.staging.yml` permanece no `/health` antigo.
- Pendências: o healthcheck de staging, se esse arquivo voltar a ser usado
- Commit: este commit de docs
