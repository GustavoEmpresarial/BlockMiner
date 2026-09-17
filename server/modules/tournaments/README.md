# Tournaments — premiação e encerramento

Documentação do caminho crítico: como um torneio pontua, ranqueia, paga e
encerra — e o que fazer quando não paga.

> **Contexto:** este documento nasceu de um incidente real em que jogadores em
> massa não receberam prêmios. Se você for mexer em `finalizeTournament`, leia
> a seção "Por que em fases" antes — as decisões ali são cicatriz, não estilo.

## Fluxo

```
cron lifecycle (60s)
        │
        │  status=ACTIVE AND endsAt <= now
        ▼
finalizeTournament(id)
        │
        ├─ Fase A  pontuação            reconcile / computeScores      sem tx
        │
        ├─ Fase B  ranking              assignRanks → persistRanks     tx curtas em lote (200)
        │
        ├─ Fase C  premiação            claim + grant por vencedor     1 tx curta POR VENCEDOR
        │             │
        │             ├─ POL/BLK  ──► userRewardInbox (pending)  ──► jogador coleta
        │             ├─ MACHINE  ──► userRewardInbox (pending)  ──► jogador coleta
        │             └─ BOOST    ──► userPowerGame              ──► aplicado na hora
        │
        └─ Fase D  encerramento         status=ENDED                   sempre
                        │
                        └─ recurring? ──► gera o próximo ciclo
```

Repare na assimetria da Fase C: **MINING_BOOST não passa pelo inbox**, é
aplicado direto em `userPowerGame`. Os outros três tipos viram item pendente
que o jogador precisa coletar.

## Por que em fases

A versão anterior envolvia **tudo** numa única `prisma.$transaction`: o loop
sobre todas as entries, todos os grants e o `status=ENDED`.

O orçamento de transação interativa é 15s (`PRISMA_TX_TIMEOUT_MS`, em
`core/database/prisma.ts`). Com entries suficientes:

```
tx estoura 15s
   ↓
P2028 Transaction already closed
   ↓
rollback de TUDO — nenhum prêmio, status continua ACTIVE
   ↓
cron tenta de novo em 60s
   ↓
estoura de novo
   ↓
loop infinito. Ninguém recebe. Para sempre.
```

As três regras que saíram disso e **não devem ser desfeitas**:

1. **Nenhuma transação longa.** Ranking em lotes, premiação por vencedor.
2. **Falha isolada.** Um prêmio quebrado não pode custar o prêmio dos outros —
   por isso o `try/catch` fica *fora* da transação, por vencedor.
3. **A Fase D roda sempre.** Encerrar mesmo com falha parcial é o que quebra o
   loop de retry. Vencedor não pago fica `rewardGranted=false` e é reportado
   como `TOURNAMENT_FINALIZE_PARTIAL`, não engolido.

## Idempotência

A primitiva é **uma só**, e vale para todos os tipos de prêmio:

```ts
updateMany({ where: { id: entry.id, rewardGranted: false },
             data:  { rewardGranted: true, rewardGrantedAt } })
```

`count === 1` → este processo ganhou a corrida e vai conceder.
`count === 0` → alguém já pagou; segue em frente.

O claim e a concessão vivem na **mesma transação curta**. Se a concessão lançar,
o claim reverte junto e a entry continua pagável. É o que garante que nunca
mais exista o estado "marcado como pago, nada concedido".

> Havia antes uma segunda dedupe contando linhas em `userRewardInbox` por
> `metaJson.entryId`. Era redundante com o claim atômico, não cobria
> MINING_BOOST (que não cria linha de inbox) e custava uma consulta JSON-path
> não indexada por vencedor. Foi removida de propósito — não a traga de volta.

## Prêmio inválido nunca é silêncio

`resolvePrizeGrant` (em `tournaments.prize-resolution.ts`) é **total**: todo
prêmio vira ou uma concessão concreta ou um `{ kind: "invalid", code }`.

Isso existe porque a implementação anterior fazia:

```ts
if (prize.prizeType === "POL" && prize.polAmount) { … }
```

Com `polAmount` nulo ou zero, nenhum ramo casava, a função **retornava sem
conceder nada** — e a entry já tinha sido marcada como paga. Prêmio perdido em
definitivo, sem log, sem erro.

