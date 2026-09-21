# Manual Técnico de Governança, Segurança e Auditoria Administrativa

**BlockMiner 2.1 — Sistema de Governança Administrativa**  
*Documentação Técnica Oficial de Arquitetura, Segurança e Auditoria*

---

## 1. Visão Geral da Arquitetura

O módulo administrativo (`server/modules/admin`) é o núcleo de controle e governança do BlockMiner. Ele gerencia o ciclo de vida dos administradores, sessões ativas, controle de acesso baseado em papéis (RBAC) e o registro imutável de todas as ações de impacto através do **Admin Audit Log**.

```mermaid
flowchart TD
    subgraph UI ["Camada de Apresentação (React SPA)"]
        AuditPage["/admin/admin-audit<br/>(Painel de Auditoria)"]
        AdminsPage["/admin/admins<br/>(Gestão de Usuários)"]
        ProfilePage["/admin/profile<br/>(Meu Perfil & Senha)"]
    end

    subgraph Security ["Muralha de Segurança (Middlewares)"]
        RateLimit["adminLimiter<br/>300 req/min por IP"]
        AuthMiddleware["requireAdminAuth<br/>JWT issuer: blockminer-admin"]
        SessionValidator["Validador de Sessão<br/>admin_sessions (Cache 8s)"]
        Sanitizer["Sanitizador de Payload<br/>Mascaramento [REDACTED]"]
    end

    subgraph Core ["Lógica de Negócio (Services)"]
        AdminCtrl["admin.controller.ts"]
        AuditService["admin.audit-log.service.ts<br/>Cache de Stats: 5s"]
        AdminService["admin.service.ts<br/>Bcrypt Cost: 12"]
    end

    subgraph DB ["Persistência (PostgreSQL)"]
        UsersTbl[("admin_users")]
        SessionsTbl[("admin_sessions")]
        AuditTbl[("admin_audit_logs")]
    end

    UI --> RateLimit
    RateLimit --> AuthMiddleware
    AuthMiddleware --> SessionValidator
    SessionValidator --> AdminCtrl
    AdminCtrl --> Sanitizer
    Sanitizer --> AuditService
    AuditService --> AuditTbl
    AdminCtrl --> AdminService
    AdminService --> UsersTbl
    AdminService --> SessionsTbl
```

---

## 2. Controle de Acesso Baseado em Papéis (RBAC)

O sistema define papéis explícitos com princípio de menor privilégio:

| Papel | Descrição | Permissões Padrão |
|---|---|---|
| `super_admin` | Acesso total e irrestrito ao sistema | `["*"]` (Wildcard) |
| `admin` | Gestão operacional de usuários, mineradoras e economia | `["dashboard", "users", "miners", "inventory", "store", "payments", "withdrawals", "deposits", "support", "logs", "monitoring", "promotions", "events", "offerwall", "ptc", "shortlinks", "checkin", "mining", "tournaments", "banners", "config", "audit", "admins"]` |
| `moderator` | Moderação de usuários e chamados de suporte | `["dashboard", "users.view", "users.ban", "support", "logs.view"]` |
| `finance` | Operações financeiras, depósitos e saques | `["dashboard", "users.view", "payments", "withdrawals", "deposits"]` |
| `support` | Atendimento a jogadores e chamados | `["dashboard", "users.view", "support"]` |
| `readonly` | Visualização de métricas e dashboards | `["dashboard"]` |

### Regras de Proteção de Super Administradores:
- **Proteção contra Rebaixamento Acidental:** O sistema rejeita o rebaixamento ou desativação do último `super_admin` ativo no banco.
- **Isolamento de Criação:** Apenas usuários com papel `super_admin` podem criar novos administradores ou alterar privilégios existentes.

---

## 3. Ciclo de Vida de Autenticação e Sessões

