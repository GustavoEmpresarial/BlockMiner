# Módulo de Integração Offerwall.me (`/offerwallme`)

## 1. Visão Geral

O módulo `offerwallme` é responsável pela integração entre a plataforma BlockMiner e a rede de monetização e pesquisas **Offerwall.me**. Ele gerencia:
- A geração e entrega segura de URLs autenticadas para o mural de ofertas.
- A validação anti-automação via **BM Captcha Gate** com consumo de tokens de uso único (*pass tokens*).
- O fluxo de navegação resiliente no frontend, contornando bloqueadores de popup e mitigando riscos de *reverse tabnabbing*.
- A recepção de postbacks de recompensa com verificação criptográfica de assinatura (HMAC-SHA256), controle de IP de origem e prevenção de duplicidade (idempotência).
- A disponibilização de históricos e estatísticas individuais de conversões para o usuário.

---

## 2. Contexto e Evolução do Provedor (Novo Modelo de Operação)

### 2.1 Restrições de Iframe e Cookies de Terceiros
Historicamente, offerwalls eram exibidas dentro de elementos `<iframe>` diretamente no dashboard. No entanto, avanços nos modelos de privacidade dos navegadores modernos criaram severas limitações técnicas:
1. **Bloqueio de Third-Party Cookies**: Iniciativas como o *Privacy Sandbox* (Google Chrome), *Intelligent Tracking Prevention - ITP* (Safari) e *Total Cookie Protection* (Firefox) bloqueiam ou particionam cookies de terceiros dentro de iframes.
2. **Autenticação no Provedor**: A Offerwall.me adotou um modelo em que cada usuário precisa criar ou efetuar login em uma conta unificada no painel do provedor para acessar o inventário de campanhas e pesquisas. Em um iframe restrito, sessões, cookies e logins sociais frequentemente falham.
3. **Políticas de CSP e Cabeçalhos X-Frame-Options**: Diversos provedores de pesquisas integrados à rede recusam renderização em molduras embutidas.

### 2.2 Solução: Acesso Direto (Nova Aba) como Fluxo Primário
Para garantir 100% de compatibilidade com o novo modelo da Offerwall.me:
- **Fluxo Direto Recomendado**: O usuário clica para acessar o mural diretamente em uma nova aba com sessão isolada, garantindo funcionamento pleno de cookies e rastreamento de conversões.
- **Visualização Integrada Sob Demanda**: Uma aba de visualização integrada (iframe) permanece acessível como alternativa para usuários que queiram carregar o painel internamente, contando com atalhos de abertura direta em nova aba a qualquer momento.
- **Fallback Automático para Bloqueadores de Popup**: Quando o navegador bloqueia a abertura da nova janela, a interface exibe um aviso explicativo e renderiza um hiperlink nativo pronto para clique direto.

---

## 3. Arquitetura e Fluxo de Dados

```
[Navegador / Cliente React]
  │
  ├─ 1. Usuário clica em "Abrir Offerwall.me" na OfferwallPage.tsx
  ├─ 2. offerwallPass.ts -> fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link')
  │      │
  │      ▼ HTTP GET /api/offerwallme/link
  │
[Servidor Backend (offerwallme.routes.ts)]
  ├─ requireAuth: Valida sessão JWT do usuário logado (401 se ausente)
  ├─ limiter: Rate limiting de 60 req/min por IP
  └─ offerwallme.controller.ts (getOfferwallMeLink):
       ├─ consumeOfferwallPass(userId, provider='offerwallme', passToken)
       │    ├─ Se BM_CAPTCHA_ENABLED=0 -> Libera imediatamente
       │    ├─ Se sem token -> Retorna 403 { ok: false, code: "CAPTCHA_PASS_REQUIRED" }
       │    └─ Se token válido -> Valida expiração, propósito, provedor e consome (single-use)
       └─ buildOfferwallMeUrl(userId) -> Retorna 200 { ok: true, url }
  │
  ├─ 3. Se retorno for 403 CAPTCHA_PASS_REQUIRED:
  │      ├─ Cliente aciona window.BmCaptchaGate.ensure('offerwallme')
  │      ├─ Modal de desafio é exibido ao usuário
  │      ├─ Pass token HMAC é gerado após resolução do captcha
  │      └─ Retry automático do GET com cabeçalho 'x-bm-captcha-pass: <token>'
  │
  ├─ 4. URL recebida com sucesso:
  │      ├─ openPartnerSafe(url) é acionado
  │      ├─ window.open(url, '_blank') sem 'noopener' (para obter WindowProxy válido)
  │      ├─ Desvinculação imediata: win.opener = null (evita tabnabbing)
  │      └─ Se bloqueado (retornou null/throw) -> Exibe banner e botão <a> nativo
  │
[Provedor Externo (Offerwall.me)]
  ├─ Usuário completa oferta ou pesquisa
  │      │
  │      ▼ HTTP POST/GET /api/offerwallme/postback
[Servidor Backend (Postback Callback)]
  ├─ postbackLimiter (30 req/min)
  ├─ isIpAllowed: Whitelist de IPs oficiais do provedor
  ├─ verifySignature: Validação de assinatura HMAC-SHA256 (subId:transId:reward:secret)
  ├─ processPostback:
  │    ├─ Checagem de idempotência (transId já creditado na base?)
  │    ├─ Validação de teto de segurança (MAX_PAYOUT_USD)
  │    ├─ Ignora payloads com debug=1 (reconhece sem creditar)
  │    └─ Creditação atômica de BLK na carteira do usuário
  └─ Resposta HTTP 200 "ok" ao provedor
```

