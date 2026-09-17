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

> Shadow validation (job horário + `listShadowValidationAlerts` + rota
> `GET /admin/tournaments/:id/shadow-alerts`) era no-op puro — **removido**.

## Testes

```
tests/tournaments/prize-resolution.test.mjs
tests/tournaments/pure-modules.test.mjs
tests/tournaments/tick-guard.test.mjs
tests/tournaments/utc-boundary.test.mjs
tests/tournaments/tournament-window-align.test.mjs
tests/tournaments/controller.test.mjs              player HTTP (mock)
tests/tournaments/admin.controller.test.mjs        admin HTTP + clamp + ACTIVE lock (mock)
tests/tournaments/tournaments.finalize.smoke.test.mjs
tests/tournaments/tournaments.mining-boost.direct.smoke.test.mjs
tests/tournaments/tournaments.faucet.smoke.test.mjs
tests/security/error-redaction.test.mjs
```

`controller` / `admin.controller` usam `mock.module` → script `test` com
`--experimental-test-module-mocks`. Também: `npm run test:coverage`.

**Armadilha do node:test:** `await import` no meio do arquivo faz testes abaixo
parecerem sucesso sem rodar. Imports no topo.

### Cobertura

Módulos puros + rotas + prize-resolution/controller em ~100% função. Service /
engine / repository dependem de Prisma — smokes cobrem o caminho de dinheiro.

`DATABASE_URL` → `blockminer-current-db` em `127.0.0.1:5442`. Com Engine V2, os
smokes semeiam `TournamentAction` dentro da janela fechada.

### Lacunas conhecidas

Finalize smokes: pay-once ✅, prize parcial F3 ✅, concurrent cycle ✅.
Ainda sem: torneio com muitas entries fechando sem `P2028` (F1).

## Segurança — corrigidos (2026-09-17)

| # | Achado | Correção |
|---|---|---|
| 1 | GET público devolvia `user.name` | Leaderboard: só `id` + `username`. Client mostra username. |
| 2 | GET anônimo recomputava scores | GET nunca chama `computeScoresForTournament`; skip-recompute sempre on. |
| 3 | `tournaments.routes.ts` `@ts-nocheck` | Removido; router tipado. |
| 4 | `page` admin sem clamp | `clampAdminEntriesPagination` (`page >= 1`, limit ≤ 200). |
| 5 | Edit ACTIVE mudava metric/dates/prizes | `TOURNAMENT_ACTIVE_IMMUTABLE_FIELDS` (400). Cosméticos ok. |
| 6 | Admin devolvia `String(err)` | `reportError` + `errorId` + mensagem genérica. |
| 7 | Admin sem rate limit | Read 60/min, write 20/min, finalize 10/min. |

### Authz admin

`requireAdminAuth` via `.use()` antes de qualquer rota — preservar essa forma.

### Arquivos mortos

Nenhum órfão. `ranking.*` é vizinho (hashrate global), não leaderboard de torneio.

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
há banco local para validar com smokes. Corrigir os dois modelos **juntos** é
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
