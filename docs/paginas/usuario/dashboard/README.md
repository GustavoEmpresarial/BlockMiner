# Dashboard (logada)

## 📊 Resumo rápido

| | |
|---|---|
| **Rota (client)** | `/dashboard` (ou raiz da área logada, conforme `client/src/features/shell`) |
| **Componente** | `client/src/features/dashboard/DashboardPage.tsx` |
| **Sub-componentes** | `components/MiningAllocationPanel.tsx`, `components/DashboardEnergyTaxModal.tsx`, `components/DashboardBannersCarousel.tsx`, `components/dashboard.parts.tsx` (`DashboardCards`, `DashboardHistory`, `DashboardEfficiencyCard`, `DashboardActivityCard`) |
| **Lib** | `lib/dashboard.api.ts` (chamadas REST), `lib/dashboard.helpers.ts` (funções puras), `lib/dashboardBalanceCurrency.ts` (persistência local da moeda selecionada), `lib/dashboard.config.ts`, `lib/dashboard.errors.ts` (logging estruturado), `lib/useDashboardPoll.ts` (hook de polling) |
| **Rotas servidor** | `GET /api/mining/cycle`, `GET /api/wallet/balance`, `GET /api/rooms/slots`, `GET /api/wallet/withdraw-fee-info`, `PATCH /api/mining/allocation`, `POST /api/user/link-referral`, `GET /api/energy-tax/summary`, `POST /api/energy-tax/pay-daily`, `GET /api/banners` — todas verificadas contra `server/bootstrap/server.ts` (mount points) + `*.routes.ts`/`*.controller.ts`/`*.service.ts` |
| **Testes** | `client/src/features/dashboard/**/*.test.{ts,tsx}` (ver seção 4) |

## 1. O que a página faz

A Dashboard é a home da área logada: mostra saldo (POL/SHIB/BLK), hashrate próprio e da rede, contagem regressiva para o próximo bloco, histórico dos últimos blocos, split de mineração POL/SHIB (`MiningAllocationPanel`), programa de afiliados (copiar/colar código de indicação), eficiência de instalação (racks livres vs. inventário ocioso), progresso para isenção da taxa de saque, banners promocionais e um modal de cobrança de taxa de energia pendente.

Todos os cálculos de saldo/recompensa/taxa são feitos e validados no servidor — o client só exibe o que a API retorna e nunca decide saldo/crédito sozinho.

## 2. Fluxo de dados

```
DashboardPage monta
   ↓
useDashboardPoll(getMiningCycle)     — a cada 15s + on focus/visibilitychange
useDashboardPoll(getWalletBalance)   — idem
getRoomsSlotsSummary() + getWithdrawFeeInfo()  — uma vez no mount
   ↓
Socket (game.store) também alimenta `cycle` via merge (mergeCycleWithSocket) —
prioriza o socket quando presente, cai para o REST poll como fallback
   ↓
Estado local (React) → componentes de apresentação (dashboard.parts.tsx)
```

`mergeCycleWithSocket` (DashboardPage.tsx) funde o snapshot do socket (tempo real) com o
último REST fetch (fallback) — nenhum dos dois é fonte única de verdade sozinho.

## 3. Passada de qualidade (2026-09-11)

Auditoria completa do módulo `client/src/features/dashboard/**` (~2550 linhas, 15 arquivos) seguindo o checklist obrigatório (testes / segurança / erros e observabilidade).

### 3.1 Bugs corrigidos

- **`lib/dashboard.shared.tsx` (`Card`)**: `useState` era chamado *depois* de um `return`
  condicional (`if (children != null...) return ...`), violando a regra de hooks do React
  (ordem de hooks deve ser idêntica em todo render). Hoje nenhum call-site usa esse branch,
  então não quebrou nada em produção — mas o próximo uso do modo "children" quebraria o
  hook state de forma imprevisível. Corrigido: `useState` movido para antes do `return`.
- **Comentário desatualizado em `lib/dashboard.api.ts`**: afirmava que `GET /api/rooms/slots`
  "não está montada em `server/bootstrap/server.ts` ainda". Verificado: a rota está montada
  (`app.use("/api/rooms", roomsRouter)`, `roomsRouter.get("/slots", getSlotsSummary)`). O
  comentário foi removido — estava desatualizado e podia levar a debugar o endpoint errado.

### 3.2 Código morto / duplicação removidos