---

## 4. Especificação dos Endpoints Backend

### 4.1 `GET /api/offerwallme/link` (Novo)
Gera o link de acesso direto autenticado para o usuário logado, protegido por rate limiting e verificação de Captcha Pass.

- **Autenticação**: Obrigatória (`requireAuth`). Retorna HTTP 401 caso não autenticado.
- **Rate Limit**: 60 requisições por minuto por IP (`limiter`).
- **Headers Opcionais / Condicionais**:
  - `x-bm-captcha-pass`: Token de resolução do BM Captcha (obrigatório se `BM_CAPTCHA_ENABLED=1`).
- **Query Params**:
  - `passToken` (opcional): Alternativa ao header `x-bm-captcha-pass`.
- **Respostas**:
  - **200 OK**:
    ```json
    {
      "ok": true,
      "url": "https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/12345"
    }
    ```
  - **401 Unauthorized**:
    ```json
    {
      "ok": false,
      "message": "Unauthorized"
    }
    ```
  - **403 Forbidden** (Necessidade de validação do Captcha Gate):
    ```json
    {
      "ok": false,
      "code": "CAPTCHA_PASS_REQUIRED",
      "reason": "CAPTCHA_PASS_REQUIRED"
    }
    ```
  - **500 Internal Server Error**:
    ```json
    {
      "ok": false,
      "message": "Error loading link."
    }
    ```

---

### 4.2 `GET /api/offerwallme/embed`
Fornece a URL para exibição do painel dentro do iframe da página, com as mesmas garantias de autenticação e validação de Captcha Pass que a rota `/link`.

- **Autenticação**: Obrigatória (`requireAuth`).
- **Rate Limit**: 60 requisições por minuto por IP.
- **Resposta de Sucesso (200 OK)**:
  ```json
  {
    "ok": true,
    "url": "https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/12345"
  }
  ```

---

### 4.3 `GET /api/offerwallme/stats`
Retorna o total de ofertas concluídas, moedas faturadas e taxa de câmbio BLK da Offerwall.me.

- **Autenticação**: Obrigatória (`requireAuth`).
- **Rate Limit**: 60 requisições por minuto por IP.
- **Resposta de Sucesso (200 OK)**:
  ```json
  {
    "ok": true,
    "totalOffers": 8,
    "totalBlk": 80.0,
    "totalUsd": 0.40,
    "blkPerClick": 10.0
  }
  ```

---

### 4.4 `GET /api/offerwallme/history`
Retorna o histórico paginado de ofertas concluídas e creditadas ao usuário.

- **Autenticação**: Obrigatória (`requireAuth`).
- **Query Params**: `page` (padrão `1`).
- **Resposta de Sucesso (200 OK)**:
  ```json
  {
    "ok": true,
    "rows": [
      {
        "id": "cm...1",
        "transId": "owme-tx-98712",
        "offerName": "Install & Play App",
        "rewardBlk": 10.0,
        "payoutUsd": 0.05,
        "createdAt": "2026-10-02T18:22:00.000Z"
      }
    ],
    "page": 1,
    "totalPages": 1
  }
  ```

