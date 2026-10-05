# Lote 9 — casca transparency (shell)

Branch `feature/redesign-transparency-batch9` a partir de `origin/main` @ `9fa1a70`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/lote9-transparency`.
O checkout compartilhado não foi trocado.

A sidebar continua à esquerda. Desktop `w-72`. No mobile, barra superior, drawer e bottom nav no mesmo lugar. Nenhum item de menu foi criado, removido ou renomeado. Breakpoints `md` / `sm` / `min-[380px]` não mudaram.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: HEAD `9fa1a70`. `TopNav` só aparecia em `TopNav.tsx` e `TopNav.test.tsx` (5 testes). `shell/index.ts` não exporta `TopNav`. `ComingSoonPage` permanece. `ProtectedLayout` não usa o vocabulário antigo de superfície.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: trocar só classes de superfície (`border-2 border-slate-800`, `bg-slate-900/60`, sombra dura, `rounded-3xl` nos blocos, `rounded-xl` nos itens). O `h1` do Header vira `p` com a mesma classe. Backdrop e drawer mobile vão para `createPortal(document.body)`. O logo mobile ganha `min-w-0 overflow-hidden` para o hambúrguer caber em 320. Apagar o TopNav órfão.
- Pendências: nenhuma
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: `Sidebar.tsx`, `Header.tsx`, `AuthShell.tsx`, `SiteFooter.tsx`. Removidos `TopNav.tsx` e `TopNav.test.tsx`. `ProtectedLayout.tsx` sem diff.
- Evidências: sidebar desktop continua `hidden md:flex w-72`. Drawer continua `fixed top-14 bottom-16 left-0 w-72`. Bottom nav continua `md:hidden fixed bottom-0 h-16`. Header continua `hidden md:flex h-20`. O título do header é um `p`. Nenhuma chave i18n nova. `features/admin` e `features/admin-auth` intocados.
- Pendências: nenhuma
- Commit: `6fe421f`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: saiu `TopNav.test.tsx` (5 testes, 1 arquivo)
- Evidências: `cd client && npx vitest run` no tree final: 1082 passou, 0 falhou, 127 arquivos. Baseline 1087 em 128 arquivos. A queda é 5 testes e 1 arquivo, os do TopNav. Uma corrida intermediária, com a máquina carregada, falhou 1 teste já conhecido em `AdminTournamentsPage` (busca de texto); isolado, esse arquivo passou 5/5. O arquivo de admin não foi editado.
- Pendências: nenhuma
- Commit: `6fe421f`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma além da fase 2
- Evidências: `cd client && npm run build` verde. `cd client && npx tsc --noEmit -p tsconfig.json` no tree commitado: 61 erros, nenhum em shell, AuthShell ou SiteFooter. Baseline 61.
- Pendências: nenhuma
- Commit: `6fe421f`

### Fase 5 — DOM no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma no produto durante a medição. Usuário semeado no banco local `blockminer` em `127.0.0.1:5442`, login real pelo formulário em `127.0.0.1:5174`. Turnstile do processo de lab desligado (1 chave removida só no processo). Widget não renderizou. Conta apagada ao final. Nenhum token forjado.
- Evidências: `document.scrollingElement` scrollWidth == clientWidth em `/dashboard`: 320=320, 768=768, 1440=1440. Uma `h1` por tela (a da página). Hambúrguer (`aria-label` Menu) em 320: left 268, right 308, dentro da viewport. Sidebar desktop em 768 e 1440: left 0, largura 288. Drawer aberto: parent `BODY`, top 56, left 0, largura 288, marginTop 0. Backdrop: parent `BODY`, top 0, marginTop 0. O drawer lista todas as rotas do menu, incluindo Torneios, Offerwall interna, Ranking, Roadmap, Definições e Sair. Clique real chegou em `/tournaments`, `/internal-offerwall`, `/ranking`, `/roadmap` e `/settings`. Em 320 o aviso de cookies cobre a parte de baixo do drawer até "Aceitar todos" ou "Só essenciais"; o botão Aceitar todos está dentro da viewport (left 165, right 283). Login em 320: scrollWidth == clientWidth e o botão Open menu dentro da viewport (left 268, right 304).
- Pendências: o aviso de cookies não foi alterado. Ele não faz parte dos cinco arquivos deste lote.
- Commit: `6fe421f`

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
- Evidências: fases 0 a 7 acima. Nada publicado.
- Pendências: nenhuma
- Commit: este commit de docs
