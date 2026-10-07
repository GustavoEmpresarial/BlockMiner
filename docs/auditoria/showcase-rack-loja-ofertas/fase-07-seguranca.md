# Fase 7 — Segurança

Script: `tests/security/kali_showcase_rack_shop.py`.
Imagem: `kali-pentest:latest`.
Alvo: `http://127.0.0.1:3010`. O script recusa host que não seja `localhost` ou `127.0.0.1`. Sem payload destrutivo.

## Sem sessão (Kali)

```
docker run --rm --network host -v tests/security/kali_showcase_rack_shop.py:/tmp/kali_showcase_rack_shop.py:ro kali-pentest:latest python3 /tmp/kali_showcase_rack_shop.py http://127.0.0.1:3010
```

Exit 0. `ok: true`.

| Teste | Status |
|---|---|
| POST loja sem sessão, com `price: 0` | 403 |
| POST oferta sem sessão, com `priceBlk: "0"` | 403 |
| POST loja com `blkBalance: 999999` no corpo | 403 |
| SKU com aspas de injection | 403 |
| GET loja sem sessão | 401 |

Nenhum achado alto ou crítico. Esconder o botão não é a autorização: estes POST nem chegam ao débito.

## Com sessão, fora da allowlist

Conta de teste id 10056, login pela tela em `127.0.0.1:5174`. Não é a conta 294. Não houve token forjado.

- `POST /api/shop/purchase-rack` com SKU `showcase_3d_rack`, quantidade 1, `price: 0.01` e `floorSlot: 0`: 403 `SHOWCASE_ROOM_DISABLED`.
- `POST /api/offer-events/purchase-rack` com corpo estrito `{ sku, quantity }` e `Idempotency-Key`: 403 `SHOWCASE_ROOM_DISABLED`.
- Corpo da oferta com chaves extras (`price`, `idempotencyKey`, `floorSlot`) recebe 400 `INVALID_BODY` pelo schema `.strict()`, antes do débito.

Saldo da conta 10056 depois das chamadas: `20.00000000` BLK. `rack_credits` 2. Nenhuma sala 101.

A mesma função `isShowcaseRoomEnabledForUser` decide a listagem e a recusa.

## V2.50

- Fase: 7
- Estado: VERIFICADO
- Mudanças: script Kali local e a recusa autenticada no handler de compra.
- Evidências: `/tmp/kali-showcase.txt`; `/tmp/showcase-shots/out-api.json` e `out-offer-api.json`.
- Pendências: o script Kali não abre sessão. A recusa autenticada foi medida pelo login real e pelo teste de integração.
- Commit: script e este doc.
