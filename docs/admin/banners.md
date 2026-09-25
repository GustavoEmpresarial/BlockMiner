# Documentação Técnica: Gestão de Banners do Dashboard (`/admin/banners`)

## 1. Visão Geral e Arquitetura do Domínio

O módulo **Banners do Dashboard** (`/admin/banners`) gerencia a veiculação de avisos, comunicados, novidades e promoções com contagem regressiva exibidos no topo do painel principal dos jogadores (`/dashboard`).

O ecossistema é composto por duas superfícies principais:
1. **Superfície Pública (`GET /api/banners`)**: Consumida pelo carrossel do Dashboard do jogador (`DashboardBannersCarousel`). Não exige autenticação e retorna apenas banners ativos (`isActive: true`) cujo intervalo de exibição (`startsAt` até `endsAt`) englobe o momento atual (`now`), ordenados por data de criação decrescente.
2. **Superfície Administrativa (`/api/admin/banners`)**: Interface restrita protegida por autenticação administrativa (`requireAdminAuth`), rate limiting dedicado (300 req/min) e controle de acesso baseado em papéis (`requireAdminPermission`), permitindo listagem, criação, atualização, alternância de status e exclusão com registro de auditoria (`logAdminAction`).

```mermaid
flowchart TD
    Admin[Administrador / Moderador] -->|Acessa| AdminUI["Painel Admin /admin/banners"]
    AdminUI -->|REST API| AdminRouter["bannersAdminRouter (/api/admin/banners)"]
    AdminRouter -->|300 req/min| RateLimiter["Rate Limiter"]
    RateLimiter -->|Auth + RBAC| AuthGuard["requireAdminAuth + requireAdminPermission"]
    AuthGuard -->|Validação Zod| Controller["banners.controller"]
    Controller -->|Audit Log| Audit["logAdminAction (admin_audit_logs)"]
    Controller -->|Queries| Repo["banners.repository"]
    Repo -->|Prisma ORM| DB[(PostgreSQL: dashboard_banners)]

    Player[Jogador / Client Web] -->|Acessa| DashUI["Dashboard /dashboard"]
    DashUI -->|GET /api/banners| PublicRouter["bannersRouter (/api/banners)"]
    PublicRouter --> ControllerPub["banners.controller (getActiveBanners)"]
    ControllerPub --> RepoPub["banners.repository (listActiveBannersNow)"]
    RepoPub --> DB
```

---

## 2. Modelo de Dados Prisma (`DashboardBanner`)

A persistência é gerenciada pela tabela `dashboard_banners` mapeada pelo Prisma ORM (`prisma/schema.prisma`):

```prisma
model DashboardBanner {
  id        Int       @id @default(autoincrement())
  title     String
  message   String    @default("")
  imageUrl  String?   @map("image_url")
  type      String    @default("info") // info | warning | success | promo
  link      String?
  linkLabel String?   @map("link_label")
  isActive  Boolean   @default(true) @map("is_active")
  startsAt  DateTime? @map("starts_at")
  endsAt    DateTime? @map("ends_at")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  @@index([isActive])
  @@map("dashboard_banners")
}
```

### Detalhamento dos Campos

