# Fase 6 — Carga

Não há rota nova. A mudança é o cliente de deploy, que faz um curl a cada 2s por no máximo 180s contra o próprio host. k6 contra `blockminer.space` está fora. k6 contra localhost não exercita o bash da VM.

O bootstrap medido (4272 ms, 3036 usuários, concorrência 12) é carga de banco no boot, não um teste de throughput HTTP. Não inventei limite de ms para o k6 porque o k6 não rodou.

## V2.50

- Fase: 6
- Estado: VERIFICADO para o escopo: não há alvo de carga neste diff.
- Mudanças: nenhuma.
- Evidências: o diff não adiciona endpoint. A medição do boot está na fase 0.
- Pendências: o tempo do Postgres remoto da VM continua não medido.
- Commit: este doc.