Defesa em profundidade: `validatePrizeInput` roda em
`adminCreateTournament`/`adminUpdateTournament` e recusa o prêmio impagável
**na escrita**, com 400 e código estável. O caminho de pagamento nunca deveria
encontrar um.

## Códigos de erro

Definidos em `tournaments.errors.ts`. São contrato — renomear quebra busca de
log e histórico.

| Código | Severity / Impact | Significa |
|---|---|---|
| `TOURNAMENT_PRIZE_INVALID_AMOUNT` | ERROR / HIGH | prêmio com valor nulo, zero ou negativo |
| `TOURNAMENT_PRIZE_MINER_MISSING` | ERROR / HIGH | prêmio MACHINE sem linha de catálogo do miner |
| `TOURNAMENT_PRIZE_UNSUPPORTED_TYPE` | ERROR / HIGH | `prizeType` fora do conjunto suportado |
| `TOURNAMENT_GRANT_FAILED` | ERROR / HIGH | a concessão lançou; claim revertido, entry ainda pagável |
| `TOURNAMENT_FINALIZE_PARTIAL` | CRITICAL / CRITICAL | torneio fechou com vencedor não pago |
| `TOURNAMENT_RECURRING_SPAWN_FAILED` | CRITICAL / HIGH | ciclo fechou mas o próximo não foi criado — a série para aqui e nada tenta de novo |
| `TOURNAMENT_LIFECYCLE_TICK_FAILED` | ERROR / HIGH | o tick do cron falhou antes de chegar nos torneios |

Todos passam por `reportError` (ver `core/errors/README.md`), então carregam
`error_id`, `fingerprint`, `severity`, `impact` e contexto redigido.

### Caminho de leitura (HTTP)

| Código | Severity / Impact | Endpoint |
|---|---|---|
| `TOURNAMENT_LIST_FAILED` | ERROR / MEDIUM | `GET /api/tournaments` |
| `TOURNAMENT_DETAIL_FAILED` | ERROR / MEDIUM | `GET /api/tournaments/:id` |
| `TOURNAMENT_MY_RANK_FAILED` | ERROR / MEDIUM | `GET /api/tournaments/:id/my-rank` |
| `TOURNAMENT_MY_HISTORY_FAILED` | ERROR / MEDIUM | `GET /api/tournaments/my-history` |
| `TOURNAMENT_MY_SCORE_BREAKDOWN_FAILED` | ERROR / MEDIUM | `GET /api/tournaments/:id/my-score-breakdown` |

Um código por endpoint de propósito: o `fingerprint` é derivado do código, então
"só o `/:id` está quebrado" fica legível no log sem precisar ler contexto.

Esses cinco `catch` eram `catch { res.status(500) }` — a exceção era descartada
inteira, sem linha de log. Uma página de torneio quebrada em produção não
deixava rastro nenhum. Agora o 500 devolve `errorId` no corpo, e é esse código
que o suporte pede ao jogador.

> A mensagem do 500 continua genérica de propósito. `GET /:id` **não exige
> autenticação** — detalhe de erro interno ali seria vazamento para anônimo.

## Runbook — "a galera não recebeu"

**1. O torneio chegou a fechar?**

```sql
SELECT id, name, status, "endsAt"
FROM "Tournament"
WHERE status = 'ACTIVE' AND "endsAt" < now();
```

Linhas aqui = torneios travados. Cada uma é o loop de retry. Procure
`TOURNAMENT_FINALIZE_PARTIAL` ou `cron.finalizeTournament` no log com esse
`tournamentId`.

**2. Quem foi marcado como pago mas não recebeu?**

```sql
SELECT e.id, e."userId", e.rank
FROM "TournamentEntry" e
LEFT JOIN "UserRewardInbox" i
  ON i.source = 'tournament'
 AND i."metaJson"->>'entryId' = e.id::text
WHERE e."tournamentId" = $1
  AND e."rewardGranted" = true
  AND i.id IS NULL;
```

Resultado não-vazio para prêmio POL/BLK/MACHINE = sintoma do bug antigo.
Para MINING_BOOST isso é **esperado** (vai em `userPowerGame`, não no inbox).

**3. O prêmio é pagável?**

