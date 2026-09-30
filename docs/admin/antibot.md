# Documentação Técnica: Motor AntiBot (`/admin/antibot`)

## 1. Visão Geral e Arquitetura do Domínio

O módulo AntiBot (`/admin/antibot` e `/api/antibot`) constitui o sistema central de análise de integridade, telemetria e mitigação de automação maliciosa do BlockMiner 2.1.
Seu objetivo é identificar e pontuar comportamentos de bots, scripts de automação (Tampermonkey, Violentmonkey, Puppeteer, Playwright, Selenium), manipulação de velocidade e churn de contas em redes e dispositivos compartilhados, **sem interferir ou bloquear falsos positivos de jogadores legítimos**.

### Detectores do Motor de Risco

1. **Headless & Automation Detector (`headless.detector.ts`):** Identifica flags de `navigator.webdriver`, headless Chrome/Firefox, runtimes automatizados (Selenium, Puppeteer, Nightmare, PhantomJS) e user agents conhecidos de scrapers.
2. **Behavior Detector (`behavior.detector.ts`):** Analisa cadência de cliques, intervalos com variância próxima de zero (`perfect_intervals`), sessões ininterruptas de duração extrema (`non_stop_session` > 16h) e inputs desprovidos de curvas humanas (`no_human_input`).
3. **Browser Integrity Detector (`browserIntegrity.detector.ts`):** Detecta APIs nativas sobrepostas (monkey-patching de `fetch` ou `WebSocket`), variáveis globais de userscripts (`GM_info`, marcadores de Tampermonkey/Violentmonkey) e alterações na integridade da stack.
4. **Device Detector (`device.detector.ts`):** Mapeia assinaturas de hardware, canvas hash e WebGL renderers, identificando dispositivos com colisão de múltiplas contas (`shared_device_many_accounts`).
5. **Session Detector (`session.detector.ts`):** Registra snapshots de IP, país, ASN e sistema operacional para análise de churn e anomalias de rede.
6. **Relationship Detector (`relationship.detector.ts`):** Detecta agrupamento de contas sob mesmos IPs e fingerprints.

### Fluxo Arquitetural

```mermaid
flowchart TD
    Client[Cliente / Navegador do Jogador] -->|POST /api/antibot/telemetry| PubRouter["antibotRouter"]
    PubRouter --> Controller["antibot.controller.ts"]
    Controller --> Engine["antibot.riskEngine.ts"]
    Engine --> Detectors["Detectores Multi-Sinal (Headless, Behavior, Integrity, Device, Session)"]
    Detectors --> Scores["Cálculo Ponderado de Risco (antibot.weights.ts)"]
    Scores --> DB[(PostgreSQL: antibot_profiles, antibot_evidence, antibot_sessions, antibot_devices, antibot_alerts)]
    
    Admin[Operador Admin] -->|Acessa UI /admin/antibot| AdminUI["AdminAntibotPage.tsx"]
    AdminUI -->|adminAntibotApi| AdminRouter["antibotAdminRouter"]
    AdminRouter -->|requireAdminAuth| AuthCheck["JWT HS256 Validation"]
    AdminRouter -->|RBAC Guard| RBAC["requireAdminPermission('antibot.view' | 'antibot')"]
    AdminRouter -->|Distributed Rate Limiter| RateLimit["120 read / 120 write / 10 reset per min"]
    AdminRouter -->|Zod .strict()| Zod["antibot.schemas.ts"]
    AdminRouter --> AdminCtrl["antibot.controller.ts"]
    AdminCtrl --> Service["antibot.service.ts"]
    AdminCtrl -->|logAdminAction| AuditDB[(PostgreSQL: admin_audit_logs)]
```

---

## 2. Modelos de Dados Prisma

### AntibotProfile (`antibot_profiles`)
Mantém o score consolidado (0-100), índice de confiança e histórico do jogador.
```prisma
model AntibotProfile {
  userId         Int       @id @map("user_id")
  riskScore      Int       @default(0) @map("risk_score")
  trustScore     Int       @default(100) @map("trust_score")
  peakRiskScore  Int       @default(0) @map("peak_risk_score")
  evidenceCount  Int       @default(0) @map("evidence_count")
  trusted        Boolean   @default(false) @map("trusted")
  trustedReason  String?   @map("trusted_reason")
  lastEventAt    DateTime? @map("last_event_at")
  lastComputedAt DateTime  @default(now()) @map("last_computed_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("antibot_profiles")
}
```

