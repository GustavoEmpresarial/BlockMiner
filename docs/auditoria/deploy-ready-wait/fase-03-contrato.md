# Fase 3 — Contrato do script

Depois de `compose up -d --force-recreate --no-deps app`:

1. `docker inspect` precisa responder `running`. `created`, `exited` ou `missing` abortam com exit diferente de zero.
2. Enquanto estiver `running`, o script consulta `http://127.0.0.1:{porta}/health/ready` a cada 2s, com `curl --max-time 5`.
3. Corpo com `"ready": true` (espaço opcional) segue e imprime os segundos.
4. Se o container sair de `running` no meio, ou se passarem 180s sem ready, o script escreve ALERTA no stderr com três comandos para olhar (`docker inspect`, `curl` do ready, `docker logs --tail 200`) e sai 1. Não faz reset, checkout nem rollback.

180s é 42 vezes os 4272 ms medidos no banco local (3036 usuários, concorrência 12). Esse banco é local. A VM fala com o Postgres remoto; esse RTT não foi medido daqui. 180s também é o `stop_grace_period` que o compose já usa para este processo.

A migration continua antes do recreate, sem `|| true`.

## V2.50

- Fase: 3
- Estado: EM_IMPLEMENTACAO até o commit do `deploy.py`.
- Mudanças: `_app_ready_gate` e a troca da linha do curl.
- Evidências: constantes `APP_READY_TIMEOUT_SEC = 180`, `APP_READY_POLL_SEC = 2`.
- Pendências: testes da fase 5.
- Commit: `deploy.py` e este doc.