```sql
SELECT * FROM "TournamentPrize" WHERE "tournamentId" = $1;
```

Procure `polAmount`/`blkAmount` nulos ou zero, `boostHours` ausente,
`minerId` apontando para miner deletado.

**4. Recuperação.** Vencedor com `rewardGranted=false` volta a ser pago se o
torneio for re-finalizado. Vencedor com `rewardGranted=true` sem concessão
precisa de correção manual — o claim atômico impede reprocessamento.

## Cron

| Job | Intervalo | Env |
|---|---|---|
| score updater | 2 min | `TOURNAMENT_SCORE_INTERVAL_MS` |
| lifecycle (ativa/finaliza) | 60 s | `TOURNAMENT_LIFECYCLE_INTERVAL_MS` |
| outbox | 5 s | `TOURNAMENT_OUTBOX_INTERVAL_MS` |
| reconcile | 15 min | `TOURNAMENT_RECONCILE_INTERVAL_MS` |

Lote de ranking: `TOURNAMENT_RANK_BATCH_SIZE` (default 200).

### Guarda de reentrância

Os quatro jobs eram agendados com `setInterval` puro. `setInterval` **não
espera** o callback anterior terminar, então um tick mais lento que o próprio
intervalo rodava concorrente consigo mesmo. No lifecycle (60s) isso significa
dois `finalizeTournament` no **mesmo** torneio:

```
tick 1  ─── finalize #42 ──────────────────────────────►
tick 2        └─ 60s depois ─── finalize #42 ───────────►

ambos leem status=ACTIVE antes de qualquer um gravar ENDED
        ↓
ambos entram no ramo `recurring`
        ↓
prisma.tournament.create() roda DUAS vezes
        ↓
a série bifurca em dois torneios paralelos de mesmo nome
```

O claim atômico de `rewardGranted` impede pagar o prêmio duas vezes, mas não
cobria nada disso. Todo job agora passa por `nonOverlapping`
(`tournaments.tick-guard.ts`): tick que chega com o anterior em voo é
**descartado**, não enfileirado — são jobs periódicos, o próximo intervalo
cobre o que este faria, e enfileirar só acumularia trabalho já velho.

Tick descartado vira `log.warn("tournaments.cron.tick_skipped")`. Não é erro —
descartar é o comportamento correto. Mas skip **recorrente** significa job
durando mais que o intervalo: é o sinal para investigar antes de virar travamento.

> **Escopo: por processo.** Isso não torna o cron seguro em duas réplicas.
> Com mais de uma instância rodando `startTournamentsCron`, a corrida do
> `recurring` volta inteira. Resolver de verdade exige lock no banco
> (advisory lock ou `SELECT … FOR UPDATE` no torneio antes da Fase D).

| Código | Severity / Impact | Significa |
|---|---|---|
| `TOURNAMENT_SCORE_UPDATE_FAILED` | ERROR / MEDIUM | um torneio falhou ao repontuar; o loop segue nos outros |
| `TOURNAMENT_SCORE_UPDATER_TICK_FAILED` | ERROR / HIGH | nada repontua — todo board em lote congelado |
| `TOURNAMENT_RECONCILE_TICK_FAILED` | ERROR / HIGH | a rede que pega drift de score está fora |
| `TOURNAMENT_OUTBOX_TICK_FAILED` | ERROR / HIGH | `BLOCKS_MINED` para de avançar |
| `TOURNAMENT_WINDOW_ALIGN_FAILED` | ERROR / HIGH | janela fora do limite UTC = período errado = vencedor errado |
| `TOURNAMENT_MINIGAME_BACKFILL_FAILED` | ERROR / HIGH | torneio de minigame começa do zero, perde os wins anteriores |

O outbox era `processTournamentOutboxBatch().catch(() => {})` nos dois pontos de
chamada — engolia a falha inteira. Ele é dono da pontuação de `BLOCKS_MINED`:
uma falha persistente congelava esses leaderboards sem **nenhuma** linha de log.

