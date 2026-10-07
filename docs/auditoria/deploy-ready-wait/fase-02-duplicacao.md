# Fase 2 — Duplicação

Uma função só, `_app_ready_gate`, gera o bash da conferência. Prod e staging passam por `_docker_stack`, que chama essa função. Não há um segundo curl.

O healthcheck do `docker-compose.yml` já usa `/health/ready` dentro do container, na porta 3000, com `start_period` de 60s. O script de deploy olha o host (`5102` em prod, `3001` em staging) e não copia esse healthcheck. São checagens diferentes: o do Docker não faz o script falhar.

## V2.50

- Fase: 2
- Estado: VERIFICADO
- Mudanças: um gerador de espera, não dois.
- Evidências: um único call site, `_docker_stack` → `_app_ready_gate`.
- Pendências: nenhuma segunda regra de pronto.
- Commit: doc desta fase.
