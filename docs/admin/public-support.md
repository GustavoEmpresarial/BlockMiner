# Documentacao Tecnica: Suporte Publico Pre-Login (`/admin/public-support`)

## 1. Visao Geral e Arquitetura do Dominio

O modulo de Suporte Publico Pre-Login permite que visitantes nao autenticados (guests) abram tickets de suporte diretamente na pagina de login do BlockMiner. Administradores com permissao `support` gerenciam esses tickets atraves do painel `/admin/public-support`.

### Fluxo Funcional

```mermaid
flowchart TD
    Guest[Visitante Pre-Login] -->|POST /api/public-support/ticket| PubRouter["supportPublicRouter"]
    Guest -->|GET /api/public-support/tickets?email=| PubRouter
    Guest -->|GET /api/public-support/ticket/:id?email=| PubRouter
    Guest -->|POST /api/public-support/ticket/:id/message| PubRouter
    Guest -->|POST /api/public-support/upload-image| PubRouter
    PubRouter -->|Rate Limiter (in-memory)| RateLimiter["30 read / 10 write / 5 upload per min"]
    PubRouter --> Controller["support.public.controller.ts"]
    Controller --> Service["support.service.ts"]
    Service --> DB[(PostgreSQL: public_support_tickets + public_support_messages)]

    Admin[Administrador] -->|Acessa| UI["/admin/public-support"]
    UI -->|GET /api/admin/public-support/tickets| AdminRouter["supportAdminRouter"]
    UI -->|GET /api/admin/public-support/ticket/:id| AdminRouter
    UI -->|POST /api/admin/public-support/ticket/:id/message| AdminRouter
    UI -->|PATCH /api/admin/public-support/ticket/:id/status| AdminRouter
    AdminRouter -->|requireAdminAuth| Auth["JWT HS256 Validation"]
    AdminRouter -->|RBAC Guard| RBAC["requireAdminPermission('support')"]
    AdminRouter -->|Distributed Rate Limiter| DRL["120 read / 300 write per min"]
    AdminRouter -->|Zod Validation .strict()| Zod["public-support.schemas.ts"]
    AdminRouter -->|Audit Log| Audit["logAdminAction('ADMIN_REPLY_PUBLIC_SUPPORT_TICKET' / 'ADMIN_SET_PUBLIC_SUPPORT_STATUS')"]
    AdminRouter --> AdminCtrl["support.admin.controller.ts"]
    AdminCtrl --> Service
```

### Decisoes de Design

1. **Sem autenticacao no lado publico**: Tickets sao associados por `guestEmail` e validados via rate limiting agressivo.
2. **Validacao Zod `.strict()`**: Todos os schemas administrativos rejeitam propriedades desconhecidas para prevenir mass assignment.
3. **Rate limiting distribuido**: Rotas admin utilizam rate limiter distribuido via `callbackQueue` (Prisma), garantindo consistencia em ambientes multi-container.
4. **Audit logging**: Todas as mutacoes administrativas (reply, status change) sao registradas em `admin_audit_logs`.
5. **RBAC granular**: Leitura exige `support.view` ou `support`, mutacoes exigem `support`.

---

## 2. Modelos de Dados Prisma

### PublicSupportTicket

```prisma
model PublicSupportTicket {
  id         Int      @id @default(autoincrement())
  guestName  String   @map("guest_name")
  guestEmail String   @map("guest_email")
  subject    String
  status     String   @default("open")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  resolvedById Int? @map("resolved_by_id")

  messages PublicSupportMessage[]

  @@index([guestEmail])
  @@index([status])
  @@map("public_support_tickets")
}
```

### PublicSupportMessage

```prisma
model PublicSupportMessage {
  id         Int      @id @default(autoincrement())
  ticketId   Int      @map("ticket_id")
  authorType String   @map("author_type")
  content    String
  imageUrl   String?  @map("image_url")
  createdAt  DateTime @default(now()) @map("created_at")

  ticket PublicSupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
  @@map("public_support_messages")
}
```

**Campos-chave:**
- `authorType`: Distingue `"guest"` (visitante) de `"admin"` (operador).
- `imageUrl`: Anexo opcional de imagem, carregado via `/api/public-support/upload-image`.
- `status`: Enum textual `"open"` | `"closed"`.
- Cascade delete: Ao remover um ticket, todas as mensagens associadas sao removidas.