> Havia um quinto job, `runShadowValidation`, rodando de hora em hora. Ele
> chamava `runOfferwallShadowValidation`, que retorna `[]` incondicionalmente —
> era no-op puro. Removido.
>
> A nota anterior aqui dizia que as funções de shadow validation ficavam "porque
> podem ter outros chamadores". Varredura de 2026-09-17: `runOfferwallShadowValidation`
> tinha **zero** chamadores em todo o repo, e foi removida.
> `listShadowValidationAlerts` continua, mas também retorna `[]` sempre — e é
> servida por `GET /admin/tournaments/:id/shadow-alerts`. Esse endpoint admin
> responde lista vazia por construção; ou a feature volta, ou rota e função saem
> juntas.

## Testes

```
tests/tournaments/prize-resolution.test.mjs        decisão de prêmio + ranking (puro)
tests/tournaments/pure-modules.test.mjs            helpers, flags, presentation, janelas, providers, types (puro)
tests/tournaments/tick-guard.test.mjs              reentrância do cron + single-flight (puro)
tests/tournaments/utc-boundary.test.mjs            fronteira 00:00 UTC (puro)
tests/tournaments/controller.test.mjs              rotas de leitura, service mockado (sem banco)
tests/tournaments/tournament-window-align.test.mjs
tests/tournaments/tournaments.finalize.smoke.test.mjs   finalize ponta a ponta (PRECISA de banco)
tests/security/error-redaction.test.mjs            redação do contexto de erro
```

`controller.test.mjs` usa `mock.module`, então o script `test` do projeto agora
passa `--experimental-test-module-mocks`. Há também `npm run test:coverage`.

**Armadilha do node:test:** um `await import(...)` no meio do arquivo registra
todo teste abaixo dele tarde demais — eles **não rodam e ainda são reportados
como sucesso**. Todos os arquivos acima concentram os imports num único bloco no
topo. Já custou 4 testes fantasmas aqui.

Ao medir cobertura, mockar e reimportar o módulo por teste com query de
cache-busting (`?t=…`) cria um módulo novo por teste — o arquivo real aparece
quase descoberto por mais que seja exercitado. Mock uma vez, importe uma vez,
troque o comportamento por variável.

### Cobertura (Node 22, `--experimental-test-coverage`)

Em 100% de linha, ramo e função:

```
tournament-window.ts  tournaments.helpers.ts   tournaments.flags.ts
deposit-presentation.ts  tournaments.providers.ts  tournaments.types.ts
tournaments.errors.ts  tournaments.valid-metrics.ts  tournaments.tick-guard.ts
tournaments.routes.ts  tournaments.admin.routes.ts
```

`tournaments.prize-resolution.ts` e `tournaments.controller.ts` estão em 100%
de função e ~98% de linha. O resto que aparece descoberto neles são linhas de
**declaração de tipo** e de **argumento de objeto literal**, que o source-map do
tsx atribui a ramos inexistentes. Confirmado: adicionar caso que exercita a
tabela-verdade inteira não move o número. Não persiga esses pontos.

O restante do módulo (service, engine, repository, admin.controller,
score-computation, audit, metrics, projection, outbox, realtime, scorers,
scoring-config, socket, claim-scorers, minigame-backfill, actions, cache, cron,
deposit-score e o grupo `ranking.*`) segue entre 35% e 75%. Todos dependem de
Prisma: o `DATABASE_URL` do `.env` deve apontar para `blockminer-current-db`
(`127.0.0.1:5442`). Por um tempo apontava para `blockminer-restore-test:5439`
(container morto) e os smoke tests com banco pulavam em silêncio — inclusive
os que já existiam antes desta passada.

Convenção do projeto: teste `.mjs` com `node:test`, importando o `.ts` direto
via `await import(...)`.

### Lacunas conhecidas

Os três cenários de finalize que faltavam estão em
`tournaments.finalize.smoke.test.mjs` — cobrem:

1. finalizar duas vezes → `rewarded` é 0 na segunda, sem linha duplicada ✅
2. um prêmio MACHINE quebrado não impede os demais vencedores (regressão F3) ✅
3. cron e o botão admin finalizando juntos geram **um** próximo ciclo, não dois ✅

Com `TOURNAMENT_ENGINE_V2=1`, os smokes semeiam `TournamentAction` dentro da
janela fechada (não `tournamentEntry.score` direto): o finalize reconcilia e
apaga entries sem fonte real.

Ainda sem cobertura: torneio com muitas entries fechando sem `P2028` (regressão
F1). Precisa de volume de dados, não só de um banco.

