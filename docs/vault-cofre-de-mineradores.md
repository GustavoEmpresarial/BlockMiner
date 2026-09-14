# Cofre de Mineradores (Vault)

Tela de armazenamento de máquinas fora da sala de mineração ("Armazém").
Um minerador guardado no cofre para de minerar (sai do hashrate ativo do
usuário) até ser retirado de volta para o inventário ou para um rack.

- **Client**: `client/src/features/machines/VaultPage.tsx`, rota `/vault`
  (registrada em `client/src/app/App.tsx`).
- **Server**: `server/modules/wallet/vault/` (`vault.routes.ts`,
  `vault.controller.ts`, `vault.service.ts`, `vault.repository.ts`,
  `vault.schemas.ts`).
- **Store**: `client/src/features/shell/lib/game.store.ts` — `fetchVault`,
  `vaultItems`, `vaultLoading`, `vaultError`.

## Fluxos

```
Sala de Mineração (rack/inventário)
        │  POST /api/vault/move-to-vault
        ▼
      Cofre  ──── GET /api/vault (lista) ────► VaultPage.tsx
        │
        │  POST /api/vault/retrieve-from-vault
        ▼
Inventário ou Rack (destino escolhido)
```

- **Mover para o cofre** (`move-to-vault`) é disparado a partir da tela de
  **inventário** (`Inventory2Page.tsx`), não desta tela — `VaultPage.tsx` só
  lista e retira.
- **Retirar do cofre** (`retrieve-from-vault`) é o único write disparado a
  partir de `VaultPage.tsx`, via o modal de quantidade
  (`MachineQuantityModal`), sempre com `destination: "inventory"` nesta tela
  (retirar direto para um rack existe na API mas não tem UI própria aqui).

## API

Todas as rotas exigem sessão (`requireAuth`, aplicado a nível de router).
Respostas seguem `{ ok: true, ...data }` / `{ ok: false, code, message }`.

| Method | Path | Guards | Notas |
|---|---|---|---|
| GET | `/api/vault` | `requireAuth` | Lista `UserVault` do usuário, resolvendo nome/imagem via `resolveOwnedMachineDisplay`. Sem rate limiter próprio (leitura). |
| POST | `/api/vault/move-to-vault` | `requireAuth` + rate limit (`vault_write`, 40/min por IP+uid) + `validateBody` + `requireCriticalIdempotency` | `{ source: "inventory" \| "rack", itemId?, itemIds?[] }` — `rack` move apenas 1 item por vez (`itemId`); `inventory` aceita lote (`itemIds`, até `VAULT_BULK_MAX = 120`). |
| POST | `/api/vault/retrieve-from-vault` | idem | `{ destination: "inventory" \| "rack", vaultId?, vaultIds?[], slotIndex? }` — `rack` exige `slotIndex` (0–79) e um único `vaultId`; `inventory` aceita lote (`vaultIds`). |

Ambos os corpos usam schemas Zod `.strict()` (`vault.schemas.ts`) — campos
desconhecidos são rejeitados (proteção contra mass assignment).

### Idempotência

O client injeta `Idempotency-Key` automaticamente para qualquer request cuja
URL contenha `/vault/` (ver `client/src/shared/auth/auth.store.ts`,
`IDEMPOTENCY_PATH_MARKERS`) — não é preciso setar isso manualmente ao chamar
`postMoveToVault`/`postRetrieveFromVault`. No servidor,
`requireCriticalIdempotency({ scope: "vault_move" | "vault_retrieve" })`
garante que reenviar a mesma chave nunca duplica o efeito (replay real
protegido, não apenas no nível de UI).

### API contract (client ↔ server)

**Achado e corrigido em 2026-09-13**: os erros 400 do `vault.service.ts`
(`INVALID_RACK_REF`, `INVALID_SELECTION`, `INVALID_VAULT_ITEM`,
`INVALID_SLOT`) eram todos colapsados pelo controller num único código
genérico `INVALID_STATE` antes de chegar no client. Ao mesmo tempo, os
catálogos de i18n (`pt-BR`/`en`/`es`, chave `vault.errors`) tinham traduções
para códigos que o servidor **nunca enviava** (`VAULT_RACK_LINK`,
`VAULT_BAD_REQUEST`, `VAULT_BAD_ITEM`, `VAULT_BAD_SOURCE`,
`VAULT_BAD_DESTINATION`, `VAULT_ALREADY_STORED` — resíduo da implementação
legacy, que usava códigos diferentes), e **nenhuma** tradução para o código
real. Resultado prático: todo erro de validação caía no toast genérico
`vault.retrieve_error` / `vault.move_error`, mesmo quando o servidor sabia
exatamente qual era o problema.

