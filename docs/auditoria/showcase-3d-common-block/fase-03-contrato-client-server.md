# Fase 3 — Contrato client/server

## Server

- Código novo: `ROOMS_ERROR.SHOWCASE_3D_FITS_ONLY`.
- `resolveInstallMinerContext`: no `else` do `if (showcase)`, se `isShowcase3dMiner(...)` → HTTP 400 + código + mensagem PT.
- Sem caminho paralelo de detecção.

## Client

- Pré-checagem em `Inventory2Page` antes do POST: sala comum + `rackMinerModelUrl` → toast `inventory.showcase_3d_fits_only`.
- Resposta API com `code === SHOWCASE_3D_FITS_ONLY` mapeia a mesma chave i18n.
- `errors.SHOWCASE_3D_FITS_ONLY` / `SHOWCASE_3D_ONLY` em pt-BR, en, es.

## Contagem (Etapa A)

- Script somente leitura: `scripts/audit/count-showcase-3d-in-common-rooms.mts`.
- Recusa host ≠ localhost e marcadores de produção.
- Usa `isShowcase3dMiner` nos racks das salas 1–`ROOM_MAX`.

## Etapa B (plano, não implementada)

Ver `relatorio-auditoria.md`.

## Resumo V2.50

- Fase: 3
- Estado: VERIFICADO
- Mudanças: contrato de erro + i18n + script de contagem
- Evidências: testes em `tests/rooms/rooms.showcase3dCommonBlock.integration.test.mjs`
- Pendências: Etapa B só com autorização humana + números
- Commit: implementação