### AntibotEvidence (`antibot_evidence`)
Histórico detalhado de cada sinal suspeito coletado.
```prisma
model AntibotEvidence {
  id          Int      @id @default(autoincrement())
  userId      Int      @map("user_id")
  sessionId   String?  @map("session_id")
  eventType   String   @default("telemetry") @map("event_type")
  detector    String
  code        String
  reason      String
  weight      Int      @default(0)
  scoreBefore Int      @default(0) @map("score_before")
  scoreAfter  Int      @default(0) @map("score_after")
  severity    String   @default("info")
  ip          String?
  deviceId    String?  @map("device_id")
  fingerprint String?
  metadata    Json?
  createdAt   DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([createdAt])
  @@map("antibot_evidence")
}
```

### AntibotAlert (`antibot_alerts`)
Alertas internos para triagem da moderação/administração.
```prisma
model AntibotAlert {
  id             Int       @id @default(autoincrement())
  type           String
  severity       String    @default("medium")
  status         String    @default("open")
  userId         Int?      @map("user_id")
  riskScore      Int       @default(0) @map("risk_score")
  deviceId       String?   @map("device_id")
  ip             String?
  fingerprint    String?
  details        Json?
  message        String?
  createdAt      DateTime  @default(now()) @map("created_at")
  acknowledgedAt DateTime? @map("acknowledged_at")
  resolvedAt     DateTime? @map("resolved_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
  @@index([status])
  @@index([userId])
  @@map("antibot_alerts")
}
```

---

## 3. Matriz de Permissões RBAC

| Método | Endpoint | Permissões Requeridas | Rate Limit | Auditoria Registrada |
|---|---|---|---|---|
| `POST` | `/api/antibot/telemetry` | Público / Opcional Autenticado | — | — |
| `GET` | `/api/admin/antibot/overview` | `antibot.view` ou `antibot` | 120 req/min | — |
| `GET` | `/api/admin/antibot/evidence` | `antibot.view` ou `antibot` | 120 req/min | — |
| `GET` | `/api/admin/antibot/sessions` | `antibot.view` ou `antibot` | 120 req/min | — |
| `GET` | `/api/admin/antibot/devices` | `antibot.view` ou `antibot` | 120 req/min | — |
| `GET` | `/api/admin/antibot/alerts` | `antibot.view` ou `antibot` | 120 req/min | — |
| `GET` | `/api/admin/antibot/users/:id` | `antibot.view` ou `antibot` | 120 req/min | — |
| `PATCH`| `/api/admin/antibot/alerts/:id` | `antibot` | 120 req/min | `ANTIBOT_UPDATE_ALERT` |
| `POST` | `/api/admin/antibot/users/:id/trust` | `antibot` | 120 req/min | `ANTIBOT_TRUST_USER` / `ANTIBOT_UNTRUST_USER` |
| `POST` | `/api/admin/antibot/users/:id/recompute` | `antibot` | 120 req/min | `ANTIBOT_RECOMPUTE_SCORE` |
| `POST` | `/api/admin/antibot/reset` | `antibot` | 10 req/min | `ANTIBOT_CLEAR_ALL` |

---

## 4. Especificação OpenAPI 3.0.3

