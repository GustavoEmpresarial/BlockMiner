# Lote 10 — acabamento do header e da sidebar

Branch `feature/redesign-transparency-batch10` a partir de `origin/main` @ `abef68b`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/lote10-transparency`.
O checkout compartilhado não foi trocado.

A sidebar continua à esquerda. Desktop `hidden md:flex w-72`. Drawer `fixed top-14 bottom-16 left-0 w-72`. Bottom nav `h-16`. Nenhum item de menu foi criado, removido, reordenado ou renomeado. z-index do header (`z-30`) e do aside (`z-20`) permanecem.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: HEAD `abef68b`. O hero de `TransparencyPage.tsx` (seção do título) usa gradiente diagonal, sombra dupla, camada radial, badge 12×12 e pílula de status. O header tinha os seis ícones de ação sem borda. A spec em `.maestri` só descrevia o card.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: aplicar o vocabulário do hero no header e na sidebar, só em classe. Discord e Telegram recebem o badge por uma variante nova em `CommunityShortcuts`, usada só pelo header; o mobile continua no alvo de 44px. O globo é o botão do `LanguageSwitcher`. A barra cheia não leva a sombra sólida de 6px, para não vazar a viewport.
- Pendências: nenhuma
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: `Header.tsx`, `Sidebar.tsx`, `CommunityShortcuts.tsx`, `LanguageSwitcher.tsx`, `.maestri/spec-padrao-transparency.md`.
- Evidências: badges `h-9 w-9` com borda, fundo e sombra de 2px; hover intensifica sem tirar a sombra. Header com gradiente e camada radial, `h-20`, `sticky`, `z-30`, `backdrop-blur-md`. Título continua um `p`, com badge `w-10 h-10` à esquerda. Busca com sombra e halo no foco. Avatar intocado. Item ativo da sidebar com `border-2` e sombra; inativo sem borda. Título de seção com régua. Topo do logo com `border-b-2`. Logout no vocabulário slate, sem bloco vermelho. Aside desktop com gradiente mais baixo que o hero. Nenhuma chave i18n nova. Admin intocado.
- Pendências: nenhuma
- Commit: `5b72e2e`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: nenhuma de teste
- Evidências: `cd client && npx vitest run` no tree final: 1082 passou, 0 falhou, 127 arquivos. Duas corridas anteriores, ainda com a máquina carregada, falharam 1 teste já conhecido em `AdminTournamentsPage` (busca de texto). Esse arquivo não foi editado. A corrida limpa ficou 1082/127.
- Pendências: nenhuma
- Commit: `5b72e2e`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma além da fase 2
- Evidências: `cd client && npm run build` verde. `tsc --noEmit`: 61 erros. Baseline 61.
- Pendências: nenhuma
- Commit: `5b72e2e`

### Fase 5 — DOM no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma no produto durante a medição. Usuário semeado no banco local `blockminer` em `127.0.0.1:5442`, login real pelo formulário em `127.0.0.1:5174`. Turnstile do processo de lab desligado. Widget não renderizou. Conta apagada ao final. Nenhum token forjado.
- Evidências: `scrollingElement` scrollWidth == clientWidth em `/dashboard`: 320, 768 e 1440. Hambúrguer em 320: left 268, right 308, dentro da viewport. Drawer aberto: parent `BODY`, top 56, left 0, largura 288, marginTop 0. Backdrop: parent `BODY`, top 0, marginTop 0. Sidebar desktop em 768 e 1440: left 0, largura 288, `position: sticky`. Header `position: sticky`. Uma `h1` em `/dashboard`.
- Pendências: nenhuma
- Commit: `5b72e2e`

### Fase 6 — Carga
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: não há endpoint novo. k6 não foi executado. Não houve chamada a blockminer.space.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 7 — Kali
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: não há superfície de segurança nova. Kali não foi executado. Lab só em localhost.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 8 — Relato
- Estado: VERIFICADO
- Mudanças: este arquivo
- Evidências: fases 0 a 7 acima. A spec agora inclui a receita do hero. Nada publicado.
- Pendências: nenhuma
- Commit: este commit de docs
