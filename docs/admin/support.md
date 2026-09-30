# Documentação Técnica: Suporte Administrativo (`/admin/support`)

## 1. Visão Geral e Arquitetura do Domínio

O módulo de Suporte Administrativo (`/admin/support`) é o centro de atendimento e governança de chamados dos jogadores registrados na plataforma BlockMiner 2.1. Ele permite aos operadores de suporte:
- Triar, responder e arquivar tickets submetidos por usuários ou visitantes autenticados.
- Analisar em tempo real o **Dossiê do Jogador** (`player-dossier`), contendo histórico de transações (depósitos Polygon e CCPayment, saques, payouts de mineração), máquinas instaladas em racks, inventário e cofre (`vault`).
- Executar compensações financeiras em **POL** (`credit-pol`) com atualização atômica do saldo do jogador, criação de registro de transação financeira e registro duplo de auditoria (`audit_logs` e `admin_audit_logs`).
- Transmitir respostas em tempo real via **Socket.IO** (`support:reply` e notificação push `notification:new` para o sininho do jogador).

### Fluxo Arquitetural

```mermaid
flowchart TD
    Player[Jogador / Usuário] -->|POST /api/support| PlayerRouter["supportRouter"]
    Player -->|GET /api/support| PlayerRouter
    Player -->|GET /api/support/:id| PlayerRouter
    Player -->|POST /api/support/:id/reply| PlayerRouter
    Player -->|Socket.IO: support:subscribe| SocketHandler["support.socket.ts"]
    
    Admin[Operador Admin] -->|Acessa UI| AdminUI["/admin/support"]
    AdminUI -->|adminSupportApi| AdminRouter["supportAdminRouter"]
    AdminRouter -->|requireAdminAuth| AuthCheck["JWT HS256 Validation"]
    AdminRouter -->|RBAC Guard| RBAC["requireAdminPermission('support.view' | 'support')"]
    AdminRouter -->|Rate Limiter Distribuído| RateLimiter["120 read / 300 write / 60 credit per min"]
    AdminRouter -->|Zod .strict()| Zod["support.schemas.ts"]
    AdminRouter --> AdminCtrl["support.admin.controller.ts"]
    
    AdminCtrl --> Service["support.service.ts"]
    AdminCtrl --> DossierService["support.dossier.service.ts"]
    AdminCtrl -->|logAdminAction| AdminAudit[(PostgreSQL: admin_audit_logs)]
    
    Service -->|Prisma Transaction| DB[(PostgreSQL: support_messages, support_replies, users, transactions)]
    Service -->|emitSupportReply| Realtime["support.realtime.ts (Socket.IO)"]
    Realtime -->|support:reply| Player
    Realtime -->|notification:new| Player
```

### Princípios de Segurança e Design Inegociáveis

1. **RBAC Granular e Separação de Funções:**
   - Visualização de tickets e dossiês: permissão `support.view` ou `support`.
   - Mutação de dados (respostas e arquivamento): permissão `support`.
   - Compensações financeiras (`credit-pol`): permissão `support` estrita com rate limiting restritivo de 60 req/min.
2. **Defesa em Profundidade contra Mass Assignment:**
   - Todos os schemas Zod de entrada aplicam `.strict()`, rejeitando quaisquer propriedades espúrias (ex.: `isAdmin`, `role`, `userId`, `balance`).
3. **Clamping 32-bit e Sanitização Numérica:**
   - Identificadores de chamados passam por `supportTicketIdParamSchema` (inteiro positivo, máx. 2.147.483.647).
   - O valor de compensação (`creditPolSchema`) valida estritamente número positivo até 1.000 POL com até 8 casas decimais.
4. **Trilha Dupla de Auditoria:**
   - Mutação financeira gera registro na tabela de auditoria operacional do usuário (`audit_logs`) e registro administrativo com actor context na tabela de governança (`admin_audit_logs`).
5. **Rate Limiting Distribuído e Resiliente:**
   - Utilização de `createDistributedRateLimiter` com persistência em fila de callbacks compartilhada via banco, assegurando proteção mesmo sob múltiplos containers de API.

---

## 2. Modelos de Dados Prisma

### SupportMessage (`support_messages`)

```prisma
model SupportMessage {
  id         Int       @id @default(autoincrement())
  userId     Int?      @map("user_id")
  name       String
  email      String
  subject    String
  message    String    @db.Text
  isRead     Boolean   @default(false) @map("is_read")
  isReplied  Boolean   @default(false) @map("is_replied")
  repliedAt  DateTime? @map("replied_at")
  archived   Boolean   @default(false) @map("archived")
  archivedAt DateTime? @map("archived_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user    User?          @relation(fields: [userId], references: [id])
  replies SupportReply[]

  @@index([userId])
  @@index([archived])
  @@map("support_messages")
}
```

### SupportReply (`support_replies`)

```prisma
model SupportReply {
  id               Int      @id @default(autoincrement())
  supportMessageId Int      @map("support_message_id")
  senderId         Int?     @map("sender_id")
  message          String   @db.Text
  isAdmin          Boolean  @default(false) @map("is_admin")
  createdAt        DateTime @default(now()) @map("created_at")

  supportMessage SupportMessage @relation(fields: [supportMessageId], references: [id], onDelete: Cascade)
  sender         User?          @relation(fields: [senderId], references: [id])

  @@index([supportMessageId])
  @@map("support_replies")
}
```

---

## 3. Matriz de Permissões RBAC

