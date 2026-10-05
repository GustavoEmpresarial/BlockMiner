# Lote 8 — redesign transparency

Worktree: `/home/gustavo/Documentos/BlockMiner2.1/lote8-transparency`
Branch: `feature/redesign-transparency-batch8` a partir de `origin/main` @ `2955f92`.
O checkout compartilhado permaneceu em `feature/redesign-transparency-batch7`.
Os arquivos historicos `docs/auditoria/fase-00` … `fase-07` e `docs/relatorio-auditoria.md` nao foram alterados.

## Fase 0 — Observacao

Estado: OBSERVADO

No `main` @ `2955f92` o dashboard ainda usava `rounded-2xl`, `bg-surface` e `shadow-2xl` na pagina e nas cascas (historico, eficiencia, atividade, alocacao, banners, card de KPI em `lib/dashboard.shared.tsx`). `components/dashboard.shared.tsx` so reexporta esse `Card`.

YouTube, Social e Creator ja tinham hero com `IconBadge` e `Card` no arquivo da pagina (lote 7 entrou no main pelo PR #37). `YoutubeVideoPanel` ainda tinha caixas `rounded-2xl` / `bg-gray-800`.

`Game2048Page` e `GameSessionPage` tinham moldura propria ao redor do tabuleiro e do canvas. `ComingSoonPage` usava `rounded-2xl border-white/10`. `ComingSoonPage` nao esta ligada em `App.tsx`.

Nao ha conta de teste aprovada no repositorio. As rotas do lote (`/dashboard`, `/youtube`, `/social`, `/creator`, `/games/2048`, `/games/:slug`) passam por layout autenticado.

## Fase 1 — Mapa

Estado: OBSERVADO

Padrao aplicado no arquivo da pagina ou na casca que a pagina renderiza, fora de modal filho:

- `DashboardPage.tsx`: hero `IconBadge` + `Card`/`SectionHeader` do bloco de afiliados. Raiz continua `space-y-10`, sem `animate-in`/`transform`/`filter`.
- `dashboard.parts.tsx`: historico (`ShellCard variant="table"`), eficiencia e atividade.
- `lib/dashboard.shared.tsx`: casca do card de KPI reexportada por `components/dashboard.shared.tsx`.
- `MiningAllocationPanel.tsx`: card da secao na pagina. Overlay segue `createPortal(..., document.body)`.
- `DashboardBannersCarousel.tsx`: slide e cartao do detalhe. Overlay segue `createPortal(..., document.body)`.
- `YoutubeVideoPanel.tsx`: caixas de contagem e aviso. Contagem e recompensa intactas.
- `ComingSoonPage.tsx`: `Card` + `IconBadge`.
- `Game2048Page.tsx` e `GameSessionPage.tsx`: so a classe da moldura.

Ja conformes no arquivo da pagina, sem diff neste lote: `YouTubeWatchPage.tsx`, `youtubeWatch.parts.tsx`, `SocialTab.tsx`, `socialTab.shared.tsx`, `SocialPage.tsx`, `CreatorPage.tsx`, HUD em `gameSession/components/`.

Fora de escopo, sem diff: `features/admin/**`, `features/admin-auth/**`, `DashboardEnergyTaxModal.tsx`.

## Fase 2 — Riscos

Estado: OBSERVADO

- Medir DOM autenticado com sessao forjada ou conta real esta proibido. Sem conta de teste aprovada, a medicao 320/1440 fica bloqueada.
- `space-y-10` na raiz do dashboard aplica margem em irmaos no fluxo. Os overlays de alocacao, banners e taxa de energia ja nascem em `document.body` via portal. A raiz nao recebeu `animate-in`.
- `Card` com `spacing` ligado cria `space-y-4`. Historico usa `variant="table"` sem padding forçado. Eficiencia e atividade usam `spacing="md"`.

## Fase 3 — Plano

Estado: PROPOSTO

Trocar classes de casca pelos primitivos `Card`, `IconBadge` e `SectionHeader`. Nao alterar formulas, alocacao, timers, pontuacao, canvas, cooldown ou claim. Nao criar chave i18n. Nao criar hook de teste.

## Fase 4 — Implementacao

Estado: VERIFICADO

Mudancas visuais nos 9 arquivos listados no diff. Nenhuma chave nova em `pt-BR`, `en` ou `es`. Nenhum dado novo em tela.

## Fase 5 — Verificacao

Estado: VERIFICADO no localhost. ComingSoon permanece codigo nao alcancavel.

Build, suite e typecheck (corrida anterior, commit 400de06):

- `cd client && npm run build` — exit 0.
- `cd client && npx vitest run` — 128 arquivos, 1087 testes, exit 0.
- typecheck do client — 61 erros, nenhum novo.

Medicao de DOM, so em localhost (`127.0.0.1:5174` + API `127.0.0.1:3000`). Banco `blockminer` em `127.0.0.1:5442`. Nao e `blockminer-db`. Usuario semeado nessa base e login feito pelo formulario `/login` (e-mail e senha). Nenhum cookie ou token foi escrito a mao. O processo de laboratorio subiu com os secrets de Turnstile desligados, entao o widget nao apareceu e o envio foi o POST real de login.

No Chromium, `document.scrollWidth` e `document.clientWidth` nao existem (`null`). A medida e `document.scrollingElement` (`HTML`): `scrollWidth == clientWidth`.

| Rota | 320 | 1440 |
|---|---|---|
| /dashboard | 320=320 | 1440=1440 |
| /youtube | 320=320 | 1440=1440 |
| /social | 320=320 | 1440=1440 |
| /creator | 320=320 | 1440=1440 |
| /games/2048 | 320=320 | 1440=1440 |
| /games/memory | 320=320 enquanto a sessao estava montada | 1440=1440 enquanto a sessao estava montada |

A sessao `/games/memory` saiu para `/games` em menos de 2s. A casca foi medida antes dessa saida. O handler existente de `game:error` navega para `/games`; isso nao foi alterado neste lote.

Overlays fixed que este lote tocou:

- Modal de alocacao, 320 e 1440: `parentElement === BODY`, `top` 0, `marginTop` 0.
- Modal de banner (banner local criado so para abrir o overlay, depois apagado), 320 e 1440: `parentElement === BODY`, `top` 0, `marginTop` 0.
- Menu de moeda do saldo (fixed, portal em `document.body`): `parentElement === BODY`, `marginTop` 0. O `top` medido foi 310px porque o menu abre ancorado no botao, nao e um overlay `inset-0`.

ComingSoon: `ComingSoonPage` so e exportado em `client/src/features/shell/index.ts`. Nenhuma `<Route>` aponta para ele. Codigo nao alcancavel. Nenhuma rota foi inventada para testa-lo.

## Fase 6 — Carga

Estado: BLOQUEADO

Nao ha mudanca de API, intervalo ou payload. k6 nao foi executado. Nenhum alvo de producao foi chamado.

## Fase 7 — Seguranca

Estado: BLOQUEADO

Nao ha superficie nova. Kali nao foi executado. Nenhum alvo de producao foi chamado.

## Fase 8 — Relatorio

Estado: VERIFICADO quanto ao registro. A publicacao nao foi feita.

Pendencias: `ComingSoonPage` continua sem rota. Fases 6 e 7 seguem bloqueadas: nao ha superficie nova de API nem de seguranca.
