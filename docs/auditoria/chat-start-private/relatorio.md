# Abrir conversa privada

Branch `fix/chat-start-private` a partir de `origin/main` @ `4242177`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-chat-start-private`.
O checkout compartilhado não foi trocado.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: a causa já estava apurada e foi conferida no código, sem reabrir a investigação. `GET /chat/users` devolvia `{ ok: true, usernames }` a partir das últimas 100 mensagens públicas, sem id, sem busca e sem quem nunca escreveu no público. `POST /send-private` exige `receiverId` numérico. `listSentPrivateMessages` e `listReceivedPrivateMessages` ordenavam por `createdAt` e não tinham `take`. `chat.routes.ts` permanece com `// @ts-nocheck`.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: `GET /chat/users?q=` passa a devolver `{ id, username }`, no máximo 20, com `isBanned: false` e excluindo o próprio usuário. Sem `q`, ou com menos de 3 caracteres, a lista volta vazia e o banco não é consultado. O piso 3 é o mesmo do cadastro (`REGISTER_USERNAME_MIN`), definido de novo no módulo de chat, sem importar o módulo de registro. Rate limit próprio de 20 por 60s, só nessa rota. O `select` é só `id` e `username`. A varredura de conversas ganha `take` 100 e continua ordenada no banco. No cliente, a aba Privado ganha busca mesmo com a lista vazia; escolher um resultado chama o `openConversation` que já existia. A ação da store faz debounce de 300ms.
- Pendências: nenhuma
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: `chat.config.ts`, `chat.search.ts`, `chat.repository.ts`, `chat.service.ts`, `chat.controller.ts`, `chat.routes.ts`, `ChatPanel.tsx`, `chatSearch.ts`, `game.store.ts`, chave `chat.search_users` em pt-BR, en e es.
- Evidências: a resposta de sucesso de usuários passou de `usernames: string[]` para `users: [{ id, username }]`. O corpo 500 `Unable to fetch users.` ficou. O corpo sintético de `send-private` para destinatário inexistente ficou. `// @ts-nocheck` ficou. Constantes nomeadas, com leitor de env: mínimo 3, máximo 24, limite 20, janela 60s, 20 pedidos, varredura 100. A query usa `contains` insensível a caixa, parametrizada. Linha sem username é descartada.
- Pendências: a varredura pega as 100 PMs enviadas mais recentes e as 100 recebidas mais recentes. Um par antigo some da lista se as 100 últimas de um lado forem todas com outra pessoa.
- Commit: `53ecd33`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: `tests/chat/chat.search.test.mjs` (5), `ChatPanel.test.tsx` (+1), `game.store.chat-search.test.ts` (3).
- Evidências: os 5 de `chat.search.test.mjs` passam sem banco: query curta não busca, o `select` é só `id` e `username`, banido e o próprio id entram no `where`, o texto é cortado em 24. `chat.service.test.mjs` continua com 4 passando; o arquivo importa o Prisma e por isso precisa de `DATABASE_URL` apontando para `127.0.0.1` (URL fechada, sem consulta). Suíte do client, corrida ociosa: 1098 passaram, 0 falharam, 131 arquivos. Eram 1094 em 130. A corrida em paralelo com o build estourou 82 por timeout, com a máquina carregada; a corrida seguinte, sozinha, passou os 1098, inclusive `AdminTournamentsPage`. Esse arquivo não foi editado.
- Pendências: nenhuma
- Commit: `53ecd33`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma além da fase 2
- Evidências: `cd client && npx vite build` verde. `tsc --noEmit`: 61 erros `error TS`, exit 2. Nenhum em arquivo deste lote. Baseline 61. ESLint dos arquivos de client deste lote: limpo.
- Pendências: nenhuma
- Commit: `53ecd33`

### Fase 5 — DOM no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma no produto durante a medição. Três usuários semeados no banco local `blockminer` em `127.0.0.1`, e-mail verificado: 10037 quem buscou, 10038 o destino, 10039 banido. Login real pela tela (`#identifier`, `#password`, `data-testid="login-main-form"`) em `127.0.0.1:5174`, viewport 1440. Turnstile do processo de lab desligado. Contas, arquivo de senha e servidores de lab apagados ao final. O Vite de `127.0.0.1:5173` ficou no ar. Nenhum token forjado.
- Evidências: na aba Privado, a busca pelo prefixo comum devolveu só `lab30f90550peer`. O JSON da resposta tinha as chaves `id` e `username`. O próprio usuário e o banido não apareceram. O clique abriu a conversa do zero, o envio mostrou o texto no painel de quem enviou, e a segunda conta, ao abrir o chat depois, viu o mesmo texto na conversa.
- Pendências: nenhuma
- Commit: `53ecd33`

### Fase 6 — Carga
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: a rota de busca é autenticada, limitada a 20 linhas e a 20 pedidos por minuto. k6 não foi executado. Não houve chamada a blockminer.space.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 7 — Kali
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: Kali não foi executado. Lab só em localhost.
- Pendências: nenhuma para este lote
- Commit: nenhum

### Fase 8 — Relato
- Estado: VERIFICADO
- Mudanças: este arquivo
- Evidências: fases 0 a 7 acima. Nada publicado.
- Pendências: a limitação da varredura de 100, registrada na fase 2
- Commit: este commit de docs