| Método | Endpoint | Permissões Requeridas | Rate Limit | Auditoria Gerada |
|---|---|---|---|---|
| `GET` | `/api/admin/support` | `support.view` ou `support` | 120 req/min | — |
| `GET` | `/api/admin/support/:id` | `support.view` ou `support` | 120 req/min | — |
| `GET` | `/api/admin/support/:id/player-dossier` | `support.view` ou `support` | 120 req/min | — |
| `POST` | `/api/admin/support/:id/reply` | `support` | 300 req/min | `ADMIN_REPLY_SUPPORT_TICKET` |
| `POST` | `/api/admin/support/:id/archive` | `support` | 300 req/min | `ADMIN_SET_SUPPORT_ARCHIVED` |
| `POST` | `/api/admin/support/:id/credit-pol` | `support` | 60 req/min | `ADMIN_SUPPORT_CREDIT_POL` |

---

## 4. Especificação OpenAPI 3.0.3

```yaml
openapi: 3.0.3
info:
  title: BlockMiner 2.1 - Support & Player Dossier Admin API
  version: 2.1.0
  description: API administrativa e autenticada para governança de chamados de suporte, dossiê do jogador e compensação financeira POL.
paths:
  /api/admin/support:
    get:
      summary: Listar tickets de suporte
      description: Retorna a lista paginada de chamados de suporte com filtros por usuário e arquivamento.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: query
          name: page
          schema:
            type: integer
            default: 1
            minimum: 1
          description: Número da página
        - in: query
          name: limit
          schema:
            type: integer
            default: 50
            maximum: 100
          description: Quantidade de itens por página
        - in: query
          name: userId
          schema:
            type: integer
          description: Filtrar chamados de um usuário específico
        - in: query
          name: archived
          schema:
            type: string
            enum: ["0", "1", "true", "false"]
          description: Filtrar chamados arquivados
      responses:
        '200':
          description: Lista de tickets obtida com sucesso.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AdminSupportListResponse'
        '400':
          description: Parâmetros de consulta inválidos.
        '401':
          description: Autenticação administrativa inválida ou ausente.
        '403':
          description: Permissão insuficiente (exige support.view ou support).
        '429':
          description: Limite de requisições excedido.

  /api/admin/support/{id}:
    get:
      summary: Obter detalhes do ticket
      description: Retorna o ticket de suporte com todas as réplicas enriquecidas e anexos.
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
          description: Detalhes do ticket.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AdminSupportDetailResponse'
        '400':
          description: ID inválido.
        '404':
          description: Chamado não encontrado.

  /api/admin/support/{id}/player-dossier:
    get:
      summary: Obter dossiê consolidado do jogador
      description: Agrega balanço, transações, máquinas e inventário para auditoria do operador.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
        - in: query
          name: limit
          schema:
            type: integer
            default: 30
      responses:
        '200':
          description: Dossiê consolidado retornado.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PlayerDossierBundle'
        '404':
          description: Chamado não encontrado.

  /api/admin/support/{id}/reply:
    post:
      summary: Enviar resposta do operador
      description: Registra resposta administrativa, atualiza status do ticket e emite push via Socket.IO.
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
              $ref: '#/components/schemas/AdminReplyInput'
      responses:
        '200':
          description: Resposta gravada com sucesso.
        '400':
          description: Payload inválido ou vazio.
        '403':
          description: Permissão insuficiente (exige support).
        '404':
          description: Chamado não encontrado.

  /api/admin/support/{id}/archive:
    post:
      summary: Arquivar ou desarquivar ticket
      description: Altera o estado de arquivamento do chamado.
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
                - archived
              properties:
                archived:
                  type: boolean
              additionalProperties: false
      responses:
        '200':
          description: Estado de arquivamento atualizado.
        '403':
          description: Permissão insuficiente (exige support).

  /api/admin/support/{id}/credit-pol:
    post:
      summary: Creditar compensação POL ao jogador
      description: Operação atômica que credita saldo POL na carteira do jogador vinculado ao ticket.
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
              $ref: '#/components/schemas/CreditPolInput'
      responses:
        '200':
          description: POL creditado com sucesso.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreditPolResponse'
        '400':
          description: Valor ou motivo inválidos, ou chamado sem jogador vinculado.
        '403':
          description: Permissão insuficiente (exige support).
        '404':
          description: Chamado não encontrado.

components:
  securitySchemes:
    AdminJwtAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    AdminSupportListResponse:
      type: object
      properties:
        ok:
          type: boolean
        messages:
          type: array
          items:
            $ref: '#/components/schemas/SupportMessageItem'
        page:
          type: integer
        limit:
          type: integer
        total:
          type: integer

    SupportMessageItem:
      type: object
      properties:
        id:
          type: integer
        userId:
          type: integer
          nullable: true
        name:
          type: string
        email:
          type: string
        subject:
          type: string
        message:
          type: string
        isRead:
          type: boolean
        isReplied:
          type: boolean
        createdAt:
          type: string
          format: date-time

    AdminReplyInput:
      type: object
      properties:
        reply:
          type: string
          maxLength: 12000
        message:
          type: string
          maxLength: 12000
        attachments:
          type: array
          maxItems: 5
          items:
            type: object
            required:
              - url
            properties:
              url:
                type: string
              mimeType:
                type: string
            additionalProperties: false
      additionalProperties: false

    CreditPolInput:
      type: object
      required:
        - amount
        - reason
      properties:
        amount:
          type: number
          minimum: 0.00000001
          maximum: 1000
        reason:
          type: string
          minLength: 3
          maxLength: 500
      additionalProperties: false

    CreditPolResponse:
      type: object
      properties:
        ok:
          type: boolean
        message:
          type: string
        amount:
          type: number
        polBalance:
          type: number
        transactionId:
          type: integer

    PlayerDossierBundle:
      type: object
      properties:
        ok:
          type: boolean
        linked:
          type: boolean
        userId:
          type: integer
        dossier:
          type: object
          nullable: true
```