```yaml
openapi: 3.0.3
info:
  title: BlockMiner 2.1 - AntiBot Security Engine API
  version: 2.1.0
  description: API administrativa e pública do motor AntiBot, análise de risco multi-sinal, governança de alertas e perfis de usuário.
paths:
  /api/antibot/telemetry:
    post:
      summary: Coletor público de telemetria
      description: Recebe eventos de integridade e comportamento do cliente. Sempre retorna 200 OK.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                eventType:
                  type: string
                  maxLength: 40
                sessionId:
                  type: string
                  maxLength: 80
                telemetry:
                  type: object
      responses:
        '200':
          description: Telemetria recebida com sucesso.

  /api/admin/antibot/overview:
    get:
      summary: Visão geral do AntiBot
      description: Retorna métricas globais, top contas de maior risco e alertas recentes.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: query
          name: limit
          schema:
            type: integer
            default: 20
            minimum: 1
            maximum: 100
      responses:
        '200':
          description: Resumo de métricas retornado com sucesso.
        '401':
          description: Não autenticado.
        '403':
          description: Permissão insuficiente (exige antibot.view ou antibot).

  /api/admin/antibot/evidence:
    get:
      summary: Listar evidências de detecção
      description: Retorna listagem paginada de evidências com filtros por detector, código, gravidade e usuário.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: query
          name: page
          schema:
            type: integer
            default: 1
        - in: query
          name: limit
          schema:
            type: integer
            default: 50
            maximum: 200
        - in: query
          name: userId
          schema:
            type: integer
        - in: query
          name: detector
          schema:
            type: string
        - in: query
          name: code
          schema:
            type: string
        - in: query
          name: severity
          schema:
            type: string
            enum: [info, low, medium, high, critical]
      responses:
        '200':
          description: Lista de evidências.

  /api/admin/antibot/sessions:
    get:
      summary: Listar sessões com fingerprints
      description: Retorna sessões registradas com IP, navegador e sistema operacional.
      security:
        - AdminJwtAuth: []
      responses:
        '200':
          description: Lista de sessões.

  /api/admin/antibot/devices:
    get:
      summary: Listar dispositivos conhecidos
      description: Retorna dispositivos agrupados por hardware/canvas e contagem de contas associadas.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: query
          name: minAccounts
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: Lista de dispositivos.

  /api/admin/antibot/alerts:
    get:
      summary: Listar alertas de segurança
      description: Retorna alertas gerados pelo motor de risco com filtros de status e gravidade.
      security:
        - AdminJwtAuth: []
      responses:
        '200':
          description: Lista de alertas.

  /api/admin/antibot/alerts/{id}:
    patch:
      summary: Atualizar status do alerta
      description: Altera o estado do alerta entre open, acknowledged e resolved.
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
                - status
              properties:
                status:
                  type: string
                  enum: [open, acknowledged, resolved]
              additionalProperties: false
      responses:
        '200':
          description: Alerta atualizado com sucesso.
        '400':
          description: Status inválido ou campo desconhecido.
        '403':
          description: Permissão insuficiente (exige antibot).
        '404':
          description: Alerta não encontrado.

  /api/admin/antibot/users/{id}:
    get:
      summary: Obter dossiê antibot do usuário
      description: Retorna perfil de risco consolidado, evidências, sessões e dispositivos vinculados ao usuário.
      security:
        - AdminJwtAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
        - in: query
          name: evidenceLimit
          schema:
            type: integer
            default: 100
            maximum: 500
      responses:
        '200':
          description: Dossiê completo do jogador retornado.
        '404':
          description: Usuário não encontrado.

  /api/admin/antibot/users/{id}/trust:
    post:
      summary: Definir status de confiança (whitelist)
      description: Define ou remove o jogador da whitelist de antibot com motivo auditado.
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
                trusted:
                  type: boolean
                  default: true
                reason:
                  type: string
                  maxLength: 300
              additionalProperties: false
      responses:
        '200':
          description: Status de confiança atualizado.
        '403':
          description: Permissão insuficiente (exige antibot).

  /api/admin/antibot/users/{id}/recompute:
    post:
      summary: Recalcular pontuação de risco
      description: Força o recálculo ponderado de risco com base no histórico de evidências do usuário.
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
          description: Score recalculado com sucesso.
        '403':
          description: Permissão insuficiente (exige antibot).

  /api/admin/antibot/reset:
    post:
      summary: Zerar toda a base do AntiBot
      description: Ação administrativa destrutiva que remove todas as evidências, sessões e alertas, zerando perfis de risco.
      security:
        - AdminJwtAuth: []
      responses:
        '200':
          description: Base reiniciada com sucesso.
        '403':
          description: Permissão insuficiente (exige antibot).

components:
  securitySchemes:
    AdminJwtAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```
