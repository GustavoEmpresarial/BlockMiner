# Relatório — rack 3D na Loja e nas Ofertas

Data: 07/10/2026. Branch `feature/showcase-rack-loja-ofertas`. Base `ea96866`. Sem deploy. Sem push.

`docs/relatorio-auditoria.md` na raiz é o relatório do dashboard e não foi alterado.

## Achados

1. Crítico, corrigido: vender o rack 3D para qualquer um debitaria BLK de quem não tem a sala (`SHOWCASE_3D_ROOM_USER_IDS`). A listagem e os dois POST passam por `isShowcaseRoomEnabledForUser`. Sem acesso, o item não aparece e a compra responde 403 `SHOWCASE_ROOM_DISABLED`, sem débito.
2. Alto, corrigido no caminho novo: quantidade acima de 24, ou que estoura as 24 posições da sala, não debita e não cria rack.
3. Alto, preservado: o endpoint da sala continua aceitando compra para cliente em cache, no preço legado. O botão dessa tela foi removido.
4. Informativo: `POST` sem sessão responde 401/403, inclusive com `price`, `priceBlk` ou `blkBalance` no corpo.

Nenhum achado corrigido foi apagado.

## Correção

SKU `showcase_3d_rack`. Loja 1.5 BLK. Ofertas 0.95 BLK, lista 1.5. Débito com `Prisma.Decimal` a partir da string, dentro de `pg_advisory_xact_lock`, com saldo conferido na mesma transação. Idempotência das rotas de loja e oferta. `rackCredits` não muda. Duas baias e um placement por rack. Teto 24.

## Regressão

- Cliente: 1103 testes em 132 arquivos, exit 0.
- Servidor: bloco do rack verde dentro de 2410 testes (2389 passaram, 20 falharam fora do diff).
- Typecheck cliente: 61 erros, nenhum nos arquivos novos. Typecheck raiz: 75 erros, nenhum nos arquivos novos.
- Build do cliente: exit 0.

## Verificação em localhost, duas contas

Servidor `127.0.0.1:3010` com `SHOWCASE_3D_ROOM_USER_IDS=10055` e a flag global desligada. Vite `127.0.0.1:5174`. Login pela tela. Contas de teste, não a 294.

| Conta | O que aconteceu |
|---|---|
| 10055, na lista | Vê Rack 3D na loja a 1.5 BLK e nas ofertas a 0.95 BLK. Comprou 1 na loja. Toast de instalação. Sala 3D mostra 1 de 24. Carteira 18,5000 BLK. Banco: `18.50000000`, `rack_credits` 2, sala 101, posições 0 e 1, um placement no slot 0. |
| 10056, fora da lista | Loja só mostra a prateleira de 0.15 BLK. Ofertas não têm Rack 3D. POST direto da loja e da oferta: 403 `SHOWCASE_ROOM_DISABLED`. Saldo permanece `20.00000000`. |

Capturas em `/tmp/showcase-shots/`: `01-in-shop.png`, `02-in-offers.png`, `03-in-bought.png`, `04-in-room.png`, `04b-in-wallet.png`, `05-out-shop.png`, `06-out-offers.png`.

## Carga e Kali

k6, 5 VUs, 15s, localhost: 10260 pedidos, 634.8/s, med 2.99 ms, p95 17.31 ms, p99 40.38 ms, 5xx 0. `http_req_failed` 100% são 401/403 sem sessão.

Kali no mesmo alvo: os cinco checks sem sessão ok, nenhum achado alto.

## Antes e depois

Antes, o rack da sala só era comprado pelo botão interno, a 1 BLK default, e a loja vendia outro produto (crédito de prateleira). Depois, quem tem a sala compra na loja e nas ofertas pelo preço em BLK, o rack aparece na sala 101, e quem não tem a sala não vê e não consegue comprar por chamada direta.

## Risco residual

- Cliente antigo ainda pode chamar `POST /api/rooms/showcase-rack/buy` e pagar o preço legado, se a allowlist deixar. O botão não está mais na UI.
- A suíte de servidor tem 20 falhas fora deste diff, não triadas.
- A carga não passa pelo débito autenticado.
- Contas 10055 e 10056 são lixo de verificação no banco local. Devem ser apagadas ao fechar.

## Commits

| Fase | Commit |
|---|---|
| 0 | `83813da` |
| 1 | `d8919b9` |
| 2 | `cf635e1` |
| 3 | `b3d30f7` |
| 4 | `4559a03` |
| 5 | `c57daf7` |
| 6 | `8cd0ca1` |
| 7 | `9cdeb60` |
| 8 | commit deste relatório |

## V2.50

- Fase: 8
- Estado: VERIFICADO
- Mudanças: relatório. Sem deploy.
- Evidências: capturas, saldo `18.50000000` / `20.00000000`, 403 nas duas rotas, suíte e k6 acima.
- Pendências: push não feito; deploy não feito; limpeza das contas de teste no banco local.
- Commit: este relatório e o doc da fase 8.