---

### 4.5 `POST /api/offerwallme/postback` e `GET /api/offerwallme/postback`
Webhook chamado pelos servidores da Offerwall.me após a conclusão de uma conversão pelo usuário.

- **Rate Limit**: 30 requisições por minuto (`postbackLimiter`).
- **Segurança de Origem**: Checagem de IP em whitelist configurada (`OFFERWALLME_IPS`).
- **Assinatura**: Validação HMAC-SHA256 calculada como `hmac(subId:transId:reward:secret)`.
- **Campos do Postback**:
  | Campo | Tipo | Descrição |
  |---|---|---|
  | `subId` | string | ID do usuário no BlockMiner (`userId`) |
  | `transId` | string | Identificador único da transação na rede |
  | `reward` | string | Recompensa informada pelo parceiro |
  | `payout` | string | Valor em USD pago pelo anunciante |
  | `offer_name` | string | Nome descritivo da tarefa concluída |
  | `offer_type` | string | Categoria da oferta |
  | `status` | number | Status da transação (`1` para sucesso) |
  | `debug` | string | Flag de teste (`1` para simulação) |
  | `signature` | string | Assinatura HMAC enviada pela rede |

- **Respostas**:
  - `ok` (HTTP 200): Postback aceito e processado.
  - `ERROR: Invalid source` (HTTP 403): IP não autorizado.
  - `ERROR: Invalid signature` (HTTP 403): Falha na assinatura digital.
  - `ERROR: Duplicate` (HTTP 200/400): Transação já processada (idempotência preservada).

---

## 5. Proteção Anti-Automação: BM Captcha Gate

A obtenção de links de mural é protegida pelo serviço `consumeOfferwallPass` (`server/modules/bm-captcha/bm-captcha.service.ts`).

### 5.1 Regras de Validação do Token
1. **Verificação de Ativação**: Se `BM_CAPTCHA_ENABLED` estiver desligado (`"0"`), a validação é automaticamente dispensada (`{ ok: true }`).
2. **Presença do Token**: Na ausência do token, retorna status `403` com código `CAPTCHA_PASS_REQUIRED`.
3. **Consistência do Usuário**: O token deve pertencer exatamente ao `userId` da sessão (`rec.userId === input.userId`), evitando roubo de tokens entre contas.
4. **Prevenção de Replay (Single-Use)**: O token é marcado como consumido imediatamente (`rec.consumed = true`). Qualquer tentativa de reuso resulta em `CAPTCHA_PASS_USED`.
5. **Janela de Expiração**: Tokens possuem validade temporal estrita. Tokens expirados retornam `CAPTCHA_PASS_EXPIRED`.
6. **Propósito e Provedor Vinculados**: O token precisa ter sido emitido especificamente para o propósito `BM_CAPTCHA_PURPOSE_OFFERWALL_EXTERNAL` e com `rec.provider === "offerwallme"`, impedindo confusão cruzada de tokens entre diferentes murais.

---

## 6. Frontend: `offerwallPass.ts` e Camada de Segurança do Navegador

O helper `client/src/features/offerwall/lib/offerwallPass.ts` encapsula a interação segura com o navegador e a resolução com o Captcha Gate.

### 6.1 `openPartnerSafe(url: string): boolean`
Responsável por navegar para o mural externo de forma segura e confiável:

```typescript
export function openPartnerSafe(url: string): boolean
```

#### Mitigações e Desafios Resolvidos:
1. **Contorno do Bug de Especificação do `window.open`**:
   - Pela especificação WHATWG HTML, chamar `window.open(url, '_blank', 'noopener')` faz o navegador retornar `null` compulsoriamente por especificação, mesmo quando a janela abre com sucesso.
   - Isso impedia o código de saber se a janela foi aberta ou bloqueada pelo bloqueador de popups.
   - **Solução implementada**: Chamar `window.open(url, '_blank')` sem a feature string `'noopener'`, permitindo receber a referência do `WindowProxy`.
2. **Proteção Contra Reverse Tabnabbing**:
   - Ao receber o objeto da nova janela, o código executa imediatamente:
     ```typescript
     win.opener = null;
     ```
   - Isso desassocia a página filha da página pai, garantindo que o site externo não possa executar redirecionamentos maliciosos via `window.opener.location`, enquanto preserva a integridade de referenciamento de navegação.
