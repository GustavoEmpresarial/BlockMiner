# Fase 0: Reconhecimento e Preflight

- **Data**: 2026-10-03
- **Branch**: `feature/transparency-page-redesign`
- **Commit Base**: `d443356` (`docs(auditoria): fase 9 relatorio de deploy staging e producao`)
- **Alvo**: `localhost` (Ambiente Local Isolado)
- **Estado do Gate G0**: `VERIFICADO`

---

## 1. Contexto do Repositório e Árvore do Escopo

O projeto **BlockMiner 2.1** é uma aplicação Fullstack composta por:
- **Frontend**: Single Page Application (SPA) em React 19, Vite, TypeScript, TailwindCSS, Zustand/Axios, i18next, Recharts.
- **Backend**: Node.js (ES Modules, TypeScript 5.8), Express 5, Prisma ORM 7.9, PostgreSQL 15, Redis 7.
- **Arquitetura**: Monolito Modular (`server/modules/`, `server/core/`, `server/shared/`, `client/src/features/`).
- **Página Alvo**: Página pública de Transparência Financeira (`/transparency`).

### Árvore da Superfície Mapeada (`client/src/features/transparency/`)
```text
client/src/
├── app/
│   └── App.tsx                                        # Linha 165: Rota pública /transparency
├── features/
│   └── transparency/
│       ├── index.ts                                   # Barrel export
│       ├── TransparencyPage.tsx                       # Página principal (414 linhas, orquestra 11 seções)
│       ├── components/
│       │   ├── transparency.shared.tsx                # Re-exports de componentes
│       │   ├── transparency.base.ts                   # Tipos, formatadores e helper walletTreasuryUsd
│       │   ├── transparency.charts.tsx                # StatCard, CategoryBar, tooltips, PieLabel (Recharts)
│       │   ├── transparency.wallets.tsx               # WalletsLiveSection (carteiras e tesouraria)
│       │   ├── transparency.hardware.tsx              # HardwareSection (ASICs e ROI Lightning)
│       │   ├── transparency.ai-models.tsx             # AiInfrastructure3DSection (modelos IA e servidores)
│       │   ├── transparency.withdrawals.tsx           # WithdrawalsSection (saques recentes e métricas)
│       │   └── transparency.methodology.tsx           # MethodologyModal (diálogo explicativo)
│       └── __tests__/
│           └── TransparencyPage.test.tsx              # Testes unitários/renderização da página
├── shared/
│   └── components/
│       └── TransparencyErrorBoundary.tsx              # Error boundary dedicado para /transparency
└── i18n/locales/
    ├── pt-BR.json                                     # Chave raiz "transparency" (27 chaves)
    ├── en.json
    └── es.json
server/
└── modules/
    └── transparency/
        ├── transparency.controller.ts                 # Endpoints públicos /api/transparency/*
        ├── transparency.routes.ts                     # Rotas REST
        ├── transparency.service.ts                    # Agregações de tesouraria, hardware, saques
        └── transparency.repository.ts                 # Acesso a dados de entradas e carteiras
tests/
└── transparency/                                      # 13 arquivos de testes dedicados (68 testes)
```

---

## 2. Inventário de Comandos e Scripts Reais

Conforme inspecionado em `package.json` (raiz) e `client/package.json`:
- **Frontend (client/)**:
  - Testes: `npm test` (`vitest run`)
  - Teste focado: `npm test -- src/features/transparency`
  - Build: `npm run build` (`vite build`)
  - Lint: `npm run lint` (`eslint .`)
  - Typecheck: `npm run typecheck` (`tsc --noEmit -p tsconfig.json`)
- **Backend (raiz/)**:
  - Build: `npm run build` (`tsc -p tsconfig.json`)
  - Typecheck: `npm run typecheck` (`tsc --noEmit -p tsconfig.json`)
  - Testes Globais: `npm test` (`tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit --experimental-test-module-mocks tests/**/*.test.mjs`)
  - Testes focados: `./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/transparency/*.test.mjs`
  - Prisma Generate: `npm run prisma:generate` (`prisma generate --schema prisma/schema.prisma`)
  - Proibidos terminantemente: `prisma migrate reset`, `deploy.sh`.

