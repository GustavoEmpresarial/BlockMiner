# Documentação Técnica: Gestão de Usuários & Jogadores (`/admin/users`)

## 1. Visão Geral e Arquitetura do Domínio

O módulo de Gestão de Usuários (`/admin/users` e `/admin/users/:id`) é o componente central de governança de jogadores do BlockMiner 2.1.
Ele permite aos operadores administrativos inspecionar dados cadastrais, métricas em tempo real, gerenciar punições/banimentos, redefinir senhas, conceder ativos e ajustar saldos de moedas com isolamento transacional estrito.

### Principais Funcionalidades

1. **Diretório Geral de Usuários (`GET /api/admin/users`):** Listagem paginada com suporte a pesquisa multi-campo (ID, username, nome, e-mail, IP, carteira, código de referência) e filtros de status (`all`, `active`, `banned`).
2. **Dossiê Consolidado do Jogador (`GET /api/admin/users/:id`):** Consulta atômica de perfil de identidade combinada com agregação em tempo real de hashrate ativo, máquinas em racks, inventário, reivindicações de faucet, depósitos e saques totais.
3. **Ajuste Serializável de Saldos (`POST /api/admin/users/:id/adjust-balance`):** Ajuste manual atômico e concorrente seguro em nível de isolamento `Serializable`, suportando 9 moedas (`pol`, `blk`, `blkLocked`, `shib`, `btc`, `eth`, `usdt`, `usdc`, `zer`) em modos `set` ou `add`, com barreira contra saldo negativo e geração dupla de auditoria (`audit_logs` e `admin_audit_logs`).
4. **Suspensão & Banimento (`POST/PUT /api/admin/users/:id/ban`, `POST /api/admin/users/:id/unban`):** Bloqueio imediato de acesso do jogador, com registro de motivo auditado e suporte a banimento temporário em dias ou permanente.
5. **Concessão Direta de Mineradoras (`POST /api/admin/users/:id/send-miner`):** Injeção de mineradoras ativas do catálogo diretamente no inventário do jogador através da API pública de inventário (`grantPurchasedInventoryItems`).
6. **Redefinição Segura de Credenciais (`POST /api/admin/users/:id/reset-password`):** Redefinição manual de senha com hash adaptativo bcrypt ou geração pseudo-aleatória forte de senha temporária.
7. **Desbloqueio de Conta (`POST /api/admin/users/:id/unlock`):** Limpeza de callbacks de bloqueio de segurança (`SEC_LOCK`) permitindo recuperação de contas com tentativas de login excedidas.

### Fluxo Arquitetural

```mermaid
flowchart TD
    Admin[Operador Admin] -->|Acessa /admin/users| UI["AdminUsersPage.tsx / AdminUserDetailPage.tsx"]
    UI -->|adminUsersApi| Router["usersAdminRouter"]
    Router -->|requireAdminAuth| Auth["JWT HS256 Validation"]
    Router -->|RBAC Guard| RBAC["requireAdminPermission('users.view' | 'users.ban' | 'users')"]
    Router -->|Distributed Rate Limiter| DRL["120 read / 60 write / 30 balance / 10 password"]
    Router -->|Zod .strict()| Zod["users.admin.schemas.ts"]
    Router --> Ctrl["users.admin.controller.ts"]
    
    Ctrl --> Repo["usersAdmin.repository.ts"]
    Repo --> DB[(PostgreSQL: users, miners, audit_logs)]
    Ctrl -->|Transação Serializável| BalanceTx["adjustUserBalanceFieldTx (Isolation: Serializable)"]
    BalanceTx --> DB
    
    Ctrl -->|logAdminAction| AuditDB[(PostgreSQL: admin_audit_logs)]
```

---

## 2. Modelos de Dados Envolvidos

### users (`users`)
Entidade principal da conta do jogador:
- `id`: Chave primária inteira sequencial.
- `username`: Nome de usuário único na plataforma.
- `email`: Endereço de e-mail único.
- `password_hash`: Hash bcrypt adaptativo da senha.
- `wallet_address`: Endereço público EVM/Polygon (com constraint de unicidade `users_wallet_address_key`).
- `is_banned`: Booleano indicando suspensão de acesso.
- `ban_reason`, `banned_at`, `banned_until`, `banned_by_admin_id`: Rastro do banimento.
- Saldos: `pol_balance`, `blk_balance`, `blk_locked`, `shib_balance`, `btc_balance`, `eth_balance`, `usdt_balance`, `usdc_balance`, `zer_balance`.

### audit_logs (`audit_logs`)
Registro de auditoria operacional do usuário:
- `user_id`: Identificador do jogador auditado.
- `action`: Tipo de ação (`admin_balance_adjust`, etc.).
- `source`: `"admin"`.
- `severity`: `"warn"`.
- `details_json`: Metadados completos do delta de saldo (moeda, antes, depois, autor).

### admin_audit_logs (`admin_audit_logs`)
Trilha central de governança administrativa:
- Registra `admin_id`, `admin_email`, `session_id`, `action` (`ADMIN_BAN_USER`, `ADMIN_UNBAN_USER`, `ADMIN_ADJUST_BALANCE`, `ADMIN_GRANT_MINER`, `ADMIN_PASSWORD_RESET`, `ADMIN_UNLOCK_ACCOUNT`), `resource: "User"` e `resource_id`.

---

## 3. Matriz de Permissões RBAC e Rate Limiting

