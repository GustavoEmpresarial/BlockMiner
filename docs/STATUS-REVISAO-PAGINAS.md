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
  - [ ] Faucet (`/faucet`)
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
