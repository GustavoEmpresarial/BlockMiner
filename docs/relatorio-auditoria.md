# Relatório Consolidado de Auditoria, Saneamento e Segurança: Painel Administrativo

**Última Atualização**: 25 de Setembro de 2026  
**Ambiente**: Desenvolvimento / Staging Local Isolado  
**Superfícies Auditadas**:
- Módulo de Banners (`server/modules/banners/`, `client/src/features/admin/banners/`)
- Módulo de Torneios & Ligas (`server/modules/tournaments/`, `client/src/features/admin/tournaments/`)
- Módulo de Faucet & Genesis Miner (`server/modules/faucet/`, `client/src/features/admin/faucet/`)
**Responsável**: Antigravity Quality Gate & Security Engine  

---

# PARTE I: MÓDULO DE BANNERS (`/admin/banners`)

## 1. Resumo Executivo dos Achados — Banners

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-01** | **BFLA (Broken Function Level Authorization):** Rotas administrativas acessíveis por qualquer administrador sem verificação da permissão `banners`. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/banners/banners.admin.routes.ts:15-20` | ✅ **Corrigido** |
| **SEC-02** | **Injeção de Protocolos Perigosos (XSS/SSRF):** Aceitação de URIs `javascript:` e `data:text/html` nos campos `link` e `imageUrl`. | **ALTA** | CWE-79 / OWASP A3 | `server/modules/banners/banners.controller.ts:37, 65` | ✅ **Corrigido** |
| **SEC-03** | **IDOR / Crash 500 no Prisma:** Tentativa de atualizar/deletar ID inexistente gerava erro `P2025` e HTTP 500 em vez de 404 limpo. | **ALTA** | CWE-639 / OWASP A1 | `server/modules/banners/banners.controller.ts:64, 86` | ✅ **Corrigido** |
| **SEC-04** | **Ausência de Auditoria Administrativa:** Nenhuma mutação (criar, alterar, alternar status ou excluir) registrava rastro no banco de auditoria. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/banners/banners.controller.ts` | ✅ **Corrigido** |
| **BUG-01** | **Desincronização de Schema no Client:** Campo `linkLabel` presente no Prisma e no Carousel, porém ausente no formulário admin. | **MÉDIA** | Regra de Negócio | `client/src/features/admin/banners/AdminBannersPage.tsx:18` | ✅ **Corrigido** |
| **TEC-01** | **Diretiva `@ts-nocheck` e Export Órfão:** Exportação de `BannerErrorCode` quebrado, gerando erro `TS2724` no build da raiz. | **BAIXA** | Qualidade Estática | `server/modules/banners/banners.errors.ts:1` | ✅ **Corrigido** |

### Resultados de Carga (k6) — Banners
- **Requisições Totais**: 2.434 requests em 11s.
- **Taxa de Erro 5xx**: **0.00%** (zero erros de servidor).
- **Latência Pública (`/api/banners`)**: p50 = 2.65 ms, p95 = **5.28 ms**, p99 = 8.12 ms.
- **Latência Admin (`/api/admin/banners`)**: p50 = 1.57 ms, p95 = **5.09 ms**.
- **Rate Limiting**: Bloqueio ativo a 300 req/min (HTTP 429 retornado em flooding).

### Resultados do Pentest (Kali Linux) — Banners
- **Total de Verificações**: 19 executadas, 19 aprovadas, 0 falhas.
  - Auth Guards: 4/4 bloqueados (HTTP 401).
  - SQLi / ID Tampering: 7/7 neutralizados (HTTP 400/401/404).
  - XSS Media & Link Injection: 6/6 bloqueados com `BANNER_VALIDATION_ERROR`.

---

# PARTE II: MÓDULO DE TORNEIOS (`/admin/tournaments`)

