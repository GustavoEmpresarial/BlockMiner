# Fase 3 — Contrato cliente e servidor

## Servidor

SKU `showcase_3d_rack`. `creditsPerUnit` 0. `maxQuantity` 24.

`listMinersForShop(page, pageSize, userId)` só anexa o item se `showcaseRackListingForUser` devolver o listing. Sem usuário, a lista não inclui o rack 3D. `GET /api/offer-events/active` passa por `withShowcaseRackOffer`.

`purchaseRack` e `purchaseRackOffer`, se o SKU for o da sala, chamam `handleShowcaseRackCatalogPurchase` e não o crédito de prateleira. O handler exige quantidade inteira >= 1, abre o lease de idempotência, e chama `purchaseShowcaseRacksForChannel`.

Dentro da transação: `pg_advisory_xact_lock(userId, 101)`, sala criada se faltar, saldo conferido, um `decrement` do total, baias e placement. Sem acesso à sala: 403 `SHOWCASE_ROOM_DISABLED`, sem débito. Sala cheia: `SHOWCASE_RACK_FULL`, sem débito. Preço zero recusado. Quantidade 25 recusada antes de escrever.

O cache de ofertas no cliente guarda `userId`. Leitura de outro usuário devolve null. Logout já limpava o cache quando a página via `!isAuthenticated`.

## Cliente

- Card da loja e card da oferta mostram o item só porque a API o enviou.
- O stepper usa `item.maxQuantity` (24) quando o item traz o campo.
- Pads vazios da sala 3D são `div`, sem `role=button` e sem compra.
- `client/vite.config.ts`: o proxy de `/api` e `/socket.io` usa `VITE_DEV_API_PROXY` ou `http://localhost:3000`.

## I18N

Novas chaves em `pt-BR`, `en` e `es`: `racks.showcase_3d_name`, `racks.showcase_3d_desc`, `racks.showcase_3d_purchase_success`, `racks.errors.showcase_forbidden`, `racks.errors.showcase_full`, `racks.errors.showcase_invalid_quantity`, `inventory.showcase_pad_empty`.

## V2.50

- Fase: 3
- Estado: EM_IMPLEMENTACAO até o commit do código; o comportamento está no worktree e coberto pelos testes da fase 5.
- Mudanças: catálogo condicional, compra com débito e instalação, botão interno removido, i18n nos três idiomas.
- Evidências: símbolos em `rooms.showcase.ts` linhas 186–188 e 227; handler em `rooms.showcasePurchase.ts`.
- Pendências: commits das fases 5 a 8 e o relatório.
- Commit: código de produto desta fase (servidor, cliente, i18n, proxy de dev).
