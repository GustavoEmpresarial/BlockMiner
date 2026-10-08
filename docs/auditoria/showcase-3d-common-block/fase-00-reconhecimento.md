# Fase 0 — Reconhecimento

Base: `b423ad1` (Merge pull request #72), worktree `/home/gustavo/Documentos/BlockMiner2.1/showcase-3d-common-block`, branch `feature/showcase-3d-common-block`. Sem push. Sem deploy. `.env` é symlink para `current/.env` (localhost `blockminer`, não `blockminer-db`).

Estado observado em `b423ad1` antes de editar:

- `resolveInstallMinerContext` (`rooms.service.ts`): se a sala é showcase, `decideShowcaseInstall` + `isShowcase3dMiner` recusam PNG com `SHOWCASE_3D_ONLY`. Não havia `else` para o caminho inverso.
- Critério 3D (`rooms.showcase.ts`): `modelUrl` `.glb` em `/media/models/`, ou nome exato `MinerCore MCX9` (prefixo `[Event]` removido), ou `imageUrl` contendo `/minercore-mcx9`.
- Salas comuns = `roomNumber` 1–`ROOM_MAX` (4). Showcase = `kind=showcase_3d` / room 101.
- `moveRackMinerBackToInventoryTx` já devolve máquina do rack ao inventário (caminho das salas 1–4).

## Resumo V2.50

- Fase: 0
- Estado: OBSERVADO
- Mudanças: nenhuma neste passo
- Evidências: `git rev-parse HEAD` = `b423ad1` no início da branch
- Pendências: fases 1 a 8
- Commit: base da branch