| Método | Endpoint | Permissões Requeridas | Rate Limit | Auditoria Registrada |
|---|---|---|---|---|
| `GET` | `/api/admin/users` | `users.view` ou `users` | 120 req/min | — |
| `GET` | `/api/admin/users/:id` | `users.view` ou `users` | 120 req/min | — |
| `GET` | `/api/admin/users/:id/tickets` | `users.view` ou `users` | 120 req/min | — |
| `GET` | `/api/admin/users/:id/related` | `users.view` ou `users` | 120 req/min | — |
| `GET` | `/api/admin/users/:id/wallet-ledger` | `users.view` ou `users` | 120 req/min | — |
| `GET` | `/api/admin/users/:id/activity-summary` | `users.view` ou `users` | 120 req/min | — |
| `POST/PUT` | `/api/admin/users/:id/ban` | `users.ban` ou `users` | 60 req/min | `ADMIN_BAN_USER` |
| `POST` | `/api/admin/users/:id/unban` | `users.ban` ou `users` | 60 req/min | `ADMIN_UNBAN_USER` |
| `POST` | `/api/admin/users/:id/adjust-balance` | `users` | 30 req/min | `ADMIN_ADJUST_BALANCE` + `audit_logs` |
| `POST` | `/api/admin/users/:id/unlock` | `users` | 60 req/min | `ADMIN_UNLOCK_ACCOUNT` |
| `POST` | `/api/admin/users/:id/reset-password` | `users` | 10 req/min | `ADMIN_PASSWORD_RESET` |
| `POST` | `/api/admin/users/:id/send-miner` | `users` | 60 req/min | `ADMIN_GRANT_MINER` |

---

## 4. Especificação OpenAPI 3.0.3

```yaml
openapi: 3.0.3
info:
  title: BlockMiner 2.1 - User Administration & Management API
  version: 2.1.0
  description: API administrativa completa para gestão de contas de jogadores, auditoria, banimentos, redefinição de senhas e ajustes de saldo.
paths:
  /api/admin/users:
    get:
      summary: Listar usuários
      description: Retorna a lista paginada de contas de jogadores com filtros de busca e status.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: query
          name: page
          schema:
            type: integer
            default: 1
            minimum: 1
        - in: query
          name: pageSize
          schema:
            type: integer
            default: 25
            maximum: 100
        - in: query
          name: query
          schema:
            type: string
            maxLength: 120
        - in: query
          name: status
          schema:
            type: string
            enum: [all, active, banned]
            default: all
      responses:
        '200':
          description: Lista de usuários obtida com sucesso.
        '401':
          description: Não autenticado.
        '403':
          description: Permissão insuficiente (exige users.view ou users).

  /api/admin/users/{id}:
    get:
      summary: Obter detalhes do usuário e métricas
      description: Retorna o perfil completo e agregação de hashrate, inventário, depósitos e saques.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
            minimum: 1
            maximum: 2147483647
      responses:
        '200':
          description: Perfil do jogador retornado.
        '400':
          description: ID inválido.
        '404':
          description: Usuário não encontrado.

  /api/admin/users/{id}/adjust-balance:
    post:
      summary: Ajustar saldo de moeda
      description: Operação serializável para definir ou creditar/debitar saldo de uma das 9 moedas suportadas.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - currency
                - mode
                - amount
              properties:
                currency:
                  type: string
                  enum: [pol, blk, blkLocked, shib, btc, eth, usdt, usdc, zer]
                mode:
                  type: string
                  enum: [set, add]
                amount:
                  type: number
                reason:
                  type: string
                  maxLength: 300
              additionalProperties: false
      responses:
        '200':
          description: Saldo ajustado com sucesso.
        '400':
          description: Parâmetros inválidos ou resultado geraria saldo negativo.
        '403':
          description: Permissão insuficiente (exige permissão estrita "users").
        '404':
          description: Usuário não encontrado.

  /api/admin/users/{id}/ban:
    post:
      summary: Banir usuário
      description: Suspende a conta do jogador imediatamente com motivo auditado.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                reason:
                  type: string
                  maxLength: 300
                days:
                  type: integer
                  minimum: 1
              additionalProperties: false
      responses:
        '200':
          description: Usuário banido com sucesso.
        '403':
          description: Permissão insuficiente (exige users.ban ou users).

  /api/admin/users/{id}/unban:
    post:
      summary: Desbanir usuário
      description: Reativa a conta do jogador.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: Usuário desbanido com sucesso.
        '403':
          description: Permissão insuficiente (exige users.ban ou users).

  /api/admin/users/{id}/reset-password:
    post:
      summary: Redefinir senha da conta
      description: Define nova senha ou gera aleatória forte automaticamente.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                newPassword:
                  type: string
                  minLength: 6
                  maxLength: 100
              additionalProperties: false
      responses:
        '200':
          description: Senha redefinida com sucesso.
        '403':
          description: Permissão insuficiente (exige users).

  /api/admin/users/{id}/send-miner:
    post:
      summary: Conceder mineradora ao inventário
      description: Injeta instâncias de mineradoras ativas diretamente no inventário do jogador.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - minerId
              properties:
                minerId:
                  type: integer
                  minimum: 1
                quantity:
                  type: integer
                  minimum: 1
                  maximum: 50
                  default: 1
              additionalProperties: false
      responses:
        '200':
          description: Mineradora concedida com sucesso.
        '403':
          description: Permissão insuficiente (exige users).

  /api/admin/users/{id}/unlock:
    post:
      summary: Desbloquear conta
      description: Remove bloqueios de segurança (SEC_LOCK).
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: Bloqueio removido com sucesso.
        '403':
          description: Permissão insuficiente (exige users).

components:
  securitySchemes:
    AdminJwtAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```
