# Fase 1 — Saneamento

Nenhum arquivo foi apagado.

## Mantido de propósito

- `POST /api/rooms/showcase-rack/buy` e `buyShowcaseRackForUser`. Cliente antigo em cache ainda pode chamar. O preço desse caminho continua o legado (default 1 BLK), não 1.5.
- `postBuyShowcaseRack` em `machines.api.ts` continua exportado. A página do inventário deixou de chamá-lo.
- O SKU `mining_rack_shelf` e `purchaseRacksForUser` continuam vendendo crédito de prateleira.

## UI

O botão de comprar rack dentro da sala 3D saiu. O pad vazio da sala 3D não é mais botão e não chama compra. O texto do pad aponta a Loja e as Ofertas.

## Fora do commit

Symlinks locais `node_modules`, `client/node_modules` e `.env` apontam para o checkout `current/`. Não entram no git. `tests/load` e `tests/integration/security` não foram copiados; os scripts novos estão em `tests/performance` e `tests/security`.

Nada ficou em REQUER_APROVACAO.

## V2.50

- Fase: 1
- Estado: VERIFICADO
- Mudanças: remoção só do caminho de UI. Endpoint legado conservado.
- Evidências: `Inventory2RoomContent` não recebe mais `onBuyShowcaseRack`. Busca no diff: o handler da página foi removido; a rota `showcase-rack/buy` permanece em `rooms.routes.ts`.
- Pendências: nenhuma exclusão pendente de aprovação.
- Commit: doc desta fase.