- Prop `miner` de `DashboardCardsProps` (`components/dashboard.parts.tsx`) nunca era lida
  dentro do componente (só desestruturada como `miner: _miner` e descartada) — removida da
  prop e do call-site em `DashboardPage.tsx`.
- `DASHBOARD_BLOCK_COUNTDOWN_RESYNC_SECONDS` (`lib/dashboard.config.ts`) existia mas
  `nextBlockCountdownAnchor` (`lib/dashboard.helpers.ts`) usava o literal `2` hardcoded —
  agora importa e usa a constante (uma fonte de verdade).
- **Duplicação de polling**: `DashboardPage.tsx` tinha dois `useEffect` quase idênticos
  (fetch inicial + `setInterval` + listeners de `visibilitychange`/`focus` + cleanup) — um
  para `getMiningCycle`, outro para `getWalletBalance`, diferindo só na chamada assíncrona
  interna. Extraído para `lib/useDashboardPoll.ts` (hook reutilizável), testado isoladamente.

### 3.3 Erros / observabilidade

Antes desta passada, **toda** chamada de API no módulo usava `.catch(() => {})` — uma falha
de rede, 500, timeout ou token expirado era completamente invisível: nenhum log de console,
nenhuma linha em `/admin/client-errors`, nenhuma forma de distinguir "API fora do ar" de
"usuário com saldo zero". A UX correta (degradar para estado vazio em vez de quebrar a
página) foi mantida — só a observabilidade foi adicionada.

Criado `lib/dashboard.errors.ts`: `logDashboardError(code, err)` — loga um objeto
estruturado e retorna o `errorId` (para o usuário poder informar em um chamado de suporte).
Nunca loga o corpo da resposta (`response.data`) — só `status` e `message` — para não vazar
token/PII que um payload de erro do backend possa carregar.

**Atualizado em 2026-09-11 (passada 2)**: adicionados `errorId` (único por ocorrência,
`err_<uuid>`), `fingerprint` (agrupamento — `dashboard:<code>:<status>`, igual para N
ocorrências da mesma falha) e `impact` (`LOW`/`MEDIUM`/`HIGH`, independente de `severity`).
Payload atual:

```json
{
  "errorId": "err_...",
  "correlationId": "corr_...",
  "fingerprint": "dashboard:DASHBOARD_ALLOCATION_SAVE_FAILED:500",
  "code": "DASHBOARD_ALLOCATION_SAVE_FAILED",
  "severity": "CRITICAL",
  "impact": "HIGH",
  "source": "dashboard",
  "status": 500,
  "message": "..."
}
```

`impact` reflete a consequência de negócio, não a gravidade técnica: fetches somente-leitura
(`*_FETCH_FAILED`) degradam para um card vazio/estático e ficam `LOW` mesmo que o status seja
500; escritas que podem deixar o estado do usuário fora de sincronia com o que ele acha que
aconteceu (`DASHBOARD_ALLOCATION_SAVE_FAILED`, `DASHBOARD_ENERGY_TAX_PAY_FAILED`) são `HIGH`
e sobem `severity` para `CRITICAL` independente do status HTTP. `DASHBOARD_REFERRAL_LINK_FAILED`
e `DASHBOARD_ENERGY_TAX_FETCH_FAILED` ficam em `MEDIUM`/`ERROR` (não é dinheiro em trânsito,
mas o usuário pode achar que uma ação completou quando não completou).

Códigos usados:

| Código | Onde |
|---|---|
| `DASHBOARD_CYCLE_FETCH_FAILED` | poll de `GET /mining/cycle` |
| `DASHBOARD_BALANCE_FETCH_FAILED` | poll de `GET /wallet/balance` |
| `DASHBOARD_SLOTS_FETCH_FAILED` | `GET /rooms/slots` |
| `DASHBOARD_FEE_INFO_FETCH_FAILED` | `GET /wallet/withdraw-fee-info` |
| `DASHBOARD_ALLOCATION_SAVE_FAILED` | `PATCH /mining/allocation` |
| `DASHBOARD_REFERRAL_LINK_FAILED` | `POST /user/link-referral` |
| `DASHBOARD_REFERRAL_COPY_FAILED` | `navigator.clipboard.writeText` |
| `DASHBOARD_ENERGY_TAX_FETCH_FAILED` | `GET /energy-tax/summary` |
| `DASHBOARD_ENERGY_TAX_PAY_FAILED` | `POST /energy-tax/pay-daily` |
| `DASHBOARD_BANNERS_FETCH_FAILED` | `GET /banners` |

