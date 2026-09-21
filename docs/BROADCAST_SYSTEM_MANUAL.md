# Manual Técnico e Arquitetural do Sistema de Broadcast (`/admin/broadcast`)

## 1. Visão Geral e Arquitetura

O sistema de **Notificações Broadcast** do BlockMiner foi concebido para entregar avisos, comunicados urgentes, notas de atualização e campanhas promocionais diretamente aos jogadores no momento em que se autenticam na plataforma.

Ao contrário de notificações comuns que ficam agrupadas no sino da barra de navegação, o **Broadcast** tem comportamento de alta visibilidade e interrupção controlada:
- É exibido em um **modal centralizado** (`<BroadcastPopup />`) com fundo escurecido e efeito de desfoque (`backdrop-blur`).
- Oferece suporte a contagem regressiva de bloqueio (`dismissDelaySeconds`), impedindo que o usuário feche a notificação antes de ler o aviso por um determinado número de segundos (0 a 120s).
- Suporta Call-to-Action (CTA) com botão configurável para links internos (ex: `/shop`, `/faucet`) ou links externos (`https://...`).
- Mantém rastreamento individual de visualizações na tabela `broadcast_message_views` através de restrição única `(userId, messageId)`, garantindo que cada usuário veja o anúncio exatamente uma vez.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Admin Dashboard                        │
                  │   (/admin/broadcast - AdminBroadcastPage.tsx)          │
                  └──────────┬─────────────────────────────┬───────────────┘
                             │                             │
             CRUD + Preview  │                             │ Reset Views
                             ▼                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   Server REST API Router & Controllers                   │
│   • broadcast.admin.routes.ts (requireAdminAuth + requireAdminPermission)│
│   • broadcast.routes.ts (requireAuth + rateLimiter)                      │
│   • broadcast.controller.ts + broadcast.service.ts                       │
│   • Trilha de Auditoria: logAdminAction (BROADCAST_*)                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                    Prisma ORM & PostgreSQL Database
         ┌───────────────────────────┴───────────────────────────┐
         │                                                       │
         ▼                                                       ▼
┌──────────────────────────────┐              ┌───────────────────────────────────┐
│     broadcast_messages       │              │     broadcast_message_views       │
│  - id (PK)                   │ 1          N │  - id (PK)                        │
│  - title                     ├──────────────┤  - userId (FK User)               │
│  - content (text)            │              │  - messageId (FK BroadcastMessage)│
│  - imageUrl                  │              │  - viewedAt (DateTime)            │
│  - isActive (Boolean)        │              │  UNIQUE(userId, messageId)        │
│  - dismissDelaySeconds (Int) │              └───────────────────────────────────┘
│  - linkUrl, linkLabel        │
└──────────────────────────────┘
         ▲
         │ GET /api/broadcast/active
         │ POST /api/broadcast/:id/dismiss
         │
┌────────┴─────────────────────────────────────────────────────────────────┐
│                           Client SPA Shell                               │
│  • ProtectedLayout.tsx -> BroadcastPopup.tsx (Montado uma única vez)     │
│  • Validação estrita de rotas e fechamento gracioso com persistência     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Limpeza de Legado e Saneamento de Código

Na versão anterior, existia um script duplicado legado em `client/public/assets/broadcast-popup-inv2plus64.js`, injetado através de `<script defer>` em `client/index.html`.
- **Falha Crítica do Legado:** O script vanilla disparava `setInterval(poll, 4000)` a cada 4 segundos no site inteiro, competindo diretamente com o componente React `<BroadcastPopup />`.
- **Ação de Saneamento:** O arquivo foi deletado, a injeção no `index.html` removida e todo o controle de ciclo de vida, contagem regressiva e descarte foi unificado no componente React oficial, reduzindo centenas de requisições inúteis por sessão.

---

## 3. Especificação de Endpoints da API

### 3.1 Endpoints de Jogador (Públicos Autenticados)

