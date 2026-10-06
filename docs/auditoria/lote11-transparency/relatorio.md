# Lote 11 — navbar sem fila de badges

Branch `feature/redesign-transparency-batch11` a partir de `origin/main` @ `f36a3d4`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/lote11-transparency`.
O checkout compartilhado não foi trocado. `Sidebar.tsx` não entrou no diff.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: HEAD `f36a3d4`. Os seis ícones do header eram badges `h-9 w-9` com borda, fundo primary e sombra. O subtítulo estava em azul, maiúsculo e bold. A sidebar já estava aprovada.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: trocar o badge dos seis ícones por glifo fantasma. Manter o badge do título, o gradiente, o brilho, a busca e o avatar. Devolver o subtítulo ao estilo do lote 9. Registrar na spec que barra densa não repete badge.
- Pendências: nenhuma
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: `Header.tsx`, `CommunityShortcuts.tsx`, `LanguageSwitcher.tsx`, `.maestri/spec-padrao-transparency.md`.
- Evidências: estado normal sem borda, sem fundo e sem sombra, glifo `text-slate-400`, área `h-9 w-9`. Hover `text-white` e `bg-slate-800/60`. Sino aberto `bg-slate-800 text-white`, sem borda. Focus com anel. Variante do atalho renomeada de `badge` para `ghost`. O `plain` do mobile continua `min-h-[44px] min-w-[44px]`. Subtítulo voltou a `text-[11px] text-slate-400 font-medium`. Nenhuma chave i18n nova. Sidebar intocada.
- Pendências: nenhuma
- Commit: `6f7f518`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: nenhuma de teste
- Evidências: `cd client && npx vitest run`: 1082 passou, 0 falhou, 127 arquivos. A corrida imediatamente anterior, ainda com a máquina carregada, falhou 1 teste já conhecido em `AdminTournamentsPage` (busca). Esse arquivo não foi editado.
- Pendências: nenhuma
- Commit: `6f7f518`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma além da fase 2
- Evidências: `cd client && npm run build` verde. `tsc --noEmit`: 61 erros. Baseline 61.
- Pendências: nenhuma
- Commit: `6f7f518`

### Fase 5 — DOM no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma no produto durante a medição. Usuário semeado no banco local `blockminer` em `127.0.0.1:5442`, login real pela tela em `127.0.0.1:5174`. Turnstile do processo de lab desligado. Widget não renderizou. Conta apagada ao final. Nenhum token forjado.
- Evidências: scrollWidth == clientWidth em `/dashboard`: 320, 768 e 1440. Sidebar desktop em 768 e 1440: left 0, largura 288. Os seis ícones do header, em 768 e 1440: 36×36, borda 0, sombra none, fundo transparente, glifo `rgb(148, 163, 184)`. Contraste do glifo sobre o gradiente amostrado atrás do botão: 6.35:1 em 768 e 6.02:1 em 1440, os dois acima de 3:1. Discord e Telegram no mobile, na largura em que a barra os mostra (400px): 44×44. Abaixo de 380px eles continuam ocultos pela regra que já existia. Chat, sino e menu da barra mobile são da sidebar e não foram alterados.
- Pendências: nenhuma
- Commit: `6f7f518`

### Fase 6 — Carga
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: não há endpoint novo. k6 não foi executado. Não houve chamada a blockminer.space.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 7 — Kali
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: não há superfície nova. Kali não foi executado. Lab só em localhost.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 8 — Relato
- Estado: VERIFICADO
- Mudanças: este arquivo
- Evidências: fases 0 a 7 acima. A spec agora diz que badge não se repete em fila numa barra densa. Nada publicado.
- Pendências: nenhuma
- Commit: este commit de docs
