# Fase 5 — Testes

Novos testes em `tests/rooms/`. Testes de cliente nos arquivos que já cobriam o card, o cache e a sala. Sem `skip`, `only` ou asserção enfraquecida. `tests/chat` não foi alterado.

## O que os testes travam

- Preço string `1.5` na loja e `0.95` na oferta. `purchaseRacksForUser` rejeita o SKU antes de creditar.
- Catálogo da loja omite o item para usuário fora da allowlist e para lista sem usuário.
- Integração no Postgres local: fora da lista recebe 403 `SHOWCASE_ROOM_DISABLED` e a oferta não lista o SKU.
- Débito exato de 1.5 e depois 0.95. `rackCredits` não muda. Duas baias e um placement.
- Compra pela sala continua no preço legado 1.
- Quantidade 25 não debita. Compra de 24 e a seguinte recebe `SHOWCASE_RACK_FULL` com saldo intacto na tentativa extra.
- Saldo insuficiente não instala rack.
- Duas compras concorrentes do último rack debitam uma vez.
- Cache de ofertas não devolve o payload de outro usuário.
- Pad vazio da sala 3D não é botão de compra.

Usuários da integração são descartáveis e o teste recusa o id 294.

## Execução

Cliente, `npm test` em `client/`: 132 arquivos, 1103 testes, exit 0. A referência citada era 1101 em 132. Os dois testes novos estão em `offers.api.test.ts` e `Inventory2RoomContent.test.tsx`.

Servidor, `npm test` na raiz: 2410 testes, 2389 passaram, 20 falharam, 1 skipped, exit 1. O bloco `showcase rack shop and offer purchase` passou, inclusive o teste de integração. As 20 falhas estão em auth, redis, sky-runner, broadcast, telegram, admin de eventos, torneio, traffic e transparency. Nenhum desses arquivos está no diff desta branch. Não rodei a suíte de novo em `ea96866` limpo, então não marco essas 20 como pré-existentes com prova de baseline.

Typecheck do cliente: `tsc --noEmit` exit 2, 61 erros. É a mesma contagem citada no gate. Nenhum erro nos arquivos desta tarefa.

Typecheck da raiz: exit 2, 75 erros. Nenhum em `rooms.showcase`, `rooms.showcasePurchase`, `shop.controller`, `shop.service` ou `offer-events.service`.

Build do cliente: `vite build` exit 0, 48.61s. O `build` da raiz é `tsc -p tsconfig.json`, o mesmo compilador do typecheck, e para nos 75 erros.

ESLint nos arquivos de cliente tocados: 1 erro em `Inventory2Page.tsx` (`farmRef.current` durante o render). A linha já existia antes desta tarefa; o diff só removeu `buyShowcaseLock`. Três warnings são os JSON de i18n fora do config do ESLint.

## V2.50

- Fase: 5
- Estado: VERIFICADO para o rack. A suíte inteira do servidor fica com 20 falhas fora do diff.
- Mudanças: testes de unidade, integração e cliente.
- Evidências: `/tmp/client-test.txt` exit 0; `/tmp/server-test.txt` com o bloco showcase em verde; `/tmp/tsc-client.txt` 61 erros; `/tmp/tsc-server.txt` 75 erros; `/tmp/client-build.txt` exit 0.
- Pendências: as 20 falhas da suíte de servidor não foram triadas aqui.
- Commit: testes e este doc.
