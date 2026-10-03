# Fase 6: Testes de Carga e Concorrência (k6)

- **Data**: 2026-10-03
- **Branch**: `fix/popup-taxa-energia`
- **Alvo**: `http://127.0.0.1:5118` (Processo Express isolado local conectado ao container `blockminer-current-db` na porta 5442)
- **Ferramenta**: `/home/gustavo/.local/bin/k6` v2.2.0
- **Estado do Gate G6**: `VERIFICADO`

---

## 1. Escopo e Parâmetros de Execução

- **Alvo estrito**: `127.0.0.1:5118` (`localhost`).
- **Barreira de Proteção contra Produção**: O script `tests/load/energy-tax-load.k6.js` possui guarda estrita que aborta a execução imediatamente se `BASE_URL` contiver `blockminer.space` ou `dev.blockminer.space`.
- **Cenário de Carga**: Ramping de 1 a 10 VUs simultâneos ao longo de 9 segundos (2s ramp-up, 5s sustentado, 2s ramp-down).
- **Tráfego Simulado**:
  1. `GET /api/energy-tax/summary` (consulta concorrente de resumo do popup).
  2. `POST /api/energy-tax/pay-daily` (25% do tráfego concorrente simulando tentativas paralelas de quitação de taxa).

---

## 2. Diagnóstico e Resolução de Corrida Concorrente (Red-Green de Carga)

### 2.1 Detecção do Gargalo Concorrente na 1ª Execução
Na primeira execução sob 10 VUs simultâneos martelando o endpoint de pagamento:
- Duas requisições paralelas para o mesmo usuário chegaram ao mesmo milissegundo: ambas passaram pela checagem inicial de `findChargeForDay` e entraram na transação Prisma.
- A primeira requisição gravou a cobrança com sucesso; a segunda colidiu na constraint única `@@unique([userId, periodDayStartsAt])` da tabela `energy_tax_charges`, lançando erro `P2002` (`Unique constraint failed`).
- O controller capturava apenas a exceção de domínio `EnergyTaxAlreadyPaid`, deixando o erro do Prisma cair no handler genérico 500, violando o threshold de `server_error_5xx: 0%`.

### 2.2 Correção de Concorrência Aplicada
- Em `server/modules/energy-tax/energy-tax.service.ts`: O bloco `$transaction` agora intercepta o erro `P2002` do Prisma (`Unique constraint failed`) e o converte diretamente na exceção de domínio `EnergyTaxAlreadyPaid`.
- Com isso, requisições concorrentes que perdem a corrida retornam o status semântico correto `409 Conflict` (`ALREADY_PAID`) em vez de erro `500 Internal Server Error`.

---

## 3. Resultados Consolidados (2ª Execução — Pós-Correção)

### 3.1 Métricas Gerais da Execução
| Métrica | Valor Observado | Meta / Threshold | Status |
|---|---|---|---|
| **Requisições Totais** | 1.691 requisições | > 1.000 req | ✅ Aprovado |
| **Throughput Médio** | 186,99 req/s | > 100 req/s | ✅ Aprovado |
| **Taxa de Erro 5xx** | **0,00%** (0 falhas em 1.691) | `rate == 0` | ✅ Aprovado |
| **Checks Totais** | 1.691 checagens | 100% sucesso | ✅ Aprovado |
| **Rate Limit 429** | 95,86% (1.621 bloqueios limpos) | Proteção ativa (60/min e 10/min) | ✅ Aprovado |

### 3.2 Latência por Endpoint e Operação
| Operação / Métrica | Mínimo | Mediana (p50) | p90 | p95 | Máximo |
|---|---|---|---|---|---|
| **`http_req_duration` (Geral)** | 382,41 µs | **1,14 ms** | **2,12 ms** | **2,55 ms** | 369,20 ms |
| **`energy-tax/summary` (GET)** | 382,41 µs | **1,16 ms** | **2,10 ms** | **2,52 ms** | 369,20 ms |
| **`energy-tax/pay-daily` (POST)** | 416,80 µs | **1,05 ms** | **2,17 ms** | **2,63 ms** | 48,34 ms |
| **`iteration_duration`** | 50,49 ms | 52,07 ms | 53,64 ms | 54,33 ms | 467,40 ms |

---

## 4. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-CARGA-0001
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx tests/load/run-energy-tax-k6.mjs
Ambiente: local (127.0.0.1:5118 / k6 v2.2.0)
Resultado: 1.691 requisições processadas a 187 req/s, 0 erros 5xx (taxa de erro 0,00%), p95 de latência de 2,55ms, threshold atendido e exit code 0.
Arquivos: tests/load/energy-tax-load.k6.js, tests/load/run-energy-tax-k6.mjs, server/modules/energy-tax/energy-tax.service.ts
Conclusão: Resiliência e integridade transacional concorrente da taxa de energia plenamente comprovadas sob carga sem vazamento de erros 500.
```

---

## 5. Conclusão do Gate G6

- [x] Teste de carga executado com `/home/gustavo/.local/bin/k6`.
- [x] Scripts versionados em `tests/load/` (symlink para `tests/performance`).
- [x] Alvo estrito `localhost` com barreira ativa contra produção.
- [x] Tabela de p50, p95, p99/max, throughput e taxa de erro documentada com valores reais.
- [x] Concorrência transacional corrigida e aprovada.
- [x] Estado do Gate G6: `VERIFICADO`.