1. **Hash de Senhas:** Utiliza **bcrypt com fator de custo 12** para todas as contas administrativas (superior ao fator de custo 10 dos usuários comuns).
2. **Requisitos de Senha Forte:** Mínimo de 12 caracteres contendo obrigatoriamente maiúsculas (`A-Z`), minúsculas (`a-z`), dígitos (`0-9`) e caracteres especiais (`!@#$%...`).
3. **Sessão Baseada em Banco de Dados (`admin_sessions`):**
   - Cada login bem-sucedido gera um registro exclusivo em `admin_sessions`.
   - O identificador da sessão (`sessionId`) é embutido no JWT assinado com `issuer: "blockminer-admin"`.
   - Cookie seguro com flags: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=86400`, `Secure`.
4. **Revogação Instantânea:**
   - Ao alterar a senha ou clicar em "Revogar Outras Sessões", o status `revokedAt` é preenchido no banco de dados e o cache em memória é invalidado imediatamente.

---

## 4. Dicionário de Eventos de Auditoria (`admin_audit_logs`)

Todas as operações administrativas geram registros imutáveis na tabela `admin_audit_logs`.

| Ação | Módulo | Descrição | Dados Registrados |
|---|---|---|---|
| `ADMIN_LOGIN_SUCCESS` | `auth` | Autenticação bem-sucedida de administrador | IP, User-Agent, AdminId, SessionId |
| `ADMIN_LOGIN_FAILURE` | `auth` | Tentativa de login rejeitada | IP, User-Agent, Email tentado, Erro (`WRONG_PASSWORD`, etc.) |
| `ADMIN_LOGOUT` | `auth` | Encerramento de sessão administrativa | AdminId, SessionId, IP |
| `ADMIN_CREATE` | `admins` | Criação de novo administrador | `newValue`: Nome, Email, Role |
| `ADMIN_UPDATE` | `admins` | Atualização de papel ou status de admin | `oldValue` vs `newValue` (Nome, Role, IsActive) |
| `ADMIN_PASSWORD_RESET` | `admins` | Redefinição de senha de administrador | AdminId do alvo (sem vazamento de senha) |
| `ADMIN_PROFILE_UPDATE` | `admins` | Atualização de perfil próprio | Nome alterado |
| `ADMIN_CHANGE_OWN_PASSWORD` | `admins` | Alteração de senha pelo próprio admin | AdminId |
| `ADMIN_SESSION_REVOKE` | `admins` | Revogação de sessão específica | SessionId |
| `ADMIN_SESSIONS_REVOKE_OTHER` | `admins` | Revogação de todas as outras sessões | Contagem de sessões revogadas |
| `ADMIN_SESSIONS_REVOKE_ALL` | `admins` | Revogação forçada de todas as sessões | Contagem de sessões revogadas |
| `ADMIN_GRANT_MINER` | `users` | Concessão manual de mineradora a jogador | `minerId`, `quantity`, `minerName` |
| `ADMIN_UNLOCK_ACCOUNT` | `users` | Desbloqueio manual de conta de usuário | `rowsDeleted` |
| `ADMIN_MINER_CREATE` | `miners` | Criação de máquina no catálogo | Dados da máquina criada |
| `ADMIN_MINER_UPDATE` | `miners` | Modificação de máquina no catálogo | `oldValue` vs `newValue` |

---

## 5. Blindagem e Segurança Defensiva (OWASP)

### 5.1 Sanitização Automática de Dados (`sanitizeAuditPayload`)
O serviço de auditoria possui um interceptor estático que analisa recursivamente todos os payloads (`oldValue` e `newValue`) antes de persistir no banco. Qualquer chave contendo termos confidenciais como:
- `password`, `userPassword`, `newPassword`, `passwordHash`
- `token`, `jwt`, `secret`, `apiKey`
- `privateKey`, `mnemonic`, `seed`
- `creditCard`, `cvv`

É automaticamente substituída pelo valor `[REDACTED]`. Isso elimina o risco de vazamento de credenciais na visualização do histórico.

### 5.2 Truncamento Seguro de Entradas
Para evitar ataques de negação de serviço por estouro de payload (Buffer Overflow / Memory Bloat):
- `action`: Máximo 100 caracteres.
- `module`: Máximo 50 caracteres.
- `resource`: Máximo 100 caracteres.
- `ipAddress`: Máximo 64 caracteres (compatível com IPv6 expandido).
- `userAgent`: Máximo 500 caracteres.
- `errorMsg`: Máximo 500 caracteres.

### 5.3 Cache de Agregação de Alta Performance
O endpoint `GET /api/admin/admin-audit/stats` processa múltiplos `COUNT` e `GROUP BY`. Para proteger o banco PostgreSQL contra exaustão de conexões durante o uso do **Auto-refresh (10s)** na interface, os resultados são cacheados em memória por **5 segundos**.

---

## 6. Catálogo de Endpoints da API

Todas as rotas exigem cabeçalho de autenticação ou cookie `blockminer_admin_session`.

### Gestão de Auditoria:
- `GET /api/admin/admin-audit`
  - **Query Params:** `page`, `pageSize` (máx 200), `adminId`, `action`, `module`, `search`, `success` (`true`/`false`), `from`, `to`.
  - **Resposta:** `{ ok: true, rows: AdminAuditLogRow[], total, page, pageSize, totalPages }`
- `GET /api/admin/admin-audit/stats`
  - **Resposta:** `{ ok: true, stats: AdminAuditStats }`

### Gestão de Administradores (Restrito a `super_admin`):
- `GET /api/admin/admins` — Lista todos os administradores cadastrados.
- `POST /api/admin/admins` — Cadastra novo administrador com senha forte.
- `PATCH /api/admin/admins/:id` — Atualiza nome, papel ou status ativo/inativo.
- `POST /api/admin/admins/:id/reset-password` — Gera e redefine a senha do admin.
- `GET /api/admin/admins/:id/sessions` — Lista sessões ativas do admin especificado.
- `DELETE /api/admin/admins/:id/sessions` — Revoga todas as sessões do admin especificado.

### Perfil e Própria Conta:
- `GET /api/admin/profile` — Carrega dados da conta logada.
- `PATCH /api/admin/profile` — Altera nome da conta logada.
- `POST /api/admin/change-password` — Altera a própria senha (valida senha atual).
- `GET /api/admin/sessions` — Lista sessões da conta logada.
- `DELETE /api/admin/sessions/other` — Revoga todas as outras sessões abertas.
- `DELETE /api/admin/sessions/:sessionId` — Revoga uma sessão específica.
- `GET /api/admin/my-audit` — Histórico de ações exclusivas do admin autenticado.
