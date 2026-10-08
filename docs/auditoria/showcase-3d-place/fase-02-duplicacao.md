# Fase 2 — Duplicação

O crédito da sala 3D não pode ser `users.rack_credits`. Essa coluna é o rack de prateleira (0.15 / 0.1). `purchaseRacksForUser` incrementa; só `fromCredit` decrementa. Misturar deixaria um crédito de 0.15 instalar um rack de 1.5.

O crédito da sala 3D é a linha que a compra já criava em `user_visual_rack_placements`, com `floorSlot` nulo. Instalar preenche o piso. Guardar volta o piso para nulo. A mesma linha, o mesmo lock `pg_advisory_xact_lock(userId, 101)`.

Arrastar de piso para piso continua recusado. O caminho para trocar de piso é guardar e instalar de novo.

## Resumo V2.50

- Fase: 2
- Estado: PROPOSTO
- Mudanças: nenhuma neste commit; a decisão está no código da fase 3
- Evidências: `rooms.showcase.ts` (`creditsPerUnit: 0`); `racks.service.ts` incrementa `rackCredits` só na prateleira
- Pendências: nenhuma
- Commit: este commit