## Segurança — achados em aberto

Levantados em auditoria (2026-09-17) e **não corrigidos**: cada um muda contrato
de API ou comportamento de produto, então é decisão de produto, não de refactor.

**1. `GET /api/tournaments/:id` é anônimo e devolve nome real.**
A rota não tem `requireAuth` (`tournaments.routes.ts`), e
`getTournamentWithLeaderboard` seleciona `user: { id, username, name }` para o
top 100. Qualquer um sem login coleta `userId` interno + `username` + **nome
real** de todo mundo no pódio. É exposição excessiva de dados (e material para
enumeração de usuário).
Correção mínima: tirar `name` do payload público. Não fiz porque não consegui
verificar se o frontend renderiza esse campo.

**2. A mesma rota anônima dispara recomputação de score.**
Em `getTournamentWithLeaderboard`, torneio `ACTIVE` com
`isTournamentSkipGetRecomputeEnabled()` desligado chama
`computeScoresForTournament` **a cada GET**. Um endpoint sem autenticação que
provoca varredura de pontuação é amplificação: o rate limit é 120 req/min e o
custo por request é uma repontuação inteira.
Correção: servir sempre do cache/reconcile no caminho anônimo e deixar a
recomputação para o cron. Envolve decidir sobre `TOURNAMENT_SKIP_GET_RECOMPUTE`.

**3. `tournaments.routes.ts` está com `@ts-nocheck`.**
O cabeçalho do arquivo diz que ele nunca foi commitado e foi reconstruído do
`dist/` compilado em 2026-09-11, com produção rodando de build cache velho.
Enquanto o `@ts-nocheck` estiver lá, **toda a superfície de rotas está fora do
typecheck** — inclusive a ordem de middleware. Por isso o controller confere
`req.user` em vez de confiar no `!` do `requireAuth`.

**4. `page` do admin não tem clamp.**
`adminGetEntries(tournamentId, page = 1, limit = 50)`: o handler `entries`
**não** repassa `limit` da query — então não há exaustão de memória por
`?limit=`. Mas passa `page` cru (`parseInt(req.query.page)`), e `skip` é
`(page - 1) * limit`. `?page=0` ou `?page=-5` produz `skip` negativo, que o
Prisma rejeita: vira 500 com `String(err)` no corpo.

**6. O controller admin devolve o erro cru e não reporta nada.**
`tournaments.admin.controller.ts` responde `{ message: String(err) }` em catch
(ex.: linhas 230, 239, 272), o que entrega texto de erro do Prisma — nome de
tabela, de coluna — ao cliente. É atrás de `requireAdminAuth`, então o risco é
menor, mas continua sendo detalhe interno cruzando a fronteira. E **nenhum**
catch ali chama `reportError`: o caminho admin tem o mesmo buraco de
observabilidade que o controller de jogador tinha. Não migrei junto para manter
esta passada revisável; é o próximo lote óbvio.

**7. Rotas admin não têm rate limit.**
`tournaments.routes.ts` aplica `createRateLimiter({ windowMs: 60_000, max: 120 })`
em toda rota de jogador. `tournaments.admin.routes.ts` não aplica nenhum. O
`POST /:id/finalize` dispara uma finalização completa por request.

**5. `adminUpdateTournament` aceita editar torneio em andamento.**
`metric`, `startsAt` e `endsAt` são alteráveis enquanto o status é `ACTIVE`, e
`data.prizes` faz `deleteMany` + recriar. Trocar a métrica no meio repontua o
torneio inteiro por outra regra; trocar as faixas de prêmio depois do ranking
muda quem ganha o quê. O guard existente só barra `ENDED`/`CANCELLED`.

### Authz do caminho admin — verificado, está correto

`tournaments.admin.routes.ts` aplica `requireAdminAuth` via `.use()` **antes**
de declarar qualquer rota, então as 14 rotas admin estão cobertas por
construção — não há como adicionar uma e esquecer o guard. Vale preservar essa
forma; enumerar o middleware rota a rota é o que costuma vazar uma.

### Varredura de arquivos mortos (2026-09-17)

Contagem de importadores por arquivo dos 41 do módulo: **nenhum órfão**. Todo
arquivo tem pelo menos um importador real.

