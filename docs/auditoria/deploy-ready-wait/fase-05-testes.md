# Fase 5 — Testes

`tests/deploy/deploy-migrate-order.test.mjs` continua exigindo a migration antes do recreate, sem `|| true` nela, e agora também exige `/health/ready` e a ausência de `/health || true`. `bash -n` aceita o script gerado.

`tests/deploy/deploy-ready-wait.test.mjs` roda o bash gerado contra um HTTP local:

- a primeira resposta já tem `ready: true`: exit 0 e imprime os segundos
- as duas primeiras são `ready: false` e a terceira é true: exit 0
- nunca fica true, timeout de 2s: exit diferente de zero, ALERTA, "NAO foi revertido", e os três comandos para olhar
- `docker inspect` devolve `created`: falha na hora, sem esperar o timeout

O mock roda em outro processo. O `spawnSync` do teste bloqueia o event loop do Node, então um servidor HTTP no mesmo processo não atenderia o curl.

## O que não foi testado

Não houve SSH, não houve `docker compose` na VM, não houve container real em `created`, não houve bootstrap de produção. O Postgres remoto da VM não foi medido. O número de 4272 ms é o banco local.

## V2.50

- Fase: 5
- Estado: VERIFICADO
- Mudanças: o teste novo e o assert no teste da migration.
- Evidências: `node --test tests/deploy/*.test.mjs` — 6 passaram, 0 falharam.
- Pendências: o fluxo da VM.
- Commit: testes e este doc.
