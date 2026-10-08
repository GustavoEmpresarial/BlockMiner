# Fase 3 — Contrato cliente e servidor

Compra na loja ou na oferta (`channel !== "room"` e `floorSlot` nulo) grava os pisos como nulos. Compra antiga dentro da sala (`channel === "room"`) continua escolhendo piso livre. Preços 1.5 / 0.95 não mudaram. Preços 0.15 / 0.1 não mudaram.

`setShowcasePlacementForUser`:

- `fromCredit` responde `SHOWCASE_RACK_FIXED`. Crédito de prateleira não cria rack 3D.
- Guardar com `floorSlot` já nulo não cria outro crédito.
- Guardar com máquina na baia (`visualIndex * 2` até `+2`, `userMinerId` ou `blockedByMinerId`) responde `RACK_NOT_EMPTY`. Não apaga rack nem máquina.
- Mover um rack que já tem piso responde `SHOWCASE_RACK_FIXED` ("O rack desta sala fica fixo no chão.").
- Instalar um rack guardado ocupa o piso livre, ou `SHOWCASE_RACK_OCCUPIED`.
- O mesmo piso pedido de novo é idempotente.

A UI da sala 3D passa `onUnplaceRack`. Piso vazio sem crédito continua o texto de comprar na Loja ou nas Ofertas, e não é botão. Com um rack guardado, o botão "Instalar rack" chama o place. Com vários, abre o seletor que já existia. O cabo de arrastar segue oculto.

Máquina no rack: o mesmo caminho das salas 1–4. A UI pede desmontar, `postRackUninstallBatch` chama `uninstallMinerForUser`, e `moveRackMinerBackToInventoryTx` (`rooms.service.ts`) devolve a máquina ao inventário e apaga o `userMiner`. O servidor ainda recusa guardar se a baia não estiver vazia. A máquina não some.

O aviso "só na Sala 3D" está no card e no modal da loja e das ofertas, via `isShowcase3dCatalogMachine` (mesmo critério do `SHOWCASE_3D_ONLY`). A regra de instalação não mudou.

Flag global: com `SHOWCASE_3D_ROOM_ENABLED` ligado, a allowlist não filtra. A sala nasce vazia e não mexe em `rack_credits`. Ligar a flag em produção é passo de deploy. Este trabalho não editou `.env.production` e não fez deploy.

## Resumo V2.50

- Fase: 3
- Estado: EM_IMPLEMENTACAO
- Mudanças: `rooms.service.ts`, `rooms.showcase.ts`, `rooms.showcasePurchase.ts`, `rooms.visualPlacements.ts`, `Inventory2RoomContent.tsx`, `Inventory2Page.tsx`, `ImageRackCard.tsx`
- Evidências: leitura das funções citadas acima
- Pendências: testes na fase 5; tela na fase 8
- Commit: este commit
