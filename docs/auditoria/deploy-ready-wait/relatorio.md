# Relatório — o deploy não pode declarar sucesso com o app parado

Data: 07/10/2026. Branch `feature/deploy-health-ready`. Base `4c77742`. Sem deploy. Sem push.

## Achado

Crítico, corrigido: `compose up -d --force-recreate --no-deps app` pode terminar em zero com o container em `created`. O curl seguinte usava `|| true` em `/health`, então o script seguia. O Nginx servia a manutenção. O site ficou fora cerca de 10 minutos e o deploy apareceu como sucesso.

## Correção

`_app_ready_gate` em `storage/scripts/deploy/deploy.py`:

- exige estado `running` antes de seguir
- espera `GET /health/ready` até `ready: true`, no máximo 180s, a cada 2s
- se estourar, ou se o container sair de `running`, escreve ALERTA no stderr com `docker inspect`, o curl do ready e `docker logs --tail 200`, e sai 1
- não reverte

A migration continua antes do recreate, sem `|| true`.

## Tempo do bootstrap

Medido no Postgres local (`127.0.0.1`), 3036 usuários não banidos, concorrência 12, o mesmo caminho que roda antes do `listen`:

- bloco: 489 ms
- sync dos perfis: 3783 ms
- total: 4272 ms

O timeout de 180s é 42 vezes esse total. O Postgres da VM é remoto e não foi medido daqui. 180s é também o `stop_grace_period` já usado por este processo no compose.

## Testes

`node --test tests/deploy/*.test.mjs`: 6 passaram. Cobrem ready imediato, ready atrasado, ready que nunca chega, e container `created`.

Não testado: SSH, compose na VM, container Docker real, bootstrap contra o banco de produção.

## Risco residual

Um boot na VM mais lento que 180s falha um deploy bom. Não há medição desse RTT. O humano vê o ALERTA e decide se restaura.

## V2.50

- Fase: 8
- Estado: VERIFICADO
- Mudanças: o gate e os testes.
- Evidências: 6 testes, 4272 ms no banco local.
- Pendências: VM.
- Commit: este relatório.
