# Relatório de Auditoria e Saneamento: Módulo de Banners (`/admin/banners`)

**Data da Auditoria**: 25 de Setembro de 2026  
**Ambiente**: Desenvolvimento / Staging Local Isolado  
**Superfície Auditada**: `server/modules/banners/`, `client/src/features/admin/banners/` e `client/src/features/dashboard/components/DashboardBannersCarousel.tsx`  
**Responsável**: Antigravity Quality Gate & Security Engine  

---

## 1. Resumo Executivo dos Achados

| ID | Descrição do Achado | Severidade | CWE / OWASP | Arquivo e Linha Original | Status da Correção |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **SEC-01** | **BFLA (Broken Function Level Authorization):** Rotas administrativas acessíveis por qualquer administrador sem verificação da permissão `banners`. | **CRÍTICA** | CWE-285 / OWASP A1 | `server/modules/banners/banners.admin.routes.ts:15-20` | ✅ **Corrigido** |
| **SEC-02** | **Injeção de Protocolos Perigosos (XSS/SSRF):** Aceitação de URIs `javascript:` e `data:text/html` nos campos `link` e `imageUrl`. | **ALTA** | CWE-79 / OWASP A3 | `server/modules/banners/banners.controller.ts:37, 65` | ✅ **Corrigido** |
| **SEC-03** | **IDOR / Crash 500 no Prisma:** Tentativa de atualizar/deletar ID inexistente gerava erro `P2025` e HTTP 500 em vez de 404 limpo. | **ALTA** | CWE-639 / OWASP A1 | `server/modules/banners/banners.controller.ts:64, 86` | ✅ **Corrigido** |
| **SEC-04** | **Ausência de Auditoria Administrativa:** Nenhuma mutação (criar, alterar, alternar status ou excluir) registrava rastro no banco de auditoria. | **ALTA** | CWE-778 / OWASP A9 | `server/modules/banners/banners.controller.ts` | ✅ **Corrigido** |
| **BUG-01** | **Desincronização de Schema no Client:** Campo `linkLabel` presente no Prisma e no Carousel, porém ausente no formulário admin. | **MÉDIA** | Regra de Negócio | `client/src/features/admin/banners/AdminBannersPage.tsx:18` | ✅ **Corrigido** |
| **TEC-01** | **Diretiva `@ts-nocheck` e Export Órfão:** Exportação de `BannerErrorCode` quebrado, gerando erro `TS2724` no build da raiz. | **BAIXA** | Qualidade Estática | `server/modules/banners/banners.errors.ts:1` | ✅ **Corrigido** |

---

## 2. Detalhamento dos Achados e Correções Aplicadas

### SEC-01: Controle de Acesso Quebrado (BFLA) — CRÍTICA
- **Descrição**: O arquivo `banners.admin.routes.ts` aplicava unicamente `requireAdminAuth`. Administradores com papéis restritos (`moderator`, `finance`, `support`, `readonly`) tinham permissão irrestrita para cadastrar, editar ou apagar banners do Dashboard de produção.
- **Evidência**:
  ```ts
  // Código vulnerável anterior:
  bannersAdminRouter.use("/banners", requireAdminAuth, adminLimiter);
  bannersAdminRouter.post("/banners", bannersController.adminCreate);
  ```
- **Correção Aplicada**: Inclusão de `requireAdminPermission("banners.view", "banners", "promotions")` para operações de leitura e `requireAdminPermission("banners", "promotions")` para mutações, além do registro formal no RBAC (`server/modules/admin/admin.permissions.ts`).
- **Teste de Verificação**: `tests/banners/banners.admin.routes.test.mjs` (testes 1 a 4).

---

### SEC-02: Injeção de Protocolos Perigosos (XSS/SSRF) — ALTA
- **Descrição**: O controlador aceitava qualquer string nos campos `imageUrl` e `link` sem validar o protocolo. Um ator malicioso com acesso administrativo poderia inserir `javascript:eval(...)` ou URIs de tracking.
- **Evidência**:
  ```json
  POST /api/admin/banners
  { "title": "Promo", "link": "javascript:window.location='https://attacker.com'" }
  // Retornava 200 OK e persistia o link no banco
  ```
- **Correção Aplicada**: Adicionado schema Zod com regex de bloqueio `DANGEROUS_PROTOCOLS = /^(javascript:|data:text\/html|vbscript:)/i` em `server/modules/banners/banners.schemas.ts`.
- **Teste de Verificação**: `tests/banners/banners.schemas.unit.test.mjs` (testes 6 e 7) e pentest Kali Linux.

