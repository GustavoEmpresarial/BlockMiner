# 🗺️ Status de Revisão e Qualidade das Páginas (BlockMiner 2.1)

Documento central de controle de qualidade e auditoria das páginas da aplicação, alinhado à ordem da barra lateral de navegação ([`userDashboardNav.config.ts`](../client/src/features/shell/nav/userDashboardNav.config.ts)).

---

## 📌 Categoria: Principal

| Página / Rota | Status | Branch / Commits de Referência | Testes Automatizados | Destaques da Passada |
|---|:---:|---|:---:|---|
| **Dashboard Central** (`/dashboard`) | ✅ **Concluído** | `feature/dashboard-quality-pass` | 10 suítes (Vitest) | Polling otimizado (`useDashboardPoll`), observabilidade estruturada com `logDashboardError`, correção de ordem de hooks no `Card`, XSS & CSRF blindados. |
| **Estatísticas e poder** (`/power-stats`) | ✅ **Concluído** | `feature/stats-power-quality-pass` | Vitest + Fast-check + Playwright E2E | Fuzz testing, cálculo diário de rendimentos corrigido (hoje/ontem/melhor dia), acessibilidade em abas com teclado (WAI-ARIA). |
| **Minhas Máquinas** (`/inventory`) | ✅ **Concluído** | `feat(inventory,rooms)` (`9d66c0c`, `b87f2a5`, `962c324`) | Vitest (~100% cobertura) | Validação estrita de slots, remoção de bypass de capacidade, telemetria de erro e prevenção de race conditions na instalação. |
| **Inventário / Cofre** (`/inventario` / `/vault`) | ✅ **Concluído** | `feature/vault-quality-pass` (`eb2ab32`, `7dc73ae`) | Testes unitários & integração | Eliminação de dead code, sincronização de telemetria, bloqueio de requisições bulk inválidas e tratamento de erros. |
| **Loja de Equipamentos** (`/shop`) | ✅ **Concluído** | `feature/shop-quality-pass` (`b8f5b27`) | 44 testes (28 backend/pentest + 16 Vitest) | `pg_advisory_xact_lock`, CAS retry no estoque, idempotência estrita, sanitização Zod, pentest Kali e cards modulares. |
| **Ofertas / Eventos** (`/offers` e `/admin/offer-events`) | ✅ **Concluído** | `feature/offer-events-quality-pass` | Vitest (35 testes) + Backend/Smoke | Eventos temporais, controle de concorrência com `pg_advisory_xact_lock` para claimLimit, CAS de estoque, RBAC granular (`events` e `events.view`), auditoria `logAdminAction`, eliminação de `@ts-nocheck` e diálogos inline sem `window.confirm`. |
| **Carteira** (`/wallet`) | ⏳ *Pendente* | — | — | Próximo item da categoria Principal. |
| **Taxas** (`/taxes`) | ⏳ *Pendente* | — | — | Próximo item da categoria Principal. |
| **Suporte** (`/support`) | ⏳ *Pendente* | — | — | Próximo item da categoria Principal. |

---

## 🎯 Próximas Categorias do Sistema