Morto encontrado no nível de função, não de arquivo:

| Símbolo | Situação |
|---|---|
| `runOfferwallShadowValidation` | zero chamadores, retornava `[]` — **removido** |
| `listShadowValidationAlerts` | retorna `[]` sempre, mas servida por rota admin — ver acima |

O grupo `ranking.*` (`ranking.hashrate`, `ranking.repository`, `ranking.routes`,
`ranking.service`) mora nesta pasta mas é uma feature própria, com router
próprio. Não é morto; é vizinho. Só está anotado aqui para ninguém confundir com
o leaderboard de torneio ao procurar ranking.

## Fronteira 00:00 UTC

O rollover diário é o momento mais delicado do módulo: o torneio do dia fecha,
o próximo ciclo nasce e a janela de pontuação troca — tudo no mesmo instante.
Revisão de 2026-09-17, com `tests/tournaments/utc-boundary.test.mjs` (14 casos)
fixando o comportamento.

**A matemática de janela está correta.** Verificado por teste:

- janelas consecutivas encaixam sem buraco — `fim[N] === início[N+1]`, então
  não existe milissegundo órfão no rollover;
- encadear `snapWindowForType(type, prevEnd)` sempre avança, nunca devolve o
  ciclo que acabou (o que faria um torneio recorrente respawnar o mesmo dia
  para sempre);
- snap é idempotente, então `alignActiveTournamentWindows` a cada boot não
  reescreve janela;
- `snapWindowForActiveTournament` ancora em `startsAt`, nunca em `now` — se
  ancorasse em `now`, às 00:00 a janela recém-encerrada deslizaria para o dia
  novo e o cron nunca veria `endsAt <= now`: o ciclo fechado **nunca pagaria**;
- viradas de mês, de ano e fevereiro bissexto conferem.

**Uma inconsistência real, de frequência desprezível.**

Os dois modelos de intervalo do módulo discordam na fronteira:

```
resolveTournamentStatusForWindow   [início, fim)   meio-aberto   ✅
windowContains + ~25 queries       [início, fim]   fechado
   (gte: startsAt, lte: upperBound)
```

Como as janelas são geradas com `fim[N] === início[N+1]`, um evento carimbado
**exatamente** em `00:00:00.000` satisfaz as duas: conta no torneio que está
fechando **e** no que está abrindo. No torneio que fecha, isso entra no ranking
final — ou seja, pode mexer em quem ganha prêmio.

Antes de correr para corrigir: medi a exposição real. Os timestamps que entram
na pontuação vêm de `row.createdAt` do Postgres (precisão de microssegundo) e,
nos fallbacks, de `new Date()` (milissegundo). Para duplicar, o evento precisa
cair no milissegundo — ou microssegundo — exato da meia-noite. É um alvo de 1ms
em 86.400.000. **É um defeito de correção, não um risco operacional.**

A correção é uniformizar em meio-aberto, alinhando com
`resolveTournamentStatusForWindow`: `lte: upperBound` → `lt: upperBound` nos
~25 pontos, e `<= upper` → `< upper` em `windowContains`. Não foi feita nesta
passada porque mexe na semântica de pontuação de dinheiro em 25 lugares e não
há banco local para validar (ver abaixo). Corrigir os dois modelos **juntos** é
obrigatório: consertar só `windowContains` faria o caminho incremental
divergir do batch, e o reconcile passaria a acusar drift permanente.

> Nota de limite: o laço `while (end <= now && safety < 366)` em
> `nextCycleWindow` cobre um ano de DAILY. Uma série dormente por mais tempo
> sai do laço com janela no passado — o ciclo nasce já vencido e é finalizado
> no tick seguinte, avançando ~1 ano por vez. Se auto-cura, mas devagar.

## Conhecido e não resolvido

**Janela de corrida no ranking.** As entries são lidas logo após a pontuação,
mas fora de qualquer transação. Um callback de offerwall referente a um evento
ainda dentro da janela pode chegar entre a leitura e a gravação dos ranks, e
aquele rank sai de um snapshot levemente velho. A leitura foi aproximada ao
máximo da pontuação para estreitar isso; não há lock. Corrigir de verdade exige
`SELECT … FOR UPDATE` ou ranking em SQL numa passada só.