| Campo | Tipo | Descrição | Regras de Negócio |
| :--- | :--- | :--- | :--- |
| `id` | `Int` (PK) | Identificador auto-incremental único do banner. | Gerado automaticamente. |
| `title` | `String` | Título em destaque do banner. | Obrigatório, máximo 120 caracteres. |
| `message` | `String` | Texto explicativo complementar. | Opcional, máximo 500 caracteres, padrão vazio. |
| `imageUrl` | `String?` | URL da mídia visual (imagem ou vídeo em loop). | Suporta imagens (PNG, JPG, WebP, GIF) e vídeos (MP4, WebM). Higienizado contra URIs perigosas (`javascript:`, `data:`). |
| `type` | `String` | Tipo temático e estilo visual do banner. | Enum restrito: `'info'`, `'warning'`, `'success'`, `'promo'`. Padrão `'info'`. |
| `link` | `String?` | Destino ao clicar no banner. | Suporta rota interna (ex.: `/shop`) ou URL externa HTTPS. Sanitizado contra XSS. |
| `linkLabel` | `String?` | Rótulo personalizado do botão de ação. | Opcional, máximo 60 caracteres. Se nulo, o carrossel exibe "Saiba mais". |
| `isActive` | `Boolean` | Flag mestre de ativação do banner. | Booleano, padrão `true`. Se `false`, o banner é imediatamente ocultado dos jogadores. |
| `startsAt` | `DateTime?` | Data/hora de início da janela de veiculação. | Snapped para calendar day UTC (00:00:00.000Z). Se nulo, inicia imediatamente. |
| `endsAt` | `DateTime?` | Data/hora final da janela (countdown na UI). | Snapped para calendar day UTC (00:00:00.000Z). Deve ser $\ge$ `startsAt`. Se nulo, não expira. |

---

## 3. Controle de Acesso e Matriz RBAC

O módulo utiliza o middleware central `requireAdminPermission` para garantir segregação de funções:

| Permissão | Categoria | Descrição | Papéis com Acesso Padrão |
| :--- | :--- | :--- | :--- |
| `banners` | Monetização | Gestão completa (criar, atualizar, alternar status ativo e deletar banners). | `super_admin`, `admin` |
| `banners.view` | Monetização | Consulta e visualização dos banners cadastrados na administração. | `super_admin`, `admin`, `moderator` |

*Compatibilidade legada:* A permissão `promotions` é aceita como fallback automático para instalações anteriores.

---

## 4. Especificação dos Endpoints de API

### 4.1. Endpoints Administrativos (`/api/admin/banners`)

#### `GET /api/admin/banners`
- **Permissão Exigida**: `banners.view` (ou `banners`, `promotions`, `*`)
- **Descrição**: Lista todos os banners cadastrados no banco de dados, ordenados por data de criação decrescente.
- **Resposta Sucesso (200 OK)**:
```json
{
  "ok": true,
  "banners": [
    {
      "id": 1,
      "title": "Super Promoção de Mineração",
      "message": "Aproveite 20% de bônus em novos racks.",
      "imageUrl": "https://blockminer.space/uploads/banners/promo1.webp",
      "type": "promo",
      "link": "/shop",
      "linkLabel": "Ver Loja",
      "isActive": true,
      "startsAt": "2026-09-01T00:00:00.000Z",
      "endsAt": "2026-10-01T00:00:00.000Z",
      "createdAt": "2026-09-01T00:00:00.000Z",
      "updatedAt": "2026-09-01T00:00:00.000Z"
    }
  ]
}
```

#### `POST /api/admin/banners`
- **Permissão Exigida**: `banners` (ou `promotions`, `*`)
- **Descrição**: Cria um novo banner com validação Zod e registra log de auditoria administrativa.
- **Corpo da Requisição (JSON)**:
```json
{
  "title": "Novo Evento da Comunidade",
  "message": "Participe do torneio semanal de blocos!",
  "imageUrl": "https://blockminer.space/uploads/banners/event.png",
  "type": "promo",
  "link": "/tournaments",
  "linkLabel": "Participar",
  "isActive": true,
  "startsAt": "2026-09-25",
  "endsAt": "2026-10-05"
}
```
- **Resposta Sucesso (201 Created)**:
```json
{
  "ok": true,
  "banner": {
    "id": 2,
    "title": "Novo Evento da Comunidade",
    "type": "promo",
    "isActive": true
  }
}
```
- **Respostas de Erro**:
  - `400 Bad Request`: `{ "ok": false, "code": "BANNER_VALIDATION_ERROR", "message": "Título é obrigatório." }`
  - `401 Unauthorized`: Sessão administrativa ausente ou inválida.
  - `403 Forbidden`: Papel sem a permissão `banners`.