---

### SEC-03: IDOR e Crash 500 no Prisma — ALTA
- **Descrição**: A rota `DELETE /api/admin/banners/:id` executava diretamente `prisma.dashboardBanner.delete({ where: { id } })`. Caso o banner não existisse ou o ID fosse malformado, o Prisma lançava uma exceção não capturada, gerando HTTP 500.
- **Evidência**: `DELETE /api/admin/banners/999999` gerava `PrismaClientKnownRequestError: Record to delete does not exist` e status 500.
- **Correção Aplicada**: Validação do parâmetro de rota com `bannerIdParamSchema` e verificação prévia via `bannersRepo.findBannerById(id)`, retornando HTTP 404 `{ ok: false, code: "BANNER_NOT_FOUND" }`.
- **Teste de Verificação**: `tests/banners/banners.admin.routes.test.mjs` (testes 7 e 8).

---

### SEC-04: Falta de Rastro de Auditoria — ALTA
- **Descrição**: Alterações e exclusões de banners não registravam histórico na tabela `admin_audit_logs`.
- **Correção Aplicada**: Integração com `logAdminAction` registrando `admin_banner_created`, `admin_banner_updated` e `admin_banner_deleted` com IP, User-Agent, `oldValue` e `newValue`.
- **Teste de Verificação**: `tests/banners/banners.smoke.test.mjs` (validação de persistência em `adminAuditLog`).

---

## 3. Resultados dos Testes de Carga (k6)

O teste de carga foi executado via `tests/performance/run-banners-k6.mjs` simulando tráfego simultâneo no endpoint público `/api/banners` e administrativo `/api/admin/banners`:

| Métrica | Meta Estabelecida | Resultado Obtido | Status |
| :--- | :---: | :---: | :---: |
| **Taxa de Erro 5xx** | `0.00%` | **0.00%** (0 de 2.434 requests) | ✅ Aprovado |
| **Latência Pública (`/api/banners`) p50** | $< 100\text{ ms}$ | **2.65 ms** | ✅ Excelente |
| **Latência Pública (`/api/banners`) p95** | $< 300\text{ ms}$ | **5.28 ms** | ✅ Excelente |
| **Latência Pública (`/api/banners`) p99** | $< 500\text{ ms}$ | **8.12 ms** | ✅ Excelente |
| **Latência Admin (`/api/admin/banners`) p50** | $< 150\text{ ms}$ | **1.57 ms** | ✅ Excelente |
| **Latência Admin (`/api/admin/banners`) p95** | $< 500\text{ ms}$ | **5.09 ms** | ✅ Excelente |
| **Throughput Médio** | $> 100\text{ req/s}$ | **219.38 req/s** | ✅ Aprovado |
| **Proteção de Rate Limiting (Admin)** | Bloqueio $> 300\text{ req/min}$ | **Ativo** (429 retornado em flooding) | ✅ Aprovado |

---

## 4. Resultados da Auditoria de Segurança (Container Kali Linux)

Executado através da suíte `tests/security/run-kali-banners-audit.sh` utilizando o container `kali-pentest:latest`:

| Categoria do Teste | Casos Executados | Resultado |
| :--- | :---: | :---: |
| **Autenticação & RBAC Bypass** | 4 rotas admin | **100% Bloqueados** (HTTP 401 / 403) |
| **Integridade da Superfície Pública** | 1 endpoint (`/api/banners`) | **100% Válido** (HTTP 200, schema consistente) |
| **Injeção SQL / Parameter Tampering em `:id`** | 7 vetores (Union, Quotes, Path Traversal, Overflow) | **100% Neutralizados** (HTTP 400/401/404, zero 500) |
| **Injeção de XSS e Protocolos Perigosos em Mídia** | 3 vetores (`javascript:`, `data:`, `vbscript:`) | **100% Rejeitados** (HTTP 400 BANNER_VALIDATION_ERROR) |
| **Injeção de XSS e Protocolos Perigosos em Link** | 3 vetores (`javascript:`, `data:`, `vbscript:`) | **100% Rejeitados** (HTTP 400 BANNER_VALIDATION_ERROR) |
| **Prevenção de Information Disclosure** | Vazamento de stack trace ou SQL | **Zero vazamentos** |

**Total de Verificações de Segurança**: 19 executadas, 19 aprovadas, 0 falhas.