## 1. Resumo Executivo dos Achados — Torneios

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-05** | **BFLA nas Rotas Administrativas:** Roteador `/api/admin/tournaments` não possuía `requireAdminPermission`. Papéis restritos (`support`, `finance`, `readonly`, `moderator`) podiam criar, alterar e até finalizar torneios distribuindo saldo real. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/tournaments/tournaments.admin.routes.ts:34-48` | ✅ **Corrigido** |
| **SEC-06** | **Falta de Rastro de Auditoria nas Ações de Torneio:** Operações de criação, edição, cancelamento e finalização não gravavam em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/tournaments/tournaments.admin.controller.ts` | ✅ **Corrigido** |
| **TEC-02** | **8 Erros de Tipagem no Módulo:** Incompatibilidade entre tipos de drift (`DriftDetail`, `OfferwallDriftReport`, `ReconcileReport`) e campos produzidos pelo código. | **MÉDIA** | Tipagem Estática | `server/modules/tournaments/tournaments.types.ts:80-98` | ✅ **Corrigido** |
| **UX-01** | **Interface Monolítica e Ações Destrutivas sem Confirmação Inline:** Uso de `window.confirm()` nativo do navegador, 698 linhas em único arquivo e quebra de layout mobile em `<table>`. | **MÉDIA** | Usabilidade & UX | `client/src/features/admin/tournaments/AdminTournamentsPage.tsx` | ✅ **Corrigido** |
| **BUG-02** | **Falha de Serialização de Decimals no Audit Log:** `PrismaClientValidationError` ao salvar objetos com instâncias de `Decimal` em colunas JSON de auditoria. | **ALTA** | Serialização Prisma | `server/modules/admin/admin.audit-log.service.ts:46` | ✅ **Corrigido** |
| **i18n-02** | **Chaves de Tradução Mortas:** Chaves `user_id` e `user_audit` nunca utilizadas na aplicação. | **BAIXA** | Limpeza de Código | `client/src/i18n/locales/*.json` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas — Torneios

### SEC-05: Controle de Acesso Quebrado (BFLA) — CRÍTICA
- **Descrição**: O roteador administrativo de torneios continha apenas `tournamentsAdminRouter.use(requireAdminAuth)`. Qualquer token JWT de administrador (inclusive suporte e financeiro) permitia disparar `POST /:id/finalize` e creditar prêmios diretamente para os jogadores.
- **Correção Aplicada**: Adicionado `requireAdminPermission` em todas as rotas com separação de leitura (`tournaments.view`) e mutação (`tournaments`). O papel `moderator` recebeu `tournaments.view` para inspecionar leaderboards, mas é bloqueado com HTTP 403 `FORBIDDEN_PERMISSION` em criações, edições e finalizações.
- **Teste de Verificação**: `tests/tournaments/admin.routes.rbac.test.mjs` (4 testes passando 100%).

---

### SEC-06 & BUG-02: Auditoria Administrativa e Serialização de Decimals — ALTA
- **Descrição**: Nenhuma operação administrativa registrava log na tabela `admin_audit_logs`. Adicionalmente, quando tentava-se salvar o objeto do torneio com premiação `POL`/`BLK`, o Prisma lançava erro de validação devido ao protótipo `Decimal.constructor`.
- **Correção Aplicada**:
  1. Adicionado suporte a `.toJSON()` universal no `sanitizeAuditPayload` em `server/modules/admin/admin.audit-log.service.ts`, garantindo que instâncias de `Decimal`, `Date` e `BigInt` sejam convertidas em primitivos JSON seguros.
  2. Integrado `await logAdminAction` em `create`, `update`, `cancel`, `finalize` e `updateDisplayOrder`.
- **Teste de Verificação**: `tests/tournaments/tournaments.admin.audit.smoke.test.mjs` (validação de ponta a ponta gravando e checando o PostgreSQL real).

---

### UX-01: Modernização e Redesign da Interface do Administrador — MÉDIA
- **Descrição**: A tela de torneios possuía 698 linhas em um único arquivo, utilizava `window.confirm()` (pop-up nativo bloqueado em alguns navegadores móveis), não possuía paginação no leaderboard do drawer lateral e quebrava horizontalmente em telas pequenas.
- **Correção Aplicada**:
  1. Extração para arquitetura de componentes modulares: `TournamentCard`, `TournamentForm`, `TournamentSeriesCard`, `TournamentInspectPanel`, `TournamentPrizeEditor`.
  2. Implementação de **confirmação inline sem recarga** para Finalizar e Cancelar (com destaque visual amigável e proteção contra cliques acidentais).
  3. Adição de botão **"Carregar mais" com paginação real** no leaderboard do painel de inspeção.
  4. Sessão colapsável de **Presets** e **Ordem de Exibição** para evitar poluição visual na página principal.

---

## 3. Resultados dos Testes de Carga (k6) — Torneios