Corrigido repassando o motivo específico do `vault.service.ts` como código
visível ao client (`server/modules/wallet/vault/vault.controller.ts`,
`respondVaultError`):

| Código HTTP | Código enviado ao client | Quando |
|---|---|---|
| 404 | `VAULT_NOT_FOUND` | Item/máquina não pertence ao usuário ou não existe. |
| 400 | `VAULT_INVALID_RACK_REF` | `move-to-vault` com `source: "rack"` e `itemId` ausente/inválido. |
| 400 | `VAULT_INVALID_SELECTION` | Seleção vazia ou maior que `VAULT_BULK_MAX` (120). O client agora impede os dois casos antes de enviar (ver abaixo), então isto vira uma rede de segurança. |
| 400 | `VAULT_INVALID_VAULT_ITEM` | `retrieve-from-vault` com `destination: "rack"` e `vaultId` ausente/inválido. |
| 400 | `VAULT_INVALID_SLOT` | `retrieve-from-vault` com `destination: "rack"` e `slotIndex` ausente/fora de 0–79. |
| 400 (fallback) | `VAULT_INVALID_STATE` | Qualquer 400 futuro ainda não mapeado — nunca quebra, mas vale revisar se aparecer nos logs. |
| 500 | `VAULT_UNAVAILABLE` | Falha inesperada nas mutações — reportada via `reportError` (categoria `DATABASE` só quando o erro tem código Prisma `P####`, senão `UNKNOWN`). |
| 500 | `VAULT_LIST_UNAVAILABLE` | Falha inesperada em `GET /api/vault` — mesmo tratamento, código próprio para diferenciar leitura de escrita nos logs/alertas. |

Cada código tem uma entrada correspondente em `vault.errors.*` nos três
locales. Regressão coberta por
`tests/wallet/vault.controller.errorContract.test.mjs`.

Os cinco códigos 400 também foram adicionados às **três** listas espelhadas
de "erro esperado de UX" — são resultados normais de input do usuário
(seleção vazia, slot inválido) e não devem virar ruído no dashboard de erros
do admin, exatamente como o `INVALID_STATE` genérico que eles substituíram já
não virava:

1. `client/src/shared/utils/clientErrorTelemetry.ts` — `EXPECTED_CLIENT_UX_CODES`
2. `client/public/assets/client-error-collector-v4.js` — `UX_CODES` (coletor
   global carregado pelo `index.html`, que faz patch de XHR/fetch por conta
   própria e **não** passa pelo item 1)
3. `server/modules/traffic/traffic.errors.ts` — segunda linha de defesa no servidor

> As três precisam andar juntas (o cabeçalho do item 1 diz "keep in sync").
> Na primeira versão desta correção só a primeira foi atualizada, o que
> deixaria os 400 do vault inundando o dashboard mesmo assim — pego no
> segundo code review.

> **`VAULT_RACK_LINK` não é um código do servidor.** Essa chave é disparada
> pelo client em cima do **status 409** de `move-to-vault`
> (`Inventory2Page.tsx`), não por um `code` da resposta. Ela foi apagada por
> engano na primeira versão desta correção (a auditoria só olhou os códigos
> emitidos por `respondVaultError`) e restaurada depois que o code review
> pegou o teste quebrado. Ao mexer em `vault.errors.*`, grepar os usos no
> client, não só os códigos do servidor.

### Limite de lote (`VAULT_BULK_MAX = 120`)

O schema Zod do servidor rejeita `itemIds`/`vaultIds` com mais de 120 itens.
O client **não** espelhava esse teto: o modal de quantidade oferecia até
`group.quantity` e o move-to-vault do inventário mandava a seleção inteira,
então um usuário com mais de 120 máquinas idênticas empilhadas conseguia
montar uma request garantidamente inválida — e o 400 resultante usa um único
código (`VAULT_INVALID_SELECTION`) cuja mensagem dizia *"escolha pelo menos
uma máquina"*, o oposto do que tinha acontecido.

Corrigido em `client/src/features/machines/lib/machines.shared.ts`
(`VAULT_BULK_MAX`, espelhando a constante do servidor — manter as duas em
sincronia):

