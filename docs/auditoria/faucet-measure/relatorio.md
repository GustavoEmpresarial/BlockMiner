# Medição do faucet

Branch `fix/faucet-measure` a partir de `origin/main` @ `4242177`.
Worktree: `/home/gustavo/Documentos/BlockMiner2.1/fix-faucet-measure`.
O checkout compartilhado não foi trocado.

## SQL

Aplicado só no banco local `blockminer` em `127.0.0.1`, para as duas linhas de lab existirem. Não foi aplicado em outro lugar. A coluna ficou, porque removê-la seria destrutivo.

```sql
ALTER TABLE "faucet_partner_visits" ADD COLUMN "source" TEXT;
```

Nullable, sem default. Linha antiga continua `NULL` e o claim registra `unknown`.

## V2.50

### Fase 0 — Reconhecimento
- Estado: OBSERVADO
- Mudanças: nenhuma
- Evidências: `startPartnerVisitForUser` recebe só `userId`. O único gate é `FAUCET_PARTNER_WAIT_MS = 10_000`. O listener de `blur` em `FaucetPage.tsx` chama `startPartner` sem clique no banner. A URL zerads está no cliente. `POST /faucet/claim` não tem Turnstile. `req.auditContext` já traz `ipHash`, `userAgent` e `correlationId`.
- Pendências: nenhuma
- Commit: nenhum

### Fase 1 — Proposta
- Estado: PROPOSTO
- Mudanças: nenhuma ainda
- Evidências: coluna `source` nullable. Body opcional `source` com `click`, `blur` ou, na ausência, `unknown`. O claim, depois de conceder, emite um info com `userId`, `msSinceVisitOpened`, `msSinceEligible`, `source`, `userAgent`, `ipHash` e o `correlationId` que já vinha no contexto. Sem hash novo e sem o IP cru. Falha do registro não altera o resultado do claim.
- Pendências: nenhuma
- Commit: nenhum

### Fase 2 — Implementação
- Estado: VERIFICADO
- Mudanças: `faucet.measure.ts`, `faucet.service.ts`, `faucet.repository.ts`, `faucet.controller.ts`, `FaucetPage.tsx`, schema e a migration acima.
- Evidências: `FAUCET_PARTNER_WAIT_MS` continua `10_000`. A rota `POST /claim` continua sem Turnstile. Valor fora de `click`/`blur` vira `unknown` e a visita abre mesmo assim. A escrita do `source` fica fora do upsert da visita e dentro de try/catch. A medição do claim também. `emitFaucetClaimMeasurement` engole erro do logger.
- Pendências: nenhuma
- Commit: `1f080ec`

### Fase 3 — Testes
- Estado: VERIFICADO
- Mudanças: `tests/faucet/faucet.measure.test.mjs` (5).
- Evidências: `tests/faucet` inteiro, 37 passaram, 0 falharam. Cobrem source ausente, `click`/`blur`, os dois relógios, `null` virando `unknown`, e um sink que lança sem escapar. Suíte do client: 1094 testes em 130 arquivos. A corrida cheia falhou 1, o `AdminTournamentsPage` "filtra a lista por busca de texto", arquivo não editado. A corrida isolada seguinte passou 5/5.
- Pendências: nenhuma
- Commit: `1f080ec`

### Fase 4 — Build e typecheck
- Estado: VERIFICADO
- Mudanças: nenhuma além da fase 2
- Evidências: `cd client && npx vite build` verde. `tsc --noEmit`: 61 erros `error TS`, exit 2. Nenhum em arquivo deste lote. ESLint de `FaucetPage.tsx`: 0 erros. Os warnings de hook nesse arquivo já eram do timer e do listener.
- Pendências: nenhuma
- Commit: `1f080ec`

### Fase 5 — DOM no localhost
- Estado: VERIFICADO
- Mudanças: a coluna `source` no banco local, descrita acima. Usuários semeados 10040 (clique) e 10041 (blur), e-mail verificado, login real pela tela em `127.0.0.1:5174`. Turnstile do processo de lab desligado. `window.open` foi interceptado e o host zerads foi abortado, para o lab não depender da rede do anúncio; o botão "Abrir patrocinador" mesmo assim enviou `source: click`. Contas e senha apagadas. Vite de `127.0.0.1:5173` ficou no ar. Nenhum token forjado.
- Evidências: as duas linhas, copiadas do stdout do processo.

```json
{"level":"info","message":"faucet.claim.measured","category":"App:faucet.service","timestamp":"2026-10-06T17:25:58.396Z","details":{"userId":10040,"msSinceVisitOpened":10128,"msSinceEligible":128,"source":"click","userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36","ipHash":"3e48ef9d22e096da6838540fb846999890462c8a32730a4f7a5eaee6945315f7","correlationId":"cfa6e985-2d28-4e7b-9f70-5a99f7c13453"}}
```

```json
{"level":"info","message":"faucet.claim.measured","category":"App:faucet.service","timestamp":"2026-10-06T17:26:13.114Z","details":{"userId":10041,"msSinceVisitOpened":10171,"msSinceEligible":171,"source":"blur","userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36","ipHash":"3e48ef9d22e096da6838540fb846999890462c8a32730a4f7a5eaee6945315f7","correlationId":"639a4102-82b1-42b0-9390-a3ff6a12b21e"}}
```

`msSinceEligible` de 128ms e 171ms é o intervalo entre o fim dos 10s no servidor e o clique em "Resgatar Poder" assim que o botão habilitou. Os dois `ipHash` são o mesmo porque o contexto de auditoria hasheia o IP do lab, e este lote não criou outro hash.
- Pendências: nenhuma
- Commit: `1f080ec`

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
- Evidências: fases 0 a 7 acima. Nada publicado.

Não subi o tempo nem pus Turnstile no claim. O botão habilita no instante em que o timer zera, então uma massa perto de zero mistura script com gente apressada. A parcela `source: blur` é o sinal mais limpo de quem nunca clicou no anúncio. Com a distribuição real, a próxima decisão é do dono: subir o tempo, exigir postback, ou Turnstile no claim. Eu não bloquearia ninguém antes desse número.
- Pendências: a migration ainda precisa ser aplicada fora deste lab
- Commit: este commit de docs
