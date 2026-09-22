# Módulo de Logs de Sistema (`/admin/logs`)

## 1. Visão Geral
O módulo `/admin/logs` do painel administrativo é a central de observabilidade e auditoria para eventos operacionais do sistema e atividade de usuários na plataforma BlockMiner.

### Distinção Crítica entre Tabelas de Auditoria:
1. **`AuditLog` (`audit_logs`)** — Gerenciado por este módulo (`/api/admin/logs`):
   - Registra eventos de sistema, atividade de usuários, operações de banco de dados e telemetria de clientes.
   - Origens (`source`): `"database"`, `"user"`, `"system"`, `"client"`.
   - Criticidades (`severity`): `"info"`, `"warn"`, `"error"`.
2. **`AdminAuditLog` (`admin_audit_logs`)** — Gerenciado pelo módulo `/admin/audit-log` (`/api/admin/admin-audit`):
   - Registra exclusivamente as ações executadas por administradores logados no painel (mudança de saldo, banimentos, resets de senha, exportações, backups, etc.).

---

## 2. Arquitetura e Fluxo de Dados

```
[Painel Administrativo (/admin/logs)]
       │
       ▼ GET /api/admin/logs (params: source, severity, q, page, pageSize)
[Express Backend Router (/server/modules/admin/admin.logs.routes.ts)]
       │
       ├─ requireAdminAuth: Valida sessão JWT do administrador
       ├─ requireAdminPermission("logs.view"): Valida permissão granular RBAC
       ├─ adminLimiter: Rate limiting de 300 req/min
       └─ admin.logs.service.ts:
              ├─ buildAuditLogWhereClause: Sanitização estrita de strings, LIKE search seguro
              ├─ normalizePagination: Suporte duplo a page/pageSize e limit/offset
              ├─ queryAuditLogs: Execução paralela com resumo de sources e severities
              └─ exportAuditLogs: Exportação RFC 4180 CSV / JSON até 5.000 registros
                     │
                     ▼
[PostgreSQL Database (Prisma: AuditLog)]
       ├─ Indexação: source, severity, action, userId, createdAt, ip
       └─ Joins otimizados com tabela users (email, username)
```

---

## 3. Especificação dos Endpoints

### 3.1 `GET /api/admin/logs`
Listagem paginada de logs de auditoria e sistema com filtros dinâmicos e agregadores.
- **Autenticação**: Sessão JWT de Administrador (`requireAdminAuth`).
- **Permissão RBAC**: `logs.view`, `logs`, ou `*` (Super Admin).
- **Parâmetros de Consulta (Query Params)**:
  | Parâmetro | Tipo | Padrão | Descrição |
  |---|---|---|---|
  | `page` | `number` | `1` | Número da página (1-based) |
  | `pageSize` | `number` | `50` | Itens por página (máximo 100) |
  | `limit` / `offset` | `number` | — | Suporte legado alternativo de paginação |
  | `source` | `string` | — | Filtro por origem (`"database"`, `"user"`, `"system"`, `"client"`, `"all"`) |
  | `severity` | `string` | — | Filtro por criticidade (`"info"`, `"warn"`, `"error"`, `"all"`) |
  | `action` | `string` | — | Filtro textual na ação executada |
  | `userId` | `number` | — | Filtro exato por ID de usuário |
  | `q` | `string` | — | Busca textual livre em action, label, description, ip, userAgent, email e username |
  | `from` | `string` | — | Data/hora inicial no formato ISO 8601 |
  | `to` | `string` | — | Data/hora final no formato ISO 8601 |

- **Resposta de Sucesso (200 OK)**:
  ```json
  {
    "ok": true,
    "logs": [
      {
        "id": 1042,
        "userId": 5,
        "user_id": 5,
        "user_email": "user@example.com",
        "user": { "email": "user@example.com", "username": "miner01" },
        "action": "FAUCET_CLAIM",
        "label": "CLAIM_SUCCESS",
        "description": "User claimed 0.05 POL from faucet",
        "source": "user",
        "severity": "info",
        "ip": "192.168.1.1",
        "userAgent": "Mozilla/5.0 ...",
        "detailsJson": { "amount": 0.05, "rewardType": "POL" },
        "metadata": null,
        "actorAdminId": null,
        "createdAt": "2026-09-22T01:30:00.000Z",
        "created_at": "2026-09-22T01:30:00.000Z"
      }
    ],
    "total": 967,
    "page": 1,
    "pageSize": 50,
    "hasMore": true,
    "sourcesSummary": [
      { "source": "database", "count": 956 },
      { "source": "user", "count": 6 },
      { "source": "system", "count": 5 }
    ],
    "severitiesSummary": [
      { "severity": "warn", "count": 956 },
      { "severity": "info", "count": 11 }
    ]
  }
  ```

---

### 3.2 `GET /api/admin/logs/export`
Exportação em lote dos registros de auditoria correspondentes aos filtros aplicados.
- **Autenticação**: Sessão JWT de Administrador.
- **Permissão RBAC**: `logs.view`.
- **Trilha de Auditoria**: Registrado em `admin_audit_logs` com a ação `EXPORT_SYSTEM_LOGS`.
- **Parâmetros**:
  - `format`: `"csv"` (padrão) ou `"json"`.
  - Mesmos filtros de `GET /api/admin/logs` (`source`, `severity`, `action`, `userId`, `q`, `from`, `to`).
- **Limites de Segurança**:
  - Máximo de 5.000 registros por exportação para evitar exaustão de memória no Node.js.
  - CSV formatado estritamente de acordo com o RFC 4180 (escapando aspas duplas e quebras de linha).

---

### 3.3 `GET /api/admin/logs/:id`
Consulta detalhada de um registro individual por ID.
- **Autenticação**: Sessão JWT de Administrador.
- **Permissão RBAC**: `logs.view`.
- **Resposta**: Objeto com `AuditLog` e dados relacionais do `User`.

---

## 4. Segurança e Hardening

1. **Controle de Acesso Baseado em Papéis (RBAC)**:
   - Moderadores, Administradores e Super Administradores possuem acesso concedido pela permissão `logs.view` ou `logs`.
   - Perfis `finance`, `support` ou `readonly` recebem `403 Forbidden` (`FORBIDDEN_PERMISSION`).
2. **Defesa em Profundidade contra SQL Injection**:
   - Todas as consultas utilizam Prisma ORM com queries parametrizadas.
   - Entradas de texto livre (`q`, `action`) sofrem truncate automático de segurança (max 200 caracteres para `q`, 100 para `action`) para mitigar ataques de negação de serviço (ReDoS/Algorithmic Complexity).
3. **Auditoria Administrativa**:
   - Cada exportação de logs é registrada na tabela `admin_audit_logs`, preservando o ID do administrador, email, IP e parâmetros de filtro solicitados.

---

## 5. Interface do Usuário (`AdminLogsPage.tsx`)

1. **Chips Dinâmicos com Contadores Reais**:
   - As abas de Origem (`Todas`, `Banco de Dados`, `Usuário`, `Sistema`, `Cliente Web`) exibem a contagem em tempo real vinda de `sourcesSummary`.
   - Os seletores de criticidade (`Info`, `Aviso`, `Erro`) exibem as contagens de `severitiesSummary`.
2. **Modal de Inspeção Rápida**:
   - Clique em qualquer linha ou botão de olho para abrir um modal detalhado com visualização de metadados e payloads JSON formatados.
3. **Exportação Direta**:
   - Botões para download imediato em formato CSV e JSON com download nativo.