#### `GET /api/broadcast/active`
- **Autenticação:** Obrigatória (Sessão de Usuário).
- **Rate Limit:** 120 requisições por minuto por IP/Sessão.
- **Descrição:** Busca a mensagem broadcast atualmente ativa (`isActive = true`) que o usuário logado ainda **não** tenha visualizado (ou seja, não existe registro em `broadcast_message_views` para seu `userId`).
- **Resposta Sucesso (200 OK):**
```json
{
  "ok": true,
  "message": {
    "id": 14,
    "title": "Manutenção Programada para Quinta-Feira",
    "content": "Informamos que nesta quinta-feira realizaremos uma melhoria nos servidores...",
    "imageUrl": "/uploads/broadcast/bc-maintenance.webp",
    "isActive": true,
    "dismissDelaySeconds": 5,
    "linkUrl": "/shop",
    "linkLabel": "Ver Loja de Itens",
    "linkNewTab": false,
    "createdAt": "2026-09-21T16:00:00.000Z"
  }
}
```
*Se não houver broadcast ativo ou se o jogador já o descartou, retorna `"message": null`.*

#### `POST /api/broadcast/:id/dismiss`
- **Autenticação:** Obrigatória (Sessão de Usuário).
- **Rate Limit:** 120 requisições por minuto.
- **Parâmetro de Rota:** `id` (Número inteiro positivo correspondente ao `message.id`).
- **Descrição:** Registra na tabela `broadcast_message_views` que o usuário visualizou e descartou a notificação. Utiliza `upsert` no banco para garantir idempotência e evitar erros de concorrência.
- **Resposta Sucesso (200 OK):**
```json
{
  "ok": true
}
```

---

### 3.2 Endpoints Administrativos (`/api/admin/broadcast`)

Todos os endpoints administrativos exigem sessão administrativa válida (`requireAdminAuth`), limite de taxa específico (`adminLimiter`: 300 req/min) e validação de permissão granular RBAC (`requireAdminPermission("broadcast", "promotions")`).

#### `GET /api/admin/broadcast`
- **Permissão:** `broadcast`, `promotions` ou `*`.
- **Descrição:** Lista todas as mensagens de broadcast cadastradas, ordenadas pela data de criação decrescente, incluindo a contagem de visualizações (`_count: { views: number }`).
- **Resposta Sucesso (200 OK):**
```json
{
  "ok": true,
  "messages": [
    {
      "id": 14,
      "title": "Manutenção Programada",
      "content": "Aviso aos mineradores...",
      "imageUrl": "/uploads/broadcast/bc-banner.png",
      "isActive": true,
      "dismissDelaySeconds": 10,
      "linkUrl": "/shop",
      "linkLabel": "Conferir Loja",
      "linkNewTab": false,
      "createdAt": "2026-09-21T16:00:00.000Z",
      "_count": {
        "views": 2540
      }
    }
  ]
}
```

#### `POST /api/admin/broadcast`
- **Permissão:** `broadcast`, `promotions` ou `*`.
- **Descrição:** Cria uma nova mensagem de broadcast. Se `isActive: true`, o sistema desativa automaticamente todas as mensagens criadas anteriormente (`deactivateAllBroadcastMessages`), garantindo exclusividade do aviso ativo.
- **Auditoria:** Gera log com ação `BROADCAST_CREATE`.
- **Payload:**
```json
{
  "title": "Grande Torneio de Mineração Iniciado!",
  "content": "Participe das salas de torneio e dispute o prêmio de 5.000 POL.",
  "imageUrl": "https://blockminer.space/uploads/broadcast/bc-tournaments.png",
  "isActive": true,
  "dismissDelaySeconds": 8,
  "linkUrl": "/tournaments",
  "linkLabel": "Acessar Torneio",
  "linkNewTab": false
}
```

#### `PATCH /api/admin/broadcast/:id`
- **Permissão:** `broadcast`, `promotions` ou `*`.
- **Descrição:** Atualiza propriedades parciais de uma mensagem. Se `isActive: true`, desativa as outras mensagens (`deactivateOtherBroadcastMessages(id)`).
- **Auditoria:** Gera log com ação `BROADCAST_UPDATE` ou `BROADCAST_TOGGLE_ACTIVE`.