---

## 3. Especificacao OpenAPI 3.0

```yaml
openapi: 3.0.3
info:
  title: BlockMiner Public Support API
  version: 1.0.0
  description: Endpoints publicos (guest) e administrativos para o sistema de tickets de suporte pre-login.

paths:
  # ── Rotas Publicas (Guest) ────────────────────────────────────────
  /api/public-support/tickets:
    get:
      summary: Listar tickets de um visitante por email
      tags: [Public Support - Guest]
      parameters:
        - name: email
          in: query
          required: true
          schema:
            type: string
            format: email
      responses:
        '200':
          description: Lista de tickets do visitante
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean, example: true }
                  tickets:
                    type: array
                    items:
                      $ref: '#/components/schemas/PublicSupportTicketSummary'
        '400':
          description: Email invalido ou ausente
        '429':
          description: Rate limit excedido (30 req/min)

  /api/public-support/ticket:
    post:
      summary: Criar novo ticket de suporte (guest)
      tags: [Public Support - Guest]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email, subject, message]
              properties:
                name: { type: string, maxLength: 100 }
                email: { type: string, format: email }
                subject: { type: string, maxLength: 200 }
                message: { type: string, maxLength: 10000 }
                imageUrl: { type: string, nullable: true }
      responses:
        '201':
          description: Ticket criado com sucesso
        '400':
          description: Campos obrigatorios ausentes ou email invalido
        '429':
          description: Rate limit excedido (10 req/min)

  /api/public-support/ticket/{id}:
    get:
      summary: Obter detalhes de um ticket (guest, validado por email)
      tags: [Public Support - Guest]
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
        - name: email
          in: query
          required: true
          schema: { type: string, format: email }
      responses:
        '200':
          description: Detalhes do ticket com mensagens
        '400':
          description: ID ou email invalido
        '404':
          description: Ticket nao encontrado
        '429':
          description: Rate limit excedido

  /api/public-support/ticket/{id}/message:
    post:
      summary: Adicionar mensagem a um ticket existente (guest)
      tags: [Public Support - Guest]
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email: { type: string, format: email }
                message: { type: string, maxLength: 10000 }
                imageUrl: { type: string, nullable: true }
      responses:
        '201':
          description: Mensagem adicionada
        '400':
          description: Email invalido ou mensagem vazia
        '404':
          description: Ticket nao encontrado
        '429':
          description: Rate limit excedido

  /api/public-support/upload-image:
    post:
      summary: Upload de imagem para anexo de ticket (guest)
      tags: [Public Support - Guest]
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                image:
                  type: string
                  format: binary
      responses:
        '200':
          description: Upload bem-sucedido
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  url: { type: string }
                  mimeType: { type: string, nullable: true }
        '400':
          description: Arquivo invalido ou ausente
        '429':
          description: Rate limit excedido (5 req/min)

  # ── Rotas Administrativas ────────────────────────────────────────
  /api/admin/public-support/tickets:
    get:
      summary: Listar tickets de suporte publico (admin)
      tags: [Public Support - Admin]
      security:
        - AdminCookieAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [all, open, closed]
            default: all
        - name: page
          in: query
          schema: { type: integer, default: 1, minimum: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 30, minimum: 1, maximum: 100 }
      responses:
        '200':
          description: Lista paginada de tickets
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  tickets: { type: array, items: { $ref: '#/components/schemas/PublicSupportTicketSummary' } }
                  total: { type: integer }
                  page: { type: integer }
                  limit: { type: integer }
        '400':
          description: Parametros de query invalidos (validacao Zod .strict())
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '429':
          description: Rate limit distribuido excedido (120 req/min)

  /api/admin/public-support/ticket/{id}:
    get:
      summary: Obter detalhes de um ticket (admin)
      tags: [Public Support - Admin]
      security:
        - AdminCookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer, maximum: 2147483647 }
      responses:
        '200':
          description: Ticket com mensagens
        '400':
          description: ID invalido (negativo, float, overflow 32-bit)
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Ticket nao encontrado

  /api/admin/public-support/ticket/{id}/message:
    post:
      summary: Responder a um ticket (admin)
      tags: [Public Support - Admin]
      security:
        - AdminCookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer, maximum: 2147483647 }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                message: { type: string, maxLength: 10000 }
                imageUrl: { type: string, maxLength: 1000, nullable: true }
      responses:
        '201':
          description: Resposta adicionada com sucesso
        '400':
          description: Validacao falhou (mensagem vazia, campos extras rejeitados por .strict())
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Ticket nao encontrado

  /api/admin/public-support/ticket/{id}/status:
    patch:
      summary: Alterar status de um ticket (admin)
      tags: [Public Support - Admin]
      security:
        - AdminCookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer, maximum: 2147483647 }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [status]
              properties:
                status:
                  type: string
                  enum: [open, closed]
      responses:
        '200':
          description: Status atualizado
        '400':
          description: Status invalido ou campos extras rejeitados
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Ticket nao encontrado

components:
  schemas:
    PublicSupportTicketSummary:
      type: object
      properties:
        id: { type: integer }
        guestName: { type: string }
        guestEmail: { type: string }
        subject: { type: string }
        status: { type: string, enum: [open, closed] }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    PublicSupportMessage:
      type: object
      properties:
        id: { type: integer }
        ticketId: { type: integer }
        authorType: { type: string, enum: [guest, admin] }
        content: { type: string }
        imageUrl: { type: string, nullable: true }
        createdAt: { type: string, format: date-time }

  responses:
    Unauthorized:
      description: Token JWT ausente, expirado ou invalido (HTTP 401)
    Forbidden:
      description: Permissao RBAC insuficiente (HTTP 403)

  securitySchemes:
    AdminCookieAuth:
      type: apiKey
      in: cookie
      name: bm_admin_session
```

