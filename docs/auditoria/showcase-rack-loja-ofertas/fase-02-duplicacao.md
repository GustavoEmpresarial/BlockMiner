# Fase 2 — Duplicação

## Reusado

- Rotas `POST /api/shop/purchase-rack` e `POST /api/offer-events/purchase-rack`, com `requireAuth`, rate limit e `requireCriticalIdempotency`.
- `ShopRackCard` e a seção de ofertas de rack, via o mesmo formato de item (`nameKey`, `price`, `priceBlk`, `maxQuantity`).
- Lock, checagem de saldo e instalação do `buyShowcaseRack`, extraídos para `installPaidShowcaseRacks`.

## Não duplicado

- Não há uma segunda função de permissão. Loja, Ofertas e os três caminhos de compra chamam `isShowcaseRoomEnabledForUser`.
- Não há um segundo produto de crédito. `purchaseRacksForUser` rejeita o SKU `showcase_3d_rack` antes de incrementar `rackCredits`.
- O preço não é convertido de dólar. São strings decimais, no mesmo padrão de `priceBlk` das ofertas de máquina.

## Preço por canal

| Canal | Preço | Onde |
|---|---|---|
| Loja | 1.5 BLK | `SHOWCASE_RACK_SHOP_PRICE_BLK` |
| Ofertas | 0.95 BLK, lista 1.5 | `SHOWCASE_RACK_OFFER_PRICE_BLK` |
| Sala (legado) | `readShowcaseRackPrice()` default 1 | só `POST /rooms/showcase-rack/buy` |

O corpo do POST não escolhe o preço nem o slot. Quantidade acima de 24, ou que passaria de 24 na sala, não debita.

## V2.50

- Fase: 2
- Estado: VERIFICADO
- Mudanças: um instalador pago para os três canais. Catálogo separado do crédito de prateleira.
- Evidências: `handleShowcaseRackCatalogPurchase` devolve antes de `purchaseRacksForUser`. `showcaseRackListingForUser` retorna null quando `isShowcaseRoomEnabledForUser` é falso.
- Pendências: nenhuma segunda regra de allowlist.
- Commit: doc desta fase.
