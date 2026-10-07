# Fase 6 — Carga

Script: `tests/performance/showcase-rack-shop.k6.js`.
Binário: `/home/gustavo/.local/bin/k6`.
Alvo: `http://127.0.0.1:3010`. O script encerra se o host for `blockminer.space`, `dev.blockminer.space` ou outro subdomínio.

Não compra. São GET da loja, GET das ofertas e POST de compra sem sessão. O único threshold é `showcase_rack_5xx` rate == 0. Não há limite de milissegundos inventado.

## Resultado

Comando: `k6 run tests/performance/showcase-rack-shop.k6.js -e BASE_URL=http://127.0.0.1:3010 --summary-trend-stats "med,p(95),p(99)"`.

5 VUs, 15s, exit 0.

| Métrica | Valor |
|---|---|
| Pedidos | 10260 |
| Throughput | 634.8 req/s |
| `http_req_duration` med | 2.99 ms |
| p95 | 17.31 ms |
| p99 | 40.38 ms |
| `showcase_rack_5xx` | 0 |
| Checks | 10260 / 10260 |
| `http_req_failed` | 100% |

`http_req_failed` em 100% é o k6 contando 401 e 403 como falha HTTP. É a recusa sem sessão, não erro 5xx.

## V2.50

- Fase: 6
- Estado: VERIFICADO
- Mudanças: script de carga local, sem compra.
- Evidências: `/tmp/k6-showcase.txt`, exit 0.
- Pendências: a carga não exercita o débito autenticado, de propósito, para não drenar saldo.
- Commit: script e este doc.
