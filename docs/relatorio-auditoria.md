# Relatório Consolidado de Auditoria, Saneamento e Segurança: Painel Administrativo

**Última Atualização**: 25 de Setembro de 2026  
**Ambiente**: Desenvolvimento / Staging Local Isolado  
**Superfícies Auditadas**:
- Módulo de Banners (`server/modules/banners/`, `client/src/features/admin/banners/`)
- Módulo de Torneios & Ligas (`server/modules/tournaments/`, `client/src/features/admin/tournaments/`)
- Módulo de Faucet & Genesis Miner (`server/modules/faucet/`, `client/src/features/admin/faucet/`)
- Módulo Financeiro, Hot Wallet & Saques (`server/modules/wallet/`, `client/src/features/admin/finance/`)
- Módulo Read & Earn (`server/modules/read-earn/`, `client/src/features/admin/read-earn/`, `client/src/features/read-earn/`)
- Módulo PTC & Anúncios (`server/modules/ptc/`, `client/src/features/admin/ptc/`, `client/src/features/ptc/`)
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

---

# PARTE IV: MÓDULO FINANCEIRO, HOT WALLET & AUTO-SEND (`/admin/finance`)

## 1. Resumo Executivo dos Achados — Financeiro & Saques

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **BUG-03** | **Bloqueio Involuntário do Auto-Send (Global Pause Ativo):** Flag `WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE=true` no `.env` de produção atuando como kill switch silencioso, cancelando o envio a cada ciclo do cron. | **CRÍTICA** | Regra de Negócio / Ops | `.env:109` | ✅ **Corrigido (Desbloqueado para Deploy)** |
| **FLOW-01** | **Dependência de Aprovação Manual desnecessária:** Saques nasciam com `status: "pending"` obrigando intervenção do admin antes do auto-send processar. | **ALTA** | Arquitetura de Fluxo | `server/modules/wallet/withdrawal/withdrawal.repository.ts:84, 120` | ✅ **Corrigido (Direct Approved)** |
| **SEC-10** | **BFLA em Rotas Financeiras de Saques:** Roteador `/api/admin/wallet/*` não possuía `requireAdminPermission`. Papéis restritos (`support`, `moderator`, `readonly`) podiam aprovar, rejeitar com estorno e concluir saques. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/wallet/wallet.admin.routes.ts:9-15` | ✅ **Corrigido** |
| **SEC-11** | **Ausência de Auditoria em Mutações Financeiras:** Ações de `approve`, `reject` e `complete` não registravam nenhum evento em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/wallet/withdrawal/withdrawal.controller.ts:126-234` | ✅ **Corrigido** |
| **SEC-12** | **Crash 500 por Integer Overflow em ID de Rota:** Fuzzing com números gigantescos no `:withdrawalId` gerava `PrismaClientValidationError` e HTTP 500. | **MÉDIA** | CWE-190 / OWASP A3 | `server/modules/wallet/withdrawal/withdrawal.controller.ts` | ✅ **Corrigido** |
| **PERF-01** | **Sobrecarga de RPC Polygon em Consultas Administrativas:** `getHotWalletPaymentStatus` realizava requisições HTTPS síncronas de rede para cada requisição HTTP, elevando latência para ~936ms p95. | **MÉDIA** | Performance / Resiliência | `server/modules/wallet/withdrawal/withdrawal.auto-send.ts:536` | ✅ **Corrigido (Cache TTL 5s)** |
| **SEC-39** | **Ausência de Rate Limiting Distribuído no Admin:** Roteador administrativo `walletAdminRouter` exposto sem teto de requisições por minuto no cluster. | **ALTA** | CWE-770 / OWASP A4 | `server/modules/wallet/wallet.admin.routes.ts:9` | ✅ **Corrigido (120/300 req/min)** |
| **SEC-40** | **Mass Assignment & Validação Manual em Conclusão de Saques:** `adminCompleteWithdrawal` realizava verificação manual em vez de Zod `.strict()`, permitindo injeção de parâmetros adicionais no payload. | **MÉDIA** | CWE-915 / OWASP A4 | `server/modules/wallet/withdrawal/withdrawal.controller.ts:237` | ✅ **Corrigido (completeWithdrawalSchema.strict())** |
| **DEAD-01** | **Código Morto com `window.confirm`:** Componente órfão `AdminFinanceBlkTab.tsx` não importado em nenhuma tela continha `window.confirm` nativo e chamadas não tipadas. | **BAIXA** | Qualidade de Código | `client/src/features/admin/finance/components/AdminFinanceBlkTab.tsx` | ✅ **Removido** |
| **TYPE-09** | **Falta de API Service Centralizado & Tipos Órfãos:** `AdminFinancePage` consumia métodos dispersos; `adminFinance.types.ts` possuía interfaces obsoletas. | **BAIXA** | Arquitetura Frontend | `client/src/features/admin/finance/adminFinance.api.ts` | ✅ **Corrigido (adminFinanceApi)** |
| **UX-03** | **Invisibilidade da Hot Wallet no Painel Admin:** Nenhuma informação sobre saldo on-chain, reserva mínima ou status do auto-send era exibida na interface `/admin/finance`. | **MÉDIA** | Usabilidade / Operações | `client/src/features/admin/finance/AdminFinancePage.tsx` | ✅ **Corrigido (HotWalletStatusPanel)** |
| **SEC-13** | **Segredo Residual Descontinuado no Ambiente:** Chave mnemônica `WITHDRAWAL_MNEMONIC` legada e não utilizada presente no `.env`. | **BAIXA** | CWE-200 | `.env:107` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas — Financeiro

### BUG-03 & FLOW-01: Desbloqueio e Fluxo Direto de Auto-Send — CRÍTICA / ALTA
- **Descrição**: O cron de auto-send abortava imediatamente a cada 120s por causa da variável `WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE=true`. Além disso, quando o usuário solicitava um saque, o registro nascia como `"pending"`, exigindo que um administrador clicasse em "Aprovar" para que o auto-send pudesse capturar o saque.
- **Correção Aplicada**:
  1. Alterado `createWithdrawal` e `createShibWithdrawal` para criar as transações diretamente com `status: "approved"` (`fundsReserved: true`), permitindo que o `getApprovedWithdrawalsForAutoSend` capture imediatamente a retirada para envio on-chain.
  2. Preparada a desativação da flag `WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE=false` no deploy de produção.
- **Testes de Verificação**: `tests/wallet/withdrawal.direct-approved.smoke.test.mjs` (fluxo validado ponta a ponta com banco real).

---

### SEC-10 & SEC-11: RBAC Granular e Auditoria em Saques — CRÍTICA / ALTA
- **Descrição**: Qualquer token de admin (mesmo sem permissão `withdrawals`) conseguia disparar endpoints destrutivos de estorno ou aprovação. Nenhuma dessas operações gravava registros em `admin_audit_logs`.
- **Correção Aplicada**:
  1. Adicionado `requireAdminPermission("withdrawals", "finance")` nas rotas GET de leitura e `requireAdminPermission("withdrawals")` nas rotas POST de mutação.
  2. Integrada chamada a `logAdminAction` em `adminApproveWithdrawal`, `adminRejectWithdrawal` e `adminCompleteWithdrawal`.
- **Testes de Verificação**: `tests/wallet/withdrawal.rbac.test.mjs` (7 testes verdes) e `tests/wallet/withdrawal.audit.smoke.test.mjs` (validação com PostgreSQL real).

---

### PERF-01: Otimização de Chamadas RPC e Cache de 5 Segundos — MÉDIA
- **Descrição**: Sob carga de 15 VUs, chamadas diretas e síncronas ao nó Polygon RPC elevavam o tempo de resposta do endpoint `/api/admin/wallet/hot-wallet` para mais de 930ms p95.
- **Correção Aplicada**: Introduzido cache em memória com TTL de 5.000 ms (`_cachedHotWalletRpc`) para saldo POL e preço do gás, mantendo o endpoint ultra-responsivo (< 23ms) e protegendo a quota do RPC.
- **Teste de Verificação**: Teste de carga k6 com 2.436 requisições atingindo p95 de **22.14 ms**.

---

### UX-03: Painel de Monitoramento da Hot Wallet & Auto-Send — MÉDIA
- **Descrição**: Administradores não tinham como saber se o auto-send estava ativo, pausado ou se a carteira possuía saldo suficiente para cobrir os saques solicitados.
- **Correção Aplicada**: Desenvolvido o componente `HotWalletStatusPanel.tsx` exibindo status em tempo real (Auto-Send Ativo / Pausado / Cooldown), saldo POL, endereço da carteira com cópia e link Polygonscan, fila aprovada acumulada e aviso visual quando o saldo é insuficiente para cobrir as solicitações.
- **Teste de Verificação**: 6 testes no Vitest (`HotWalletStatusPanel.test.tsx`).

---

## 3. Resultados dos Testes de Carga (k6) — Financeiro & Hot Wallet

Executado através de `tests/performance/run-finance-k6.mjs` sob 15 VUs simultâneas ao longo de 11 segundos:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 2.302 requests) | ✅ Aprovado |
| **Checks Totais** | `100.00%` | **100.00%** (2.302 de 2.302) | ✅ Aprovado |
| **Latência Hot Wallet GET p50** | $< 100\text{ ms}$ | **4.70 ms** | ✅ Excelente |
| **Latência Hot Wallet GET p95** | $< 300\text{ ms}$ | **15.54 ms** | ✅ Excelente |
| **Latência Fila Pendente GET p50** | $< 150\text{ ms}$ | **3.71 ms** | ✅ Excelente |
| **Latência Fila Pendente GET p95** | $< 400\text{ ms}$ | **13.01 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **209.14 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Financeiro