### 2. Categoria: Ganhar (`earn`)
- [ ] **Torneios** (`/tournaments`)
- [x] **Check-in Diário** (`/checkin` e `/admin/checkin-milestones`) — ✅ **Revisado & Documentado**: Redesign completo da UI administrativa, RBAC granular (`checkin` e `checkin.view`), trilha de auditoria `logAdminAction`, scanner de anomalias de streak, eliminação de erros TS e documentação OpenAPI completa em `docs/admin/checkin-milestones.md`.
- [x] **Tarefas Diárias** (`/tasks` e `/admin/daily-tasks`) — ✅ **Revisado & Documentado**: Eliminação de `@ts-nocheck`, reescrita do controller administrativo em TypeScript estrito, RBAC granular (`tasks` e `tasks.view`), auditoria completa com `logAdminAction`, validação de dependências de chaves estrangeiras, documentação OpenAPI completa em `docs/admin/tasks.md`.
- [x] **Mini Pass** (`/mini-pass` e `/admin/mini-pass`) — ✅ **Revisado & Documentado**: Eliminação de `@ts-nocheck` em 9 arquivos backend, tipagem estrita de contratos, RBAC granular (`mini_pass` e `mini_pass.view`), auditoria `logAdminAction`, remoção de `window.confirm` e documentação OpenAPI completa em `docs/admin/mini-pass.md`.
- [x] **Eventos de Queima** (`/burn`) — ✅ **Concluído**: Agrupamento de máquinas idênticas com contadores `+`/`-`/`Max`, ordenação estrita por menor poder para maior poder (`hashRate` ASC), botão inteligente de auto-seleção rápida, taxa de queima atômica com seleção entre SHIB (20), POL (0.01) ou BLK (0.001) e advisory locks no backend. 19 testes automatizados (12 backend + 7 Vitest) cobrindo o fluxo.
- [ ] **Jogos** (`/games` e `/games/game-2048`)
- [ ] **Grupo de Recompensas**:
  - [x] **Faucet & Genesis Miner** (`/faucet` e `/admin/faucet`) — ✅ **Concluído**: Redesign do painel administrativo com Live Preview Card, seletor de cooldown com presets rápidos (15m a 24h), toggle de status ativo/inativo, validação estrita Zod no backend, auditoria completa (`logAdminAction`), RBAC granular (`faucet` e `faucet.view`), eliminação de `@ts-nocheck`, 41 testes automatizados (32 backend/smoke + 9 Vitest), teste de carga k6 (p95 < 14ms) e pentest Kali (20/20 verificações aprovadas).
  - [x] **Internal Offerwall** (`/internal-offerwall` e `/admin/internal-offerwall`) — ✅ **Revisado & Documentado**: Eliminação de `@ts-nocheck` em todo o backend, tipagem estrita de contratos, RBAC granular (`internal_offerwall` e `internal_offerwall.view`), suporte pleno a `PUT` e `PATCH`, trilha de auditoria completa com `logAdminAction`, seção de gestão de hosts CSP (`frame-src`) na UI e documentação OpenAPI 3.0.3 em `docs/admin/internal-offerwall.md`.
  - [x] **Offerwall Analytics** (`/admin/offerwall-analytics`) — ✅ **Revisado & Documentado**: Eliminação de `@ts-nocheck` em todo o módulo `offerwall/`, consolidação analítica multi-provedor (Internas, OfferwallMe, Multiwall, Offerwall.GG, Zerads), RBAC granular (`offerwall` e `offerwall.view`), documentação OpenAPI completa em `docs/admin/offerwall-analytics.md`.
  - [ ] Offerwall Externo (`/offerwall`)
  - [x] **PTC** (`/ptc` e `/admin/ptc`) — ✅ **Concluído em Produção**: Eliminação de `@ts-nocheck`, validação Zod estrita contra URLs maliciosas com `isHttpUrl`, DTOs compartilhados, modal inline de exclusão de tiers, tradução completa com `useTranslation()`, RBAC granular (`ptc` e `ptc.view`), auditoria completa com `logAdminAction` em `admin_audit_logs`, **alerta instantâneo no Telegram** em novas submissões de campanha, 35 testes verdes, carga k6 a 440 req/s (p95 < 8ms, zero 5xx) e pentest Kali (30/30 verificações aprovadas).
  - [ ] Shortlinks (`/shortlinks`)
  - [x] **Read & Earn** (`/read-earn` e `/admin/read-earn`) — ✅ **Concluído em Produção**: Eliminação de `@ts-nocheck` em massa, tipagem estrita de DTOs e contratos compartilhados, modal inline de confirmação de exclusão (sem `window.confirm`), paginação dinâmica no histórico de resgates, RBAC granular (`read_earn` e `read_earn.view`), auditoria completa com `logAdminAction` em `admin_audit_logs`, hash seguro bcrypt com custo 12, 43 testes verdes (100% aprovados), carga k6 sob 15 VUs a 308 req/s (p95 < 6ms, zero 5xx) e pentest Kali (20/20 verificações aprovadas).
  - [ ] YouTube Watch (`/youtube`)
  - [ ] Auto-Mining (`/auto-mining`)

### 3. Categoria: Social (`social`)
- [ ] **Feed Social** (`/social`)
- [ ] **Criadores de Conteúdo** (`/creator`)
- [ ] **Programa de Indicações** (`/referrals`)

### 4. Categoria: Geral (`general`)
- [ ] **Calculadora de Mineração** (`/calculator`)
- [ ] **Roadmap** (`/roadmap`)
- [ ] **Whitepaper** (`/whitepaper`)
- [ ] **Regras & Termos** (`/rules`)
- [ ] **FAQ & Ajuda** (`/faq`)

---

## 🛡️ Painel Administrativo (`/admin`)

