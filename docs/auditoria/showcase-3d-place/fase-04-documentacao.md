# Fase 4 — Documentação que o usuário lê

Textos novos, pt-BR / en / es, chave `inventory`:

- `showcase_install` — Instalar rack
- `showcase_credits` — "{{count}} rack(s) para instalar"
- `showcase_3d_fits_only` — "Só pode ser instalada na Sala 3D." / "It can only be installed in the 3D room." / "Solo se puede instalar en la Sala 3D."

O sucesso da compra e a descrição deixam de dizer que a compra já instalou o rack. Passam a dizer que o rack está pronto para instalar. `showcase_pad_empty` permanece para o piso sem crédito.

`ShowcaseRoomOnlyNotice` só renderiza quando a máquina é 3D. Loja: o tipo ganhou `modelUrl` opcional; o catálogo `Miner` não tem essa coluna, então o aviso da loja só aparece se o item tiver URL `.glb`. A oferta do MinerCore MCX9 tem essa URL.

## Resumo V2.50

- Fase: 4
- Estado: VERIFICADO
- Mudanças: `pt-BR.json`, `en.json`, `es.json`, `ShowcaseRoomOnlyNotice.tsx`, `OffersPage.tsx`, `ShopMinerCard.tsx`, `ShopPurchaseModal.tsx`, `shop.types.ts`, `rackMinerModel.ts`
- Evidências: as três chaves existem nos três arquivos; o componente usa `inventory.showcase_3d_fits_only`
- Pendências: nenhuma
- Commit: este commit
