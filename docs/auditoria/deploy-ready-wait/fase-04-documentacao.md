# Fase 4 — Documentação

`docs/auditoria/deploy-migrate-before-up/relatorio.md` dizia que o curl do `/health` continuava com `|| true`. Essa frase descrevia o comportamento e ficou falsa. Foi reescrita para apontar esta correção, sem apagar o relato de que a migration daquele lote não tratou o curl.

Não há README de deploy descrevendo o `|| true` como regra atual.

## V2.50

- Fase: 4
- Estado: VERIFICADO
- Mudanças: uma frase do relatório anterior.
- Evidências: a frase nova cita `deploy-ready-wait` e `/health/ready`.
- Pendências: nenhuma outra doc descrevendo o curl antigo como vigente.
- Commit: a frase e este doc.
