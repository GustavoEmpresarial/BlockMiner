# Fase 0: Reconhecimento e Preflight

- **Data**: 2026-10-03
- **Branch**: `fix/swap-pol-blk-balance`
- **Commit Base**: `c5f7a2cb4f13bcd9e32a3a6c1c8e68170844e56e`
- **Alvo**: `localhost` (Ambiente Local Isolado)
- **Estado do Gate G0**: `VERIFICADO`

---

## 1. Contexto do Repositório e Árvore Resumida

O projeto **BlockMiner 2.1** é uma aplicação Fullstack composta por:
- **Backend**: Node.js (ES Modules, TypeScript 5.8), Express 5, Prisma ORM 7.9, PostgreSQL 15, Redis 7.
- **Frontend**: Single Page Application (SPA) em React 18, Vite, TypeScript, TailwindCSS, Zustand/Axios.
- **Arquitetura**: Monolito Modular localizado em `server/modules/`, com infraestrutura compartilhada em `server/core/` e utilitários em `server/shared/`.
- **Testes**: Node.js Native Test Runner via `tsx --test` localizado em `tests/`.

### Árvore Resumida dos Módulos Relevantes ao Bug de Swap
```text
├── client/
│   └── src/features/wallet/
│       ├── components/SwapPanel.tsx
│       ├── lib/useWalletPage.ts
│       ├── lib/wallet.api.ts
│       └── WalletPage.tsx
├── server/
│   ├── bootstrap/server.ts           # Montagem de rotas (/api/swap -> swapRouter)
│   ├── modules/
│   │   ├── swap/                     # Módulo de conversão POL/SHIB -> BLK
│   │   │   ├── index.ts
│   │   │   ├── swap.controller.ts
│   │   │   ├── swap.pairs.ts
│   │   │   ├── swap.repository.ts
│   │   │   ├── swap.routes.ts
│   │   │   └── swap.service.ts
│   │   └── wallet/
│   │       ├── balance/
│   │       │   ├── balance.controller.ts
│   │       │   ├── balance.repository.ts
│   │       │   └── balance.service.ts   # Mantém balanceCache (TTL 10s)
│   └── shared/
│       └── security/authUser.ts         # Mantém authUserCache (TTL 30s)
├── prisma/
│   └── schema.prisma                 # Model User (polBalance, blkBalance, shibBalance) e Transaction
└── tests/
    ├── swap/
    │   └── swap.service.test.mjs
    ├── load -> performance           # Symlink canônico
    └── integration/security -> ../security # Symlink canônico
```

---

## 2. Inventário de Comandos e Scripts Reais

Conforme inspecionado em `package.json`:
- **Build**: `npm run build` (`tsc -p tsconfig.json`)
- **Typecheck**: `npm run typecheck` (`tsc --noEmit -p tsconfig.json`)
- **Testes Globais**: `npm test` (`tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit --experimental-test-module-mocks tests/**/*.test.mjs`)
- **Testes Unitários / Focados**: `./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/<arquivo>`
- **Prisma Generate**: `npm run prisma:generate` (`prisma generate --schema prisma/schema.prisma`)
- **Proibidos nesta Fase**: `prisma migrate reset`, `deploy.sh`.

---

## 3. Inventário de Banco de Dados e Isolamento

- **Datasource**: PostgreSQL (`prisma/schema.prisma` provider `postgresql`).
- **Banco de Produção Proibido**: Hostname `blockminer-db` (estritamente vedado qualquer acesso/mutação).
- **Banco de Teste / Dev Local Identificado**:
  - Container Docker: `blockminer-current-db` (ID: `f9f27387369c`), rodando em `127.0.0.1:5442`.
  - Redis Local Identificado: `blockminer-current-redis` (ID: `889b73251982`), rodando em `127.0.0.1:6389`.
- **Tabelas Críticas Envolvidas**:
  - `users`: Armazena `pol_balance`, `blk_balance`, `shib_balance` como `Decimal(20, 8)`.
  - `transactions`: Tabela de ledger/auditoria com campos `type`, `amount`, `status`, etc.

---

## 4. Pontos de Entrada e Fronteiras de Confiança

### 4.1 Frontend (`client`)
- **Componente**: `SwapPanel.tsx` em `client/src/features/wallet/components/SwapPanel.tsx`.
- **Chamadas de API**:
  - `walletApi.getSwapBalances()` -> `GET /api/swap/balances` (obtém cotações em tempo real de POL/USD e SHIB/USD).
  - `walletApi.postSwapExecute(...)` -> `POST /api/swap/execute` (envia `{ fromAsset: 'POL' | 'SHIB', toAsset: 'BLK', amount: number }`).
- **Atualização de Saldo**: Após sucesso no `postSwapExecute`, o frontend invoca `await onRefresh()`, que dispara `fetchWalletData` -> `GET /api/wallet/balance`.

### 4.2 Backend (`server`)
- **Roteamento**: `server/bootstrap/server.ts` monta `/api/swap` via `swapRouter`.
- **Rotas**:
  - `GET /api/swap/balances` (protegida por `requireAuth` e rate limiter).
  - `POST /api/swap/execute` (protegida por `requireAuth`, rate limiter e validação Zod `swapSchema.strict()`).
