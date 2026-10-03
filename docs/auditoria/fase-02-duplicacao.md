# Fase 2: Duplicação e Consolidação Estrutural

- **Data**: 2026-10-03
- **Branch**: `fix/swap-pol-blk-balance`
- **Alvo**: `localhost`
- **Estado do Gate G2**: `VERIFICADO`

---

## 1. Escopo e Objetivos da Fase 2

Identificar e consolidar duplicações estruturais relevantes no fluxo de swap, sem incorrer em overengineering, mantendo uma única fonte de verdade para regras de negócio, esquemas de validação e constantes de domínio.

---

## 2. Duplicações Identificadas e Consolidadas

### 2.1 Duplicação de Zod Schema de Validação
- **Antes**: `tests/swap/swap.service.test.mjs` redeclarava manualmente o `swapSchema` com `z.object({...}).strict()`, duplicando a definição existente em `server/modules/swap/swap.routes.ts`. Se o schema de produção mudasse, o teste não detectaria incompatibilidades reais de contrato.
- **Depois**: `tests/swap/swap.service.test.mjs` agora importa `swapSchema` diretamente da fonte canônica (`server/modules/swap/swap.routes.ts`), assegurando que a suíte teste exatamente o schema em vigor na API.

### 2.2 Números Mágicos de Cotação de Fallback
- **Antes**: `server/modules/swap/swap.service.ts` continha literais mágicos `0.09` e `0.0000055` embutidos inline na função de execução de swap.
- **Depois**: Extraídas as constantes semânticas de domínio `SWAP_FALLBACK_POL_USD = 0.09` e `SWAP_FALLBACK_SHIB_USD = 0.0000055`, devidamente exportadas e documentadas.

### 2.3 Tipos de Pares e Ativos
- **Antes**: Tipagens de ativos permitidos ficavam dispersas como strings literais não verificadas pelo compilador.
- **Depois**: `VALID_SWAP_PAIRS` e os tipos `SwapFromAsset` e `SwapToAsset` unificados em `server/modules/swap/swap.pairs.ts`, sendo compartilhados entre repositório, serviço e testes.

---

## 3. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0007
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/swap/swap.service.test.mjs
Ambiente: local (localhost)
Resultado: 4/4 testes passando (100% de sucesso consumindo o schema real de swap.routes.ts).
Arquivos: tests/swap/swap.service.test.mjs, server/modules/swap/swap.routes.ts, server/modules/swap/swap.service.ts
Conclusão: Duplicação de schema e números mágicos eliminados com sucesso; testes validam a implementação canônica sem divergências.
```

---

## 4. Conclusão do Gate G2

O Gate G2 foi atendido: duplicações relevantes foram tratadas com foco estrito no domínio de swap, mantendo clareza, manutenibilidade e zero overengineering.