3. **Detecção Fiel de Popup Blocker**:
   - Se `window.open` retornar `null` ou lançar uma exceção de segurança, `openPartnerSafe` retorna `false` sem disparar cliques sintéticos desgovernados (que também seriam bloqueados pelo navegador por falta de gesto ativo).
4. **Fallback para Webviews Customizadas**:
   - Caso `window.open` não exista no ambiente (ex: certas webviews mobile ou extensões), é feita a injeção temporária e clique de um elemento `<a target="_blank" rel="noopener">`.
5. **Hook de Teste e Automação**:
   - Suporte transparente a `window._BmPartnerIframe(url)` para execução determinística em suites de teste ou harness embutido.

---

### 6.2 `fetchOfferwallLinkWithPass`
Realiza a resolução da URL autenticada de forma transparente:

```typescript
export async function fetchOfferwallLinkWithPass(
  provider: BmCaptchaProvider,
  endpoint: string,
): Promise<OfferwallPassResult>
```

#### Ciclo de Vida da Resolução:
1. **Tentativa Direta**: Efetua `GET` no endpoint informado (ex: `/offerwallme/link`). Se o Captcha Gate estiver desligado ou o usuário já tiver passe válido, a URL é retornada imediatamente.
2. **Interceptação de 403 `CAPTCHA_PASS_REQUIRED`**:
   - Aciona `window.BmCaptchaGate.ensure(provider)`.
   - Se o usuário cancelar ou fechar o modal, retorna `{ ok: false, code: 'CAPTCHA_CANCELLED' }`.
   - Com o token gerado, faz nova tentativa de requisição anexando o cabeçalho `x-bm-captcha-pass`.
3. **Classificação Estruturada de Erros**:
   - Não propaga exceções não tratadas para a UI. Retorna um tipo discriminado seguro (`OfferwallPassResult`).

---

## 7. Experiência do Usuário (UX) e Observabilidade

### 7.1 Estados Visuais na Interface (`OfferwallPage.tsx`)
A interface do Offerwall.me apresenta uma hierarquia clara:

1. **Card de Acesso Direto (Recomendado)**:
   - Destaque visual com badge *"Recomendado"*.
   - Explicação clara de que a nova aba oferece compatibilidade total com login, pesquisas e cookies.
   - Botão de ação primária com ícone `ExternalLink` e loader dinâmico durante a geração da URL.
   - Quando o link é resolvido, exibe confirmação visual *"Link direto verificado e pronto para abrir"*.
2. **Tratamento de Bloqueio de Popup**:
   - Quando `openPartnerSafe` retorna `false`, surge um banner em tom âmbar com ícone `AlertCircle`:
     > *"A janela foi bloqueada pelo navegador. Clique no link direto para abrir o Offerwall.me."*
   - Notificação tipo toast de advertência via `sonner`.
   - O botão principal transforma-se num elemento `<a>` estilizado, permitindo abertura instantânea por clique nativo do usuário.
3. **Tratamento de Erros e Resiliência**:
   - Erros de rede ou servidor exibem um banner de alerta com link de ação *"Tentar novamente"*, permitindo nova tentativa imediata sem recarregar a aplicação.
4. **Visualização Integrada (Iframe Sob Demanda)**:
   - Mantida em container retrátil e limpo.
   - Inicialização sob demanda com botão *"Carregar Painel Integrado"*, economizando requisições externas e recursos de memória.
   - Barra superior do iframe com atalho *"Abrir em nova aba"*.

### 7.2 Matriz de Códigos de Erro e Feedback ao Usuário

| Código de Erro | Causa Técnica | Comportamento na UI | Mensagem (pt-BR) |
|---|---|---|---|
| `CAPTCHA_CANCELLED` | Usuário fechou ou cancelou o modal do captcha | Toast informativo (`toast.info`), sem poluição de alertas vermelhos | *"Verificação cancelada. Clique novamente para tentar."* |
| `NETWORK_ERROR` | Falha de conexão / sem resposta HTTP | Banner vermelho na UI + toast de erro (`toast.error`) + botão de retry | *"Erro de conexão ao carregar o link. Verifique sua internet."* |
| `UNAUTHENTICATED` | Sessão expirada ou usuário deslogado | Toast de erro e redirecionamento de login | *"Autenticação necessária"* |
| `POPUP_BLOCKED` | `window.open` retornou `null` | Banner de alerta âmbar + toast de aviso (`toast.warning`) + botão `<a>` pronto | *"A janela foi bloqueada pelo navegador. Clique no link direto para abrir o Offerwall.me."* |
| `SERVER_ERROR` | Falha interna no backend (5xx) | Banner de erro + toast de erro + botão de retry | *"Não foi possível carregar as ofertas. Tente novamente."* |