- **Controlador**: `swap.controller.ts` invoca `swapService.executeSwapForUser(userId, fromAsset, toAsset, amountNum)`.
- **Serviço**: `swap.service.ts` calcula taxa segura (`safePol` / `safeShib`), valida saldo e executa transação no banco.
- **Repositório**: `swap.repository.ts` executa `$transaction` decrementando `polBalance` e incrementando `blkBalance`.

---

## 5. Diagnóstico da Causa Raiz do Bug Reportado

O usuário relatou: *"toda vez que faz swap de pol pra blk o saldo em pol não esta diminuindo"*.

A investigação detalhada do código identificou os seguintes fatores convergentes:

1. **Gap Crítico de Invalidação de Cache de Saldo (`balanceCache`)**:
   - `server/modules/wallet/balance/balance.service.ts` implementa um cache em memória `balanceCache` com TTL de 10 segundos (`WALLET_BALANCE_CACHE_TTL_MS`).
   - Todas as consultas de saldo do painel e carteira (`GET /api/wallet/balance`) batem primeiro nesse cache.
   - Quando `executeSwapForUser` conclui a transação no banco de dados, ele **nunca chama** `invalidateBalanceCache(userId)`.
   - Quando o `SwapPanel.tsx` executa `await onRefresh()`, o endpoint `/api/wallet/balance` atende a requisição direto da memória cache, retornando o saldo de POL anterior ao swap. Para o usuário, a interface parece não ter deduzido o saldo de POL.
2. **Gap de Invalidação no Cache de Sessão de Usuário (`authUserCache`)**:
   - `server/shared/security/authUser.ts` faz cache de `polBalance` por até 30 segundos (`AUTH_USER_CACHE_TTL_MS`). A falta de chamada a `invalidateAuthUserCache(userId)` perpetua o saldo antigo em middlewares subsequentes.
   - O endpoint `POST /api/swap/execute` não devolve os saldos consolidados na resposta HTTP (apenas `{ ok: true, rate, output }`).
3. **Ausência de Registro no Ledger Financeiro (`transactions`)**:
   - Mutações legítimas de saldo no BlockMiner registram uma linha na tabela `transactions`. O swap atual alterava colunas em `users` sem gravar o evento de débito/crédito no histórico de transações.
4. **Fragilidade de Concorrência e Tipagem Numérica**:
   - `findUserBalancesTx` faz um `findUnique` simples sem `SELECT ... FOR UPDATE`. Swaps simultâneos podem competir e provocar saldo negativo ou double-spending.
   - Os arquivos de swap continham marcações `// @ts-nocheck` e uso de tipos genéricos `any`/`unknown`.

---

## 6. Estado Inicial e Evidências Coletadas

```text
EVIDÊNCIA-ID: EV-0001
Estado: VERIFICADO
Comando: git status --short && git branch
Ambiente: local (localhost)
Resultado: Branch 'fix/swap-pol-blk-balance' criada a partir de develop limpa (commit c5f7a2cb4f13bcd9e32a3a6c1c8e68170844e56e).
Arquivos: N/A
Conclusão: Isolamento Git confirmado, sem interferência em main nem em produção.
```

```text
EVIDÊNCIA-ID: EV-0002
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/swap/swap.service.test.mjs
Ambiente: local (localhost)
Resultado: 4 testes existentes executados com sucesso (100% de aprovação na suíte legada de swap).
Arquivos: tests/swap/swap.service.test.mjs
Conclusão: Os testes legados cobrem apenas parsers de pares e validação de schema Zod, sem testar a execução da transação de swap nem a dedução real de saldo.
```

```text
EVIDÊNCIA-ID: EV-0003
Estado: OBSERVADO
Comando: docker ps
Ambiente: local (localhost)
Resultado: Containers locais 'blockminer-current-db' (porta 5442) e 'blockminer-current-redis' (porta 6389) ativos e saudáveis.
Arquivos: docker-compose.yml
Conclusão: Ambiente local está pronto para execução de testes integrados e testes de carga sem tocar em hosts remotos.
```

```text
EVIDÊNCIA-ID: EV-0004
Estado: OBSERVADO
Comando: npm run typecheck
Ambiente: local (localhost)
Resultado: Erros pré-existentes catalogados em módulos desconectados do swap (games, shortlinks, rooms, mining types). O módulo server/modules/swap possui @ts-nocheck legado que será saneado na Fase 1.
Arquivos: server/modules/swap/*.ts
Conclusão: Falhas pré-existentes foram devidamente registradas antes de qualquer alteração de código.
```

---

## 7. Critérios de Sucesso e Próximos Passos

- [x] Branch `fix/swap-pol-blk-balance` criada.
- [x] Inventário completo de scripts, banco, frontend, backend e segurança documentado.
- [x] Causa raiz do saldo de POL não diminuir isolada (falha de invalidação de `balanceCache` + falta de retorno dos saldos atualizados).
- [ ] Fase 1: Saneamento dos arquivos de swap e remoção de `@ts-nocheck`.
