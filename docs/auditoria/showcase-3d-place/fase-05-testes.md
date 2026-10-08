# Fase 5 — Testes

Regressão nova e a que já cobria a compra.

`npx tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/rooms/rooms.showcaseRackShop.integration.test.mjs` — 8 passou. Compra na loja e na oferta deixa `stored: 1` e `rackCredits` em 4. Compra no canal `room` continua com `stored: 0`. Pacote de 24 deixa `stored: 24`. Duas compras concorrentes deixam um crédito.

`npx tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/rooms/rooms.showcasePlace.integration.test.mjs` — 4 passou. Com a flag ligada e a allowlist só no usuário 1, um usuário de fora vê a sala 101 aberta, 0 racks, `rackCredits` 4. Colocar no piso 3, repetir o mesmo piso não duplica, mover para o 4 responde `SHOWCASE_RACK_FIXED`. Dois cliques no mesmo crédito deixam um rack e duas baias. Com máquina na baia, guardar responde `RACK_NOT_EMPTY` e o `userMiner` continua 1. Desinstalar devolve uma linha de inventário com `hashRate` 50 e zera o `userMiner`. Guardar põe `floorSlot` nulo; guardar de novo não cria outra linha. Reinstalar no piso 5. `rackCredits` segue 4.

Cliente, arquivos tocados: `Inventory2RoomContent.test.tsx`, `rackMinerModel.test.ts`, `ShopMinerCard.test.tsx`, `ShopPurchaseModal.test.tsx` — 52 passou. Piso vazio sem crédito não é botão de compra. Com um rack guardado, o texto é "1 rack(s) para instalar" e o clique chama `onPlaceRack(0, 0)`. O aviso aparece para o MCX9 `.glb` e não aparece para um miner PNG.

Suíte do client: 132 arquivos, 1110 testes. Um falhou (`AdminTournamentsPage` ainda em "Carregando…") e passou sozinho na repetição (5). Não é deste diff. Sem `skip`, sem `only`, asserção não foi afrouxada.

`tsc --noEmit -p client/tsconfig.json` continua com 61 erros, a linha de base. `OffersPage` ainda tem TS18047 em `roomOffers` por volta das linhas 377–397; o aviso novo não criou isso. `vite build` no client saiu 0.

## Resumo V2.50

- Fase: 5
- Estado: VERIFICADO
- Mudanças: `rooms.showcaseRackShop.integration.test.mjs`, `rooms.showcasePlace.integration.test.mjs`, testes de card, modal, sala e `rackMinerModel`
- Evidências: comandos acima, nesta tarefa
- Pendências: o flake de torneio passou isolado
- Commit: este commit