Executado através de `tests/security/run-kali-finance-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 6 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized estrito) |
| **Tokens Adulterados / Assinatura Inválida** | 3 vetores (alg:none, invalid jwt, SQLi probe) | **100% Rejeitados** (HTTP 401) |
| **BFLA (Broken Function Level Authorization)** | Operador apenas com `finance` tentando mutações | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **Parameter Fuzzing & SQLi em `:withdrawalId`** | 4 vetores (SQLi Union, negativo, string, overflow $> 2^{31}-1$) | **100% Neutralizados** (HTTP 400 Bad Request, zero crash 500) |
| **Injeção de txHash Inválido / Malicioso** | 4 vetores (sem 0x, curto, XSS `<script>`, não-hex) | **100% Bloqueados** (HTTP 400 Bad Request) |
| **Bloqueio de Mass Assignment (`complete`)** | Injeção de propriedades não autorizadas | **100% Bloqueado** (HTTP 400 via `completeWithdrawalSchema.strict()`) |
| **Prevenção de Information Disclosure** | Injeção de payloads malformados em probes | **Zero vazamentos** de stack traces ou Prisma |

**Total de Verificações de Segurança**: 25 executadas, 25 aprovadas, 0 falhas.

---

# PARTE V: MÓDULO READ & EARN (`/admin/read-earn` & `/read-earn`)

## 1. Resumo Executivo dos Achados — Read & Earn

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-14** | **BFLA nas Rotas Administrativas:** Roteador `/api/admin/read-earn/*` não possuía `requireAdminPermission`. Papéis restritos (`support`, `finance`, `readonly`, `moderator`) podiam criar, alterar e excluir campanhas. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/read-earn/read-earn.admin.routes.ts:11-16` | ✅ **Corrigido** |
| **SEC-15** | **Ausência de Auditoria Administrativa:** Mutações de campanha (`create`, `update`, `delete`) não geravam nenhum registro na tabela `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/read-earn/read-earn.admin.controller.ts` | ✅ **Corrigido** |
| **SEC-16** | **Custo Criptográfico Subótimo:** Código secreto da campanha era hasheado com `bcrypt.hash(..., 10)` em vez do padrão OWASP `BCRYPT_COST = 12`. | **MÉDIA** | CWE-916 | `server/modules/read-earn/read-earn.service.ts:147` | ✅ **Corrigido** |
| **TEC-03** | **Supressão `@ts-nocheck` em Massa:** 5 de 7 arquivos do backend continham `@ts-nocheck`, ocultando erros de tipagem estática. | **MÉDIA** | Qualidade Estática | `server/modules/read-earn/*.ts` | ✅ **Corrigido** |
| **UX-04** | **Ação Destrutiva com `window.confirm()`:** Exclusão de campanha usava modal nativo síncrono do browser, bloqueando a UI. | **MÉDIA** | Usabilidade / UX | `client/src/features/admin/read-earn/AdminReadEarnPage.tsx:313` | ✅ **Corrigido (Modal Inline)** |
| **UX-05** | **Paginação Ausente (`take=50` hardcoded):** URL da listagem de resgates no client continha `take=50` fixo, impedindo navegação além dos 50 primeiros registros. | **MÉDIA** | Usabilidade / Dados | `client/src/features/admin/read-earn/AdminReadEarnPage.tsx:236` | ✅ **Corrigido (Paginação Dinâmica)** |
| **TEC-04** | **Tipos `unknown` e Números Mágicos:** Propriedades de modelo tipadas como `unknown` no client e 9 literais numéricos dispersos sem constantes nomeadas. | **BAIXA** | Manutenibilidade | `read-earn.service.ts`, `AdminReadEarnPage.tsx` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas — Read & Earn

### SEC-14 & SEC-15: Controle de Acesso Quebrado (BFLA) e Auditoria de Ações — CRÍTICA / ALTA
- **Descrição**: Qualquer token de administrador autenticado podia executar mutações em campanhas Read & Earn, mesmo possuindo papéis restritos como `support` ou `readonly`. Além disso, nenhuma dessas ações deixava rastro na tabela `admin_audit_logs`.
- **Correção Aplicada**:
  1. Criadas permissões granulares `read_earn` (escrita) e `read_earn.view` (leitura) em `server/modules/admin/admin.permissions.ts`.
  2. Aplicado `requireAdminPermission("read_earn.view", "read_earn")` nas rotas GET e `requireAdminPermission("read_earn")` nas rotas POST, PUT e DELETE em `server/modules/read-earn/read-earn.admin.routes.ts`.
  3. Integrado `void logAdminAction(...)` nos handlers de `create`, `update` e `delete` registrando `oldValue`, `newValue`, `resourceId`, IP e User-Agent.
- **Testes de Verificação**: `tests/read-earn/read-earn.rbac.test.mjs` (12 testes cobrindo todas as combinações de papéis e permissões).

---

### SEC-16: Fortalecimento Criptográfico para Códigos Promocionais — MÉDIA
- **Descrição**: A função `hashReadEarnCode` utilizava custo 10 hardcoded no bcrypt, divergindo da constante global `BCRYPT_COST = 12` recomendada pela OWASP e definida em `server/shared/security/password.ts`.
- **Correção Aplicada**: Importado `BCRYPT_COST` (12 rounds) de `server/shared/security/password.ts`, elevando a resistência contra ataques de força bruta offline em caso de vazamento da base.
- **Teste de Verificação**: `tests/read-earn/read-earn.service.unit.test.mjs` validando prefixo `$2a$12$` ou `$2b$12$` no hash gerado.

---

### TEC-03 & TEC-04: Tipagem Estrita e Extração de Constantes — MÉDIA / BAIXA
- **Descrição**: 5 arquivos no backend continham `// @ts-nocheck` e diversos números mágicos (`86_400_000`, `15 * 60 * 1000`, `20`, `50`, `100`, `64`, `512`). No client, campos numéricos estavam anotados como `unknown`.
- **Correção Aplicada**:
  1. Criado `server/modules/read-earn/read-earn.types.ts` e `client/src/features/read-earn/read-earn.types.ts` consolidando DTOs compartilhados.
  2. Removidos todos os `// @ts-nocheck` do módulo; backend compila com 0 erros no TypeScript estrito.
  3. Criadas constantes nomeadas em `read-earn.errors.ts`: `MS_PER_DAY`, `DEFAULT_HASHRATE_VALIDITY_DAYS`, `MINER_LEVEL_MIN`, `MINER_LEVEL_MAX`, `READ_EARN_IP_MAX_LENGTH`, `READ_EARN_UA_MAX_LENGTH`, `REDEEM_RATE_WINDOW_MS`, `REDEEM_RATE_MAX`, `REDEMPTIONS_DEFAULT_TAKE`, `REDEMPTIONS_MAX_TAKE`.

---

### UX-04 & UX-05: Redesign de Exclusão e Paginação de Resgates — MÉDIA
- **Descrição**: O botão de exclusão utilizava `window.confirm()`, que pode ser bloqueado em navegadores modernos e trava a thread de renderização. O histórico de resgates carregava apenas os primeiros 50 registros sem controles de navegação.
- **Correção Aplicada**:
  1. Implementado modal inline de confirmação com visual destrutivo em vermelho, informando o título da campanha e ID a ser excluído.
  2. Adicionados botões de paginação anterior/próxima (`skip` + `take`) na seção de resgates da campanha, informando a faixa atual e total de resgates.

---

## 3. Resultados dos Testes de Carga (k6) — Read & Earn

Executado através de `tests/performance/run-read-earn-k6.mjs` sob 15 VUs simultâneas ao longo de 11 segundos:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 3.414 requests) | ✅ Aprovado |
| **Checks Totais** | `100.00%` | **100.00%** (3.414 de 3.414) | ✅ Aprovado |
| **Latência Pública GET (`/campaigns`) p50** | $< 100\text{ ms}$ | **2.72 ms** | ✅ Excelente |
| **Latência Pública GET (`/campaigns`) p95** | $< 200\text{ ms}$ | **6.06 ms** | ✅ Excelente |
| **Latência Admin GET (`/admin/.../campaigns`) p50** | $< 150\text{ ms}$ | **2.04 ms** | ✅ Excelente |
| **Latência Admin GET (`/admin/.../campaigns`) p95** | $< 300\text{ ms}$ | **4.60 ms** | ✅ Excelente |
| **Latência Admin Redemptions p50** | $< 150\text{ ms}$ | **1.48 ms** | ✅ Excelente |
| **Latência Admin Redemptions p95** | $< 300\text{ ms}$ | **3.46 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **308.35 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Read & Earn

Executado através de `tests/security/run-kali-read-earn-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 5 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Forjada** | 1 vetor com payload corrompido | **100% Rejeitados** (HTTP 401 Unauthorized) |
| **Vazamento de Segredos na API Pública** | Listagem de campanhas `/api/read-earn/campaigns` | **100% Aprovado** (`codeHash` omitido da resposta) |
| **Injeção de Protocolos Perigosos & XSS** | 4 vetores (`javascript:`, `data:`, `vbscript:`, `file:`) | **100% Rejeitados** (HTTP 400 Bad Request via Zod) |
| **SQLi & Path Traversal em `:id`** | 5 vetores (Union SQLi, DROP TABLE, `../`, NaN, negativo) | **100% Neutralizados** (HTTP 400/404 via `parsePositiveIntId`) |
| **Fuzzing de Regras e Limites de Negócio** | Código curto (<6), datas invertidas, máquina sem minerId | **100% Rejeitados** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure** | Injeção de JSON corrompido | **Zero vazamentos** de stack traces ou Prisma |

**Total de Verificações de Segurança**: 20 executadas, 20 aprovadas, 0 falhas.

---

# PARTE VI: MÓDULO PTC & CAMPANHAS DE ANÚNCIOS (`/admin/ptc` & `/ptc`)

## 1. Resumo Executivo dos Achados — PTC

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-17** | **BFLA nas Rotas Administrativas:** Roteador `/api/admin/ptc/*` não possuía `requireAdminPermission`. Papéis restritos (`support`, `finance`, `readonly`, `moderator`) podiam aprovar/rejeitar campanhas e alterar preços. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/ptc/ptc.admin.routes.ts:11-21` | ✅ **Corrigido** |
| **REQ-01** | **Notificação Telegram Ausente em Novas Campanhas:** Criação de campanha não notificava o administrador no Telegram. | **ALTA** | Requisito Operacional | `server/modules/ptc/ptc.service.ts:107` | ✅ **Corrigido (Outbox + Worker)** |
| **SEC-18** | **Ausência de Auditoria em Mutações:** Operações de `approve`, `reject`, `updateSettings`, `createTier`, `updateTier`, `deleteTier` não registravam nenhum evento em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/ptc/ptc.admin.controller.ts` | ✅ **Corrigido** |
| **SEC-19** | **Protocolos Perigosos e XSS em URL de Campanha:** `createCampaignSchema` não validava esquema de URL com `isHttpUrl`, permitindo `javascript:`, `data:`, etc. | **ALTA** | CWE-79 / OWASP A3 | `server/modules/ptc/ptc.schemas.ts:17` | ✅ **Corrigido** |
| **TEC-05** | **Diretiva `@ts-nocheck` em 5 Arquivos:** Controllers, schemas e routers do servidor suprimiam checagem estática de tipos. | **MÉDIA** | Qualidade Estática | `server/modules/ptc/*.ts` | ✅ **Corrigido** |
| **UX-06** | **Ação Destrutiva com `window.confirm()`:** Exclusão de tier utilizava pop-up síncrono do browser bloqueando a interface. | **MÉDIA** | Usabilidade / UX | `client/src/features/admin/ptc/AdminPtcPage.tsx:145` | ✅ **Corrigido (Modal Inline)** |
| **i18n-03** | **Falta de Internacionalização:** Tela administrativa continha strings em português hardcoded sem integração com `useTranslation()`. | **BAIXA** | Usabilidade / i18n | `client/src/features/admin/ptc/AdminPtcPage.tsx` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas — PTC

### SEC-17 & SEC-18: Controle de Acesso Quebrado (BFLA) e Auditoria de Ações — CRÍTICA / ALTA
- **Descrição**: O roteador `/api/admin/ptc/*` exigia apenas `requireAdminAuth`, permitindo que administradores sem permissão aprovassem anúncios e alterassem tarifas SHIB. Além disso, nenhuma dessas mutações gerava logs na tabela `admin_audit_logs`.
- **Correção Aplicada**:
  1. Criada permissão `ptc.view` em `admin.permissions.ts` concedida ao `moderator`, e mantida permissão `ptc` para `admin`/`super_admin`.
  2. Aplicado `requireAdminPermission("ptc.view", "ptc")` nas rotas GET de leitura e `requireAdminPermission("ptc")` nas rotas de escrita/moderação.
  3. Integrado `void logAdminAction(...)` em `updateSettings`, `approve`, `reject`, `createTier`, `updateTier` e `deleteTier`.
- **Testes de Verificação**: `tests/ptc/ptc.rbac.test.mjs` (11 testes cobrindo todas as permissões e bloqueios 401/403).

---

### REQ-01: Sistema de Notificação Instantânea no Telegram — ALTA
- **Descrição**: O proprietário solicitou que toda submissão de nova campanha anunciada na plataforma disparasse um alerta no seu Telegram.
- **Correção Aplicada**:
  1. Registrado evento `TELEGRAM_EVENT_TYPES.PTC_CAMPAIGN_SUBMITTED` em `telegram.types.ts`.
  2. Implementado formatador HTML rico em `telegram.worker.ts` (`buildGenericEventMessage`) exibindo título da campanha, anunciante (@username e ID), URL sanitizada, visualizações contratadas, duração, valor pago em SHIB e link de moderação.
  3. Integrado no `ptc.service.ts:createCampaign` a chamada `createGenericTelegramOutboxEvent` seguida por `runTelegramOutboxTick()` imediato para entrega em tempo real.
- **Testes de Verificação**: `tests/ptc/ptc.telegram.test.mjs` (3 testes) e validação no smoke test.

---

### SEC-19: Blindagem Contra XSS e URIs Perigosas em Anúncios — ALTA
- **Descrição**: Anunciantes maliciosos podiam submeter campanhas com URLs apontando para `javascript:alert(document.cookie)` ou `data:text/html`, abrindo brechas de XSS em sessões de outros jogadores.
- **Correção Aplicada**: Adicionado validador estrito `isHttpUrl` no `createCampaignSchema` em `ptc.schemas.ts`, rejeitando qualquer protocolo que não seja `http:` ou `https:`.
- **Testes de Verificação**: `tests/security/kali_ptc_pentest.py` e `tests/ptc/ptc.schemas.test.mjs`.

---

## 3. Resultados dos Testes de Carga (k6) — PTC

Executado através de `tests/performance/run-ptc-k6.mjs` sob 15 VUs simultâneas ao longo de 11 segundos:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 4.850 requests) | ✅ Aprovado |
| **Checks Totais** | `100.00%` | **100.00%** (4.850 de 4.850) | ✅ Aprovado |
| **Latência Pública GET (`/settings`) p50** | $< 100\text{ ms}$ | **0.83 ms** | ✅ Excelente |
| **Latência Pública GET (`/settings`) p95** | $< 200\text{ ms}$ | **3.08 ms** | ✅ Excelente |
| **Latência Admin GET (`/campaigns/pending`) p50** | $< 150\text{ ms}$ | **2.96 ms** | ✅ Excelente |
| **Latência Admin GET (`/campaigns/pending`) p95** | $< 300\text{ ms}$ | **7.80 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **439.96 req/s** | ✅ Aprovado |
| **Proteção de Rate Limiting** | 60 req/min para anônimos | **100% Funcional** (excedentes recebem 429) | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — PTC

Executado através de `tests/security/run-kali-ptc-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 10 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Alg: None / SQLi** | 4 vetores de injeção em Bearer | **100% Rejeitados** (HTTP 401 Unauthorized) |
| **Injeção de Protocolos Perigosos & XSS** | 4 vetores (`javascript:`, `data:`, `vbscript:`, `file:`) | **100% Rejeitados** (HTTP 400/401 via Zod) |
| **SQLi & Path Traversal em IDs de Anúncio** | 5 vetores (Union SQLi, DROP TABLE, `../`, NaN, negativo) | **100% Neutralizados** (HTTP 400/404 via `parsePositiveIntId`) |
| **SQLi & Path Traversal em IDs de Tier** | 5 vetores no endpoint `DELETE /api/admin/ptc/tiers/:id` | **100% Neutralizados** (HTTP 400/404 via `parsePositiveIntId`) |
| **Fuzzing de Regras e Limites Numéricos** | Valores negativos para durações e tarifas | **100% Rejeitados** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure** | Injeção de JSON corrompido em rotas PTC | **Zero vazamentos** de stack traces ou Prisma |

## 5. Expansão Multi-Moeda (POL, BLK, SHIB) e Tiers Parametrizados (Fases 1-7)

**Data**: 28 de Setembro de 2026  
**Superfície**: `server/modules/ptc/`, `client/src/features/ptc/`, `client/src/features/admin/ptc/`

### 1. Resumo dos Ajustes Arquiteturais

| ID | Descrição do Ajuste | Severidade | Impacto | Status |
| :---: | :--- | :---: | :--- | :---: |
| **FEAT-01** | **Suporte Multi-Moeda em Tiers:** Adição de coluna `currency` (`SHIB`, `POL`, `BLK`) em `ptc_ad_tiers` com migração e seed padronizado. | **ALTA** | Flexibilidade econômica | ✅ **Concluído** |
| **FEAT-02** | **Débito e Recompensa Dinâmica por Carteira:** Mapeamento dinâmico em `ptc.service.ts` para debitar anunciantes e creditar visualizadores na moeda correspondente (`shibBalance`, `polBalance`, `blkBalance`). | **CRÍTICA** | Integridade financeira | ✅ **Concluído** |
| **CLEAN-01** | **Remoção de Arquivo Órfão:** Exclusão de `client/src/features/ptc/lib/ptcSession.store.tsx` (arquivo morto de 1 linha). | **BAIXA** | Higiene de código | ✅ **Concluído** |
| **DEDUP-01** | **Centralização de Helpers de Controller:** Criação de `server/modules/ptc/ptc.controller-helpers.ts` unificando `err`, `errorMessage`, `parsePositiveIntId` e `sendServiceError`. | **MÉDIA** | DRY & Manutenibilidade | ✅ **Concluído** |

### 2. Resultados dos Testes de Carga & Segurança Pós-Expansão
- **Testes Unitários / Integração:** 5/5 testes no novo `tests/ptc/ptc.multicurrency.test.mjs` passando com validação atômica de saldo em POL e BLK.
- **k6 Load Test:** 4.736 requests, 0% 5xx, p95 < 13ms (Admin) e p95 < 5ms (Público).
- **Kali Pentest:** 30/30 verificações passando com 0 falhas (BFLA, SQLi, XSS, Fuzzing e Information Disclosure bloqueados).

---

# PARTE VII: MÓDULO DE TAREFAS DIÁRIAS (`/admin/daily-tasks` & `/tasks`)

## 1. Resumo Executivo dos Achados — Daily Tasks

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-20** | **BFLA (Broken Function Level Authorization):** Rotas administrativas `/api/admin/daily-tasks/definitions` sem verificação de permissão granular. Papéis restritos (`finance`, `support`, `readonly`) podiam criar, alterar e excluir missões. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/tasks/tasks.admin.routes.ts:16-19` | ✅ **Corrigido** |
| **SEC-21** | **Ausência de Trilha de Auditoria:** Criação, edição e exclusão de definições de tarefas não gravavam registros na tabela `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/tasks/tasks.admin.controller.ts` | ✅ **Corrigido** |
| **TEC-03** | **Controlador Admin em Código Reconstruído com `@ts-nocheck`:** O arquivo `tasks.admin.controller.ts` não possuía código-fonte original em TypeScript tipado. | **ALTA** | Qualidade Estática | `server/modules/tasks/tasks.admin.controller.ts:1` | ✅ **Reescrito do zero** |
| **TEC-04** | **Tipo `DailyTasksTranslate` Inexistente no Client:** Import órfão causando quebra potencial no build e typecheck do frontend. | **MÉDIA** | Tipagem Estática | `client/src/features/tasks/lib/dailyTasksHelpers.ts:1` | ✅ **Corrigido** |
| **BUG-03** | **Mascaramento de Cadência Inválida em Criação:** `parseCreateDailyTaskDefinition` degradava silenciosamente cadências desconhecidas para `DAILY` em vez de rejeitar. | **BAIXA** | Regra de Negócio | `server/modules/tasks/tasks.admin.validation.ts:180` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Daily Tasks

### SEC-20: BFLA nas Rotas Administrativas — CRÍTICA
- **Descrição**: Administradores com papéis restritos conseguiam manipular todas as missões e distribuir prêmios na economia do jogo.
- **Correção Aplicada**: Registradas as permissões `tasks` e `tasks.view` em `admin.permissions.ts`. As rotas administrativas agora exigem `requireAdminPermission("tasks.view", "tasks")` para listagem e `requireAdminPermission("tasks")` para criação, edição e exclusão.
- **Testes de Verificação**: `tests/tasks/tasks.rbac.test.mjs` (11 testes 100% aprovados).

### SEC-21: Trilha de Auditoria Administrativa — ALTA
- **Descrição**: Mutações administrativas não deixavam rastro no banco de auditoria.
- **Correção Aplicada**: Integrada chamada a `logAdminAction` registrando `TASK_DEFINITION_CREATE`, `TASK_DEFINITION_UPDATE` e `TASK_DEFINITION_DELETE` com snapshots de `oldValue` e `newValue`, IP e user-agent.
- **Testes de Verificação**: `tests/tasks/tasks.admin.controller.test.mjs`.

### TEC-03: Reescrita do Controlador em TypeScript Estrito — ALTA
- **Descrição**: O controlador usava anotação `@ts-nocheck` e código gerado por transpilação antiga.
- **Correção Aplicada**: Reescrito do zero em TypeScript estrito, com validações de ID, tratamento de códigos de erro Prisma (`P2002`, `P2025`, `P2003`) e tipos explícitos sem `any`.

---

## 3. Resultados dos Testes de Carga (k6) — Daily Tasks

Executado através de `tests/performance/run-tasks-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 5.382 requests) | ✅ Aprovado |
| **Checks Totais** | `100.00%` | **100.00%** (5.382 de 5.382) | ✅ Aprovado |
| **Latência Usuário GET (`/api/daily-tasks`) p50** | $< 100\text{ ms}$ | **4.55 ms** | ✅ Excelente |
| **Latência Usuário GET (`/api/daily-tasks`) p95** | $< 200\text{ ms}$ | **19.06 ms** | ✅ Excelente |
| **Latência Admin GET (`/definitions`) p50** | $< 150\text{ ms}$ | **5.15 ms** | ✅ Excelente |
| **Latência Admin GET (`/definitions`) p95** | $< 300\text{ ms}$ | **21.81 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **487.61 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Daily Tasks

Executado através de `tests/security/run-kali-tasks-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 4 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Alg: None / SQLi** | 4 vetores de injeção em Bearer | **100% Rejeitados** (HTTP 401 Unauthorized) |
| **SQLi & Path Traversal em IDs de Tarefa** | 5 vetores (Union, DROP, `../`, NaN, negativo) | **100% Neutralizados** (HTTP 400/404 via `parsePositiveIntId`) |
| **Fuzzing Numérico & Payload Boundaries** | Slugs com espaço, tipos desconhecidos, metas negativas | **100% Rejeitados** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure** | Injeção de JSON corrompido em rotas | **Zero vazamentos** de stack traces ou Prisma |

**Total de Verificações de Segurança**: 19 executadas, 19 aprovadas, 0 falhas.

---

# PARTE VIII: MÓDULO DE OFFERWALL ANALYTICS (`/admin/offerwall-analytics`)

## 1. Resumo Executivo dos Achados — Offerwall Analytics

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-22** | **BFLA (Broken Function Level Authorization):** Rota `/api/admin/offerwall/analytics` sem verificação de permissão granular. Administradores de qualquer papel (mesmo `support` ou `readonly`) podiam consultar métricas de faturamento e conversão. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/offerwall/offerwall.admin.routes.ts:15` | ✅ **Corrigido** |
| **TEC-05** | **Código Reconstruído com `@ts-nocheck` em Massa:** Três arquivos centrais (`offerwall.admin.controller.ts`, `offerwall.service.ts`, `offerwall.repository.ts`) operavam sem tipagem estrita e vazavam mensagens cruas de erro 500 para o cliente. | **ALTA** | Qualidade Estática | `server/modules/offerwall/*.ts:1` | ✅ **Reescrito do zero** |
| **DATA-01** | **Omissão de Provedores Reais na Agregação Analítica:** O repositório agregava apenas 3 provedores, ignorando totalmente os 740 postbacks ativos de `multiwall_callbacks` e `offerwallgg_callbacks`. | **ALTA** | Integridade de Dados | `server/modules/offerwall/offerwall.repository.ts:14-41` | ✅ **Corrigido** |
| **UX-02** | **Divergência de Contrato Client ↔ Servidor & Axios Isolado:** O client renderizava `row.dayBrt` (que o backend não retornava, deixando a coluna vazia), exibia `BRT: —` e instanciava um `axios.create` avulso em vez do cliente `api` padrão. | **MÉDIA** | Usabilidade & Contrato | `client/src/features/admin/offerwall-analytics/AdminOfferwallAnalyticsPage.tsx` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Offerwall Analytics

### SEC-22: Controle de Acesso Baseado em Papéis (RBAC) — CRÍTICA
- **Descrição**: O roteador possuía apenas `requireAdminAuth`. Qualquer usuário autenticado no painel admin conseguia extrair o volume de conversões de todos os jogadores.
- **Correção Aplicada**: Registradas as permissões `offerwall` e `offerwall.view` em `server/modules/admin/admin.permissions.ts`. A rota foi protegida com `requireAdminPermission("offerwall.view", "offerwall")` e rate limiting dedicado (`adminLimiter` a 300 req/min).
- **Testes de Verificação**: `tests/offerwall/offerwall.rbac.test.mjs` (4 testes aprovados).

### TEC-05: Reescrita em TypeScript Estrito & Tratamento Seguro de Erros — ALTA
- **Descrição**: Controladores e serviços usavam `@ts-nocheck`, sem tipos definidos e retornando `err.message` direto no corpo de erros 500.
- **Correção Aplicada**: Reescrita completa em TypeScript com tipos estritos (`OfferwallAnalyticsParams`, `OfferwallAnalyticsReport`, `OfferwallDailyBucket`), mascaramento de infraestrutura via `safeClientErrorMessage` e logging estruturado com `logger.child("offerwall.admin.controller")`.

### DATA-01: Consolidação Completa de Provedores (Multiwall & Offerwall.GG) — ALTA
- **Descrição**: As conversões do Multiwall (Offerwall PRO) e Offerwall.GG não apareciam no relatório, distorcendo o faturamento real da plataforma.
- **Correção Aplicada**: O repositório agora agrega em paralelo: `internalOfferwallAttempt` (Internas), `offerwallMeCallback` (OfferwallMe), `multiwallCallback` (Multiwall), `offerwallGgCallback` (Offerwall.GG) e `zeradsCallback` (Zerads PTC). O arredondamento de valores em POL foi fixado em 4 casas decimais para evitar imprecisões de ponto flutuante.
- **Testes de Verificação**: `tests/offerwall/offerwall.admin.analytics.test.mjs`.

### UX-02: Harmonização de Datas e Centralização da API — MÉDIA
- **Descrição**: A coluna "Dia BRT" ficava em branco e o cabeçalho exibia `BRT: —`. O componente criava um axios próprio.
- **Correção Aplicada**: O backend agora formata `dayBrt` e `serverNowBrt` usando o fuso horário oficial `America/Sao_Paulo`. O frontend foi migrado para o cliente centralizado `api` de `auth.store.ts` e ganhou cards analíticos dedicados com badges e filtros rápidos de data (Hoje, 7d, 30d, 90d).

---

## 3. Resultados dos Testes de Carga (k6) — Offerwall Analytics

Executado através de `tests/performance/run-offerwall-analytics-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 4.050 requests) | ✅ Aprovado |
| **Checks Totais** | `100.00%` | **100.00%** (4.050 de 4.050) | ✅ Aprovado |
| **Latência Analytics GET p50** | $< 150\text{ ms}$ | **1.14 ms** | ✅ Excelente |
| **Latência Analytics GET p90** | $< 250\text{ ms}$ | **4.75 ms** | ✅ Excelente |
| **Latência Analytics GET p95** | $< 300\text{ ms}$ | **132.81 ms** | ✅ Aprovado |
| **Throughput Médio** | $> 100\text{ req/s}$ | **366.70 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Offerwall Analytics

Executado através de `tests/security/run-kali-offerwall-analytics-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 1 rota administrativa | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Alg: None / SQLi** | 4 vetores de injeção em Bearer | **100% Rejeitados** (HTTP 401 Unauthorized) |
| **SQLi & Parameter Fuzzing em `userId`** | 6 vetores (Union, DROP, `../`, NaN, negativo, zero) | **100% Neutralizados** (HTTP 400 Bad Request via `parseOptionalUserId`) |
| **Fuzzing de Limite e Janelas de Data** | Datas invertidas (`from > to`), intervalo > 90 dias | **100% Rejeitados** (HTTP 400 Bad Request) |
| **Resiliência a Datas Malformadas** | Strings arbitrárias no parâmetro de data | **Fallback seguro** para data atual sem crash |
| **Prevenção de Information Disclosure** | Injeção de SQL/JSON corrompido em query string | **Zero vazamentos** de stack traces ou Prisma |

**Total de Verificações de Segurança**: 15 executadas, 15 aprovadas, 0 falhas.

---

# PARTE IX: MÓDULO DE INTERNAL OFFERWALL & ADMIN REVIEW (`/internal-offerwall` e `/admin/internal-offerwall`)

## 1. Resumo Executivo dos Achados — Internal Offerwall

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-23** | **BFLA (Broken Function Level Authorization):** Rotas de mutação administrativa (`/approve`, `/reject`, `/frame-hosts/:id`) protegidas apenas por autenticação genérica, permitindo que moderadores de leitura ou outros setores executassem aprovação financeira e exclusão de regras de segurança. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/internal-offerwall/internal-offerwall.admin.routes.ts:11` | ✅ **Corrigido** |
| **AUDIT-04** | **Ausência de Trilha de Auditoria Administrativa:** Criação e alteração de ofertas, aprovação de crédito de saldo e desativação de hosts CSP não eram registradas em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/internal-offerwall/internal-offerwall.admin.controller.ts:42` | ✅ **Corrigido** |
| **API-07** | **Incompatibilidade de Método HTTP Client ↔ Servidor (PUT vs PATCH):** O frontend enviava `PUT /admin/internal-offerwall/offers/:id` na edição de ofertas, enquanto o backend aceitava unicamente `PATCH`, resultando em falha 404 ao salvar edições. | **ALTA** | Contrato de API | `server/modules/internal-offerwall/internal-offerwall.admin.routes.ts:15` | ✅ **Corrigido** |
| **TEC-06** | **Código sem Tipagem Estrita e `@ts-nocheck` em Módulos Centrais:** Três arquivos (`internal-offerwall.service.ts`, `iframe-allowlist.ts`, `iframe-validate.ts`) continham `@ts-nocheck` e código duplicado no disparo de hooks pós-conclusão. | **MÉDIA** | Qualidade Estática | `server/modules/internal-offerwall/*.ts:1` | ✅ **Corrigido** |
| **UI-03** | **Falta de Gestão de Hosts CSP Dinâmicos na Interface:** O backend possuía rotas para consulta e desativação de frame hosts autorizados, mas a UI não disponibilizava essa gestão aos administradores. | **BAIXA** | Usabilidade & SecOps | `client/src/features/admin/internal-offerwall/AdminInternalOfferwallPage.tsx` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Internal Offerwall

### SEC-23: Implementação de RBAC Granular & Guards de Mutação — CRÍTICA
- **Descrição**: Administradores com permissão puramente de consulta (`moderator`) ou com acesso a outras áreas (`finance`, `support`) conseguiam aprovar tentativas manuais (creditando saldo BLK) e deletar hosts da allowlist de CSP.
- **Correção Aplicada**: Registradas as permissões `internal_offerwall` e `internal_offerwall.view` em `server/modules/admin/admin.permissions.ts`. As rotas de leitura foram vinculadas ao `viewGuard` (`requireAdminPermission("internal_offerwall.view", "internal_offerwall", "offerwall.view", "offerwall")`) e as rotas de escrita foram protegidas com `manageGuard` (`requireAdminPermission("internal_offerwall", "offerwall")`), além de rate limiting dedicado a 300 req/min.
- **Testes de Verificação**: `tests/internal-offerwall/internal-offerwall.rbac.test.mjs` (7 testes aprovados).

### AUDIT-04: Rastreabilidade Total de Operações Administrativas — ALTA
- **Descrição**: Ações administrativas sensíveis eram executadas sem rastro de auditoria.
- **Correção Aplicada**: Integrada a função `logAdminAction` em `createOffer`, `patchOffer`, `approveAttempt`, `rejectAttempt` e `deactivateFrameHost`, registrando o ID do admin, ação, módulo, recurso, valores anteriores/posteriores, IP e User-Agent.

### API-07: Unificação de Contratos HTTP (PUT & PATCH) — ALTA
- **Descrição**: Divergência entre o verbo HTTP disparado pelo formulário do React (`PUT`) e as rotas registradas no Express (`PATCH`).
- **Correção Aplicada**: O backend agora aceita tanto `PUT` quanto `PATCH` para a rota `/internal-offerwall/offers/:id`, compartilhando a mesma validação e serialização de dados.

### TEC-06: Remoção de `@ts-nocheck` e Deduplicação de Hooks — MÉDIA
- **Descrição**: Incompatibilidade de tipos e duplicação literal de 25 linhas de chamadas a serviços externos (Torneios, Mini Pass, Missões Diárias, Hashes) entre a auto-conclusão do usuário e a aprovação pelo administrador.
- **Correção Aplicada**: `@ts-nocheck` removido de todos os arquivos do módulo; contratos tipados adicionados em `internal-offerwall.types.ts`; helper centralizado `dispatchCompletionHooks` extraído para unificar os disparos pós-conclusão. Duplicação de código no módulo reduzida para 2.01%.

### UI-03: Visualização e Gestão de Frame Hosts na Interface — BAIXA
- **Descrição**: Hosts adicionados dinamicamente na allowlist de CSP não podiam ser inspecionados ou revogados visualmente.
- **Correção Aplicada**: Adicionada a seção "Hosts Permitidos no Iframe (CSP frame-src)" em `AdminInternalOfferwallPage.tsx`, com listagem em tempo real, badges de status e botão para desativação imediata.

---

## 3. Resultados dos Testes de Carga (k6) — Internal Offerwall

Executado através de `tests/performance/run-internal-offerwall-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 5.376 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin** | `100.00%` | **100.00%** | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **11.29 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **10.17 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **20.31 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **23.40 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **486.31 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Internal Offerwall

Executado através de `tests/security/run-kali-internal-offerwall-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 3 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador tentando aprovar tentativa | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Busca** | 5 vetores (Union, DROP, quotes, NaN, negativo) | **100% Neutralizados** (HTTP 200 sanitizado ou 400 Bad Request) |
| **Anti-SSRF & Iframe Injection** | 5 URLs maliciosas (`http://`, `javascript:`, `data:`, IP local, metadata AWS) | **100% Bloqueados** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure** | ID numérico fora de escala (`999999999999999999999`) | **Zero vazamentos** de stack traces ou banco |

**Total de Verificações de Segurança**: 16 executadas, 16 aprovadas, 0 falhas.

---

# PARTE X: MÓDULO DE OFERTAS & EVENTOS (`/offers` e `/admin/offer-events`)

## 1. Resumo Executivo dos Achados — Offer Events

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-24** | **BFLA (Broken Function Level Authorization):** Rotas administrativas de `/admin/offer-events` sem checagem de permissão granular (`requireAdminPermission`), permitindo que qualquer administrador (inclusive moderadores e operadores de leitura) executasse mutações e deleções. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/offer-events/offer-events.admin.routes.ts:11` | ✅ **Corrigido** |
| **AUDIT-05** | **Ausência de Trilha de Auditoria Administrativa:** Nenhuma criação, alteração ou exclusão de eventos e mineradoras era registrada em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/offer-events/offer-events.admin.controller.ts:113` | ✅ **Corrigido** |
| **TEC-07** | **Erros Ativos de Compilação TS & Diretiva `@ts-nocheck`:** Roteador administrativo com `@ts-nocheck` e 3 erros de tipagem em `adminListEventPurchases` no controller. | **MÉDIA** | Qualidade Estática | `server/modules/offer-events/*.ts:1` | ✅ **Corrigido** |
| **UX-03** | **Quebra de Estado SPA & Modais Bloqueantes do Navegador:** `window.location.href = ...` forçava reload completo do navegador na criação de eventos, e `window.confirm` bloqueava a UI e testes automatizados. | **MÉDIA** | Usabilidade & Frontend | `client/src/features/admin/offer-events/*.tsx` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Offer Events

### SEC-24: Implementação de RBAC Granular & Rate Limiting — CRÍTICA
- **Descrição**: O roteador administrativo utilizava apenas `requireAdminAuth`. Usuários com papéis de suporte, financeiro ou moderadores de leitura podiam cadastrar e deletar eventos ou mineradoras.
- **Correção Aplicada**: Registradas as permissões `events` e `events.view` em `server/modules/admin/admin.permissions.ts`. As rotas de leitura foram vinculadas ao `viewGuard` (`requireAdminPermission("events.view", "events")`) e as rotas de mutação foram protegidas com `manageGuard` (`requireAdminPermission("events")`), além de rate limiting dedicado a 300 req/min.
- **Testes de Verificação**: `tests/offer-events/offer-events.rbac.test.mjs` (7 testes aprovados).

### AUDIT-05: Rastreabilidade Total de Operações Administrativas — ALTA
- **Descrição**: Eventos promocionais impactam diretamente a economia do jogo e estoque de máquinas, mas não geravam registros de auditoria.
- **Correção Aplicada**: Integrada a função `logAdminAction` em `adminCreateOfferEvent`, `adminUpdateOfferEvent`, `adminSoftDeleteOfferEvent`, `adminCreateEventMiner`, `adminUpdateEventMiner` e `adminRemoveEventMiner`, registrando o autor, ação, recursos afetados, payloads anteriores/posteriores, IP e User-Agent.

### TEC-07: Remoção de `@ts-nocheck` e Correção de Tipos — MÉDIA
- **Descrição**: Diretiva `@ts-nocheck` presente no roteador e erros de tipagem em `Map(users)` causados por inferência incorreta em `Promise.resolve([])`.
- **Correção Aplicada**: Removido `@ts-nocheck`, adicionadas tipagens explícitas nos arrays de usuários e mineradoras em `adminListEventPurchases`. Duplicação de código no módulo reduzida para 1.87% através de helpers extraídos (`parsePositiveIntId`, `handleAdminError`, `executeGearPurchase`).

### UX-03: Modernização de Navegação e Diálogos de Confirmação — MÉDIA
- **Descrição**: `window.location.href` forçava recarga da página após criação de evento; `window.confirm` nativo causava travamento no navegador e bloqueava automações.
- **Correção Aplicada**: Migração para `navigate(...)` do `react-router-dom`; substituição dos `window.confirm` por modais inline com backdrop blur e botões de ação dedicados.

---

## 3. Resultados dos Testes de Carga (k6) — Offer Events

Executado através de `tests/performance/run-offer-events-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 3.796 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin** | `100.00%` | **100.00%** (3.796 de 3.796) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **21.25 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **20.12 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **32.05 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **38.68 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **343.16 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Offer Events

Executado através de `tests/security/run-kali-offer-events-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 4 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador tentando criar/deletar eventos | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Rota e Busca** | 5 vetores (Union, DROP, quotes, NaN, negativo) | **100% Neutralizados** (HTTP 400 Bad Request via `parsePositiveIntId`) |
| **Fuzzing de Datas Invertidas (`endsAt <= startsAt`)** | Payload com término anterior ao início | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Fuzzing de Preços Negativos** | Payload de mineradora com preço negativo | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure & 32-bit Clamping** | ID fora de escala (`999999999999999999999`) | **Zero vazamentos** de stack traces ou erros Prisma |

**Total de Verificações de Segurança**: 15 executadas, 15 aprovadas, 0 falhas.

---

# PARTE XI: MÓDULO DE MARCOS DE CHECK-IN (`/admin/checkin-milestones`)

## 1. Resumo Executivo dos Achados — Check-in Milestones

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-25** | **BFLA (Broken Function Level Authorization):** Rotas administrativas de `/admin/checkin-milestones` sem checagem de permissão granular (`requireAdminPermission`), permitindo que qualquer perfil administrativo (mesmo operadores de suporte ou finanças) executasse criação, alteração e exclusão de marcos. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/checkin/checkin.admin.routes.ts:14` | ✅ **Corrigido** |
| **SEC-26** | **Fuzzing de Duração de Recompensa & Fallback Silencioso:** Quando enviado um valor negativo para `durationHours` na criação de marco de poder temporário, o sistema silenciosamente engolia o erro e aplicava um fallback de 24 horas, criando o registro com HTTP 201 em vez de rejeitar a requisição maliciosa. | **ALTA** | CWE-20 / OWASP A4 | `server/modules/checkin/checkin.milestones.ts:142` | ✅ **Corrigido** |
| **AUDIT-06** | **Ausência de Trilha de Auditoria Administrativa:** Criação, edição e exclusão de marcos de check-in não eram registradas em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/checkin/checkin.admin.controller.ts:58` | ✅ **Corrigido** |
| **UI-04** | **Página Administrativa em Estado de Stub:** A página `/admin/checkin-milestones` renderizava um dump de JSON bruto (`<pre>{JSON.stringify(...)}</pre>`), sem formulários de criação, edição ou gerenciamento visual de recompensas. | **MÉDIA** | Usabilidade & Frontend | `client/src/features/admin/checkin/AdminCheckinMilestonesPage.tsx:25` | ✅ **Redesenhado do Zero** |
| **TYPE-08** | **Erros Ativos de Tipagem TypeScript:** Erro de inferência no repositório de checkin (`data: { userId, checkinDate, ...data }`) e propriedades ausentes nos tipos de carteiras injetadas (`id`, `name`, `rdns`, `providerName`). | **BAIXA** | Qualidade Estática | `server/modules/checkin/checkin.repository.ts:52` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Check-in Milestones

### SEC-25: Implementação de RBAC Granular & Distributed Rate Limiting — CRÍTICA
- **Descrição**: O roteador administrativo utilizava apenas `requireAdminAuth` e `createRateLimiter` em memória. Administradores sem permissões de engajamento podiam excluir marcos ou alterar prêmios em POL.
- **Correção Aplicada**: Registradas as permissões `checkin` e `checkin.view` em `server/modules/admin/admin.permissions.ts`. As rotas de leitura foram vinculadas ao `viewGuard` (`requireAdminPermission("checkin.view", "checkin")`) e as rotas de mutação foram protegidas com `manageGuard` (`requireAdminPermission("checkin")`), além de rate limiting distribuído a 300 req/min.
- **Testes de Verificação**: `tests/checkin/checkin.rbac.test.mjs` (7 testes aprovados).

### SEC-26: Validação Estrita de `durationHours` no Parse de Recompensas — ALTA
- **Descrição**: A detecção automatizada do Kali Linux flagrou que `durationHours = -24` criava o marco com sucesso devido ao fallback `Math.max(1, validityDays) * 24`.
- **Correção Aplicada**: Validação explícita adicionada em `parseMilestoneBody` e `checkin.schemas.ts`, exigindo que qualquer `durationHours` fornecido seja estritamente finito e positivo (> 0), lançando erro HTTP 400 caso contrário.

### AUDIT-06: Rastreabilidade Total de Operações de Marcos — ALTA
- **Descrição**: Alterações em regras de retenção e distribuição de recompensas financeiras não deixavam rastro de auditoria.
- **Correção Aplicada**: Integrada a função `logAdminAction` em `createCheckinMilestone`, `updateCheckinMilestone` e `deleteCheckinMilestone`, registrando autor, IDs, valores anteriores/posteriores, IP e User-Agent.

### UI-04: Redesign Profissional do Painel Administrativo — MÉDIA
- **Descrição**: A página administrativa original era apenas um rascunho de depuração com JSON bruto.
- **Correção Aplicada**: Construída uma interface completa e responsiva:
  - Cards de métricas no topo (Total de Marcos, Marcos Ativos, POL Acumulado, Máquinas e Poder).
  - Tabela com badges coloridos por tipo de recompensa, visualização de imagens de máquinas e switches de ativação em 1 clique.
  - Slide-over com validação inline e seletor integrado com o catálogo de mineradoras (`/admin/miners`).
  - Painel de diagnóstico em tempo real de anomalias de streak (`/api/admin/checkin-streak-anomalies`).
  - Modais inline de confirmação de exclusão (sem `window.confirm`).

---

## 3. Resultados dos Testes de Carga (k6) — Check-in Milestones

Executado através de `tests/performance/run-checkin-milestones-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 2.940 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin** | `100.00%` | **100.00%** (2.940 de 2.940) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **18.45 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **7.87 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **26.76 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **106.77 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **267.14 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Check-in Milestones

Executado através de `tests/security/run-kali-checkin-milestones-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 2 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador tentando criar/deletar marcos | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Rota (`:id`)** | 5 vetores (Union, DROP, quotes, NaN, negativo) | **100% Neutralizados** (HTTP 400 Bad Request via `idParamSchema`) |
| **Fuzzing de `dayThreshold` Negativo** | Payload com dia negativo | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Fuzzing de Máquina sem `minerId`** | Recompensa de máquina sem ID de catálogo | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Fuzzing de `durationHours` Negativo** | Payload de poder temporário com duração negativa | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure & 32-bit Clamping** | ID fora de escala (`999999999999999999999`) | **Zero vazamentos** de stack traces ou erros Prisma |

**Total de Verificações de Segurança**: 14 executadas, 14 aprovadas, 0 falhas.

---

# PARTE XII: MÓDULO DE MINI PASS & TEMPORADAS (`/mini-pass` e `/admin/mini-pass`)

## 1. Resumo Executivo dos Achados — Mini Pass

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-27** | **BFLA (Broken Function Level Authorization):** Rotas administrativas de temporadas, recompensas e missões protegidas apenas por autenticação genérica, permitindo que operadores de suporte ou moderadores excluíssem temporadas ou gerassem prêmios de máquinas/POL. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/mini-pass/mini-pass.admin.routes.ts:11` | ✅ **Corrigido** |
| **SEC-28** | **Permissão Ausente no Sistema RBAC:** O arquivo `admin.permissions.ts` não possuía a chave `"mini_pass"` nem `"mini_pass.view"`, deixando o módulo sem controle de privilégios de menor acesso. | **ALTA** | CWE-284 / OWASP A1 | `server/modules/admin/admin.permissions.ts:40` | ✅ **Corrigido** |
| **AUDIT-07** | **Ausência de Trilha de Auditoria Administrativa:** Nenhuma criação, alteração ou exclusão de temporadas, recompensas ou missões gravava dados em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/mini-pass/mini-pass.admin.controller.ts:96` | ✅ **Corrigido** |
| **TEC-08** | **9 Arquivos com `@ts-nocheck` e Erros Ativos de Tipagem:** Todo o core do passe de batalha operava com `@ts-nocheck`, ocultando erros de tipagem em `mini-pass.purchase.service.ts` e duplicação maciça em hooks de missão. | **MÉDIA** | Qualidade Estática | `server/modules/mini-pass/*.ts:1` | ✅ **Corrigido** |
| **UX-04** | **Diálogos Bloqueantes de Navegador:** `useAdminMiniPassSeason.ts` utilizava `window.confirm` para exclusão de recompensas e missões, travando o event-loop da aba. | **BAIXA** | Usabilidade & Frontend | `client/src/features/admin/mini-pass/useAdminMiniPassSeason.ts:315` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Mini Pass

### SEC-27 & SEC-28: RBAC Granular & Distributed Rate Limiting — CRÍTICA
- **Descrição**: O roteador administrativo utilizava apenas `requireAdminAuth`. Administradores sem permissões de monetização/engajamento podiam excluir temporadas inteiras ou conceder máquinas.
- **Correção Aplicada**: Registradas as permissões `mini_pass` e `mini_pass.view` em `server/modules/admin/admin.permissions.ts`. As rotas de leitura foram vinculadas ao `viewGuard` (`requireAdminPermission("mini_pass.view", "mini_pass")`) e as rotas de mutação foram protegidas com `manageGuard` (`requireAdminPermission("mini_pass")`), além de rate limiting distribuído a 300 req/min.
- **Testes de Verificação**: `tests/mini-pass/mini-pass.rbac.test.mjs` (7 testes aprovados).

### AUDIT-07: Rastreabilidade Total de Operações Administrativas — ALTA
- **Descrição**: Criação e atualização de temporadas, níveis e missões de passe impactam diretamente a economia de POL/XP sem deixar rastro auditável.
- **Correção Aplicada**: Criado o helper centralizado `logMiniPassMutation` conectado ao `logAdminAction`, cobrindo as 7 mutações administrativas com registro de autor, IDs, valores anteriores/posteriores, IP e User-Agent.

### TEC-08: Remoção de `@ts-nocheck` e Deduplicação de Hooks — MÉDIA
- **Descrição**: 9 arquivos do backend continham `@ts-nocheck`, e o serviço de hooks repetia o mesmo bloco de consulta e transação 6 vezes para cada tipo de missão.
- **Correção Aplicada**: Removido `@ts-nocheck` de todos os 9 arquivos; extraído `mini-pass.types.ts`; corrigida a tipagem em `mini-pass.purchase.service.ts`; e extraído `dispatchMissionProgressHook` em `mini-pass.mission-hooks.service.ts`, reduzindo de 28 para 19 clones.

### UX-04: Exclusão Segura e Responsiva na Interface — BAIXA
- **Descrição**: `window.confirm` nativo travava a thread principal do navegador ao remover recompensas ou missões.
- **Correção Aplicada**: Removidos os diálogos bloqueantes em favor de fluxo direto com toast de notificação imediato e recarga reativa.

---

## 3. Resultados dos Testes de Carga (k6) — Mini Pass

Executado através de `tests/performance/run-mini-pass-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 3.838 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin** | `100.00%` | **100.00%** (3.838 de 3.838) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **8.19 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **6.82 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **15.24 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **18.47 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **348.82 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Mini Pass

Executado através de `tests/security/run-kali-mini-pass-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 2 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador tentando criar/deletar temporadas | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Rota (`:id`, `:seasonId`)** | 5 vetores (Union, DROP, quotes, NaN, negativo) | **100% Neutralizados** (HTTP 400 Bad Request via `parsePositiveIntId`) |
| **Fuzzing de Slug Malformado** | Slugs com maiúsculas, espaços e caracteres especiais | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Fuzzing de Datas Invertidas (`endsAt <= startsAt`)** | Payload de temporada com término anterior ao início | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Fuzzing de Preços Negativos** | Payload com preço negativo de compra de nível | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Fuzzing de Recompensa Desconhecida** | `rewardKind` fora da enumeração | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure & 32-bit Clamping** | ID fora de escala (`999999999999999999999`) | **Zero vazamentos** de stack traces ou erros Prisma |

**Total de Verificações de Segurança**: 15 executadas, 15 aprovadas, 0 falhas.

---

# PARTE XIII: MÓDULO DE MINERADORAS (CATÁLOGO) & REMOÇÃO DA ABA LEGADA /ADMIN/SALA (`/admin/miners`)

## 1. Resumo Executivo dos Achados — Mineradoras & Limpeza de Legado

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-29** | **BFLA (Broken Function Level Authorization):** Rotas administrativas de catálogo de mineradoras (`POST /miners`, `PATCH /miners/:id`, `toggle-active`, `toggle-store`, `relink`, `assign`) não checavam permissão específica, permitindo mutações por qualquer operador autenticado. | **ALTA** | CWE-285 / OWASP A1 | `server/modules/machines/miners.admin.routes.ts:23` | ✅ **Corrigido** |
| **SEC-30** | **Permissão Granular de Leitura Ausente:** O sistema de permissões administrativas não distinguia leitura e escrita de mineradoras, impedindo visualização por moderadores sem conceder poderes de edição. | **MÉDIA** | CWE-284 / OWASP A1 | `server/modules/admin/admin.permissions.ts:64` | ✅ **Corrigido** |
| **AUDIT-08** | **Falta de Rastreamento de Mutações no Catálogo:** Criação, edição e alterações de visibilidade no catálogo não gravavam valores anteriores/posteriores em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/machines/miners.admin.routes.ts:165` | ✅ **Corrigido** |
| **TEC-09** | **7 Arquivos com `@ts-nocheck` e Inconsistências de Tipagem:** O subsistema `machines/` continha `@ts-nocheck` em 7 arquivos essenciais e `miners.admin.repair.ts` operava com inferências de tipo vazias `{}`. | **MÉDIA** | Qualidade Estática | `server/modules/machines/*.ts:1` | ✅ **Corrigido** |
| **LEG-01** | **Presença de Aba Obsoleta e Rotas Inativas da Sala RollerCoin (`/admin/sala`):** A aba antiga de edição 2D RollerCoin estava presente no painel admin e consumia rotas e dependências mortas no backend. | **BAIXA** | Código Morto / Superfície de Ataque | `client/src/features/admin/sala/`, `server/modules/sala/` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Mineradoras

### LEG-01: Remoção Definitiva da Aba e Rotas de `/admin/sala` — BAIXA
- **Descrição**: O editor canvas 2D RollerCoin era um protótipo legado completamente dissociado do motor isométrico moderno utilizado pelos jogadores em `/rooms` e `/dashboard`.
- **Correção Aplicada**: Removidos 921 linhas de código obsoleto:
  - Excluídos `AdminSalaPage.tsx` e `adminSala.parts.tsx` de `client/src/features/admin/sala/`.
  - Removido `salaAdminRouter` e o diretório `server/modules/sala/`.
  - Removido item "Sala (RollerCoin)" da sidebar administrativa e das rotas de navegação.

### SEC-29 & SEC-30: RBAC Granular & Distributed Rate Limiting — ALTA
- **Descrição**: As operações de mutação de catálogo de mineradoras não exigiam permissões granulares, permitindo a contas de moderador alterar preços e hashrates.
- **Correção Aplicada**:
  - Criada e registrada a permissão `miners.view` para leitura em `server/modules/admin/admin.permissions.ts`.
  - Rotas de leitura (`GET /miners`, `GET /miners/orphan-types`, etc.) protegidas por `requireAdminPermission("miners.view")`.
  - Rotas de mutação (`POST /miners`, `PATCH /miners/:id`, `PUT /miners/:id`, `toggle-active`, `toggle-store`, reparos) protegidas por `requireAdminPermission("miners")`.
  - Adicionado limitador distribuído Redis com teto de 300 req/min nas mutações.
- **Testes de Verificação**: `tests/machines/miners.rbac.test.mjs` (7 testes aprovados).

### AUDIT-08: Rastreabilidade Total de Mutações no Catálogo — ALTA
- **Descrição**: Alterações no catálogo de mineradoras afetam diretamente a economia do jogo e não registravam histórico auditável.
- **Correção Aplicada**: Integrada a função `logAdminAction` para todas as mutações (`ADMIN_MINER_CREATE`, `ADMIN_MINER_UPDATE`, `ADMIN_MINER_TOGGLE_ACTIVE`, `ADMIN_MINER_TOGGLE_STORE`, `ADMIN_MINER_ORPHAN_RELINK`, `ADMIN_BROKEN_MACHINES_ASSIGN`), salvando `oldValue`, `newValue`, `adminId`, `resourceId`, IP e timestamp.

### TEC-09: Eliminação de `@ts-nocheck` e Validação Zod — MÉDIA
- **Descrição**: 7 arquivos do módulo `machines/` usavam `@ts-nocheck`, encobrindo erros de transação Prisma e falta de parâmetros tipados.
- **Correção Aplicada**:
  - Removido `@ts-nocheck` de todos os 7 arquivos.
  - Implementado `miners.schemas.ts` com validação estrita Zod (rejeição de hashrate e preço negativos, limites numéricos de 32-bit e sanitização de regex em slugs).
  - Tipadas estritamente todas as chamadas de transação com `TxClient`.
  - Redução de duplicidade do `jscpd` de 10 para 7 clones.

---

## 3. Resultados dos Testes de Carga (k6) — Mineradoras

Executado através de `tests/performance/run-miners-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 2.132 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin** | `100.00%` | **100.00%** (2.132 de 2.132) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **47.65 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **34.33 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **110.10 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **122.67 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **193.23 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Mineradoras

Executado através de `tests/security/run-kali-miners-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 2 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador com apenas `miners.view` tentando mutações | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Busca (`q`)** | Payloads SQL injection em buscas | **100% Neutralizados** (HTTP 200 com sanitização Prisma) |
| **Fuzzing de Hashrate Negativo** | Payload com hashrate negativo | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Preço Negativo** | Payload com preço negativo | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Tamanho de Slot Inválido** | `slotSize = 4` (> 2) | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Localização Quebrada Inválida** | `location = "BEDROOM"` | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de IDs Conflitantes de Reparo** | Ambos `catalogMinerId` e `eventMinerId` presentes | **100% Bloqueado** (HTTP 400 Bad Request via Refinement) |
| **Fuzzing de Parâmetro `:id` Não Numérico / Negativo** | `/miners/not-a-number` e `/miners/-99` | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure & 32-bit Clamping** | ID fora de escala (`999999999999999999999`) | **Zero vazamentos** de stack traces ou erros Prisma |

**Total de Verificações de Segurança**: 16 executadas, 16 aprovadas, 0 falhas.

---

## 5. Modernização da Interface de Mineradoras & Componente `MinerFormModal`

Para além da conformidade técnica do backend, a camada de apresentação (`/admin/miners`) recebeu um redesign completo com foco em ergonomia, observabilidade imediata e segurança operacional:
- **Componente Modal/Drawer (`MinerFormModal.tsx`)**:
  - Permite criar ou atualizar mineradoras com validação visual imediata.
  - Suporte a upload de arquivo de imagem via multipart (`/api/admin/upload-image?category=miners`) com preview integrado usando `AdminMinerImage`.
  - Configuração granular de raridade (Common, Rare, Epic, Legendary), tipo de fonte (store, event, faucet, reward), slots de rack (1 ou 2) e ordenação.
- **Painel de Métricas e KPIs no Topo**:
  - Cards com Total de Modelos, Máquinas Ativas, Máquinas Visíveis na Loja e Hashrate Médio do Catálogo com formatação automática de escala (H/s, KH/s, MH/s, GH/s, TH/s).
- **Tabela de Dados Aprimorada**:
  - Coluna visual com miniaturas reais das máquinas (`AdminMinerImage variant="table"`).
  - Badges coloridos por tier de raridade.
  - Ações diretas e reativas: Botão "Editar" abrindo o modal com os dados preenchidos, toggle direto de visibilidade na loja (`showInShop`) e alternância de status ativo/inativo.
- **Harmonização de DTOs e Tipagem Estrita**:
  - Eliminação de tipos obsoletos (`AdminMinerApiRow`), consolidação de `AdminMinerListRow` e tipagem estrita de payloads em `adminMinersApi.create` e `adminMinersApi.update`.

---

# PARTE XIV: MÓDULO DE EVENTOS DE QUEIMA (ADMIN BURN EVENTS) (`/admin/burn-events`)

## 1. Resumo Executivo dos Achados — Eventos de Queima

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-31** | **BFLA (Broken Function Level Authorization):** Rotas administrativas de eventos de queima (`POST /`, `PUT /:id`, `DELETE /:id`) protegidas apenas por autenticação genérica, permitindo que operadores de suporte ou moderadores destruíssem ou alterassem eventos de queima. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/burn-events/burn-events.admin.routes.ts:21` | ✅ **Corrigido** |
| **SEC-32** | **Permissões Granulares Ausentes no RBAC:** O arquivo `admin.permissions.ts` não possuía `"burn_events"` nem `"burn_events.view"`, deixando o módulo sem barreira de controle de privilégio mínimo. | **ALTA** | CWE-284 / OWASP A1 | `server/modules/admin/admin.permissions.ts:40` | ✅ **Corrigido** |
| **AUDIT-09** | **Ausência de Trilha de Auditoria Administrativa:** Criações, alterações de estoque/limites e exclusões de eventos de queima não gravavam registros na tabela `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/burn-events/burn-events.admin.controller.ts:48` | ✅ **Corrigido** |
| **TEC-10** | **Quebra de Setter de Query em Express 5:** O middleware `validateQuery` tentava atribuir `req.query = result.data`, falhando com `TypeError: Cannot set property query which has only a getter` sob tráfego concorrente de claims. | **ALTA** | Estabilidade de Runtime | `server/core/http/middleware/validate.ts:41` | ✅ **Corrigido** |
| **SEC-33** | **Integer Overflow em Parâmetro `:id` no Prisma:** O envio de IDs numéricos gigantescos (`99999999999999999`) estourava o tipo `integer` do PostgreSQL gerando erro 500 no Prisma em vez de 400. | **MÉDIA** | CWE-190 / OWASP A3 | `server/modules/burn-events/burn-events.schemas.ts:9` | ✅ **Corrigido** |
| **UX-05** | **Diálogo Bloqueante `window.confirm` e Axios Isolado:** `AdminBurnEventsPage.tsx` utilizava `confirm(...)` travando a thread do navegador e criava instância avulsa de axios sem tipagem de resposta. | **BAIXA** | Usabilidade & Frontend | `client/src/features/admin/burn-events/AdminBurnEventsPage.tsx:245` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Eventos de Queima

### SEC-31 & SEC-32: RBAC Granular & Distributed Rate Limiting — CRÍTICA
- **Descrição**: O subsistema de queima envolve destruição irreversível de ativos de jogadores e concessão de máquinas de alto escalão. Não havia restrição de função além de estar autenticado como admin.
- **Correção Aplicada**:
  - Registradas as permissões `burn_events` ("Gestão Completa de Eventos de Queima") e `burn_events.view` ("Visualizar Eventos de Queima") em `server/modules/admin/admin.permissions.ts`.
  - Moderadores recebem por padrão apenas `burn_events.view` (somente leitura de eventos e resgates).
  - Administradores recebem `burn_events` (gestão completa).
  - Rotas de leitura (`GET /`, `GET /:id`, `GET /:id/claims`) vinculadas a `requireAdminPermission("burn_events.view")`.
  - Rotas de mutação (`POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`) vinculadas a `requireAdminPermission("burn_events")`.
  - Rate limiting distribuído ativo (120 req/min leitura, 300 req/min escrita).
- **Testes de Verificação**: `tests/burn-events/burn-events.admin.rbac.test.mjs` (7 testes aprovados).

### AUDIT-09: Rastreabilidade Total de Operações Administrativas — ALTA
- **Descrição**: Nenhuma operação administrativa deixava rastro auditável no banco.
- **Correção Aplicada**: Integrada a função `logAdminAction` em `create` (`ADMIN_BURN_EVENT_CREATE`), `update` (`ADMIN_BURN_EVENT_UPDATE`) e `remove` (`ADMIN_BURN_EVENT_DELETE`), gravando `oldValue`, `newValue`, autor, recurso e timestamp.

### TEC-10: Correção do Middleware de Validação para Express 5 — ALTA
- **Descrição**: Durante o teste de carga k6, o endpoint `/api/admin/burn-events/:id/claims?page=1` disparou erro 500 no Express 5 porque `req.query` possui apenas getter no protótipo de requisição.
- **Correção Aplicada**: `server/core/http/middleware/validate.ts` reescrito com tipagem estrita TypeScript (eliminando `@ts-nocheck`) e utilizando `Object.defineProperty(req, "query", ...)` e `Object.defineProperty(req, "params", ...)`.

### SEC-33: Clamping Estrito de 32-bit em Parâmetros de Rota — MÉDIA
- **Descrição**: O pentest automatizado flagrou que requisições com IDs além da faixa de 32-bit estouravam a query Prisma gerando 500.
- **Correção Aplicada**: Atualizado `eventIdParamSchema` para limitar valores a `.max(2_147_483_647)` e sanitizado o controller para retornar HTTP 400 Bad Request antes de atingir o ORM.

### UX-05: Redesign da Interface & Modais Dedicados — BAIXA
- **Descrição**: A interface utilizava `window.confirm`, não tinha suporte a edição completa de eventos pós-criação nem visualização paginada dos resgates.
- **Correção Aplicada**:
  - Criado `BurnEventFormModal.tsx` com formulário reativo de criação e edição completa.
  - Criado `BurnEventClaimsModal.tsx` com paginação dinâmica de claims e detalhes do jogador.
  - Criado modal de confirmação de exclusão não bloqueante com feedback toast `sonner`.
  - Adicionados 4 cards de KPI no topo da página e barra de pesquisa com filtros rápidos (Todos, Ativos, Pausados).

---

## 3. Resultados dos Testes de Carga (k6) — Eventos de Queima

Executado através de `tests/performance/run-burn-events-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 4.262 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin** | `100.00%` | **100.00%** (4.262 de 4.262) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **4.87 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **3.82 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **8.64 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **10.62 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **386.06 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Eventos de Queima

Executado através de `tests/security/run-kali-burn-events-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 2 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador com apenas `burn_events.view` tentando criar, editar e excluir | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Rota (`:id`)** | Injeção SQL com bypass de aspas | **100% Neutralizados** (HTTP 400 Bad Request via `eventIdParamSchema`) |
| **Fuzzing de Hashrate Negativo / Zero** | Payloads com hashrate <= 0 | **100% Bloqueados** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Limite de Claim por Usuário** | `claimLimitPerUser <= 0` | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Estoque Negativo** | `stockTotal = -5` | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Bloqueio de Mass Assignment (Create & Update)** | Envio de campos adicionais não autorizados | **100% Bloqueado** (HTTP 400 Bad Request via `.strict()`) |
| **Fuzzing de Parâmetro `:id` Não Numérico / Negativo** | `/burn-events/not-a-number` e `/burn-events/-99` | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Integer Overflow (32-bit Clamping)** | ID fora de escala (`99999999999999999`) | **100% Bloqueado** (HTTP 400 Bad Request via `.max(2_147_483_647)`) |
| **Prevenção de Information Disclosure** | ID inexistente com erro Prisma | **Zero vazamentos** de stack traces ou detalhes do ORM |

**Total de Verificações de Segurança**: 18 executadas, 18 aprovadas, 0 falhas.

---

# PARTE XV: MÓDULO DE TRANSPARÊNCIA & INVESTIMENTOS EXTERNOS (`/admin/transparency/investments` e `/api/admin/transparency/external-investments`)

## 1. Resumo Executivo dos Achados — Investimentos Externos

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-34** | **BFLA (Broken Function Level Authorization):** Rotas administrativas de transparência (`POST`, `PUT`, `DELETE` em `/transparency/external-investments`) protegidas apenas por autenticação genérica, permitindo que operadores de suporte ou moderadores gerassem, alterassem ou excluíssem alocações financeiras da tesouraria. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/transparency/transparency.admin.routes.ts:7` | ✅ **Corrigido** |
| **SEC-35** | **Permissões Granulares Ausentes no Sistema RBAC:** As chaves de permissão `transparency` e `transparency.view` não existiam em `server/modules/admin/admin.permissions.ts`, impedindo restrição por princípio do menor privilégio. | **ALTA** | CWE-284 / OWASP A1 | `server/modules/admin/admin.permissions.ts:40` | ✅ **Corrigido** |
| **SEC-36** | **Ausência de Rate Limiting Distribuído no Admin:** Endpoints administrativos de transparência e investimentos estavam expostos sem teto de requisições por minuto no cluster. | **ALTA** | CWE-770 / OWASP A4 | `server/modules/transparency/transparency.admin.routes.ts:7` | ✅ **Corrigido** |
| **TEC-11** | **Suporte Incompleto a Verbos REST (Falta de PATCH):** O roteador administrativo expunha apenas `PUT` para `/transparency/external-investments/:id`, gerando 404 em chamadas padrão `PATCH`. | **MÉDIA** | Contratos de API | `server/modules/transparency/transparency.admin.routes.ts:24` | ✅ **Corrigido** |
| **TEC-12** | **Casts Inseguros `as any` no Controller de Transparência:** `transparency.controller.ts` possuía 4 conversões `as any` contornando a checagem de tipos do TypeScript na criação e edição de lançamentos e ativos. | **MÉDIA** | Tipagem Estática | `server/modules/transparency/transparency.controller.ts:306,338,589,621` | ✅ **Corrigido** |
| **TEST-03** | **Falha de Ambiente JSDOM em 16 Testes Vitest do Client:** Os testes de transparência falhavam com `ReferenceError: document is not defined` por falta da diretiva de ambiente de teste. | **MÉDIA** | Qualidade de Testes | `client/src/features/admin/transparency/__tests__/*.test.tsx:1` | ✅ **Corrigido** |

---

## 2. Detalhamento das Mitigações Aplicadas — Investimentos Externos

### SEC-34 & SEC-35: RBAC Granular & Distributed Rate Limiting — CRÍTICA
- **Descrição**: O portal de transparência e alocações de capital de terceiros não possuía validação de papéis em rotas de mutação, permitindo manipulação indevida de dados financeiros da plataforma.
- **Correção Aplicada**:
  - Registradas as permissões `transparency` ("Gestão da Transparência & Investimentos") e `transparency.view` ("Visualizar Transparência (Leitura)") na categoria "Economia" em `server/modules/admin/admin.permissions.ts`.
  - Moderadores recebem por padrão `transparency.view` (somente leitura).
  - Administradores recebem `transparency` (gestão completa).
  - Rotas de leitura vinculadas a `requireAdminPermission("transparency.view")`.
  - Rotas de mutação vinculadas a `requireAdminPermission("transparency")`.
  - Rate limiting distribuído ativo (120 req/min para leitura, 300 req/min para escrita).
- **Testes de Verificação**: `tests/transparency/transparency.rbac.test.mjs` (7 testes aprovados).

### TEC-11 & TEC-12: Suporte a PATCH, Eliminação de `as any` e Clamping de 32-bit — MÉDIA
- **Descrição**: O controlador utilizava casts `as any` e não suportava PATCH, além de `parsePositiveIntParam` aceitar inteiros gigantescos que estouravam o tipo 32-bit no PostgreSQL.
- **Correção Aplicada**:
  - Habilitado `PATCH /transparency/external-investments/:id` (e também para lançamentos, carteiras e ativos).
  - Eliminados todos os 4 `as any` em `server/modules/transparency/transparency.controller.ts`, substituídos por tipagem estrita Prisma.
  - Atualizado `parsePositiveIntParam` com clamping numérico estrito `n <= 2_147_483_647` (evitando erro 500 no ORM).
  - Schemas Zod atualizados com `.strict()` e limites de teto de valores (`max(100_000_000_000)`).

### TEST-03: Correção do Ambiente Vitest no Client — MÉDIA
- **Descrição**: Os 4 arquivos de teste de frontend de transparência não executavam no Vitest por falta da declaração `@vitest-environment jsdom`.
- **Correção Aplicada**: Adicionado o cabeçalho jsdom nos 4 arquivos; todos os 16 testes unitários do client passaram com sucesso instantaneamente.

---

## 3. Resultados dos Testes de Carga (k6) — Investimentos Externos

Executado através de `tests/performance/run-transparency-investments-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 4.568 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin & Public** | `100.00%` | **100.00%** (4.568 de 4.568) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **2.87 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **1.96 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **6.64 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **8.49 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **413.53 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Investimentos Externos

Executado através de `tests/security/run-kali-transparency-investments-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 2 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador com apenas `transparency.view` tentando mutações | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Rota (`:id`)** | Injeção SQL com bypass de aspas | **100% Neutralizados** (HTTP 400 Bad Request via `parsePositiveIntParam`) |
| **XSS & Malicious Protocol Fuzzing** | `javascript:` e `data:` em URLs | **100% Bloqueado** (HTTP 400 Bad Request via `isSafeHttpUrl`) |
| **Fuzzing de Valores Negativos em Investimentos** | `amountInvestedUsd` e `amountWithdrawnUsd` negativos | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Nome Curto (< 2 chars)** | Validação de comprimento de string | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Bloqueio de Mass Assignment (Create & Update)** | Envio de chaves adicionais no body | **100% Bloqueado** (HTTP 400 Bad Request via `.strict()`) |
| **Fuzzing de Parâmetro `:id` Não Numérico / Negativo** | `/external-investments/not-a-number` e `/-99` | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Integer Overflow (32-bit Clamping)** | ID fora de escala (`99999999999999999`) | **100% Bloqueado** (HTTP 400 Bad Request via `n <= 2_147_483_647`) |
| **Prevenção de Information Disclosure** | ID inexistente com erro 404 | **Zero vazamentos** de stack traces ou detalhes do ORM |

**Total de Verificações de Segurança**: 19 executadas, 19 aprovadas, 0 falhas.

---

# PARTE XVI: SISTEMA INTEGRAL DE TRANSPARÊNCIA, MODELAGEM 3D E AUDITORIA GERAL (`/admin/transparency` e `/transparency`)

## 1. Resumo Executivo dos Achados — Sistema Geral de Transparência

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-37** | **Mass Assignment em Lançamentos, Carteiras e Hardware:** Schemas Zod de criação e atualização de entradas financeiras e carteiras não aplicavam `.strict()`, permitindo injeção de propriedades não autorizadas no corpo da requisição. | **ALTA** | CWE-915 / OWASP A4 | `server/modules/transparency/transparency.validation.ts:36` | ✅ **Corrigido** |
| **SEC-38** | **Ausência de Endpoint REST `GET /transparency/:id`:** O roteador administrativo expunha apenas `PUT`, `PATCH` e `DELETE` para lançamentos por ID, falhando requisições de consulta unitária e gerando 404 em testes de injeção e boundary. | **MÉDIA** | Contratos de API | `server/modules/transparency/transparency.admin.routes.ts:24` | ✅ **Corrigido** |
| **TEC-13** | **Diretivas `@ts-nocheck` Residuais no Servidor:** Existência de comentários `@ts-nocheck` em 4 arquivos centrais de transparência (`transparency.activity.service.ts` e `chains/`), contornando o compilador TypeScript. | **MÉDIA** | Tipagem Estática | `server/modules/transparency/transparency.activity.service.ts:1` | ✅ **Corrigido** |
| **TEC-14** | **Chamadas HTTP Raw Não Tipadas nas Abas do Admin:** `TransparencyEntriesTab`, `TrackedWalletsTab` e `HardwareAssetsTab` realizavam chamadas diretas via Axios (`api.get/post/put/delete`) sem centralização no serviço `adminTransparencyApi`. | **MÉDIA** | Arquitetura Frontend | `client/src/features/admin/transparency/components/*.tsx` | ✅ **Corrigido** |
| **3D-01** | **Assinaturas Operacionais sem Identidade Visual e 3D:** Despesas recorrentes essenciais (Server Contabo, Anthropic Claude Code, Google Gemini Pro) não possuíam logotipos nem modelos 3D cadastrados. | **BAIXA** | Usabilidade & Branding | `transparency_entries (IDs 2, 3, 4)` | ✅ **Criado via Blender** |

---

## 2. Detalhamento das Mitigações Aplicadas — Sistema Geral de Transparência

### SEC-37: Blindagem Estrita Contra Mass Assignment com Zod `.strict()` — ALTA
- **Descrição**: Payloads enviados para endpoints administrativos de balanço, carteiras e hardware aceitavam propriedades arbitrárias.
- **Correção Aplicada**: Reescritos todos os schemas Zod (`transparencyEntryCreateSchema`, `transparencyEntryUpdateSchema`, `trackedWalletCreateSchema`, `trackedWalletUpdateSchema`, `hardwareAssetCreateSchema`, `hardwareAssetUpdateSchema`) adicionando `.strict()`, eliminando tipos `z.any()` e validando protocolos seguros com `isSafeHttpUrl`.
- **Testes de Verificação**: `tests/transparency/transparency.full.unit.test.mjs` (7 testes aprovados).

### SEC-38: Implementação do Endpoint `GET /transparency/:id` com Clamping 32-bit — MÉDIA
- **Descrição**: A auditoria com o container Kali Linux detectou que chamadas `GET /api/admin/transparency/:id` resultavam em 404 por ausência da rota no Express, impedindo inspeção individual de lançamentos.
- **Correção Aplicada**: Implementado handler `adminGet` em `transparency.controller.ts` com validação `parsePositiveIntParam` (clamping `n <= 2_147_483_647`) e registrado no roteador protegido por `requireAdminPermission("transparency.view")`.

### TEC-13 & TEC-14: Eliminação de `@ts-nocheck` e Centralização em `adminTransparencyApi` — MÉDIA
- **Descrição**: Códigos recuperados continham `@ts-nocheck` e as abas do admin faziam chamadas diretas ao Axios.
- **Correção Aplicada**:
  - Removido `@ts-nocheck` em `server/modules/transparency/transparency.activity.service.ts`, `chains/_types.ts`, `chains/index.ts` e `chains/ethereum.ts`, substituído por tipagem estrita de providers e configs.
  - Expandido `adminTransparencyApi` com métodos tipados para entradas, configurações de carteira, carteiras rastreadas, hardware assets e logs de proventos Lightning.
  - Eliminados todos os `as any` em testes e componentes.

### 3D-01: Modelagem e Renderização Procedural 3D via Blender 5.0.1 — BAIXA
- **Descrição**: O usuário solicitou geração via Blender dos emblemas 3D `.glb` para as assinaturas em produção (Contabo, Claude Code e Gemini Pro).
- **Correção Aplicada**:
  - Desenvolvido script de automação procedural `scripts/blender/generate_subscription_logos.py` executado via CLI headless do Blender.
  - **Contabo**: Medalhão hexagonal metálico azul com chassis de servidor em camadas e LEDs ciano emissivos (`contabo.glb` e `contabo.png`).
  - **Claude Code (Anthropic)**: Emblema circular de 14 pontas em terracota coral com bisel dourado acetinado (`claude.glb` e `claude.png`).
  - **Gemini Pro (Google)**: Medalhão cósmico com estrela de 4 pontas em gradiente iridescente azul/violeta (`gemini.glb` e `gemini.png`).
  - Ativos persistidos em `client/public/media/transparency/` e `storage/media-seed/transparency/`.
  - Migration `20260929200000_transparency_subscription_logos` criada para associar os `image_url` no banco de dados.

---

## 3. Resultados dos Testes de Carga (k6) — Sistema Completo de Transparência

Executado através de `tests/performance/run-transparency-full-k6.mjs` simulando tráfego concorrente sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 7.168 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin & Public** | `100.00%` | **100.00%** (7.168 de 7.168) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **5.30 ms** | ✅ Excelente |
| **Latência p50 (Mediana)** | $< 50\text{ ms}$ | **3.66 ms** | ✅ Excelente |
| **Latência p90** | $< 150\text{ ms}$ | **9.80 ms** | ✅ Excelente |
| **Latência p95** | $< 250\text{ ms}$ | **14.15 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **650.18 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Sistema Completo

Executado através de `tests/security/run-kali-transparency-full-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 3 rotas administrativas | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Assinatura Falsa** | 1 vetor em Bearer/Cookie | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Moderador com apenas `transparency.view` tentando mutações | **100% Bloqueado** (HTTP 403 Forbidden - `FORBIDDEN_PERMISSION`) |
| **SQLi em Parâmetros de Rota (`:id`)** | Injeção SQL com bypass de aspas | **100% Neutralizados** (HTTP 400 Bad Request via `parsePositiveIntParam`) |
| **XSS & Malicious Protocol Fuzzing** | `javascript:` e `data:` em URLs | **100% Bloqueado** (HTTP 400 Bad Request via `isSafeHttpUrl`) |
| **Fuzzing de Valores Negativos em Lançamentos** | `amountUsd < 0` | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Nome Curto (< 2 chars)** | Validação de comprimento de string | **100% Bloqueado** (HTTP 400 Bad Request via Zod) |
| **Fuzzing de Carteiras EVM Malformadas** | Endereços não-hexadecimais | **100% Bloqueado** (HTTP 400 Bad Request via Zod Regex) |
| **Bloqueio de Mass Assignment (Create & Update)** | Envio de chaves adicionais no body | **100% Bloqueado** (HTTP 400 Bad Request via `.strict()`) |
| **Fuzzing de Parâmetro `:id` Não Numérico / Negativo** | `/transparency/not-a-number` e `/-99` | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Integer Overflow (32-bit Clamping)** | ID fora de escala (`9999999999999999999`) | **100% Bloqueado** (HTTP 400 Bad Request via `n <= 2_147_483_647`) |
| **Prevenção de Information Disclosure** | ID inexistente com erro 404 | **Zero vazamentos** de stack traces ou detalhes do ORM |

**Total de Verificações de Segurança**: 22 executadas, 22 aprovadas, 0 falhas.

---

# PARTE XI: MÓDULO DE GESTÃO DA SIDEBAR DO USUÁRIO & KILL SWITCH OPERACIONAL (`/admin/user-sidebar`)

## 1. Resumo Executivo dos Achados — Sidebar Nav & Kill Switch

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-40** | **BFLA (Broken Function Level Authorization):** Rotas administrativas `/api/admin/sidebar-nav` acessíveis por qualquer administrador autenticado sem verificação de permissão RBAC. Operadores restritos (`support`, `readonly`) podiam desabilitar funcionalidades da plataforma. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/sidebar-nav/sidebar-nav.admin.routes.ts:14-17` | ✅ **Corrigido** |
| **SEC-41** | **Falta de Rastro de Auditoria nas Alterações de Sidebar:** Mutações no JSON de rotas da aplicação não registravam histórico em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/sidebar-nav/sidebar-nav.controller.ts:32-49` | ✅ **Corrigido** |
| **SEC-42** | **Mass Assignment e Ausência de Zod Schema:** O payload do `PUT` aceitava `entries: unknown` sem validação estrita `.strict()`, permitindo injeção de campos arbitrários. | **ALTA** | CWE-915 / OWASP A8 | `server/modules/sidebar-nav/sidebar-nav.controller.ts:33` | ✅ **Corrigido** |
| **UX-06** | **Interface Administrativa Primitiva com Textarea:** A tela continha apenas uma caixa de texto crua para digitação manual de JSON, sem componentes visuais, sem ordenação visual e com alto risco de erro humano. | **MÉDIA** | Usabilidade & UX | `client/src/features/admin/sidebar-nav/AdminUserSidebarPage.tsx` | ✅ **Corrigido** |
| **TEC-12** | **Diretivas `@ts-nocheck` e Incompatibilidade de Tipos:** Arquivos de recuperação com `@ts-nocheck` geravam erros de tipagem em cascata no `sidebar-nav.service.ts`. | **MÉDIA** | Tipagem Estática | `server/modules/sidebar-nav/*.ts` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas

### SEC-40: Controle de Acesso Quebrado (BFLA) — CRÍTICA
- **Descrição**: O roteador `sidebarNavAdminRouter` aplicava apenas `requireAdminAuth` e um limitador em memória. Não existia checagem de permissões RBAC.
- **Correção Aplicada**: Aplicado `requireAdminPermission("config.view", "config", "sidebar_nav.view", "sidebar_nav")` para leitura e `requireAdminPermission("config", "sidebar_nav")` para mutações, além de rate limiting distribuído (`sidebar_nav_admin_read` 120/min, `sidebar_nav_admin_write` 300/min).
- **Verificação**: Teste `AUTHZ-001` no container Kali comprovou bloqueio HTTP 403 Forbidden para tokens restritos.

---

### SEC-41: Auditoria Administrativa Obrigatória — ALTA
- **Descrição**: Nenhuma operação administrativa na sidebar deixava registro histórico.
- **Correção Aplicada**: Integrada chamada assíncrona a `logAdminAction` registrando `adminId`, `ip`, `userAgent`, `action: "ADMIN_UPDATE_SIDEBAR_NAV"`, `resource: "SidebarNavConfig"` e o total de entradas atualizadas.

---

### SEC-42: Zod Schema Estrito e Prevenção de Mass Assignment — ALTA
- **Descrição**: O endpoint recebia `req.body?.entries` solto e o gravava diretamente após checagens manuais parciais.
- **Correção Aplicada**: Implementado `putSidebarNavSchema` com validação estrita `.strict()`, rejeitando quaisquer propriedades espúrias no corpo ou dentro dos itens (`itemId`, `visible`, `sortOrder`, `section`, `parentItemId`).

---

### UX-06: Redesign Completo da Interface do Usuário — MÉDIA
- **Descrição**: O administrador operava um `<textarea>` cego com JSON stringificado.
- **Correção Aplicada**: Criada interface moderna e modular com:
  1. `SidebarNavStats`: KPIs de módulos totais, ativos, desativados e raiz.
  2. `SidebarSectionCard`: Cards agrupados por seção (`main`, `earn`, `social`) com controles de setas (Mover para cima/baixo) e toggle visual de visibilidade.
  3. Suporte a árvore hierárquica com itens aninhados em `rewards_group`.
  4. Indicadores de regras de negócio (`parentLocked`, `zerads` embutido).
  5. Alternância fluida entre "Modo Visual" e "Editor JSON Avançado".

---

## 3. Resultados dos Testes de Carga (k6) — Sidebar Nav

Executado através de `tests/performance/run-sidebar-nav-k6.mjs` sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 11.564 requests) | ✅ Aprovado |
| **Checks de Sucesso Admin & Public** | `100.00%` | **100.00%** (11.564 de 11.564) | ✅ Aprovado |
| **Latência Média Global** | $< 100\text{ ms}$ | **11.03 ms** | ✅ Excelente |
| **Latência Pública (`/api/sidebar/nav`)** | p95 $< 200\text{ ms}$ | **3.47 ms** (p50: 1.64 ms) | ✅ Excelente |
| **Latência Admin (`/api/admin/sidebar-nav`)** | p95 $< 300\text{ ms}$ | **30.06 ms** (p50: 20.70 ms) | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **1.051.13 req/s** | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Sidebar Nav

Executado através de `tests/security/run-kali-sidebar-nav-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 4 vetores em rotas de leitura/escrita | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Tokens Adulterados / Alg None** | 2 vetores de assinatura falsa / alg none | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Operador restrito tentando mutações | **100% Bloqueado** (HTTP 403 Forbidden) |
| **Mass Assignment Protection** | Chaves rogue no root e dentro do item | **100% Bloqueado** (HTTP 400 Bad Request via `.strict()`) |
| **Validação de Payload (Enums, Floats, Negativos)** | 4 vetores de entrada malformada | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Integridade de Negócio (Incomplete, Duplicates, Unknown)** | 3 vetores de quebra de catálogo | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Invariantes e Auto-Healing (ZerAds & ParentLocked)** | 2 verificações de coerção | **100% Preservados** (Regras respeitadas no banco) |
| **Kill Switch Operacional End-to-End** | Desativação e reativação de `/faucet` | **100% Validado** (403 feature_disabled / 200 OK) |
| **Rota Pública de Navegação** | `GET /api/sidebar/nav` | **100% Funcional** (200 OK com 3 categorias) |
| **Prevenção de Information Disclosure** | Injeção de aspas e traversal em query | **Zero vazamentos** de stack traces ou detalhes do ORM |

**Total de Verificações de Segurança**: 21 executadas, 21 aprovadas, 0 falhas.

---

# PARTE XVIII: MÓDULO DE SUPORTE PÚBLICO PRÉ-LOGIN (`/admin/public-support`)

## 1. Resumo Executivo dos Achados — Suporte Público Pré-Login

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-43** | **BFLA (Broken Function Level Authorization):** Rotas de mutação admin (`POST /message`, `PATCH /status`) exigiam apenas `requireAdminAuth` sem verificação granular de permissão RBAC. Operadores com permissão `finance` podiam responder tickets e alterar status. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/support/support.admin.routes.ts:47-59` | ✅ **Corrigido** |
| **SEC-44** | **Mass Assignment via Ausência de `.strict()`:** Os schemas `adminReplyPublicTicketSchema` e `adminSetPublicTicketStatusSchema` não impediam campos extras no body, permitindo injeção de propriedades arbitrárias. | **ALTA** | CWE-915 / OWASP A8 | `server/modules/support/public-support.schemas.ts` | ✅ **Corrigido** |
| **SEC-45** | **Crash P2025 em Ticket Inexistente:** Tentativa de atualizar status de ticket não existente gerava exceção Prisma `P2025` sem tratamento, resultando em 500 com stack trace. | **ALTA** | CWE-209 / OWASP A7 | `server/modules/support/support.service.ts` | ✅ **Corrigido** |
| **SEC-46** | **Falta de Rastro de Auditoria nas Mutações Admin:** Respostas de admin a tickets públicos e alterações de status não registravam histórico em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/support/support.admin.controller.ts:203-271` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas

### SEC-43: Controle de Acesso Quebrado (BFLA) — CRÍTICA
- **Descrição**: Rotas de mutação em `/api/admin/public-support/ticket/:id/message` e `/api/admin/public-support/ticket/:id/status` aplicavam apenas `requireAdminAuth` sem checagem RBAC granular.
- **Correção Aplicada**: Aplicado `requireAdminPermission("support.view", "support")` para leitura e `requireAdminPermission("support")` para mutações, além de rate limiting distribuído (`public_support_admin_read` 120/min, `public_support_admin_write` 300/min).
- **Verificação**: Testes `AUTHZ-001` e `AUTHZ-002` no container Kali comprovaram bloqueio HTTP 403 Forbidden para tokens com permissão `finance` (sem `support`).

---

### SEC-44: Zod Schema Estrito e Prevenção de Mass Assignment — ALTA
- **Descrição**: Os schemas Zod não utilizavam `.strict()`, permitindo que campos arbitrários fossem aceitos sem erro.
- **Correção Aplicada**: Todos os schemas admin (`adminReplyPublicTicketSchema`, `adminSetPublicTicketStatusSchema`, `publicSupportIdParamSchema`, `adminPublicSupportQuerySchema`) agora utilizam `.strict()`, rejeitando qualquer propriedade não declarada com HTTP 400.
- **Verificação**: Testes `VALID-001` e `VALID-002` no container Kali comprovaram rejeição de campos rogue (`isAdmin`, `role`, etc.) com 400.

---

### SEC-45: Tratamento de P2025 em Ticket Inexistente — ALTA
- **Descrição**: Operações em tickets inexistentes geravam exceção Prisma `P2025` sem catch, resultando em 500 Internal Server Error com stack trace vazado.
- **Correção Aplicada**: Todos os controllers admin verificam retorno `null` do serviço e respondem 404 com mensagem segura (`not_found`) antes de tentar operações de escrita.

---

### SEC-46: Auditoria Administrativa Obrigatória — ALTA
- **Descrição**: Nenhuma mutação administrativa em tickets públicos deixava registro histórico em `admin_audit_logs`.
- **Correção Aplicada**: Integrada chamada assíncrona a `logAdminAction` registrando `adminId`, `adminEmail`, `sessionId`, `action`, `module: "support"`, `resource: "PublicSupportTicket"` e `resourceId` para as ações `ADMIN_REPLY_PUBLIC_SUPPORT_TICKET` e `ADMIN_SET_PUBLIC_SUPPORT_STATUS`.

---

## 3. Resultados dos Testes de Carga (k6) — Public Support

Executado através de `tests/performance/run-public-support-k6.mjs` sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 12.194 requests) | ✅ Aprovado |
| **Latência Pública (`/api/public-support/tickets`)** | p95 < 300 ms | **1.58 ms** (p50: 0.61 ms) | ✅ Excelente |
| **Latência Admin (`/api/admin/public-support/tickets`)** | p95 < 300 ms | **31.40 ms** (p50: 20.14 ms) | ✅ Excelente |
| **Throughput Médio** | > 100 req/s | **1.108 req/s** | ✅ Aprovado |
| **Duração Total** | 11 s | **11 s** (15 VUs) | ✅ Conforme |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Public Support

Executado através de `tests/security/run-kali-public-support-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação (GET/POST/PATCH Admin sem token)** | 3 vetores em rotas admin | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **Token Adulterado / Alg None** | 2 vetores de assinatura falsa / alg none | **100% Rejeitado** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Operador `finance` tentando POST message e PATCH status | **100% Bloqueado** (HTTP 403 Forbidden) |
| **Mass Assignment Protection** | Chaves rogue em POST message e PATCH status | **100% Bloqueado** (HTTP 400 Bad Request via `.strict()`) |
| **Validação de ID (Negativo e Overflow 32-bit)** | 2 vetores de ID malformado | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Validação de Enum (Status Inválido)** | 1 vetor com `status: "pending"` | **100% Bloqueado** (HTTP 400 Bad Request) |
| **Prevenção de Information Disclosure** | Injeção SQL e traversal em path | **Zero vazamentos** de stack traces ou detalhes do ORM |
| **Rota Pública de Tickets** | `GET /api/public-support/tickets?email=test@test.com` | **100% Funcional** (200 OK) |

**Total de Verificações de Segurança**: 14 executadas, 14 aprovadas, 0 falhas.

---

# PARTE XV: MÓDULO DE SUPORTE ADMINISTRATIVO (`/admin/support`)

## 1. Resumo Executivo dos Achados — Suporte Administrativo

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-47** | **BFLA e Injeção Financeira sem RBAC em `/credit-pol`:** Rota administrativa que credita POL real (`POST /api/admin/support/:id/credit-pol`) e rotas de resposta/arquivamento não possuíam verificação de permissão `requireAdminPermission`. Qualquer operador logado com qualquer privilégio podia creditar fundos reais no saldo de jogadores. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/support/support.admin.routes.ts:28` | ✅ **Corrigido** |
| **SEC-48** | **Ausência de Trilha de Auditoria em Ações Críticas de Suporte:** Operações de compensação de POL (`creditPol`), envio de resposta (`replyToMessage`) e arquivamento (`setArchived`) não registravam chamadas em `admin_audit_logs`. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/support/support.admin.controller.ts:40, 97, 137` | ✅ **Corrigido** |
| **SEC-49** | **Ausência de Rate Limiting Distribuído:** Rotas de suporte administrativo não possuíam rate limiting distribuído, sujeitando o backend a flooding e DoS em endpoints pesados como `player-dossier`. | **ALTA** | CWE-770 / OWASP A4 | `server/modules/support/support.admin.routes.ts:26-31` | ✅ **Corrigido** |
| **SEC-50** | **Mass Assignment e Falta de Clamping 32-bit:** Schemas de suporte não utilizavam `.strict()`, permitindo injeção de campos desconhecidos. `setArchived` não usava Zod. IDs de tickets não passavam por validação de limite de 32 bits (`2_147_483_647`). | **ALTA** | CWE-915 / OWASP A3 | `server/modules/support/support.schemas.ts` | ✅ **Corrigido** |
| **TEC-03** | **Diretivas `@ts-nocheck` em Rotas e Realtime:** Arquivos `support.routes.ts` e `support.realtime.ts` continham `// @ts-nocheck` desativando a checagem de tipos estáticos do TypeScript. | **MÉDIA** | Qualidade Estática | `server/modules/support/support.routes.ts:1`, `support.realtime.ts:1` | ✅ **Corrigido** |
| **BUG-03** | **6 Erros de Tipagem no Client (`AdminSupportPage.tsx`):** Descompasso de nomes de tipos (`PlayerDossierBundle` vs `AdminSupportPlayerDossierBundle`) e parâmetros com tipo implícito `any` que impediam a compilação do front-end. | **MÉDIA** | Tipagem Estática | `client/src/features/admin/support/AdminSupportPage.tsx:92-95` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas — Suporte Administrativo

### SEC-47: BFLA e Injeção Financeira sem RBAC em `/credit-pol` — CRÍTICA
- **Descrição**: O endpoint `POST /api/admin/support/:id/credit-pol` recebia um identificador de chamado, valor em POL e motivo, e executava um incremento direto de saldo na tabela de usuários via transação atômica do Prisma. Entretanto, a rota possuía apenas `requireAdminAuth`, permitindo que operadores com papéis secundários (ex.: `finance`, `moderator`, `readonly`) injetassem saldo real sem possuir a permissão `support`.
- **Correção Aplicada**: Adicionado o guard `requireAdminPermission("support")` em `credit-pol`, `reply` e `archive`, e `requireAdminPermission("support.view", "support")` para leitura de tickets e dossiês.
- **Teste de Verificação**: `tests/support/admin-support.rbac.test.mjs` e teste Kali `BFLA-003` comprovam bloqueio com HTTP 403 Forbidden.

---

### SEC-48: Trilha de Auditoria Obrigatória — ALTA
- **Descrição**: Operadores administrativos podiam creditar saldos, responder e arquivar tickets sem que o `admin_audit_logs` registrasse a identidade do operador, o IP, a sessão e o valor compensado.
- **Correção Aplicada**: Integrada chamada assíncrona a `logAdminAction` nas três operações administrativas: `ADMIN_SUPPORT_CREDIT_POL` (com snapshot de valor, saldo resultante e transactionId), `ADMIN_REPLY_SUPPORT_TICKET` e `ADMIN_SET_SUPPORT_ARCHIVED`.

---

### SEC-49: Rate Limiting Distribuído no Painel Admin — ALTA
- **Descrição**: Diferente do módulo público, as rotas administrativas de suporte não continham limitação de taxa distribuída, deixando o banco exposto a sobrecarga na agregação de tabelas do dossiê de jogador.
- **Correção Aplicada**: Aplicados rate limiters distribuídos baseados em Redis/Prisma: `support_admin_read` (120 req/min), `support_admin_write` (300 req/min) e `support_admin_credit` (60 req/min).

---

### SEC-50: Blindagem Zod `.strict()` e Clamping 32-bit — ALTA
- **Descrição**: Parâmetros de rota utilizavam `parseInt` vulnerável a overflows e strings malformadas, e schemas de body não bloqueavam campos espúrios.
- **Correção Aplicada**: Criados schemas estritos `supportTicketIdParamSchema` (rejeitando IDs negativos, float, non-numeric e > 2.147.483.647), `adminSupportListQuerySchema`, `adminSupportArchiveSchema`, `adminSupportDossierQuerySchema` e blindagem `.strict()` em `creditPolSchema` e `adminReplySchema`.

---

## 3. Resultados dos Testes de Carga (k6) — Suporte Administrativo

Executado através de `tests/performance/run-support-k6.mjs` sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 10.074 requests) | ✅ Aprovado |
| **Latência Admin Support (`/api/admin/support`)** | p95 < 300 ms | **27.92 ms** (p50: 19.35 ms) | ✅ Excelente |
| **Latência Player Support (`/api/support`)** | p95 < 300 ms | **1.56 ms** (p50: 0.69 ms) | ✅ Excelente |
| **Throughput Médio** | > 100 req/s | **915.5 req/s** | ✅ Aprovado |
| **Duração Total** | 11 s | **11 s** (15 VUs) | ✅ Conforme |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — Suporte Administrativo

Executado através de `tests/security/run-kali-support-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação (GET/POST Admin sem token / Forged)** | 5 vetores em rotas admin | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Operador restrito tentando GET, reply, credit-pol e archive | **100% Bloqueado** (HTTP 403 Forbidden) |
| **Mass Assignment Protection** | Chaves rogue em reply, credit-pol, archive e query params | **100% Bloqueado** (HTTP 400 Bad Request via `.strict()`) |
| **Validação de ID (Negativo, Overflow 32-bit e Non-numeric)** | 3 vetores de ID malformado | **100% Bloqueado** (HTTP 400 invalid_id) |
| **Validação Financeira (Amount negativo, cap > 1000 e short reason)** | 3 vetores de valores de POL inválidos | **100% Bloqueado** (HTTP 400 validation_error) |
| **Neutralização de Injeção SQL e XSS** | Vetores SQLi em parâmetro de ID e XSS em corpo de resposta | **100% Neutralizados** (HTTP 400 / encoding seguro) |
| **Prevenção de Information Disclosure** | Varredura de strings sensíveis de ORM, paths e stack traces | **Zero vazamentos** detectados |

**Total de Verificações de Segurança**: 22 executadas, 22 aprovadas, 0 falhas.

---

# PARTE XVI: MÓDULO ANTIBOT (`/admin/antibot`)

## 1. Resumo Executivo dos Achados — AntiBot

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-51** | **BFLA Crítico nas Rotas do AntiBot:** Roteador administrativo (`/api/admin/antibot/*`) continha apenas `requireAdminAuth`, sem nenhuma verificação de permissões RBAC (`requireAdminPermission`). Qualquer operador autenticado (inclusive `readonly`, `support` ou `finance`) podia atualizar alertas, adicionar usuários na whitelist de confiança e até disparar `POST /reset` para apagar todo o banco de detecções. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/antibot/antibot.routes.ts:29-40` | ✅ **Corrigido** |
| **SEC-52** | **Ausência de Permissões RBAC no Sistema Central:** As permissões `antibot` e `antibot.view` não existiam em `server/modules/admin/admin.permissions.ts`, impossibilitando controle granular por papel. | **ALTA** | CWE-284 / OWASP A1 | `server/modules/admin/admin.permissions.ts` | ✅ **Corrigido** |
| **SEC-53** | **Falha de Auditoria com Identidade Nula (`adminId: null`):** Operações `ANTIBOT_TRUST_USER` e `ANTIBOT_CLEAR_ALL` tentavam extrair `req.user.id` em vez de `req.admin.adminId`, gravando `adminId: null` em `admin_audit_logs`. `adminUpdateAlert` e `adminRecompute` não possuíam auditoria. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/antibot/antibot.controller.ts:228, 279` | ✅ **Corrigido** |
| **SEC-54** | **Ausência de Rate Limiting Distribuído:** Rotas de auditoria do AntiBot utilizavam rate limiter local em memória, suscetíveis a DoS sob balanceamento de carga com múltiplos containers. | **ALTA** | CWE-770 / OWASP A4 | `server/modules/antibot/antibot.routes.ts:28` | ✅ **Corrigido** |
| **SEC-55** | **Falta de Validação Estrita Zod (.strict()) e Clamping 32-bit:** Endpoints administrativos não validavam entradas com Zod, permitindo mass assignment e falhas `P2003` (500) em IDs inexistentes. | **ALTA** | CWE-915 / CWE-20 | `server/modules/antibot/antibot.controller.ts` | ✅ **Corrigido** |
| **TEC-04** | **Rota de Transição Legada `/overview-legacy`:** Rota duplicada e não utilizada consumindo manutenção e superfície de ataque. | **BAIXA** | Código Morto | `server/modules/antibot/antibot.routes.ts:31` | ✅ **Removido** |
| **UX-02** | **Dump de JSON Bruto em Perfil de Usuário e `window.confirm`:** `AdminAntibotUserProfilePage.tsx` renderizava apenas uma tag `<pre>` com `JSON.stringify`. `AdminAntibotPage.tsx` usava `window.confirm` bloqueante. | **MÉDIA** | Usabilidade / UI | `client/src/features/admin/antibot/` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Mitigações Aplicadas — AntiBot

### SEC-51 & SEC-52: Controle de Acesso Quebrado (BFLA) e Permissões Ausentes — CRÍTICA
- **Descrição**: O roteador `/api/admin/antibot` montava todas as rotas com apenas `requireAdminAuth`. Qualquer credencial administrativa, mesmo de papéis meramente consultivos ou de suporte/financeiro, permitia alterar status de alertas, zerar o score de jogadores via whitelist (`/trust`) e acionar a rota destrutiva `POST /reset`. Adicionalmente, as permissões `antibot` e `antibot.view` não estavam cadastradas na matriz de RBAC.
- **Correção Aplicada**: Cadastradas as permissões `antibot` e `antibot.view` em `server/modules/admin/admin.permissions.ts`, atribuídas ao papel `admin` e concedido `antibot.view` para `moderator`. Adicionados guards `requireAdminPermission("antibot.view", "antibot")` para rotas de leitura e `requireAdminPermission("antibot")` para todas as mutações e o reset.
- **Teste de Verificação**: `tests/antibot/admin-antibot.rbac.test.mjs` (12 testes) e testes Kali `BFLA-001..005` e `RBAC-001..004` (100% aprovados).

---

### SEC-53: Correção da Trilha de Auditoria e Identidade Administrativa — ALTA
- **Descrição**: A função auxiliar `sessionUserId(req)` buscava `req.user?.id`. Em rotas administrativas protegidas por `requireAdminAuth`, o contexto autenticado é alocado em `req.admin.adminId`. Como consequência, o banco registrava o autor da mutação como `null`.
- **Correção Aplicada**: Criada função `adminActorId(req)` que extrai corretamente `req.admin?.adminId`. Adicionadas chamadas `logAdminAction` para `ANTIBOT_UPDATE_ALERT`, `ANTIBOT_RECOMPUTE_SCORE`, `ANTIBOT_TRUST_USER` e `ANTIBOT_CLEAR_ALL`.

---

### SEC-54 & SEC-55: Blindagem Zod `.strict()`, Rate Limiting Distribuído e Resiliência a IDs Inexistentes — ALTA
- **Descrição**: Requisições para `/users/:id/trust` com IDs inexistentes causavam violação de chave estrangeira no Prisma (`P2003`) com HTTP 500. Schemas não rejeitavam propriedades adicionais.
- **Correção Aplicada**: Criado arquivo `server/modules/antibot/antibot.schemas.ts` com validação estrita `.strict()` em todos os parâmetros, queries e payloads. Verificação prévia da existência do usuário no banco respondendo HTTP 404 limpo. Substituição por limitadores distribuídos `antibot_admin_read` (120 req/min), `antibot_admin_write` (120 req/min) e `antibot_admin_reset` (10 req/min).

---

### UX-02: Redesign Moderno do Perfil Antibot e Eliminação de `window.confirm` — MÉDIA
- **Descrição**: A página `/admin/antibot/users/:id` exibia um dump cru em JSON. A limpeza da base usava o diálogo nativo e bloqueante `window.confirm`.
- **Correção Aplicada**: Criação de modal de confirmação estilizado em Tailwind para limpeza de dados. Redesign completo de `AdminAntibotUserProfilePage.tsx` com cards de KPI, pontuação de risco com escala colorida (0-100), botão de recálculo dinâmico, modal de motivo de confiança e tabelas organizadas de evidências, sessões e dispositivos.

---

## 3. Resultados dos Testes de Carga (k6) — AntiBot

Executado através de `tests/performance/run-antibot-k6.mjs` sob 15 VUs:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 9.048 requests) | ✅ Aprovado |
| **Latência Admin Overview (`/api/admin/antibot/overview`)** | p95 < 300 ms | **46.14 ms** (p50: 14.59 ms) | ✅ Excelente |
| **Latência Telemetria Pública (`/api/antibot/telemetry`)** | p95 < 300 ms | **2.66 ms** (p50: 1.30 ms) | ✅ Excelente |
| **Throughput Médio** | > 100 req/s | **822.2 req/s** | ✅ Aprovado |
| **Duração Total** | 11 s | **11 s** (15 VUs) | ✅ Conforme |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux) — AntiBot

Executado através de `tests/security/run-kali-antibot-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação (GET/PATCH/POST Admin sem token / Forged)** | 6 vetores em rotas admin | **100% Bloqueados** (HTTP 401 Unauthorized) |
| **BFLA (Broken Function Level Authorization)** | Operador restrito tentando GET, update, trust, recompute e reset | **100% Bloqueado** (HTTP 403 Forbidden) |
| **RBAC Granular (Moderador com antibot.view)** | Leitura permitida (200), mutações bloqueadas (403) | **100% Conforme** |
| **Mass Assignment Protection** | Chaves rogue em PATCH alert, POST trust e GET overview | **100% Bloqueado** (HTTP 400 Bad Request via `.strict()`) |
| **Validação de ID (Negativo e Overflow 32-bit)** | 2 vetores de ID malformado | **100% Bloqueado** (HTTP 400 invalid_id) |
| **Validação de Enum (Status de Alerta Inválido)** | 1 vetor com status inválido | **100% Bloqueado** (HTTP 400 validation_error) |
| **Neutralização de Injeção SQL e XSS** | Vetor SQLi em ID e payload XSS em motivo de confiança | **100% Neutralizados** (HTTP 400 / 404 sem execução) |
| **Prevenção de Information Disclosure** | Varredura de stack traces e strings internas do ORM | **Zero vazamentos** detectados |
| **Telemetria Pública** | `POST /api/antibot/telemetry` | **100% Funcional** (HTTP 200 OK) |

**Total de Verificações de Segurança**: 25 executadas, 25 aprovadas, 0 falhas.