#### `POST /api/admin/broadcast/:id/reset-views`
- **Permissão:** `broadcast`, `promotions` ou `*`.
- **Descrição:** Exclui todos os registros da tabela `broadcast_message_views` associados a este `messageId`.
- **Efeito:** Faz com que todos os usuários da plataforma voltem a visualizar este modal em seu próximo login ou carregamento de página.
- **Auditoria:** Gera log com ação `BROADCAST_RESET_VIEWS` contendo a contagem de visualizações apagadas (`clearedViewsCount`).
- **Resposta Sucesso (200 OK):**
```json
{
  "ok": true,
  "clearedViewsCount": 2540,
  "message": "Visualizações resetadas com sucesso (2540 registros limpos)."
}
```

#### `DELETE /api/admin/broadcast/:id`
- **Permissão:** `broadcast`, `promotions` ou `*`.
- **Descrição:** Exclui o broadcast e, por chave estrangeira em cascata (`onDelete: Cascade`), remove todas as visualizações associadas em `broadcast_message_views`.
- **Auditoria:** Gera log com ação `BROADCAST_DELETE`.

#### `POST /api/admin/broadcast/upload-image`
- **Permissão:** `broadcast`, `promotions` ou `*`.
- **Content-Type:** `multipart/form-data` (campo `image`).
- **Validação:** Formatos aceitos: JPEG, PNG, WebP, GIF. Limite máximo: 5 MB.
- **Resposta:**
```json
{
  "ok": true,
  "url": "/uploads/broadcast/bc-1726939200000-xyz.webp"
}
```

---

## 4. Diretrizes de Segurança e Hardening

1. **Prevenção de XSS e Redirecionamento Malicioso via `linkUrl`:**
   - O campo `linkUrl` passa pela função `normalizeBroadcastLink` no backend.
   - São categoricamente rejeitados esquemas de URI executáveis como `javascript:`, `data:`, `vbscript:` e `file:`.
   - Links relativos precisam iniciar com barra simples `/` (URLs com `//` são bloqueadas para evitar protocol-relative bypass).
   - Links absolutos são restritos a `https://` (ou `http://localhost` em ambientes de desenvolvimento local).
2. **Defesa contra Parâmetro Inválido e IDOR:**
   - O endpoint de dismiss valida estritamente `Number.isInteger(messageId) && messageId >= 1`.
   - O registro é inserido exclusivamente associado ao `req.user.id` da sessão verificada por JWT, impedindo que um usuário descarte notificações em nome de outro.
3. **Controle de Acesso Baseado em Funções (RBAC):**
   - Funções administrativas como `readonly` ou `support` não possuem a permissão `broadcast` concedida por padrão.
   - Tentativas de acesso não autorizado recebem HTTP 403 Forbidden com código estruturado `FORBIDDEN_PERMISSION`.
4. **Resiliência a Inundações (Rate Limiting):**
   - A rota de descarte e consulta dos jogadores é limitada a 120 req/min para evitar flood de requisições de clientes maliciosos.
   - O painel administrativo conta com limiter de 300 req/min.

---

## 5. Manual Operacional para Administradores

1. **Publicando um Novo Anúncio:**
   - Acesse **Administração → Notificações Broadcast**.
   - Clique no botão **Nova Notificação**.
   - Preencha o título e o texto explicativo.
   - Insira um banner visual fazendo upload ou colando um link direto.
   - Defina o tempo de bloqueio (`dismissDelaySeconds`). Recomenda-se entre 5 a 10 segundos para avisos importantes, ou 0 para comunicados simples.
   - Para direcionar tráfego, configure um botão de ação (ex: `/tournaments` com o texto "Participar Agora").
   - Utilize o botão **Pré-visualizar Popup** para simular como a caixa de diálogo aparecerá aos usuários antes de publicar.
   - Marque a opção **Ativo** e clique em **Criar Notificação**.
2. **Re-enviando um Comunicado Editado:**
   - Se você alterou dados críticos de um comunicado ativo e deseja que todos os mineradores vejam novamente o aviso:
   - No card do anúncio, clique no ícone de reciclagem (**Resetar visualizações**).
   - Confirme a operação no modal. O contador de visualizações voltará a zero e os usuários receberão o popup novamente.
