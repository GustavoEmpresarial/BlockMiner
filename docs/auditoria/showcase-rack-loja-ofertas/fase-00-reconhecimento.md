# Fase 0 — Reconhecimento: rack 3D na Loja e nas Ofertas

**Data**: 07/10/2026
**Branch**: `feature/showcase-rack-loja-ofertas`
**Base**: `origin/main` @ `ea96866beddafd24dae82dea978e50e50694706c` (Merge pull request #64)
**Worktree**: `/home/gustavo/Documentos/BlockMiner2.1/rack-shop-offers`
**Checkout original**: `/home/gustavo/Documentos/BlockMiner2.1/current` na branch `feature/redesign-transparency-batch7`, suja, não tocada.

Deploy não foi executado. O dono pediu para construir, testar e parar.

## Ambiente

- PostgreSQL local: `127.0.0.1:5442`, banco `blockminer`, container `blockminer-current-db`.
- Redis local: `127.0.0.1:6389`, container `blockminer-current-redis`.
- Produção usa `blockminer-db`. `server/core/database/prisma.ts` recusa `DATABASE_URL` com `89.167.119.164`, `169.58.45.155` ou `blockminer.space`.
- Staging não existe (removido em 2026-10-04).
- Porta 3000 ocupada por outro processo. Verificação desta tarefa: API em `127.0.0.1:3010`, Vite em `127.0.0.1:5174` com `VITE_DEV_API_PROXY=http://127.0.0.1:3010`.

## Comandos reais

Raiz: `build` = `tsc -p tsconfig.json`; `typecheck` = `tsc --noEmit -p tsconfig.json`; `test` = `tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit --experimental-test-module-mocks tests/**/*.test.mjs`.

Cliente: `build` = `vite build`; `typecheck` = `tsc --noEmit -p tsconfig.json`; `test` = `vitest run`.

k6: `/home/gustavo/.local/bin/k6`. Imagem Kali presente: `kali-pentest:latest`.

## O que já existia

- `isShowcaseRoomEnabledForUser` em `rooms.showcase.ts` é a allowlist (`SHOWCASE_3D_ROOM_ENABLED` ou `SHOWCASE_3D_ROOM_USER_IDS`). Sem env, ninguém tem a sala.
- `SHOWCASE_RACKS_PER_ROOM = 24`. `nextShowcaseRackLayout` e `resolveShowcaseFloorSlot` já recusam o 25º.
- `buyShowcaseRackForUser` debita `blkBalance` com lock e confere o saldo dentro da transação. Preço legado: `readShowcaseRackPrice()`, default 1 BLK. O endpoint `POST /api/rooms/showcase-rack/buy` permanece.
- `POST /api/shop/purchase-rack` e `POST /api/offer-events/purchase-rack` vendem o SKU `mining_rack_shelf` como crédito (`rackCredits`), a 0.15 / 0.1 BLK. Não é o rack da sala 3D.
- `ShopRackCard` e a seção de ofertas de rack já renderizam um item de catálogo com `priceBlk`.

## Decisão de reuso

Reusar as rotas, o lease de idempotência e os cards. Não reusar `purchaseRacksForUser`: esse caminho credita `rackCredits` e não instala o rack na sala 101. O débito e a instalação passam por uma função compartilhada com o `buyShowcaseRack` atual.

## V2.50

- Fase: 0
- Estado: VERIFICADO
- Mudanças: worktree e branch criados a partir de `ea96866`. Nenhum arquivo de produto alterado nesta fase. O `docs/auditoria/fase-00-reconhecimento.md` da auditoria do dashboard não foi sobrescrito.
- Evidências: `git rev-parse HEAD` = `ea96866beddafd24dae82dea978e50e50694706c`; `git branch --show-current` = `feature/showcase-rack-loja-ofertas`.
- Pendências: fases 1 a 8.
- Commit: doc desta fase.
