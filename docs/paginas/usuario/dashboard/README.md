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
