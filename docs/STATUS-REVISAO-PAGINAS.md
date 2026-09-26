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
| **Ofertas** (`/offers`) | ⏳ *Pendente* | — | — | Próximo item da categoria Principal. |
| **Carteira** (`/wallet`) | ⏳ *Pendente* | — | — | Próximo item da categoria Principal. |
| **Taxas** (`/taxes`) | ⏳ *Pendente* | — | — | Próximo item da categoria Principal. |
| **Suporte** (`/support`) | ⏳ *Pendente* | — | — | Próximo item da categoria Principal. |

---

## 🎯 Próximas Categorias do Sistema

### 2. Categoria: Ganhar (`earn`)
- [ ] **Torneios** (`/tournaments`)
- [ ] **Check-in Diário** (`/checkin`)
- [ ] **Tarefas Diárias** (`/tasks`)
- [ ] **Mini Pass** (`/mini-pass`)
- [x] **Eventos de Queima** (`/burn`) — ✅ **Concluído**: Agrupamento de máquinas idênticas com contadores `+`/`-`/`Max`, ordenação estrita por menor poder para maior poder (`hashRate` ASC), botão inteligente de auto-seleção rápida, taxa de queima atômica com seleção entre SHIB (20), POL (0.01) ou BLK (0.001) e advisory locks no backend. 19 testes automatizados (12 backend + 7 Vitest) cobrindo o fluxo.
- [ ] **Jogos** (`/games` e `/games/game-2048`)
- [ ] **Grupo de Recompensas**:
  - [x] **Faucet & Genesis Miner** (`/faucet` e `/admin/faucet`) — ✅ **Concluído**: Redesign do painel administrativo com Live Preview Card, seletor de cooldown com presets rápidos (15m a 24h), toggle de status ativo/inativo, validação estrita Zod no backend, auditoria completa (`logAdminAction`), RBAC granular (`faucet` e `faucet.view`), eliminação de `@ts-nocheck`, 41 testes automatizados (32 backend/smoke + 9 Vitest), teste de carga k6 (p95 < 14ms) e pentest Kali (20/20 verificações aprovadas).
  - [ ] Internal Offerwall (`/internal-offerwall`)
  - [ ] Offerwall Externo (`/offerwall`)
  - [ ] PTC (`/ptc`)
  - [ ] Shortlinks (`/shortlinks`)
  - [ ] Read & Earn (`/read-earn`)
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


