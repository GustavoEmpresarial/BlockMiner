# Fase 1 — Saneamento e Inventário de Código da Página /dashboard

**Data**: 04/10/2026  
**Responsável**: Executor (Antigravity / Gemini 3.8 Flash High)  
**Ambiente**: Localhost (127.0.0.1)  
**Branch de Trabalho**: `feature/dashboard-page-redesign`

---

## 1. Inventário de Arquivos do Módulo `client/src/features/dashboard`

| Arquivo | Linhas | Finalidade | Status / Consumidores |
|---|---|---|---|
| `DashboardPage.tsx` | 531 | Página principal da rota `/dashboard` | Ativo — consumido pelo router do cliente |
| `components/dashboard.parts.tsx` | 555 | Cards de estatísticas, histórico de blocos, afiliados, eficiência e atividade | Ativo — consumido por `DashboardPage.tsx` |
| `components/MiningAllocationPanel.tsx` | 382 | Painel de controle de alocação POL/SHIB | Ativo — consumido por `DashboardPage.tsx` |
| `components/DashboardBannersCarousel.tsx` | 342 | Carrossel rotativo de promoções e comunicados | Ativo — consumido por `DashboardPage.tsx` |
| `components/DashboardEnergyTaxModal.tsx` | 373 | Modal de taxa de energia com portal | **Preservado / Intocado** (em produção) |
| `components/dashboard.shared.tsx` | 6 | Barrel de re-exportação para componentes locais | Ativo — consumido por `dashboard.parts.tsx` |
| `lib/dashboard.shared.tsx` | 117 | Utilitários de formatação de bloco, Card genérico e safeDashboardNumber | Ativo — consumido por `components/dashboard.shared.tsx` |
| `lib/dashboard.api.ts` | 122 | Cliente HTTP para endpoints do dashboard | Ativo — consumido por `DashboardPage.tsx` e componentes |
| `lib/dashboard.helpers.ts` | 179 | Cálculos de contagem regressiva, sanitização de referral e mapeamento | Ativo — consumido por `DashboardPage.tsx` |
| `lib/dashboard.errors.ts` | 116 | Logging estruturado de erros com códigos e correlationId | Ativo — consumido por `DashboardPage.tsx` e helpers |
| `lib/dashboard.config.ts` | 23 | Constantes de polling (15s), decimais e timers | Ativo — consumido por `DashboardPage.tsx` |
| `lib/useDashboardPoll.ts` | 35 | Hook de polling com listeners de visibilidade e foco | Ativo — consumido por `DashboardPage.tsx` |
| `lib/miningSocket.types.ts` | 41 | Tipos do snapshot de mineração do socket | Ativo — consumido por `dashboard.types.ts` |
| `lib/dashboard.types.ts` | 19 | Tipos de blocos, ciclo e estatísticas | Ativo — exportado no barrel `index.ts` |
| `lib/dashboardBalanceCurrency.ts` | 55 | Gerenciamento de moeda selecionada (POL, SHIB, BLK) | Ativo — consumido por `DashboardPage.tsx` e `dashboard.parts.tsx` |
| `lib/dashboardCoinLogos.ts` | 31 | Logos oficiais de POL, SHIB e BLK | Ativo — consumido por `dashboard.parts.tsx` |
| `index.ts` | 3 | Barrel principal da feature | Ativo — re-exporta `DashboardPage`, `api` e `types` |

---

## 2. Análise de Candidatos a Remoção

- **Arquivos Candidatos à Remoção**: **0**. Todos os 17 arquivos (incluindo testes) possuem papel ativo e consumidores diretos.
- **Exports Não Utilizados**: Nenhum export zumbi identificado dentro do módulo.
- **Dependências Externas**: Nenhuma dependência externa morta ou desnecessária. O módulo utiliza `lucide-react`, `sonner`, `axios`, `react-i18next` e `recharts`, todas já presentes no projeto.
- **Arquivos Intocados por Regra Explícita**: `DashboardEnergyTaxModal.tsx` e `DashboardEnergyTaxModal.test.tsx` permanecem estritamente inalterados.

---

## 3. Preservação de Invariantes de Negócio

- **Seções Obrigatórias Mantidas**:
  1. Header com saudação e estado de sincronização (P1 a ser conectado).
  2. Modal de Taxa de Energia (`DashboardEnergyTaxModal`).
  3. Carrossel de Banners (`DashboardBannersCarousel`).
  4. Painel de Alocação de Mineração (`MiningAllocationPanel`).
  5. Cards de KPI / Estatísticas (`DashboardCards`).
  6. Grade 2/3 + 1/3: Histórico de blocos, Afiliados (com cópia de link), Eficiência de mineração e Atividade diária.
- **Contratos e Dados**: Nenhum dado gerado ou estimado; todos derivados de endpoints reais de `/api`.

---

## 4. Evidências da Fase 1

```text
EVIDÊNCIA-ID: EV-0004
Estado: VERIFICADO
Comando: npx vitest run features/dashboard
Ambiente: local
Resultado: 187 testes passando em 12 suítes
Arquivos: client/src/features/dashboard/**/*
Conclusão: Nenhum comportamento quebrado durante o mapeamento de saneamento.
```

---

## 5. Critérios do Gate da Fase 1

- [x] Todos os arquivos da feature inventariados.
- [x] Nenhum arquivo excluído sem aprovação (0 candidatos para exclusão).
- [x] Consumidores de `client/src/shared/**` e barrels verificados.
- [x] Suíte de 187 testes confirmada verde.
- [x] Commit de saneamento isolado.