#### `PUT /api/admin/banners/:id`
- **Permissão Exigida**: `banners`
- **Descrição**: Atualiza dados ou status de um banner existente.
- **Resposta Sucesso (200 OK)**:
```json
{
  "ok": true,
  "banner": { "id": 2, "isActive": false }
}
```
- **Respostas de Erro**:
  - `400 Bad Request`: ID inválido ou erro de validação nos campos fornecidos.
  - `404 Not Found`: `{ "ok": false, "code": "BANNER_NOT_FOUND", "message": "Banner não encontrado." }`

#### `DELETE /api/admin/banners/:id`
- **Permissão Exigida**: `banners`
- **Descrição**: Exclui permanentemente o banner especificado e registra auditoria.
- **Resposta Sucesso (200 OK)**:
```json
{
  "ok": true
}
```
- **Respostas de Erro**:
  - `404 Not Found`: Banner não encontrado.

---

### 4.2. Endpoint Público (`GET /api/banners`)

- **Autenticação**: Nenhuma (aberto ao público / CDN friendly).
- **Descrição**: Retorna a lista de banners ativos e dentro da janela de validade para o Dashboard do jogador.
- **Resposta Sucesso (200 OK)**:
```json
{
  "ok": true,
  "banners": [
    {
      "id": 1,
      "title": "Super Promoção de Mineração",
      "message": "Aproveite 20% de bônus em novos racks.",
      "imageUrl": "https://blockminer.space/uploads/banners/promo1.webp",
      "type": "promo",
      "link": "/shop",
      "linkLabel": "Ver Loja",
      "startsAt": "2026-09-01T00:00:00.000Z",
      "endsAt": "2026-10-01T00:00:00.000Z"
    }
  ]
}
```

---

## 5. Setup Local e Scripts

### 5.1. Variáveis de Ambiente Necessárias

```env
DATABASE_URL="postgresql://user:password@localhost:5442/blockminer_dev?schema=public"
JWT_SECRET="sua-chave-secreta-jwt-de-desenvolvimento"
ADMIN_SESSION_SECRET="sua-chave-secreta-admin"
PORT=3000
```

### 5.2. Comandos de Execução

```bash
# Executar migrations e gerar cliente Prisma
npm run prisma:generate

# Iniciar servidor backend em modo watch
npm run dev

# Executar suíte de testes de banners
npx tsx --import ./tests/_env-test-overrides.mjs --test tests/banners/*.test.mjs

# Executar testes do frontend (Vitest)
npm run test --prefix client
```

---

## 6. Segurança e Resiliência (Checklist OWASP)

1. **Prevenção de XSS e Injeção de Protocolos Maliciosos (A3 / CWE-79):**
   - Os campos `link` e `imageUrl` passam por validação estrita com Zod rejeitando regex com protocolos executáveis (`javascript:`, `vbscript:`, `data:text/html`).
   - No frontend, os links internos são navegados via React Router e links externos são abertos com `rel="noopener noreferrer"`.
2. **Controle de Acesso em Nível de Função Quebrado (BFLA - A1 / CWE-285):**
   - Todos os endpoints sob `/api/admin/banners` são protegidos por `requireAdminPermission`. Papéis como `readonly` ou `support` recebem HTTP 403 `FORBIDDEN_PERMISSION` em operações de escrita.
3. **Prevenção de IDOR e Type Juggling no Parâmetro `:id` (A1 / CWE-639):**
   - Parâmetros de rota são validados por `bannerIdParamSchema`. IDs alfanuméricos, negativos ou malformados resultam em 400 imediato antes de tocar o banco de dados.
4. **Auditabilidade Completa de Operações Administrativas (A9 / CWE-778):**
   - Toda mutação (criação, atualização e deleção) registra o usuário admin (`adminId`, `adminEmail`), IP, User-Agent, dados anteriores (`oldValue`) e novos (`newValue`) na tabela `admin_audit_logs`.