| Página / Módulo Admin | Status | Testes & Auditoria | Destaques da Passada |
|---|:---:|---|---|
| **Banners do Dashboard** (`/admin/banners`) | ✅ **Concluído em Produção** | 64 testes (29 backend + 35 Vitest) + Carga k6 + Pentest Kali | Validação Zod com bloqueio de URIs maliciosas (`javascript:`, `data:`), RBAC granular (`banners` e `banners.view`), persistência em `AdminAuditLog`, taxa de erro 0.00% em carga (219 req/s) e compatibilidade total. |
| **Torneios & Ligas** (`/admin/tournaments`) | ✅ **Concluído em Produção** | 127 testes (96 backend + 31 Vitest) + Carga k6 + Pentest Kali | Remoção de script de redirect que causava loop na home, correção de 8 erros TS de drift, extração de componentes modulares (`TournamentCard`, `TournamentForm`, etc.), confirmação inline sem `window.confirm`, paginação no leaderboard, RBAC granular (`tournaments` e `tournaments.view`), auditoria em `AdminAuditLog` e taxa de erro 0.00% em carga (334 req/s). |
| **Faucet (Genesis Miner)** (`/admin/faucet`) | ✅ **Concluído em Produção** | 41 testes (32 backend + 9 Vitest) + Carga k6 + Pentest Kali | Alinhamento com regra de poder temporário, Live Preview do raio de poder, seletor de cooldown rápido (15m a 24h), Zod schemas estritos, RBAC granular (`faucet`), auditoria em `AdminAuditLog` e taxa de erro 0.00% em carga (163 req/s). |
| **Financeiro & Saques** (`/admin/finance`) | ✅ **Concluído em Produção** | 54 testes (48 backend + 6 Vitest) + Carga k6 + Pentest Kali | Criação direta com status `approved` (sem necessidade de aprovação manual para auto-send), painel dinâmico da Hot Wallet com saldo POL ao vivo e cobertura da fila, RBAC granular (`withdrawals` e `finance`), auditoria em `admin_audit_logs`, cache RPC de 5s (latência p95 de 22ms) e pentest Kali (18/18 aprovados). |
| **Read & Earn** (`/admin/read-earn`) | ✅ **Concluído em Produção** | 43 testes backend/smoke + Carga k6 + Pentest Kali | Eliminação de `@ts-nocheck` e números mágicos, DTOs compartilhados, modal inline para exclusão, paginação dinâmica na listagem de resgates, RBAC granular (`read_earn` e `read_earn.view`), auditoria `logAdminAction`, bcrypt custo 12, carga k6 a 308 req/s (p95 < 6ms, 0.00% 5xx) e pentest Kali (20/20). |
| **PTC & Anúncios** (`/admin/ptc`) | ✅ **Concluído em Produção** | 35 testes backend/smoke + Carga k6 + Pentest Kali | Eliminação de `@ts-nocheck`, validação Zod de URLs seguras, DTOs compartilhados, modal inline de exclusão de tier, i18n completo, RBAC granular (`ptc` e `ptc.view`), auditoria `logAdminAction`, alerta Telegram de novas campanhas, carga k6 a 440 req/s (p95 < 8ms, 0.00% 5xx) e pentest Kali (30/30). |
| **Eventos de Oferta** (`/admin/offer-events`) | ✅ **Concluído em Produção** | Vitest + Backend/Smoke + Carga k6 + Pentest Kali | Eliminação de `@ts-nocheck` e correção de tipos TS em vendas, RBAC granular (`events` e `events.view`), auditoria `logAdminAction`, suporte a PUT/PATCH, substituição de `window.confirm` por modal inline e documentação OpenAPI completa em `docs/admin/offer-events.md`. |
| **Marcos de Check-in** (`/admin/checkin-milestones`) | ✅ **Concluído em Produção** | 49 testes backend/smoke + Carga k6 + Pentest Kali | Redesign completo do painel administrativo (substituindo dump de JSON por UI moderna), cards de métricas, modal de criação/edição com seletor de máquinas do catálogo, scanner de anomalias de streak, RBAC granular (`checkin` e `checkin.view`), auditoria `logAdminAction`, suporte a PUT/PATCH e 0% duplicação. |
| **Mini Pass (Battle Pass)** (`/admin/mini-pass`) | ✅ **Concluído em Produção** | Backend/Smoke + Carga k6 + Pentest Kali | Eliminação de `@ts-nocheck` em massa (9 arquivos), contratos tipados, deduplicação de hooks de missão, RBAC granular (`mini_pass` e `mini_pass.view`), auditoria `logAdminAction`, suporte a PUT/PATCH, remoção de `window.confirm` e documentação OpenAPI completa. |