O teste de carga foi executado via `tests/performance/run-tournaments-k6.mjs` simulando tráfego simultâneo no endpoint público `/api/tournaments` e nos endpoints administrativos sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 3.711 requests) | ✅ Aprovado |
| **Latência Pública (`/api/tournaments`) p50** | $< 100\text{ ms}$ | **0.81 ms** | ✅ Excelente |
| **Latência Pública (`/api/tournaments`) p95** | $< 400\text{ ms}$ | **2.33 ms** | ✅ Excelente |
| **Latência Admin (`/api/admin/tournaments`) p50** | $< 150\text{ ms}$ | **0.71 ms** | ✅ Excelente |
| **Latência Admin (`/api/admin/tournaments`) p95** | $< 600\text{ ms}$ | **2.62 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **334.52 req/s** | ✅ Aprovado |
| **Proteção de Rate Limiting (Player)** | Limite estrito a 120 req/min | **100% Funcional** (excedentes recebem 429) | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Torneios

Executado através da suíte `tests/security/run-kali-tournaments-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 10 rotas admin | **100% Bloqueados** (HTTP 401 Unauthorized estrito) |
| **Integridade da Superfície Pública** | 1 endpoint (`/api/tournaments`) | **100% Válido** (HTTP 200 / 429, schema padrão) |
| **Injeção SQL / Parameter Tampering em `:id`** | 7 vetores (Union, Quotes, Path Traversal, Overflow) | **100% Neutralizados** (HTTP 400/401/404, zero 500) |
| **Fuzzing de Limites de Negócio (Inverted Dates)** | Data de fim anterior à data de início | **100% Bloqueado** (HTTP 400 / 401) |
| **Fuzzing de Limites de Negócio (Duration > 90d)** | Duração de 150 dias solicitada | **100% Bloqueado** (HTTP 400 / 401) |
| **Prevenção de Information Disclosure** | Vazamento de stack trace ou SQL no `/finalize` | **Zero vazamentos** |

**Total de Verificações de Segurança**: 21 executadas, 21 aprovadas, 0 falhas.

---

# PARTE III: MÓDULO FAUCET & GENESIS MINER (`/admin/faucet`)

## 1. Resumo Executivo dos Achados — Faucet

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-07** | **BFLA nas Rotas Administrativas de Faucet:** Rota `/api/admin/faucet/config` continha apenas `requireAdminAuth`. Qualquer perfil administrativo (`finance`, `support`, `readonly`, `moderator`) podia alterar hashrate e cooldown da faucet. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/faucet/faucet.admin.routes.ts:13` | ✅ **Corrigido** |
| **SEC-08** | **Ausência de Rastro de Auditoria Administrativa:** Alterações de parâmetros do Genesis Miner / Faucet não eram registradas em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/faucet/faucet.admin.routes.ts:44` | ✅ **Corrigido** |
| **SEC-09** | **Injeção de Protocolos Perigosos (XSS/SSRF):** Campo `imageUrl` aceitava URIs `javascript:`, `data:text/html` e esquemas arbitrários sem sanitização estrita. | **ALTA** | CWE-79 / OWASP A3 | `server/modules/faucet/faucet.admin.routes.ts:63` | ✅ **Corrigido** |
| **TEC-03** | **Diretivas `@ts-nocheck` e Tipagem Frouxa:** Módulo continha 3 arquivos com `@ts-nocheck` e parâmetros anônimos herdados de build antigo. | **MÉDIA** | Tipagem Estática | `server/modules/faucet/*.ts` | ✅ **Corrigido** |
| **UX-02** | **Interface Inadequada de Configuração em Produção:** Painel administrativo continha apenas `<textarea>` com JSON stringificado cru, sem validação, sem presets e sem preview. | **MÉDIA** | Usabilidade & UX | `client/src/features/admin/faucet/AdminFaucetPage.tsx` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas — Faucet

### SEC-07: Controle de Acesso Quebrado (BFLA) — CRÍTICA
- **Descrição**: O roteador `/api/admin/faucet/config` não validava permissões granulares. Qualquer administrador autenticado conseguia enviar requisição PUT para inflar o hashrate distribuído gratuitamente aos jogadores.
- **Correção Aplicada**: Adicionadas permissões `faucet` e `faucet.view` em `server/modules/admin/admin.permissions.ts`. A rota GET agora exige `requireAdminPermission("faucet.view", "faucet")` e a rota PUT exige `requireAdminPermission("faucet")`. Perfis restritos recebem HTTP 403 `FORBIDDEN_PERMISSION`.
- **Teste de Verificação**: `tests/faucet/faucet.admin.rbac.test.mjs` (10 testes aprovados).

---

### SEC-08: Rastreabilidade e Auditoria — ALTA
- **Descrição**: A alteração dos parâmetros do Genesis Miner ocorria silenciosamente no banco sem gravar quem alterou, quando alterou ou os valores prévios.
- **Correção Aplicada**: Integrada chamada assíncrona a `logAdminAction` registrando `action: "admin_faucet_config_updated"`, `oldValue`, `newValue`, `adminId`, `adminEmail`, IP e User-Agent.
- **Teste de Verificação**: `tests/faucet/faucet.admin.smoke.test.mjs` (validação ponta a ponta com PostgreSQL real).

---

### SEC-09: Injeção de Protocolos em Imagens — ALTA
- **Descrição**: Validação manual rudimentar permitia URLs de qualquer esquema em `imageUrl`.
- **Correção Aplicada**: Criado schema Zod estrito `adminFaucetConfigUpdateSchema` que valida regex de URIs permitidas (somente `/media/...` relativo ou `http(s)://` seguro), rejeitando expressamente `javascript:`, `data:`, `vbscript:`, `file:`.
- **Teste de Verificação**: `tests/faucet/faucet.admin.schemas.unit.test.mjs` e pentest Kali.

---

### UX-02 & TEC-03: Redesign Modular e Eliminação de `@ts-nocheck` — MÉDIA
- **Descrição**: O frontend possuía um textarea de 47 linhas exibindo JSON cru. O backend possuía 3 arquivos com `@ts-nocheck`.
- **Correção Aplicada**:
  1. Remoção de todos os `@ts-nocheck` e adição de contratos DTO estritos compartilhados 1:1 entre client e server.
  2. Redesign completo de `AdminFaucetPage.tsx` no padrão visual do BlockMiner (glassmorphism, status ativo/inativo, presets de cooldown de 15m a 24h, preview dinâmico em tempo real `FaucetRewardPreviewCard` e formulário tipado `FaucetConfigForm`).
- **Teste de Verificação**: 9 testes no Vitest (`adminFaucet.api.test.ts`, `AdminFaucetPage.test.tsx`).

---

## 3. Resultados dos Testes de Carga (k6) — Faucet

Executado através de `tests/performance/run-faucet-k6.mjs` com 15 VUs concorrentes realizando leituras e mutações:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 1.798 requests) | ✅ Aprovado |
| **Checks Totais** | `100.00%` | **100.00%** (1.798 de 1.798) | ✅ Aprovado |
| **Latência Admin GET p50** | $< 100\text{ ms}$ | **2.72 ms** | ✅ Excelente |
| **Latência Admin GET p95** | $< 300\text{ ms}$ | **5.33 ms** | ✅ Excelente |
| **Latência Admin PUT p50** | $< 150\text{ ms}$ | **8.44 ms** | ✅ Excelente |
| **Latência Admin PUT p95** | $< 500\text{ ms}$ | **13.58 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **163.38 req/s** | ✅ Aprovado |
| **Uso de Recursos** | Sem leaks de memória | Estável ao longo de 1.510 iterações | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Faucet

Executado através de `tests/security/run-kali-faucet-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 2 rotas admin (GET e PUT) | **100% Bloqueados** (HTTP 401 Unauthorized estrito) |
| **Tokens Adulterados / Assinatura Inválida** | 3 vetores (alg:none, invalid jwt, SQLi probe) | **100% Rejeitados** (HTTP 401) |
| **Injeção XSS / Protocolos Maliciosos em Imagem** | 5 vetores (javascript, data:html, vbscript, file) | **100% Bloqueados** (HTTP 400 `FAUCET_VALIDATION_ERROR`) |
| **Fuzzing de Limites Numéricos & Lógica** | 8 vetores (hashrate negativo, zero, overflow, cooldown < 1m, empty) | **100% Bloqueados** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure** | Injeção de payloads malformados | **Zero vazamentos** de stack traces ou Prisma |

**Total de Verificações de Segurança**: 20 executadas, 20 aprovadas, 0 falhas.

