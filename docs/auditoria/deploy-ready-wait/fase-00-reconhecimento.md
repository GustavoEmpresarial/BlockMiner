# Fase 0 — Reconhecimento: deploy declara sucesso com o app parado

**Data**: 07/10/2026
**Branch**: `feature/deploy-health-ready`
**Base**: `4c777427021a22169896c20fdbd582275b7e9f30`
**Worktree**: `/home/gustavo/Documentos/BlockMiner2.1/deploy-health-ready`

Sem deploy. Sem SSH na VM.

## O que o script fazia

`storage/scripts/deploy/deploy.py`, dentro de `_docker_stack`, recria o app e em seguida:

`curl -sS -o /dev/null -w "health:%{http_code}" http://127.0.0.1:{porta}/health || true`

O `|| true` engole qualquer falha. `compose up -d` pode devolver zero com o container em `created`. O Nginx então serve a manutenção estática.

`/health` é liveness e responde 200 sem o SPA. `/health/ready` é quem devolve `ready: true` só com `client/dist/index.html`. O processo só escuta depois de `bootstrapEngine()`, que sincroniza os usuários no motor.

## Bootstrap medido

Banco local em `127.0.0.1`, não o data tier de produção. 3036 usuários não banidos, todos com `refCode`. Concorrência 12.

- continuidade de bloco: 489 ms
- `getOrCreateMinerProfile` de cada um: 3783 ms
- soma: 4272 ms

## Comandos

Raiz: `test` = `tsx --import ./tests/_env-test-overrides.mjs --test ... tests/**/*.test.mjs`. `typecheck` = `tsc --noEmit -p tsconfig.json`. `build` = `tsc -p tsconfig.json`.

Já existe `tests/deploy/deploy-migrate-order.test.mjs`.

## V2.50

- Fase: 0
- Estado: VERIFICADO
- Mudanças: worktree e branch. Nenhum arquivo de produto.
- Evidências: `git rev-parse` = `4c77742`. Medição do bootstrap no banco local, 4272 ms.
- Pendências: fases 1 a 8.
- Commit: doc desta fase.
