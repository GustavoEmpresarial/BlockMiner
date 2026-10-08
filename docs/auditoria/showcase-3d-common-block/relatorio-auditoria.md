# Relatório — Liberar sala 3D, bloquear miner 3D nas salas comuns e migração ao inventário

Base: `b423ad1`. Branch: `feature/showcase-3d-common-block`. Worktree: `/home/gustavo/Documentos/BlockMiner2.1/showcase-3d-common-block`.

## O que entrou

1. **Liberação da Sala 3D para todo mundo:**
   - Em `server/modules/rooms/rooms.showcase.ts`, `isShowcaseRoomEnabled` agora é ativa por padrão (`true`).
   - Todos os usuários têm acesso à Sala 3D (sala 101), visualização dos racks e compra do rack 3D na Loja e Ofertas sem necessidade de estar em allowlist.
   - Mantida a opção de desativar explicitamente via `SHOWCASE_3D_ROOM_ENABLED=0` ou `"false"`.

2. **Bloqueio de miner 3D nas salas comuns:**
   - Em `server/modules/rooms/rooms.service.ts`: `resolveInstallMinerContext` recusa a instalação de máquinas 3D (como MinerCore MCX9) em salas 1 a 4 com o código `SHOWCASE_3D_FITS_ONLY` (HTTP 400).
   - Mesma checagem reusada em `client/src/features/inventory2/Inventory2Page.tsx` via `rackMinerModelUrl`, impedindo a ação no frontend e exibindo o toast correto.
   - Chaves i18n adicionadas em pt-BR, en e es (`errors.SHOWCASE_3D_FITS_ONLY` e `inventory.showcase_3d_fits_only`).

3. **Migração de produção — máquinas 3D de salas comuns para o inventário:**
   - Em `server/modules/rooms/rooms.showcaseCommonMigration.ts`: rotina `runShowcase3dCommonRoomMigration` lista ao vivo (`listShowcase3dInCommonRooms`) máquinas 3D em salas 1 a 4.
   - Em `server/modules/rooms/rooms.service.ts`: `migrateShowcase3dCommonRackToInventory` move a máquina de volta para `user_inventory` usando `moveRackMinerBackToInventoryTx`, registra em `audit_logs` (`SHOWCASE_3D_COMMON_ROOM_MIGRATE_TO_INVENTORY`), recarrega o perfil de mineração e invalida o cache.
   - **Execução no bootstrap:** conectado em `server/bootstrap/server.ts` (`main()`) de forma assíncrona e idempotente. No startup da aplicação em produção, a rotina limpa as máquinas 3D das salas comuns e as devolve aos inventários.
   - **Script CLI:** `scripts/audit/migrate-showcase-3d-from-common-rooms.mts` com `--execute` e suporte à flag `--allow-production` / `ALLOW_PRODUCTION_SHOWCASE_MIGRATION=1`.

## Verificação e Gates

| gate | resultado |
|---|---|
| `tests/rooms/**` | 58 pass / 0 fail |
| client vitest | 132 files / 1111 tests (pass) |
| client `vite build` | EXIT 0 |

## Resumo V2.50

- Fases 0–8: concluídas e verificadas com testes automatizados.
- Sala 3D: liberada globalmente.
- Bloqueio reverso: ativo no servidor e cliente.
- Migração para inventário: implementada, idempotente, integrada ao bootstrap e script CLI.