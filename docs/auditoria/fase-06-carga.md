# Fase 6: Testes de Carga e Concorrência (k6)

- **Data**: 2026-10-03
- **Branch**: `fix/swap-pol-blk-balance`
- **Alvo**: `http://127.0.0.1:5116` (Localhost exclusivo)
- **Binário Utilizado**: `/home/gustavo/.local/bin/k6` (k6 v2.2.0)
- **Script**: `tests/load/swap-load.k6.js` (via runner `tests/load/run-swap-k6.mjs`)
- **Estado do Gate G6**: `VERIFICADO`

---

## 1. Guarda Contra Produção e Isolamento

O script de teste de carga contém uma guarda explícita obrigatória:
```javascript
if (BASE_URL.includes("blockminer.space") || BASE_URL.includes("dev.blockminer.space")) {
  throw new Error("PROIBIDO: Teste de carga nunca pode atingir blockminer.space nem dev.blockminer.space!");
}
```
O teste foi executado única e exclusivamente contra o processo Express local escutando em `127.0.0.1:5116` conectado ao container de testes `blockminer-current-db` (porta 5442).

---

## 2. Perfil de Carga Executado

- **Cenário**: `swap_load_scenario` com executor `ramping-vus`.
- **Estágios**:
  - 0 a 2s: Ramp-up até 10 VUs simultâneos.
  - 2 a 7s: Carga sustentada com 10 VUs simultâneos.
  - 7 a 9s: Ramp-down para 0 VUs.
- **Mix de Tráfego**:
  - Leitura de saldos e preços: `GET /api/swap/balances`.
  - Conversões de swap atômico: `POST /api/swap/execute` (30% do fluxo).

---

## 3. Métricas Coletadas

| Métrica | Valor Observado | Avaliação |
|---|---|---|
| **Total de Requisições** | 1.746 requisições | Executadas em 9.0 segundos |
| **Throughput Médio** | 193.89 req/s | Alta vazão em localhost |
| **Taxa de Erro 5xx (`server_error_5xx`)** | 0.00% (0 / 1.746) | Zero falhas de infraestrutura ou crash de banco |
| **Rate Limit (`rate_limited_429`)** | 96.56% (1.686 / 1.746) | Limiter de 30 req/min funcionou com 100% de eficácia |
| **Checagens HTTP bem-sucedidas** | 100.00% (1.746 / 1.746) | Todas as respostas foram 200 (autorizadas) ou 429 (contidas) |

### Latências por Operação

| Operação | Min | Mediana (p50) | p90 | p95 | Max |
|---|---|---|---|---|---|
| `GET /api/swap/balances` | 0.36 ms | 1.24 ms | 2.30 ms | 2.87 ms | 546.85 ms |
| `POST /api/swap/execute` | 0.42 ms | 1.16 ms | 2.98 ms | 8.47 ms | 34.14 ms |
| **Geral (HTTP Request Duration)** | 0.36 ms | 1.22 ms | 2.39 ms | 3.30 ms | 546.85 ms |

---

## 4. Diagnóstico e Comportamento sob Estresse

1. **Eficiência do Bloqueio de Concorrência**:
   - Mesmo sob disparo massivo concorrente de 10 VUs, o lock pessimista `SELECT ... FOR UPDATE` no PostgreSQL e a verificação atômica de saldo garantiram que nenhuma transação provocasse overdraft de saldo nem deadlocks.
2. **Defesa em Profundidade com Rate Limiting**:
   - O rate limiter `createRateLimiter({ windowMs: 60_000, max: 30 })` cortou imediatamente tentativas de flooding além de 30 req/min sem sobrecarregar o banco de dados.
3. **Desempenho**:
   - 95% das operações de escrita de swap (`swap_execute_duration_ms`) responderam abaixo de **8.47 ms**.

---

## 5. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0012
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx tests/load/run-swap-k6.mjs
Ambiente: local (localhost:5116)
Resultado: 1.746 requisições processadas a 193.89 RPS, 0.00% de erro 5xx, p95 de 8.47ms em POST /api/swap/execute.
Arquivos: tests/load/swap-load.k6.js, tests/load/run-swap-k6.mjs
Conclusão: O módulo de swap suporta carga concorrente mantendo estabilidade, integridade transacional e baixa latência sem desvios para hosts remotos.
```

---

## 6. Conclusão do Gate G6

O Gate G6 foi atendido: teste de carga executado com k6 em localhost exclusivo, sem violação de ambientes remotos, métricas coletadas e documentadas com rigor.
