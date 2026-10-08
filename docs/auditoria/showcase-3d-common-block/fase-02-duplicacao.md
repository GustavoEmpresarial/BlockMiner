# Fase 2 — Duplicação

Não há segundo critério de “é 3D”. O bloqueio nas salas comuns chama a mesma `isShowcase3dMiner(showcaseMinerFromInventory(...))` usada indiretamente por `decideShowcaseInstall` no ramo showcase. Client usa `rackMinerModelUrl` (mesma regra, já espelhada em `rackMinerModel.ts`).

## Resumo V2.50

- Fase: 2
- Estado: VERIFICADO
- Mudanças: decisão única no `if (showcase) … else if (isShowcase3dMiner…)`
- Evidências: diff em `rooms.service.ts`
- Pendências: —
- Commit: implementação