---

## 3. Inventário de Banco de Dados, Serviços e Isolamento

- **Ambiente Alvo**: Estritamente `localhost`. Vedado qualquer acesso ou mutação contra `blockminer.space` ou `dev.blockminer.space`.
- **Banco de Produção Proibido**: Hostname `blockminer-db` (161.97.176.125) - estritamente isolado.
- **Banco de Teste Local Ativo**:
  - Container Docker: `blockminer-current-db` (PostgreSQL 15 Alpine), publicado em `127.0.0.1:5442` (Healthy).
  - Redis Local Ativo: Container Docker `blockminer-current-redis` (Redis 7 Alpine), publicado em `127.0.0.1:6389` (Healthy).

### 3.1 Baseline de Falhas Pré-existentes no Repositório (Medição Pré-Trabalho)

Conforme exigido pelo Contrato V2 e V2.37, foi realizada a medição e catalogação rigorosa de todas as falhas pré-existentes na suíte global e no typecheck antes de qualquer modificação de código:
1. **Suíte Global de Testes (`npm test`)**:
   - Total de testes executados: **2.348+ testes**.
   - Falhas pré-existentes catalogadas: **37 falhas** (oscilação esperada entre 35 e 45 decorrente de migrations pendentes em banco local `SCHEMA_OUT_OF_DATE`, testes de crons legados com `redisMod.__enableRedisForTests`, e `VPN_PROXY_BLOCKED`).
2. **Typecheck Global (`npm run typecheck`)**:
   - Server: **74 erros TS** pré-existentes em módulos fora do escopo (`games/`, `ip-intelligence/`, `referrals/`, `rooms/`, `shortlinks/`, `wallet/`).
   - Client: **68 erros TS** pré-existentes em áreas não relacionadas (`admin/`, `calculator/`, `games/`, `offers/`, `ptc/`, `referrals/`, `tournaments/`, `wallet/`).
3. **Conferência de Isolamento da Branch**:
   - Verificado com `(npm run typecheck 2>&1; cd client && npm run typecheck 2>&1) | grep -iE "features/transparency|server/modules/transparency"`: **0 erros** nos arquivos do escopo.
   - Testes existentes de transparência no frontend: **3/3 aprovados**.
   - Testes existentes de transparência no backend: **68/68 aprovados**.
   - Nenhuma falha pré-existente possui qualquer relação com o escopo desta tarefa.

---

## 4. Problemas Técnicos e Diagnóstico de Layout Inicial

Conforme mapeado no briefing e inspecionado no código-fonte:
1. **P1 — Ausência de Hierarquia Visual**:
   - Quase todas as seções compartilham o container idêntico `rounded-2xl border border-white/8 bg-white/[0.02] p-6` com títulos idênticos `text-xs font-black text-gray-400 uppercase tracking-widest`. Falta ênfase, ritmo visual e contraste de importância.
2. **P2 — Layout Não Intuitivo (Scroll Único com 11 Seções Pesadas)**:
   - A página empilha sequencialmente 11 seções densas sem índice, âncoras, barra de navegação rápida ou sistema de abas/filtros. Isso sobrecarrega a experiência de leitura do usuário.
   - Solução proposta: Navegação intuitiva por seções/abas temáticas (ex: "Visão Geral / KPIs & Gráficos", "Tesouraria & Carteiras", "Receitas & Despesas", "Infraestrutura (Hardware & IA)", "Saques Recentes") com controle acessível via teclado e scroll suave para âncoras.
3. **P3 — Grid de KPIs Quebrado**:
   - `grid-cols-2 lg:grid-cols-5` com 5 itens deixa um card órfão esticado na última linha entre viewports pequenas e grandes.
