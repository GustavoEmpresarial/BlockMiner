# Fase 5 — Testes

Comandos rodados:

```bash
npx tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/rooms/**/*.test.mjs
# EXIT 0 — 52 pass / 0 fail  (/tmp/rooms-suite-common-block.txt)

cd client && npx vitest run
# EXIT 0 — 132 files / 1111 tests  (/tmp/vitest-common-block.txt)

cd client && npm run typecheck
# 61 error TS (baseline)  (/tmp/tsc-common-block.txt)

cd client && npm run build
# EXIT 0  (/tmp/vite-build-common-block.txt)
```

Novos: `rooms.showcase3dCommonBlock.integration.test.mjs` (recusa sala 1 + aceita 101); unit do código `SHOWCASE_3D_FITS_ONLY`.

## Resumo V2.50

- Fase: 5
- Estado: VERIFICADO
- Mudanças: testes rooms + gates client
- Evidências: logs `/tmp/*common-block*`
- Pendências: —
- Commit: testes / implementação