### 7.3 Suporte a Internacionalização (i18n)
Todas as mensagens foram implementadas nos três idiomas oficiais da plataforma:
- `pt-BR` (`client/src/i18n/locales/pt-BR.json`)
- `en` (`client/src/i18n/locales/en.json`)
- `es` (`client/src/i18n/locales/es.json`)

Chaves adicionadas:
`open_direct`, `open_direct_recommended`, `recommended_badge`, `direct_title`, `embedded_view_title`, `open_in_new_tab`, `iframe_hint`, `load_embed_button`, `generating_link`, `link_ready_hint`, `popup_blocked_hint`, `captcha_cancelled`, `network_error`, `load_error`, `retry`.

---

## 8. Garantia da Qualidade (Quality Gate)

### 8.1 Testes Automatizados

#### Backend (Node Test Runner / TSX)
- Arquivo: `tests/offerwallme/offerwallme.direct.test.mjs`
  - Registro de rotas: validação de `/link`, `/embed` e `/postback` no `offerwallMeRouter`.
  - Construção de URL e paridade de `publisherId`.
  - Autenticação: rejeição com 401 de requisições não autenticadas em `/link` e `/embed`.
  - Consumo de Captcha: emissão de URL válida quando captcha aprovado ou desativado.
- Arquivo: `tests/offerwallme/offerwallme.service.test.mjs`
  - Validação e rejeição de assinaturas HMAC-SHA256.
  - Whitelist de IP de postback.
  - Proteção de idempotência e isolamento do modo debug (`debug=1`).
  - Resolução de `buildOfferwallMeUrl` e overrides por variável de ambiente.

#### Frontend (Vitest)
- Arquivo: `client/src/features/offerwall/lib/offerwallPass.test.ts`
  - `openPartnerSafe`: URLs inválidas retornam `false`.
  - `openPartnerSafe`: delegação correta para `_BmPartnerIframe` quando injetado.
  - `openPartnerSafe`: sucesso com desvinculação `win.opener = null`.
  - `openPartnerSafe`: retorno `false` quando bloqueado pelo navegador (`window.open` retorna `null`).
  - `openPartnerSafe`: retorno `false` em exceções disparadas por bloqueadores.
  - `openPartnerSafe`: fallback para elemento `<a>` programático na ausência de `window.open`.
  - `fetchOfferwallLinkWithPass`: resolução direta com resposta HTTP 200.
  - `fetchOfferwallLinkWithPass`: fluxo transparente com `BmCaptchaGate.ensure` sob HTTP 403 `CAPTCHA_PASS_REQUIRED`.
  - `fetchOfferwallLinkWithPass`: classificação de cancelamento `CAPTCHA_CANCELLED`.
  - `fetchOfferwallLinkWithPass`: classificação de falhas `NETWORK_ERROR` e `UNAUTHENTICATED`.

---

## 9. Nota de Cobertura do Quality Gate

| Dimensão | Status | Detalhes da Cobertura |
|---|---|---|
| **Testes (Testing)** | Concluído | 14 testes de backend executados com sucesso (rotas, controller, service, RBAC/auth, postback) + 11 testes unitários de frontend (vitest) para abertura segura, interceptação de captcha e detecção de popup blocker. |
| **Segurança (Security)** | Concluído | Middleware `requireAuth`, rate limiting (60 req/min no link, 30 req/min no postback), validação anti-replay/single-use de tokens HMAC do BM Captcha, proteção contra *reverse tabnabbing* (`win.opener = null`), validação de assinatura e IP em postbacks. |
| **Erros e Observabilidade (Errors)** | Concluído | Tipos discriminados de erro, mapeamento i18n em 3 idiomas (`pt-BR`, `en`, `es`), toasts não-intrusivos para cancelamento de captcha, logging estruturado Pino no backend (`offerwallme.controller`, `offerwallme.service`). |
| **Diferido (Deferred)** | Nenhum | Toda a especificação do fluxo direto e mitigação de restrições de provedor foi implementada e validada. |
