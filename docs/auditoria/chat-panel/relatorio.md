# Painel de chat

Branch `feature/chat-panel` a partir de `origin/main` @ `8bee56a`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/chat-panel`.
O checkout compartilhado não foi trocado.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: HEAD `8bee56a`. `toggleChat` só inverte `isChatOpen` e zera `hasMention`. Nenhum componente lia esse estado. A API em `server/modules/chat/chat.routes.ts` já cobre público, privado e conversas. `buildChatTimeline` já agrupa por dia. O bundle legado `client/spa-compat-115/index-inv2plus115.js` tem a tela antiga, fora do histórico git deste snapshot.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: um painel em `client/src/features/shell/chat/`, montado pelo `ProtectedLayout`, visível só com `isChatOpen`, portal em `document.body`. Público via `buildChatTimeline` e `sendMessage`. Privado via conversas existentes e `sendPrivateMessage`. Texto puro, sem HTML. `hasMention` continua sendo zerado só pela store.
- Pendências: recursos do bundle que não entram neste lote, listados na fase 8.
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: `ChatPanel.tsx`, `chatPanel.logic.ts`, `ProtectedLayout.tsx`, atributo `data-chat-toggle` no botão de chat do header e da sidebar, namespace `chat` em pt-BR, en e es.
- Evidências: o painel usa `rounded-3xl`, `border-2 border-slate-800`, `bg-slate-900/60` e `shadow-[4px_4px_0px_#000000]`. Um `IconBadge` no cabeçalho. As abas são `TabPills`, não uma fila de badges. Mensagem de usuário passa por `decodeLegacyChatEntities` e vai para um nó de texto. E-mail, id interno e `replyTo` não são renderizados. Erro da API aparece; 429 e e-mail não verificado têm texto próprio, sem retry. O painel não chama `clearMention`.
- Pendências: nenhuma
- Commit: `9c721dd`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: `ChatPanel.test.tsx` (7) e `chatOpenState.test.ts` (1).
- Evidências: a corrida cheia logo após o build falhou 1 teste já conhecido de `AdminTournamentsPage` (busca), com a máquina carregada. Esse arquivo não foi editado. A corrida seguinte, ociosa: 1093 passaram, 0 falharam, 130 arquivos. Eram 1085 em 128 antes deste lote. Entrou 8 testes em 2 arquivos. Cobrem painel fechado, painel aberto, envio, erro da API, 429, e-mail não verificado, Escape, clique fora, privado sem vazar id, e `openChat`/`toggleChat` zerando `hasMention`.
- Pendências: nenhuma
- Commit: `9c721dd`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma além da fase 2
- Evidências: `cd client && npx vite build` verde. `tsc --noEmit`: 61 erros. Nenhum em arquivo deste lote. Baseline 61.
- Pendências: nenhuma
- Commit: `9c721dd`

### Fase 5 — DOM no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma no produto durante a medição. Usuário semeado no banco local `blockminer` em `127.0.0.1:5442`, com e-mail verificado, login real pela tela em `127.0.0.1:5174`. Turnstile do processo de lab desligado. Widget não renderizou. Conta apagada ao final. Nenhum token forjado.
- Evidências: o botão de chat abriu o diálogo. Uma mensagem foi enviada e apareceu no painel. Escape fechou. Clique fora fechou. Painel: pai `BODY`, `position: fixed`, `clientHeight` 508, retângulo 384×512 dentro da viewport em 1440. Com o painel aberto, `scrollWidth == clientWidth` em 320, 768 e 1440. Nas três larguras o pai continuou `BODY` e o painel continuou dentro da viewport, com `clientHeight` 508.
- Pendências: nenhuma
- Commit: `9c721dd`

### Fase 6 — Carga
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: não há endpoint novo. k6 não foi executado. Não houve chamada a blockminer.space.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 7 — Kali
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: a superfície de API já existia. Kali não foi executado. Lab só em localhost.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 8 — Relato
- Estado: VERIFICADO
- Mudanças: este arquivo
- Evidências: fases 0 a 7 acima. Nada publicado.

No bundle legado, o chat também tinha o que este lote não implementou:
- resposta, com citação de `replyTo` e o estado "respondendo a"
- botão de mencionar o usuário
- link para ver a sala do usuário
- texto de cliente para mensagem longa demais (`shell.chat_too_long`); a API já recusa e o painel mostra a mensagem dela

Na janela da tela antiga não há emoji, upload, moderação nem bloqueio.
- Pendências: essas quatro peças, se o dono quiser
- Commit: este commit de docs
