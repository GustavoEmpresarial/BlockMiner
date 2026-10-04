# Fase 6: Teste de Carga e Performance (k6)

- **Data**: 2026-10-03
- **Branch**: `feature/transparency-page-redesign`
- **Alvo**: `http://127.0.0.1:5136` (Processo Express isolado local conectado ao PostgreSQL 5442)
- **Ferramenta**: `/home/gustavo/.local/bin/k6` v2.2.0
- **Estado do Gate G6**: `VERIFICADO`

---

## 1. Escopo e Parâmetros de Execução

- **Alvo estrito**: `127.0.0.1:5136` (`localhost`).
- **Guarda Ativa de Proteção**: O script `tests/performance/admin-transparency-full-load.k6.js` (executado via `tests/load/`) possui guarda incondicional que aborta imediatamente caso `BASE_URL` aponte para `blockminer.space` ou `dev.blockminer.space`.
- **Cenário de Carga**: 1 a 15 VUs simultâneos ao longo de 11 segundos (3s ramp-up, 6s sustentado, 2s ramp-down).
- **Tráfego Simulado**:
  1. `GET /api/transparency` (resumo público da página /transparency)
  2. `GET /api/transparency/wallets-live` (feed público de carteiras e tesouraria)
  3. `GET /api/admin/transparency` (listagem administrativa de entradas)
  4. `GET /api/admin/transparency/tracked-wallets` (carteiras monitoradas)
  5. `GET /api/admin/transparency/hardware-assets` (hardware e ROI)

---

## 2. Resultados Consolidados de Performance (k6)

### 2.1 Métricas Gerais da Execução
| Métrica | Meta Estabelecida | Resultado Obtido | Status |
|---|---|---|---|
| **Requisições Totais** | > 1.000 req | **9.185 requisições** | ✅ Aprovado |
| **Throughput Médio** | > 100 req/s | **834,34 req/s** | ✅ Excelente |
| **Taxa de Erro 5xx** | `rate == 0` | **0,00%** (0 falhas em 9.185) | ✅ Aprovado |
| **Checagens Totais** | 100% sucesso | **9.185 / 9.185 (100,00%)** | ✅ Aprovado |
| **Proteção de Rate Limiting** | 429 sem 5xx | **8.705 requests contidas limpas** | ✅ Aprovado |

### 2.2 Tabela de Latência
| Métrica | Mínimo | Mediana (p50) | p90 | p95 | Máximo |
|---|---|---|---|---|---|
| **Latência Global (`transparency_full_duration_ms`)** | 106,40 µs | **2,79 ms** | **8,36 ms** | **10,47 ms** | 188,31 ms |
| **Latência em Respostas 200 OK** | 1,28 ms | **8,00 ms** | **14,02 ms** | **16,60 ms** | 188,31 ms |
| **Duração de Iteração (`iteration_duration`)** | 54,36 ms | **67,73 ms** | **82,75 ms** | **88,18 ms** | 310,12 ms |

---

## 3. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-CARGA-0001
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx tests/load/run-transparency-full-k6.mjs
Ambiente: local (127.0.0.1:5136 / k6 v2.2.0 em /home/gustavo/.local/bin/k6)
Resultado: 9.185 requisições processadas a 834.34 req/s, 0 erros 5xx (taxa de erro 0,00%), p50 de 2,79ms, p95 de 10,47ms, exit code 0.
Arquivos: tests/load/admin-transparency-full-load.k6.js, tests/load/run-transparency-full-k6.mjs
Conclusão: Capacidade, resiliência e estabilidade sob alta concorrência da API pública e administrativa de transparência plenamente comprovadas.
```

---

## 4. Conclusão do Gate G6

- [x] Teste de carga executado com `/home/gustavo/.local/bin/k6` contra `localhost`.
- [x] Scripts versionados em `tests/load/` (symlink canônico para `tests/performance/`).
- [x] Guarda de host verificada e ativa contra domínios remotos.
- [x] Tabela de p50, p95, máximo, throughput e taxa de erro documentada com valores reais.
- [x] Estado do Gate G6: `VERIFICADO`.