---

## 4. Tabela de Seguranca

| Endpoint | Metodo | Rate Limit | Permissao RBAC | Audit Log | Validacao |
| :--- | :---: | :--- | :--- | :---: | :--- |
| `/api/public-support/tickets` | GET | 30 req/min (in-memory) | Nenhuma (publico) | -- | Email validado |
| `/api/public-support/ticket` | POST | 10 req/min (in-memory) | Nenhuma (publico) | -- | name, email, subject, message obrigatorios |
| `/api/public-support/ticket/:id` | GET | 30 req/min (in-memory) | Nenhuma (publico) | -- | ID numerico + email validado |
| `/api/public-support/ticket/:id/message` | POST | 10 req/min (in-memory) | Nenhuma (publico) | -- | Email + (message ou imageUrl) |
| `/api/public-support/upload-image` | POST | 5 req/min (in-memory) | Nenhuma (publico) | -- | Multipart, campo `image` |
| `/api/admin/public-support/tickets` | GET | 120 req/min (distribuido) | `support.view` ou `support` | -- | Query: Zod `.strict()` |
| `/api/admin/public-support/ticket/:id` | GET | 120 req/min (distribuido) | `support.view` ou `support` | -- | Param: Zod `.strict()`, max 2^31-1 |
| `/api/admin/public-support/ticket/:id/message` | POST | 300 req/min (distribuido) | `support` | `ADMIN_REPLY_PUBLIC_SUPPORT_TICKET` | Body + Param: Zod `.strict()` |
| `/api/admin/public-support/ticket/:id/status` | PATCH | 300 req/min (distribuido) | `support` | `ADMIN_SET_PUBLIC_SUPPORT_STATUS` | Body + Param: Zod `.strict()` |

### Controles de Seguranca Aplicados

1. **Autenticacao**: Rotas admin protegidas por `requireAdminAuth` (JWT HS256, issuer `blockminer-admin`).
2. **Autorizacao RBAC**: `requireAdminPermission("support.view", "support")` para leitura, `requireAdminPermission("support")` para mutacoes.
3. **Rate Limiting Distribuido**: Impede abuso coordenado em ambiente multi-container.
4. **Zod `.strict()` em todos os schemas admin**: Previne mass assignment (CWE-915).
5. **32-bit Integer Clamping**: `publicSupportIdParamSchema` rejeita IDs > 2.147.483.647.
6. **Sanitizacao**: `sanitizeStr` e `sanitizeImageUrl` aplicados em todos os inputs publicos.
7. **Audit Trail**: Mutacoes registram `adminId`, `module`, `resource`, `resourceId`, `action` e `newValue`.
