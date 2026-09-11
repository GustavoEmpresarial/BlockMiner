# Landing page (pública)

## 📊 Resumo rápido

| | |
|---|---|
| **Rota (client)** | `/` (só pra visitante não logado — usuário autenticado é redirecionado pra `/dashboard`) |
| **Componente** | `client/src/features/landing/LandingPage.tsx` |
| **Sub-componentes** | `client/src/features/landing/components/{landing.parts.tsx, landing.sections.tsx}` |
| **Lógica/dados** | `client/src/features/landing/lib/{landing.data.ts, landing.hooks.ts, landing.shared.tsx, useLandingContent.ts}` |
| **Analytics** | `client/src/shared/utils/landingAnalytics.ts`, `client/src/shared/hooks/{useLandingScrollDepth.ts, useLandingSeo.ts}` |
| **Chamadas de API** | `GET /api/public-stats` (via `usePublicStatsPoll`, poll a cada 30s), `GET /api/public-feed` (saques/depósitos recentes, poll a cada 30s), `POST /api/track/hit` (analytics de visita, fire-and-forget) |
| **Testes** | `landing.data.test.ts`, `landing.hooks.test.ts`, `landing.shared.test.ts`, `landingAnalytics.test.ts` |

## 1. O que essa página faz

Página de marketing pública (não precisa login). Mostra: hero com CTA, painel de mineração simulado (`LiveMiningWidget`, dados fake só de exibição, deixa isso claro no texto "Simulado — painel real após o cadastro"), estatísticas ao vivo do servidor (jogadores, POL sacado, rigs online, hashrate estimado), como funciona, features, depoimentos (marcados como ilustrativos), jogos, feed de pagamentos/depósitos recentes (anonimizado), FAQ, CTA final.

Se o usuário já está autenticado, a página nem renderiza — redireciona direto pra `/dashboard` (`<Navigate to="/dashboard" replace />`).

## 2. Dados ao vivo vs estimados vs simulados — não confundir

- **Ao vivo, real**: `publicStats` (via `/api/public-stats`) e `publicFeed` (via `/api/public-feed`) vêm do servidor de verdade.
- **Estimado**: hashrate da rede (`estimateNetworkHashRate`) é `activeMiners * 4000 H/s`, com piso de 800.000 H/s — não é medido, é uma aproximação deliberada (documentado na própria função e na UI como "Ilustrativo — escala com jogadores ativos").
- **Simulado, nunca real**: `LiveMiningWidget` (o card "Rig #1 ONLINE" com hashrate/blocos/ganhos incrementando sozinho) é puramente decorativo, números aleatórios gerados no client, não vem do servidor. Isso já é rotulado na própria tela.
- **Fixo/hardcoded**: "SESSÕES: 1M+" é um texto estático, não vem de lugar nenhum.

## 3. Duplicação de código encontrada e limpa nesta passada

`landing.hooks.ts` tinha 5 funções (`usePublicStatsPoll`, `uptimeDays`, `estimateNetworkHashRate`, `useInViewOnce`, `useCountUp`) **idênticas e duplicadas** de `landing.shared.tsx` (as 4 últimas) e de `shared/hooks/usePublicStatsPoll.ts` (a primeira) — confirmado por grep que **nenhum lugar do código importava essas 5 versões duplicadas**; a `LandingPage.tsx` sempre usou as cópias de `landing.shared.tsx`/`shared/hooks/`. Removidas. `landing.hooks.ts` agora só tem o que é de fato usado: `formatHashrate`, `timeAgo`, e os tipos `PublicStatsPayload`/`PublicFeed`/`FeedRow` (usados por `landing.sections.tsx`).

**Não mexido nesta passada** (fora de escopo, mesma limitação nos dois arquivos): `landing.data.ts` mantém exports `@deprecated` (`copy`, `featureCards`, `howSteps`, `testimonials`, `games`, `faqItems`) — já estavam marcados como tal pelo autor original, sinalizando que os getters (`getLandingCopy()` etc.) são a forma preferida porque reagem a troca de idioma; os antigos ficam congelados no idioma do primeiro import. Não removi porque não confirmei se algo ainda importa essas constantes.

## 4. Cobertura de testes — o que dá e o que não dá pra testar sem ferramenta nova

O projeto usa Vitest + jsdom, mas **não tem React Testing Library** — a convenção existente (`chatDisplay.test.ts`, `game2048.tiles.test.ts` etc.) testa só funções puras, nunca renderiza componente/hook React. Segui a mesma convenção:

- **100% cobertos**: `landing.data.ts` (getters de copy/cards/steps/testimonials/games/faq — estrutura, contagem, distinção visual) e `landing.hooks.ts` (`formatHashrate`, `timeAgo`, todas as faixas de unidade H/s→PH/s).
- **Parcial**: `landing.shared.tsx` (só `uptimeDays`/`estimateNetworkHashRate` cobertos; `LiveMiningWidget`/`FaqItem`/`FeedPanel`/`useInViewOnce`/`useCountUp` são componente/hook React, não testados) e `shared/utils/landingAnalytics.ts` (`persistUtmParams`/`readStoredUtm`/`trackLandingEvent` cobertos; `initMetaPixel` não — injeta script real do Facebook no DOM, não dá pra testar sem simular isso de forma frágil).
- **Não coberto**: `useLandingContent.ts` (hook trivial, mas hook) e a própria `LandingPage.tsx`/`landing.parts.tsx`/`landing.sections.tsx` (componentes de apresentação).

**Para fechar esse gap de verdade** seria preciso adicionar `@testing-library/react` ao projeto — decisão de tooling maior, não tomada aqui sem confirmar com o time.

## 5. Bug documentado, não corrigido

`uptimeDays()` não tem piso em zero — se o relógio do servidor/cliente estiver antes de `2026-03-05` (não deveria acontecer em produção, mas o código não impede), a página mostraria "NO AR: -N dias". Caracterizado em teste (`landing.shared.test.ts`), não corrigido nesta passada por ser um cenário que não ocorre na prática.