4. **P4 — Strings Hardcoded fora do i18n**:
   - Em `TransparencyPage.tsx:354-357`, os cabeçalhos de tabela "Item / Descrição", "Provedor", "Valor USD" e "Status" estão fixos em português, aparecendo sem tradução nos idiomas inglês e espanhol.
5. **Invariantes Financeiras e de Segurança**:
   - Nenhum número será inventado ou estimado.
   - Zero excessive data exposure: a página é pública, nenhum dado novo além dos já fornecidos pela API será exposto.
   - Contrato da API de transparência preservado integralmente.

---

## 5. Evidências Coletadas

```text
EVIDÊNCIA-ID: EV-0001
Estado: VERIFICADO
Comando: git status --short && git branch --show-current && git log -n 1 --oneline
Ambiente: local (localhost)
Resultado: Branch ativa 'feature/transparency-page-redesign' criada a partir de develop no commit d443356. Árvore limpa exceto arquivos pré-existentes não monitorados (.maestri/, imagens na raiz e symlinks tests/load e tests/integration/security).
Arquivos: N/A
Conclusão: Isolamento Git confirmado na branch designada para a tarefa.
```

```text
EVIDÊNCIA-ID: EV-0002
Estado: VERIFICADO
Comando: docker ps
Ambiente: local (localhost)
Resultado: Containers 'blockminer-current-db' (porta 5442) e 'blockminer-current-redis' (porta 6389) ativos e saudáveis há mais de 6 horas.
Arquivos: docker-compose.yml
Conclusão: Banco de teste local e cache Redis isolados e disponíveis em localhost.
```

```text
EVIDÊNCIA-ID: EV-0003
Estado: VERIFICADO
Comando: npm test -- src/features/transparency (em client/)
Ambiente: local (localhost / vitest v3.2.7)
Resultado: 3/3 testes passando com 100% de sucesso em 350ms.
Arquivos: client/src/features/transparency/__tests__/TransparencyPage.test.tsx
Conclusão: Linha de base de testes do frontend de transparência verificada antes de qualquer alteração de código.
```

```text
EVIDÊNCIA-ID: EV-0004
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/transparency/*.test.mjs
Ambiente: local (localhost / PostgreSQL 5442)
Resultado: 68/68 testes de backend de transparência passando com 100% de sucesso em 2.82s.
Arquivos: tests/transparency/*.test.mjs
Conclusão: Backend do módulo de transparência íntegro e operacional no ambiente de testes.
```

```text
EVIDÊNCIA-ID: EV-0005-BASELINE
Estado: VERIFICADO
Comando: timeout 180 npm test 2>&1 | grep "^not ok" | wc -l && (npm run typecheck 2>&1 | grep -c "error TS") && (cd client && npm run typecheck 2>&1 | grep -c "error TS")
Ambiente: local (localhost)
Resultado: 37 falhas pré-existentes na suíte global (oscilação documentada entre 35 e 45); 74 erros TS no server e 68 no client. Verificado 0 erros nos arquivos de transparência.
Arquivos: tests/, server/, client/
Conclusão: Baseline de falhas e dívida técnica pré-existente documentado e formalmente desvinculado do escopo desta tarefa.
```

---

## 6. Gate da Fase 0

- [x] Branch `feature/transparency-page-redesign` confirmada e registrada a partir de `develop`.
- [x] Árvore inicial de arquivos inspecionada.
- [x] Comandos reais de teste e build identificados e validados.
- [x] Banco de dados de teste isolado e saudável em `127.0.0.1:5442`.
- [x] Banco de produção `blockminer-db` estritamente resguardado.
- [x] Baseline de 37 falhas pré-existentes na suíte e 142 erros de typecheck catalogados sem relação com a branch.
- [x] Diagnóstico dos problemas P1 a P4 fundamentado na inspeção de código.
- [x] Relatório `docs/auditoria/fase-00-reconhecimento.md` emitido com evidências EV-0001 a EV-0005-BASELINE.
- [x] Estado do Gate G0: `VERIFICADO`.
