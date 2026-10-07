# Fase 4 — Documentação

Os README que descrevem o comportamento foram alinhados ao código:

- `server/modules/offer-events/README.md`: o SKU `showcase_3d_rack` não é crédito; preço 0.95 BLK; a listagem e a compra exigem `isShowcaseRoomEnabledForUser`.
- `client/src/features/offers/README.md`: cache de ofertas guarda o `userId`; `maxQuantity` 24 no item do rack 3D.

Não havia README da loja descrevendo o rack 3D. O contrato ficou no README de ofertas e neste diretório de auditoria, para não criar um documento novo sem leitor.

`docs/auditoria/fase-00-reconhecimento.md` e `docs/relatorio-auditoria.md` na raiz continuam sendo a auditoria do dashboard. Esta tarefa não os altera.

## V2.50

- Fase: 4
- Estado: VERIFICADO
- Mudanças: dois README atualizados para o SKU, o preço e a allowlist.
- Evidências: leitura dos dois README contra `withShowcaseRackOffer` e `readActiveOffersCache`.
- Pendências: nenhuma divergência conhecida entre esses README e o código.
- Commit: README desta fase.