- `VaultPage.tsx`: o `max` do modal e o clamp do handler saturam em 120, então
  a request inválida não chega a ser construída.
- `Inventory2Page.tsx` (move-to-vault): bloqueia com `vault.errors.VAULT_BULK_LIMIT`,
  que informa o limite real em vez de deixar estourar no servidor.
- A mensagem de `VAULT_INVALID_SELECTION` passou a cobrir as duas pontas
  ("entre uma e 120"), já que o servidor usa o mesmo código para vazio e excesso.

Regressão coberta em `VaultPage.test.tsx` ("never sends more ids than the
server accepts") — verificado que o teste falha (130 ids) sem o cap.

## Erros / Observabilidade

Antes desta revisão, `getVault`'s catch descartava o erro por completo
(`catch { ... }`, nem um `console.error`), e o fallback genérico de 500 das
mutações nunca reportava nada. Hoje:

- **Servidor**: todo catch chama `reportError` (`core/errors/error-reporter.ts`)
  com um `code` estável (`VAULT_LIST_FAILED`, `VAULT_MOVE_FAILED`,
  `VAULT_RETRIEVE_FAILED`), categoria `DATABASE` **apenas** quando o erro
  carrega um código Prisma `P####` — senão `UNKNOWN`, para um `TypeError` ou
  falha de dependência não alertar como incidente de banco —, e contexto (`userId` +
  `source`/`destination` do corpo da requisição) — nunca o corpo/headers
  brutos da request.
- **Client**: `client/src/features/machines/lib/vault.errors.ts` (mesmo
  padrão de `inventory2.errors.ts`/`stats.errors.ts`) — `errorId` +
  `correlationId` + `fingerprint` + `severity`/`impact` por ocorrência,
  nunca loga corpo de resposta/headers, só status HTTP + mensagem.
  - `VAULT_LIST_FETCH_FAILED` — severidade `ERROR`, impacto `LOW` (degrada
    pra view vazia/stale).
  - `VAULT_RETRIEVE_FAILED` — severidade `ERROR`, impacto `MEDIUM` (mutação
    que move um ativo real).
  - Severidade e impacto são **mapas separados e explícitos**, não derivados
    um do outro: derivar colapsaria de volta os dois eixos que o desenho
    separa de propósito (uma retirada que falhou é recuperável e visível pro
    usuário — `ERROR`, não `CRITICAL`).
  - `correlationId` vem do header `x-request-id` da resposta quando existe —
    é o que realmente liga esta linha de log ao report do servidor para a
    **mesma** requisição. Um id gerado localmente não correlacionaria nada
    (teria a mesma cardinalidade do `errorId`); a geração local é só o
    fallback pra falha de rede, quando não há resposta nenhuma.
  - Mover **para** o cofre acontece na tela de inventário e já é logado por
    `inventory2.errors.ts` (`INVENTORY_MOVE_TO_VAULT_FAILED` /
    `INVENTORY_MOVE_RACK_TO_VAULT_FAILED`) — não duplicado aqui.

## Segurança

Checklist aplicado (categorias relevantes do checklist de 60 categorias):

| Categoria | Status |
|---|---|
| Autenticação | `requireAuth` a nível de router — nenhuma rota de `/vault` é acessível sem sessão. |
| IDOR / BOLA | Toda leitura/escrita no repositório filtra por `userId` (`findFirst({ where: { id, userId } })`) — confirmado ao remover código morto que fazia a mesma checagem duplicada sem uso real. |
| Mass assignment | Schemas Zod `.strict()` — campo desconhecido no corpo é rejeitado com 400 antes de chegar no service. |
| CSRF | Cookie duplo-envio (`server/core/http/middleware/csrf.ts`) — `/api/vault/*` **não** está na lista de exceção; testado ao vivo contra o middleware real (`tests/wallet/vault.routes-security.test.mjs`), não apenas lido da lista. |
| Rate limiting | `vault_write` (40/min, chave IP + userId) nas duas mutações; leitura (`GET /`) não precisa — sem custo de escrita. |
| Idempotência / Replay | `requireCriticalIdempotency` com escopos `vault_move`/`vault_retrieve` — reenviar a mesma `Idempotency-Key` retorna o resultado já processado, nunca duplica a mutação. Client injeta a chave automaticamente. |
| Race conditions | Documentado como gap conhecido em `vault.service.ts`: sem advisory lock real do Postgres ainda (mesma limitação interina de `machines/`/`inventory/`), depende de `prisma.$transaction` + unique constraints. Não corrigido nesta passada — fora de escopo. |
| Vazamento de dados sensíveis em log | Nenhum log (servidor ou client) grava corpo/headers brutos da requisição — só status HTTP + mensagem + contexto mínimo (`userId`, `source`/`destination`). |

## Testes

| Arquivo | Cobertura |
|---|---|
| `tests/wallet/vault.service.test.mjs` | Validações de entrada do service (rack/inventory, seleção vazia, slot inválido) + 404 real contra o DB para item que não pertence ao usuário. |
| `tests/wallet/vault.routes-security.test.mjs` | Introspecção do router real: `requireAuth` router-wide, rate limit + idempotência nas duas mutações, CSRF ativo (403 real contra o middleware, não apenas leitura da allowlist). |
| `tests/wallet/vault.controller.errorContract.test.mjs` | Contrato de códigos de erro (a tabela acima) — trava a correção do bug de colapso de código. |
| `client/.../VaultPage.test.tsx` | 15 testes: loading/erro/vazio, guard de reentrância do retry, filtragem de linhas malformadas, agrupamento/badge de quantidade, fluxo completo de retirada (single + lote, ids ordenados/limitados), toast traduzido vs. genérico, log estruturado. 98.72% statements / 90% branch. |
| `client/.../vault.errors.test.ts` | 8 testes mirando `inventory2.errors.test.ts` — inclui teste de segurança garantindo que segredos nunca vazam na entrada logada. 95.45% coverage. |

Gaps aceitos (mesma classe já documentada em `inventory2.errors.ts`/
`stats.errors.ts`): fallback do `crypto.randomUUID` indisponível (ambiente
sem suporte) e um branch defensivo em `VaultPage.tsx` praticamente
inatingível dado que `groupInventoryStacks` já garante ids válidos.

## Código morto removido (2026-09-13)

- `vault.repository.ts`: `findInventoryItem`, `findVaultItem`,
  `moveInventoryItemToVaultTx`, `retrieveVaultItemToInventoryTx` — sem
  nenhum chamador em todo o repositório (só as variantes `*InTx`, chamadas
  de dentro da própria transação do `vault.service.ts`, são usadas de
  verdade).
- `client/.../machines.api.ts`: `getVault()` e `MACHINES_API.vault` — só
  eram exercitados pelo próprio teste unitário; a tela real busca via
  `game.store.ts`'s `fetchVault` (`api.get('/vault')` inline), não por este
  helper.

## Deploy

Este módulo é código de **servidor** (TypeScript compilado para
`dist/server/...`) — mudanças aqui só chegam ao container depois que
`storage/scripts/deploy/deploy.py` recompila `dist/` (ver
`_build_server_on_vm()`; requer `npm` ou fallback via container Docker no
VM — corrigido em `b363006` depois de descobrir que `npm` nunca está no
`PATH` da sessão SSH não-interativa usada pelo deploy).

**Race conhecida, ainda não corrigida**: o `docker-compose.yml` faz bind-mount
de `./dist` no container **em execução**, então o build emite o JS novo
arquivo a arquivo dentro do diretório que o processo **antigo** ainda está
servindo, segundos/minutos antes do `compose up --force-recreate` trocar o
container. Um `import()` dinâmico nessa janela carregaria código novo contra
estado antigo em memória. A correção é buildar num diretório de staging e
trocar atomicamente (o force-recreate já cuida do inode novo) — deixada de
fora desta passada de propósito, porque não dá pra validar sem um deploy
real e um erro aqui quebra todos os deploys. Fazer como mudança própria,
verificada ponta a ponta no staging.

A verificação pós-build compara a **data** de `dist/server/bootstrap/server.js`
contra um marcador criado antes do build. Checar só a *existência* do arquivo
não prova nada: `_preserve_runtime_artifacts()` copia o `dist/` do container
antigo pra frente e o rsync do clone exclui `dist/`, então o arquivo está
sempre lá — inclusive quando o build falhou ou nem rodou, que é justamente o
no-op silencioso que essa checagem existe pra pegar.

Deploys deste trabalho vão para o container **dev/staging**
(`blockminer-staging-*`); não para produção, salvo pedido explícito.
