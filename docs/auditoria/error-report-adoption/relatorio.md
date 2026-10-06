# Adoção de reportError em cinco controllers

Branch `fix/error-report-adoption` a partir de `origin/main` @ `4242177`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-error-report-adoption`.
O checkout compartilhado não foi trocado.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: `reportError` já existe em `server/core/errors/` e não lança. O README desse diretório manda usá-lo no catch no lugar de `log.error`. O modelo local é `failed()` em `tournaments.controller.ts`. O login classifica Prisma antes do 500 genérico. Os cinco controllers deste lote ainda faziam `log.error(..., { error: String(e) })` e respondiam 500 sem `errorId`.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: helper local em cada controller, código estável no `*.errors.ts` do próprio módulo, `classifyInfrastructureError` só para marcar a categoria `DATABASE`. Status HTTP e o corpo que já existia permanecem. O JSON ganha `errorId`. O postback do offerwall.me continua `ERROR: Internal` e o do multiwall continua `er`.
- Pendências: nenhuma
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: os cinco controllers e o `*.errors.ts` de cada um. Offer-events, bm-captcha e multiwall não tinham arquivo de códigos; o arquivo foi criado dentro do módulo, não um mapa central.
- Evidências: `respondPrismaAwareError` não foi usado. Ele trocaria o status para 503 e substituiria a mensagem do módulo. A trava deste lote é não mudar status nem formato. A classificação de banco entra só na categoria do registro. Contexto do `reportError`: `userId` numérico nas rotas autenticadas, e objeto vazio no postback. Sem body, sem header, sem assinatura.
- Pendências: os outros controllers que ainda usam `log.error` ficam para outro lote
- Commit: `dd1a410`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: `tests/offer-events/offer-events.controller.report.test.mjs`.
- Evidências: o teste sobe o controller em `127.0.0.1` com `DATABASE_URL` apontando para `127.0.0.1:1`, sem conta e sem token. `GET` devolve 500, corpo `{ ok: false, message: "Unable to load offer events.", errorId }` e nada além dessas três chaves. `tests/http/spaStatic.test.mjs` 3, `tests/core/siteMaintenance.test.mjs` 10, `tests/security/error-redaction.test.mjs` verde, `tests/core/error-reporter.test.mjs` verde. `setupHttpStack.test.mjs` 6, com a mesma URL local fechada, porque o arquivo importa o Prisma e o worktree não tem `.env`.
- Pendências: nenhuma
- Commit: `dd1a410`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma em `client/`
- Evidências: `cd client && npx vite build` verde. `tsc --noEmit`: 61 erros. Nenhum em arquivo deste lote. Baseline 61. `npx vitest run`: 1093 passaram e 1 falhou no teste já conhecido de busca em `AdminTournamentsPage`. Isolado, esse arquivo passou 5/5. Nada de admin foi editado. Suíte do client: 1094 em 130.
- Pendências: nenhuma
- Commit: `dd1a410`

### Fase 5 — Log no localhost
- Estado: VERIFICADO
- Mudanças: nenhuma no produto durante a medição. Processo só do teste, banco em `127.0.0.1:1`, sem conta real e sem token.
- Evidências: a linha que saiu no stdout foi `message: OFFER_EVENTS_LIST_FAILED`, `error_id: err_muwx534l54cdf9a1b8`, `fingerprint: fp_467c230042`, `category: DATABASE`, `module: offer-events`, `operation: listActiveOfferEvents`, `request_id: proof-offer-events-1`, `context: { userId: 1 }`. O stack ficou nessa linha. A resposta HTTP não teve stack, nem `prisma`, nem `ECONNREFUSED`. O `errorId` da resposta foi o mesmo `err_muwx534l54cdf9a1b8`.
- Pendências: nenhuma
- Commit: `dd1a410`

### Fase 6 — Carga
- Estado: BLOQUEADO
- Mudanças: nenhuma
- Evidências: não há endpoint novo. k6 não foi executado. Não houve chamada a blockminer.space.
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
- Evidências: fases 0 a 7 acima. Nada publicado. O postback de parceiro não mudou de corpo.
- Pendências: os demais catches com `String(e)` em `server/modules`
- Commit: este commit de docs
