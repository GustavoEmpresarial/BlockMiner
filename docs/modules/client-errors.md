# Módulo de Telemetria de Erros de Cliente (`client-errors`)

## 1. Visão Geral
O módulo `client-errors` é responsável por capturar, sanitizar, deduplicar e apresentar falhas de execução no cliente (erros não tratados no React, quedas de requisições de API, rejections de promises assíncronas e exceções globais do navegador).

Os dados são armazenados na tabela `AuditLog` com `source = "client"` e ações:
- `client_error_report`: Quebras de interface (React ErrorBoundary, `window.onerror`, `unhandledrejection`).
- `client_api_failure`: Falhas em requisições de API (5xx, timeouts de rede, erros inesperados).

---

## 2. Arquitetura de Ingestão e Fluxo de Dados

```
[Navegador do Usuário]
  ├─ React Error Boundaries (RootErrorBoundary, TransparencyErrorBoundary)
  ├─ Collector SPA (client-error-collector-v5.js)
  ├─ Axios Interceptor (installAxiosClientErrorReporting.ts)
  └─ Trilha de Breadcrumbs (últimos 15 passos de navegação e cliques)
         │
         ▼ HTTP POST /api/track/client-error (keepalive: true, credentials: include)
[Servidor Backend]
  ├─ Rate Limiter (30 reqs / 60s por IP)
  ├─ Autenticação Opcional (captura userId se autenticado, sem bloquear anônimos)
  ├─ Sanitização Estrita (traffic.schemas.ts: limits em stack, message, breadcrumbs)
  ├─ Deduplicação Inteligente (janela de 15s por fingerprint + ator)
  └─ Gravação no Banco (Prisma AuditLog com severity, label e metadata JSON)
         │
         ▼ Visualização
[Painel Administrativo /admin/client-errors]
  ├─ RBAC: requireAdminPermission("logs.view") para listar
  ├─ RBAC: requireAdminPermission("logs") para limpar
  ├─ Trilha de Auditoria: logAdminAction registra consultas e esvaziamentos
  ├─ Agrupamento por Usuário / IP e Criticidade (Critical, High, Warning, Info)
  ├─ Exibição de Fingerprint, Trilha de Breadcrumbs e Metadados de Ambiente
  └─ Exportação para JSON e CSV
```

---

## 3. Especificação dos Endpoints

### 3.1 `POST /api/track/client-error`
Endpoint público para envio de telemetria pelo navegador.
- **Autenticação**: Opcional (`authenticateTokenOptional`). Permite falhas anônimas (ex: `/register`, `/auth`).
- **Rate Limit**: 30 requisições por minuto por IP.
- **Payload (JSON)**:
  | Campo | Tipo | Descrição |
  |---|---|---|
  | `category` | `"crash" \| "api_failure"` | Tipo da falha reportada |
  | `message` | `string` (max 800) | Mensagem do erro |
  | `operation` | `string` (max 120) | Identificador da operação (ex: `axios_post`, `window_onerror`) |
  | `statusCode`| `number \| null` | Código HTTP se aplicável |
  | `code` | `string \| null` (max 64) | Código de erro da aplicação |
  | `requestId` | `string \| null` (max 80) | Correlação `X-Request-Id` retornado pela API |
  | `url` | `string \| null` (max 800) | URL da página onde ocorreu o erro |
  | `stack` | `string \| null` (max 4000) | Stack trace ou dados da requisição |
  | `componentStack` | `string \| null` (max 4000) | Árvore de componentes React |
  | `fingerprint` | `string \| null` (max 64) | Assinatura única da falha |
  | `breadcrumbs` | `Array<Breadcrumb>` (max 15) | Trilha dos últimos 15 passos do usuário |
  | `environment` | `Object` | Dados de tela, conexão, memória e idioma |

- **Resposta de Sucesso**:
  ```json
  { "ok": true, "dropped": false }
  ```

---

### 3.2 `GET /api/admin/client-errors`
Endpoint administrativo para listagem dos erros reportados.
- **Segurança**: Requer cookie de sessão administrativo válido (`requireAdminAuth`) e permissão `logs.view` ou `logs` ou `*`.
- **Query Parameters**:
  - `limit`: Quantidade máxima de registros (padrão `500`, máximo `1000`).
  - `offset`: Deslocamento para paginação (padrão `0`).
  - `category`: Filtrar por `"crash"` ou `"api_failure"`.
  - `search`: Busca textual nos campos label, descrição, IP e userAgent.
- **Resposta**:
  ```json
  {
    "ok": true,
    "items": [
      {
        "id": 1234,
        "action": "client_error_report",
        "severity": "error",
        "label": "Cannot read properties of undefined",
        "description": "TypeError: ...",
        "ip": "203.0.113.195",
        "userAgent": "Mozilla/5.0 ...",
        "metadata": {
          "category": "crash",
          "url": "https://blockminer.space/mining",
          "fingerprint": "crash:cannot_read_properties:react_error_boundary",
          "breadcrumbs": [
            { "ts": 1758501234567, "type": "navigation", "message": "nav_to:/mining" },
            { "ts": 1758501235123, "type": "click", "message": "click:button [Ligar Máquinas]" }
          ],
          "environment": {
            "viewport": "1920x1080",
            "connection": "4g",
            "online": true
          }
        },
        "createdAt": "2026-09-21T21:40:00.000Z",
        "userId": 42,
        "user": { "id": 42, "name": "Gustavo" }
      }
    ]
  }
  ```

---

### 3.3 `DELETE /api/admin/client-errors`
Endpoint administrativo para expurgo dos relatórios de erros.
- **Segurança**: Requer `requireAdminAuth` e permissão `logs` ou `*`.
- **Auditoria**: Registra a ação `CLIENT_ERRORS_CLEAR` no `admin_audit_logs` informando o total de registros excluídos.
- **Resposta**:
  ```json
  { "ok": true, "deleted": 42 }
  ```

---

## 4. Deduplicação e Filtros de Ruído

1. **Filtro de Ruído de Extensões / Terceiros**:
   - Descarta erros provindos de extensões de navegador (`chrome-extension://`, `moz-extension://`).
   - Descarta bugs conhecidos de bibliotecas de terceiros sem impacto (`ResizeObserver loop`, desconexão normal do WalletConnect).
2. **Deduplicação por Janela de Tempo (15 segundos)**:
   - Evita que um erro disparado em loop (ex: em um `setInterval` ou renderização repetida) gere centenas de registros idênticos.
   - A mesma assinatura de erro (`category + message + operation + code + statusCode`) só é persistida 1 vez a cada 15 segundos por ator (usuário/IP).

---

## 5. Trilha de Breadcrumbs e Diagnóstico Enriquecido
Cada relatório de erro agora inclui:
- **Breadcrumbs de Navegação**: Transições de rota via History API (`pushState`, `popstate`).
- **Breadcrumbs de Interação**: Cliques do usuário nos botões e links que antecederam a falha.
- **Breadcrumbs de Rede**: Histórico de chamadas HTTP recentes.
- **Metadados de Ambiente**: Resolução da viewport, tipo de rede móvel/wifi, idioma e estimativa de memória disponível.
