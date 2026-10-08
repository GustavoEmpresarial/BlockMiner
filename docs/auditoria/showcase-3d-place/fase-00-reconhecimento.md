# Fase 0 — Reconhecimento

Base: `32547fa` (Merge pull request #70), worktree `/home/gustavo/Documentos/BlockMiner2.1/showcase-3d-place`, branch `feature/showcase-3d-place-remove`. `origin/main` nesse ponto é esse commit. Sem push. Sem deploy. `.env.production` não foi aberto nem editado.

Banco de teste: o `DATABASE_URL` do `.env` local (symlink para a árvore `current`). Não é `blockminer-db`. Produção continua em `blockminer-db` (`161.97.176.125`). Staging não existe desde 2026-10-04.

Comandos reais do `package.json` usados nesta trilha: `npx tsx --import ./tests/_env-test-overrides.mjs --test` para integração de salas; `npx vitest run` no `client/`; `tsc --noEmit -p client/tsconfig.json`; `npx vite build` no `client/`. `npm run build` da raiz (`tsc -p tsconfig.json`) não foi rodado: a linha de base já falha com erros anteriores a este diff.

O que o código em `32547fa` fazia, lido antes de editar:

- Compra do rack 3D na loja e na oferta (`installPaidShowcaseRacks`) já debitava BLK e criava o rack com `floorSlot` preenchido. `creditsPerUnit` é 0. `users.rack_credits` não sobe. O toast dizia que o rack tinha sido instalado.
- Sala vazia só oferecia o texto de comprar na Loja ou nas Ofertas. `Inventory2RoomContent` passava `onUnplaceRack` só fora da sala 3D.
- `setVisualPlacement` na sala 3D recusava guardar e mover com `SHOWCASE_RACK_FIXED`.
- `SHOWCASE_3D_ROOM_ENABLED` ligado faz `isShowcaseRoomEnabledForUser` ignorar a allowlist. `ensureShowcaseRoomForUser` cria a sala com `pricePaid: 0` e zero racks.
- Máquina 3D só instala na sala 3D (`SHOWCASE_3D_ONLY`). O catálogo da loja não tem coluna `modelUrl`. O MinerCore MCX9 é oferta (`EventMiner`), com `/media/models/minercore-mcx9.glb`.

## Resumo V2.50

- Fase: 0
- Estado: OBSERVADO
- Mudanças: nenhuma neste commit
- Evidências: `git rev-parse HEAD` = `32547fa` no início; branch `feature/showcase-3d-place-remove`
- Pendências: fases 1 a 8
- Commit: este commit