Não há mudança de UX/toast para o usuário final além do que já existia — os `toast.error`
existentes continuam disparando; agora eles são precedidos por um log estruturado.

### 3.4c Modal de Taxa de Energia Pendente (`DashboardEnergyTaxModal`)

O componente `DashboardEnergyTaxModal.tsx` exibe um aviso modal quando o usuário logado possui dias em aberto de taxa de energia nesta semana (`unpaidDays > 0` e `active === true`):
- **Montagem via Portal**: Renderizado via `createPortal(..., document.body)` com `ENERGY_TAX_MODAL_Z_INDEX = 'z-[9999]'`. Isso elimina o aprisionamento no containing block de `DashboardPage` (que possui animações CSS), garantindo que o backdrop escureça e desfoque a viewport inteira (incluindo o header desktop `z-30` e a topbar mobile `z-40`), sem deixar faixas nítidas no topo.
- **Ciclo de Vida e Scroll Lock**: Ao abrir, trava a rolagem do `document.body` (`overflow: hidden`) preservando a largura do viewport sem causar layout shift (compensando o `scrollbarWidth`); restaura o scroll e o foco original ao fechar ou desmontar.
- **Acessibilidade (a11y)**: Configurado com `role="dialog"`, `aria-modal="true"`, `aria-labelledby="energy-tax-modal-title"` e `aria-describedby="energy-tax-modal-description"`. Suporta fechamento pela tecla `Escape`, clique no backdrop e botão de fechar acessível (`aria-label`).
- **Regras de Negócio e Cotas**:
  - Pagamento diário opcional com taxa equivalente a 5% por semana (fórmula: `0,05 / 7 ≈ 0,7143%/dia × 7 dias = 5% total`), contra 15% (`0,15 / 7 ≈ 2,1429%/dia`) no fechamento automático semanal de segunda-feira às 00:00 UTC. O badge exibe `-66%` de economia.
  - Exibição de total minerado nos últimos 7 dias (`totalRewards7d`).
  - Seletor de moeda de quitação (`POL`, `BLK`, `SHIB`) com verificação dinâmica de saldo (`affordable`).
  - Isenção de 100% da taxa diária ao completar 10 atividades diárias na plataforma (`todayExempt`), transformando o botão em "Registrar isenção de hoje" (taxa zero).
  - Resiliência contra corrida concorrente (race condition): colisão na constraint `@@unique([userId, periodDayStartsAt])` em `EnergyTaxCharge` retorna `409 ALREADY_PAID` em vez de erro 500.
  - Ações: "Pagar hoje" (`POST /api/energy-tax/pay-daily`), link para a página completa de taxas (`/taxes`) e botão "Lembrar depois" que encerra o modal nesta visualização sem marcar como quitado.
  - Para documentação aprofundada de produto e guia de suporte, consulte a [Seção 5](#5-modal-de-taxa-de-energia-pendente--manual-de-produto-e-suporte).

### 3.4 Segurança — pontos verificados

- **IDOR**: nenhum endpoint chamado por este módulo aceita um id de usuário vindo do client
  (`userId`, `account_id`, etc. na URL/query/body) — todos derivam o usuário da sessão no
  servidor (`requireSessionUser`/`authenticateToken*`). Não há BOLA possível a partir deste
  módulo.
  - Único identificador exposto no client é `user.id`, mostrado como "código de indicação"
    — leitura pública por design (é o próprio código que o usuário compartilha), não é um
    segredo nem controla acesso a dados de outra conta.
- **XSS**: `banner.title`/`banner.message` e `user.name` são renderizados via JSX (React
  escapa por padrão) — nenhum `dangerouslySetInnerHTML` no módulo. `sanitizeReferralInput`
  e `displayDashboardUserName` (`lib/dashboard.helpers.ts`) também removem caracteres de
  controle antes de exibir/enviar.
- **Open redirect / link externo**: `banner.link` (link de banner administrável) abre com
  `rel="noopener noreferrer"` e `target="_blank"` só quando começa com `http` — não segue
  cegamente esquemas arbitrários (`javascript:` não passa no `startsWith('http')`).
- **Secrets**: nenhuma chave/token hardcoded no módulo; CSRF e Idempotency-Key são tratados
  centralmente pelos interceptors do `axios` em `shared/auth/auth.store.ts` (fora deste
  módulo, mas cobre todas as chamadas feitas por `dashboard.api.ts`).
- **Dinheiro/saldo**: este módulo só **exibe** saldo — todo cálculo de recompensa, taxa e
  saldo é feito e validado no servidor (`mining.service`, `wallet` module, `energy-tax`
  module). O client não decide crédito/débito.
- **Local storage**: `dashboardBalanceCurrency.ts` (preferência de moeda exibida) só guarda
  um enum (`'POL'|'SHIB'|'BLK'`) por `userId`, sem dado sensível; leitura/escrita têm
  try/catch para não quebrar em modo privado/quota excedida (testado).

### 3.4b Segurança — auditoria de rede/servidor das rotas de escrita (2026-09-11, passada 2)

A passada 1 (3.4) cobriu IDOR/XSS/secrets/dinheiro do ponto de vista do módulo client. Esta
passada auditou especificamente CSRF, CORS, rate limiting e mass assignment nas duas rotas
de **escrita** que este módulo chama — `PATCH /api/mining/allocation` (`MiningAllocationPanel`)
e `POST /api/user/link-referral` (form de indicação) — por serem as únicas onde um ataque
teria efeito real (as demais chamadas do módulo são só leitura).

- **CSRF**: `server/core/http/middleware/csrf.ts` usa double-submit cookie
  (`blockminer_csrf`, `SameSite=strict` em produção) + header `x-csrf-token` obrigatório em
  todo `POST/PUT/PATCH/DELETE`. Nem `/mining/allocation` nem `/user/link-referral` estão na
  lista de exceção (`CSRF_EXEMPT_PREFIXES` — só webhooks S2S como
  `/api/moneyrain/callback`). Client injeta o header automaticamente
  (`shared/auth/auth.store.ts`, `xsrfCookieName`/`xsrfHeaderName` casados com o nome do
  cookie do servidor). Sem achados.
- **CORS**: `server/shared/http/corsConfig.ts` usa allowlist explícita
  (`BUILTIN_CORS_ORIGINS` + `CORS_ORIGINS` do env) com `credentials: true` — não é
  `origin: '*'` com credentials (que seria uma falha crítica). `assertProductionCorsConfigured()`
  derruba o boot se `CORS_ORIGINS` estiver vazio em produção. Sem achados.
- **Rate limiting**: `mining.routes.ts` aplica `writeLimiter` (30 req/min) em
  `/mining/allocation`; `user.routes.ts` aplica `userLimiter` (100 req/15min) em todo o
  router, incluindo `/link-referral`. Ambas as rotas exigem `requireAuth`. Sem achados.
- **Mass assignment**: `updateAllocation` (mining.controller.ts) só lê `body.polBps`
  (nunca faz `Object.assign(user, body)` ou spread do body inteiro) e delega clamp/validação
  para `mining.service.ts`. `linkReferral` (user.controller.ts) só lê `refCode`, valida tipo
  e `.trim()`, verifica indicação já existente (idempotência), auto-indicação e mesmo IP.
  Sem achados de mass assignment em nenhuma das duas.
- ⚠️ **Achado de processo (não é vulnerabilidade de segurança, mas registrado aqui por
  aparecer nas duas rotas auditadas)**: `server/modules/mining/mining.routes.ts` e
  `server/modules/users/user.routes.ts` carregam o cabeçalho
  `// RECOVERED: this source file was missing from git history (never committed) while
  production kept running off a stale compiled dist/ via Docker build cache` com
  `@ts-nocheck`. Ou seja, em algum momento o `.ts` desses dois arquivos não estava no git e a
  produção rodava a partir de um `dist/` compilado que não correspondia a nenhum commit
  rastreável — um risco de auditoria/rastreabilidade (não dá pra saber por `git blame` quem
  mudou rate limit/auth nessas rotas historicamente) e o `@ts-nocheck` remove a verificação
  de tipos justamente nos arquivos que definem quais rotas exigem autenticação/rate-limit.
  Fora do escopo desta passada corrigir (envolve mexer no processo de build/deploy, não no
  dashboard), mas recomendo abrir uma tarefa separada para: (1) confirmar que o `dist/` atual
  em produção bate com este `.ts` reconstruído, (2) remover `@ts-nocheck` depois de tipar,
  (3) auditar os demais arquivos com o mesmo padrão.
  **Escopo real, medido nesta passada**: `grep -rl "RECOVERED: this source file was missing
  from git history" server/{modules,core,shared,bootstrap}` retorna **156 de 713** arquivos
  `.ts` do servidor (~22%) — não é um caso isolado das duas rotas auditadas aqui, é um
  padrão amplo no `server/`. Isso é **project-wide**, fora do escopo deste módulo de
  dashboard; reportado ao usuário diretamente fora deste doc também.

### 3.5 Testes adicionados (zero testes existiam antes desta passada)

| Arquivo | Cobre |
|---|---|
| `lib/dashboard.helpers.test.ts` | `mapWalletBalancePayload` (payload malformado/NaN/Infinity), `sanitizeReferralInput` (XSS-like input, control chars, truncamento), `displayDashboardUserName`, `buildReferralRegisterUrl` (URL-encoding), `nextBlockCountdownAnchor`/`smoothedBlockCountdownSeconds` (resync, clamp), `pendingPolAccrual` (divisão por zero, clamp) |
| `lib/dashboardBalanceCurrency.test.ts` | valor corrompido no storage, `localStorage` lançando exceção (modo privado/quota), escopo por `userId` |
| `lib/dashboard.errors.test.ts` | correlation id único por chamada, não vaza `response.data` (token/senha), não lança em valor de erro não-padrão |
| `lib/dashboard.shared.test.tsx` | `Card` (bug de hooks corrigido, fallback de logo quebrada), `safeDashboardNumber`/`parseBlockTime`/`formatDashboardBlockTime` (entradas malformadas) |
| `components/MiningAllocationPanel.test.tsx` | validação de draft não-numérico, presets, estado "saving" desabilita controles |
| `components/DashboardBannersCarousel.test.tsx` | falha de API, `ok:false`, payload não-array — todos devem renderizar "nada" e não quebrar |
| `components/DashboardEnergyTaxModal.test.tsx` | falha de fetch, falha de pagamento, estados active/exempt |
| `components/dashboard.parts.test.tsx` | estado vazio de histórico, linha malformada, contadores nulos |
| `DashboardPage.smoke.test.tsx` | página completa: happy path E todas as chamadas REST falhando simultaneamente (garante que cada falha gera o código de erro correto e a página não quebra) |
| `index.test.ts` | barrel export não quebra |

Cobertura de statements do diretório `lib/` (funções puras + hooks): **91%**. Cobertura
geral do módulo (`lib/` + `components/` + `DashboardPage.tsx`): **77%** — o restante é,
majoritariamente, JSX puramente decorativo (classes Tailwind, ícones) sem branch lógico a
testar; ver "Deferred" abaixo para o que ficou de fora conscientemente.

Rodar: `cd client && npx vitest run src/features/dashboard --coverage --coverage.include='src/features/dashboard/**'`

### 3.6 Deferred (não coberto nesta passada, com motivo)

- **Testes de `DashboardBannersCarousel`**: cobrem fetch/renderização, mas não o carrossel
  interativo (auto-advance, `ResizeObserver`, swipe/portal do modal de detalhe) — a lógica
  de layout responsivo depende de `ResizeObserver`/`getBoundingClientRect`, que exigiriam
  mocks pesados para pouco ganho de sinal; risco é cosmético, não funcional/financeiro.
- **E2E real (Playwright/Cypress) da Dashboard**: fora de escopo desta passada, que ficou
  em nível de componente (`@testing-library/react`) + smoke test. Não há suíte E2E no
  projeto ainda para nenhuma página logada.
- **Mutation testing / property-based testing**: não aplicado — o ganho marginal não
  justificou o tempo nesta passada para um módulo majoritariamente de apresentação.

## 4. Referência de arquivos

```
client/src/features/dashboard/
├── DashboardPage.tsx              — página principal, orquestra estado + polling
├── index.ts                       — barrel export (DashboardPage + api + types)
├── lib/
│   ├── dashboard.api.ts           — chamadas REST (com doc inline de cada rota)
│   ├── dashboard.config.ts        — constantes (intervalo de poll, decimais, etc.)
│   ├── dashboard.errors.ts        — logDashboardError (logging estruturado)
│   ├── dashboard.helpers.ts       — funções puras (sanitização, countdown, accrual)
│   ├── dashboard.shared.tsx       — Card genérico + formatadores
│   ├── dashboard.types.ts         — tipos de estado do ciclo de mineração
│   ├── dashboardBalanceCurrency.ts— persistência local da moeda exibida
│   ├── dashboardCoinLogos.ts      — mapa de ícones de moeda
│   ├── miningSocket.types.ts      — tipos do payload de socket
│   └── useDashboardPoll.ts        — hook de polling (fetch + interval + focus/visibility)
└── components/
    ├── dashboard.parts.tsx        — DashboardCards/History/EfficiencyCard/ActivityCard
    ├── dashboard.shared.tsx       — re-export de lib/dashboard.shared
    ├── DashboardBannersCarousel.tsx
    ├── DashboardEnergyTaxModal.tsx
    └── MiningAllocationPanel.tsx
```

---

## 5. Modal de Taxa de Energia Pendente — Manual de Produto e Suporte

Este capítulo consolida a documentação oficial de **Produto** e o guia operacional para equipes de **Suporte e Atendimento** referente ao popup de Taxa de Energia Pendente (`DashboardEnergyTaxModal.tsx`), conectado ao módulo `server/modules/energy-tax/`.

### 5.1 Visão Geral de Produto para o Usuário Final

#### 5.1.1 O que é o Popup e Qual o seu Propósito
O popup de Taxa de Energia é uma notificação modal de alta prioridade exibida na tela inicial da Dashboard (`/dashboard`). Seu objetivo é alertar imediatamente os mineradores que possuem dias pendentes de quitação de taxa de energia nesta semana, permitindo liquidar o valor diário com um desconto de 66% em relação à taxa semanal padrão ou formalizar a isenção conquistada por engajamento.

#### 5.1.2 Condições de Exibição (Gatilhos de Disparo)
O modal só é renderizado quando **todas** as seguintes condições forem satisfeitas:
1. **Recurso Ativo**: A data atual é igual ou posterior à data de início do sistema (`ENERGY_TAX_STARTS_AT`, padrão `2026-06-30T00:00:00.000Z`, validado por `isEnergyTaxActive()`).
2. **Pendência em Aberto**: O campo `unpaidDays` retornado por `GET /api/energy-tax/summary` é maior que 0 (`unpaidDays > 0`).
3. **Visibilidade Ativa na Sessão**: O usuário não dispensou o popup nesta navegação clicando em "Lembrar mais tarde", no botão fechar (`X`), na tecla `Escape` ou no backdrop.

> **Importante**: Se `unpaidDays === 0`, se `active === false` ou se a requisição à API falhar, o popup permanece totalmente invisível para não atrapalhar o uso rotineiro da Dashboard.

#### 5.1.3 Comparativo de Regimes de Taxa e Economia
O modelo econômico do BlockMiner opera sob 3 regimes estritos calculados exclusivamente no servidor:

| Regime | Alíquota Efetiva | Fórmula / Base de Cálculo | Quando Ocorre | Economia Visual |
|---|---|---|---|---|
| **Pagamento Diário Opcional** *(Recomendado)* | **5% na semana** (`DAILY_WEEK_RATE = 0.05`) | `0,05 / 7 ≈ 0,007142857` (**0,7143%/dia**) aplicado sobre a recompensa de mineração do dia fechado anterior (`yesterdayRewards`). | Manualmente pelo usuário a qualquer momento antes do sweep semanal. | **-66%** de desconto (em relação aos 15% semanais). |
| **Fechamento Automático Semanal** *(Sweep)* | **15% na semana** (`FULL_WEEK_RATE = 0.15`) | `0,15 / 7 ≈ 0,02142857` (**2,1429%/dia**) cobrado sobre cada dia fechado da semana que não foi quitado previamente. | Toda **segunda-feira às 00:00 UTC** (`isEnergyTaxAutoSweepDay`), via cron de automação. | Sem desconto (taxa plena). |
| **Isenção Total por Atividades** | **0% (Isento)** | Envio de encargo com `amount = 0`, `ratePercent = 0` e `mode = "exempt"`. | Quando o usuário atinge **10 atividades diárias** na plataforma. | **100% de desconto** (Taxa zero). |

- **Badge `-66%`**: Destaca ao minerador que quitar a taxa diariamente custa 1/3 do valor do sweep automático semanal.
- **Total Minerado nos Últimos 7 Dias (`totalRewards7d`)**: O modal exibe a soma dos rendimentos auferidos pelo usuário nos últimos 7 dias minerados, permitindo compreender a base de cálculo.

#### 5.1.4 Isenção Total por Engajamento (10 Atividades Diárias)
Se o minerador completar pelo menos 10 atividades no ciclo UTC corrente (`ACTIVITY_DISCOUNT_THRESHOLD = 10`), o campo `todayExempt` do resumo torna-se `true`.
- **Atividades contabilizadas**: Reivindicações no Faucet, cliques PTC (Zerads), shortlinks completados, vídeos do YouTube assistidos, partidas em minigames e ofertas em offerwalls (OfferwallMe, MoneyRain e internas).
- **Mudança na Interface**:
  - O seletor de moedas é ocultado (não há débito financeiro).
  - O botão principal muda para **"Registrar isenção de hoje"**.
  - Ao clicar, o sistema cria o registro formal de isenção sem descontar nenhuma fração de saldo de qualquer carteira do usuário.

#### 5.1.5 Moedas de Pagamento Aceitas e Cotações Dinâmicas
Quando a taxa não está isenta, o usuário pode liquidar o débito utilizando qualquer uma das 3 moedas suportadas pelo ecossistema:
1. **POL** (moeda base nativa de governança e mineração).
2. **BLK** (token utilitário do jogo).
3. **SHIB** (moeda memecoin minerável).

- **Cotações**: As cotações equivalentes são calculadas pelo servidor em `buildTaxPayQuotes` (`server/shared/taxPaymentCurrency.ts`) respeitando a paridade com a taxa diária em POL.
- **Validação de Saldo (`affordable`)**: O componente avalia se o saldo do usuário cobre o montante devido na moeda selecionada. Se o saldo for insuficiente, um card de alerta em vermelho é exibido (`Saldo insuficiente na moeda selecionada`) e o botão de pagamento é desabilitado.

#### 5.1.6 Ações e Navegação Disponíveis
- **Pagar hoje / Registrar isenção**: Submete `POST /api/energy-tax/pay-daily`, bloqueia novos cliques via estado `paying` (spinner), fecha o modal, atualiza a flag de sessão `energyHasPendingTax: false`, dispara revalidação silenciosa de sessão (`checkSession`) e exibe notificação toast de sucesso.
- **Ir para Taxa de Energia** (`/taxes`): Fecha o modal e conduz o minerador à página dedicada `/taxes`, onde é possível auditar o histórico de encargos, ver o detalhamento dia a dia e acompanhar o cronômetro para o fechamento semanal.
- **Lembrar mais tarde / Fechar**: Encerra a visualização do modal na sessão atual sem registrar quitação. O modal voltará a ser exibido no próximo acesso ou recarregamento enquanto existirem pendências.

#### 5.1.7 Experiência Visual e Acessibilidade (A11y)
- **Eliminação de Bug Visual via Portal**: O modal é renderizado diretamente em `document.body` através de `createPortal(modalContent, document.body)`. Isso elimina o aprisionamento provocado pelo *containing block* que o container de `DashboardPage` cria devido às animações CSS (`animate-in fade-in`), garantindo que o backdrop escureça e desfoque a tela por inteiro.
- **Escala Canônica de Z-Index (`z-[9999]`)**: Utiliza a constante nomeada `ENERGY_TAX_MODAL_Z_INDEX = 'z-[9999]'`. O modal fica acima do Header desktop (`z-30`), Topbar móvel (`z-40`) e modais comuns (`z-[100]`), mas abaixo de comunicados de broadcast globais (`z-[99999]`) e do desafio antibot (`z-[2147483000]`).
- **Acessibilidade W3C**: Estruturado com `role="dialog"`, `aria-modal="true"`, `aria-labelledby="energy-tax-modal-title"` e `aria-describedby="energy-tax-modal-description"`. Suporta atalho `Escape` para fechar, foco inicial no container do diálogo e restauração automática do foco ao elemento previamente ativo após o fechamento.
- **Scroll Lock sem Layout Shift**: O fechamento do scroll do navegador (`overflow: hidden`) aplica compensação de padding correspondente à largura exata da barra de rolagem (`window.innerWidth - document.documentElement.clientWidth`), impedindo saltos visuais na página.

---

### 5.2 Guia Operacional e Troubleshooting para Suporte

Este guia orienta operadores de atendimento e analistas de suporte no diagnóstico e resolução de dúvidas e incidentes relacionados à taxa de energia.

#### 5.2.1 Matriz de Erros de API (`POST /api/energy-tax/pay-daily`)

| Status HTTP | Código de Erro | Mensagem Típica | Causa Técnica | Conduta do Suporte |
|---|---|---|---|---|
| `401` | - | Não autenticado | Sessão expirada ou token ausente. | Solicitar que o usuário recarregue a página e realize novo login. |
| `400` | `NO_REWARDS` | *"Você não minerou nada ontem — sem taxa pra cobrar."* | Usuário não possuía máquinas ativas minerando no dia UTC fechado anterior (`yesterdayRewards <= 0`). | Esclarecer ao usuário que nenhuma taxa é cobrada em dias nos quais não houve mineração. |
| `400` | `INSUFFICIENT_BALANCE` | *"Saldo insuficiente: precisa de X [MOEDA], tem Y [MOEDA]."* | O saldo da carteira na moeda escolhida é menor que o montante necessário. | Orientar o usuário a selecionar outra moeda no seletor (POL, BLK ou SHIB) ou efetuar depósito/resgate de saldo. |
| `403` | `NOT_STARTED` | *"A Taxa de Energia entra em vigor em..."* | Tentativa de pagamento antes do marco inicial de lançamento (`ENERGY_TAX_STARTS_AT`). | Informar a data oficial de início das cobranças. Nenhuma ação manual é requerida. |
| `409` | `ALREADY_PAID` | *"Você já quitou a taxa de energia de ontem."* | O dia já foi pago anteriormente ou ocorreu clique concorrente / duplo clique simultâneo. | Confirmar ao usuário que a taxa do dia já se encontra liquidada. **Importante**: Concorrências disparam colisão única no banco (`@@unique([userId, periodDayStartsAt])`, erro Prisma `P2002`), agora tratada elegantemente com HTTP 409 em vez de erro 500. Não houve duplicidade de débito. |
| `500` | - | *"Erro ao processar pagamento."* | Falha inesperada de infraestrutura de banco ou rede. | Registrar ticket contendo o `errorId` gerado no console do cliente e encaminhar à equipe de engenharia. |

#### 5.2.2 Códigos de Erro Estruturados no Cliente (`lib/dashboard.errors.ts`)

| Código | Severidade | Impacto | Origem | Comportamento na UI |
|---|---|---|---|---|
| `DASHBOARD_ENERGY_TAX_FETCH_FAILED` | `ERROR` | `MEDIUM` | `GET /api/energy-tax/summary` | Falha silenciosa: o modal não é aberto para não bloquear o uso da Dashboard. Log estruturado com `errorId`. |
| `DASHBOARD_ENERGY_TAX_PAY_FAILED` | `CRITICAL` | `HIGH` | `POST /api/energy-tax/pay-daily` | Modal permanece aberto, botão de pagamento é destravado e exibe toast de erro informando a mensagem da API. |

#### 5.2.3 Perguntas Frequentes (FAQ de Atendimento)

**P: O usuário alega que clicou duas vezes rapidamente no botão de pagar e apareceu um aviso de erro. Ele foi cobrado duas vezes?**  
*R*: **Não.** O banco de dados possui uma restrição de unicidade composta (`@@unique([userId, periodDayStartsAt])` na tabela `EnergyTaxCharge`). A primeira requisição processa o débito com sucesso; a segunda requisição atinge a restrição de integridade e o sistema retorna imediatamente `409 ALREADY_PAID`. Apenas um único débito é registrado na conta do usuário.

**P: O usuário pergunta por que o popup apareceu se ele não comprou nenhuma taxa.**  
*R*: O popup é um aviso preventivo do sistema. Sempre que o usuário possui mineradoras gerando recompensas e há dias úteis da semana sem quitação (`unpaidDays > 0`), o aviso surge para oferecer a quitação diária a 5% (com 66% de desconto) antes que o fechamento semanal de segunda-feira aplique a taxa de 15%.

**P: Como o usuário pode obter 100% de isenção da taxa diária?**  
*R*: O usuário precisa realizar 10 atividades diárias na plataforma antes de clicar em pagar (tais como faucets, tarefas de PTC, shortlinks, vídeos ou jogos). Quando a meta for atingida, o botão do popup muda para "Registrar isenção de hoje", permitindo quitar o dia com custo zero.

**P: Fechar o modal no botão "Lembrar depois" cancela a taxa?**  
*R*: Não cancela. Apenas oculta o aviso no navegador para que o usuário possa interagir com outras abas. Se o dia não for quitado até segunda-feira às 00:00 UTC, o sistema executará o sweep automático com alíquota semanal de 15%.

