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

Estado: VERIFICADO para build, suite e typecheck. BLOQUEADO para DOM e geometria de modal.

- `cd client && npm run build` — exit 0 (vite v7.3.6, 17.90s).
- `cd client && npx vitest run` — 128 arquivos, 1087 testes, exit 0.
- `npx tsc --noEmit -p client/tsconfig.json` — 61 erros, nenhum novo nos arquivos do lote. Os tres erros em `Game2048Page.tsx` (`@game2048/engine` e `FeatureTFunction`) ja estavam na baseline.
- DOM 320 e 1440, `scrollWidth == clientWidth`, nas 7 rotas: BLOQUEADO. Nao existe conta de teste aprovada. Nao foi usada conta real nem token forjado.
- Geometria dos modais de alocacao e banners (`parentElement === BODY`, `top` 0, `marginTop` 0): BLOQUEADO pelo mesmo motivo. O codigo continua montando esses overlays com `createPortal(..., document.body)`.

## Fase 6 — Carga

Estado: BLOQUEADO

Nao ha mudanca de API, intervalo ou payload. k6 nao foi executado. Nenhum alvo de producao foi chamado.

## Fase 7 — Seguranca

Estado: BLOQUEADO

Nao ha superficie nova. Kali nao foi executado. Nenhum alvo de producao foi chamado.

## Fase 8 — Relatorio

Estado: VERIFICADO quanto ao registro. A publicacao nao foi feita.

Pendencias: medicao de viewport e geometria de modal assim que houver conta de teste aprovada. `ComingSoonPage` nao tem rota em `App.tsx`.
