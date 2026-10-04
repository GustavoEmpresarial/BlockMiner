# Fase 2 — Análise e Tratamento de Duplicação na Página /dashboard

**Data**: 04/10/2026  
**Responsável**: Executor (Antigravity / Gemini 3.8 Flash High)  
**Ambiente**: Localhost (127.0.0.1)  
**Branch de Trabalho**: `feature/dashboard-page-redesign`

---

## 1. Mapeamento de Duplicações e Clones

### 1.1 Formatação e Parsing de Dados
- **Situação Observada**: Formatação de números seguros (`safeDashboardNumber`) e tempo de bloco (`formatDashboardBlockTime`, `parseBlockTime`) já estão centralizados em `client/src/features/dashboard/lib/dashboard.shared.tsx`.
- **Re-exportação**: `client/src/features/dashboard/components/dashboard.shared.tsx` funciona como um barrel de 6 linhas apontando para `../lib/dashboard.shared`. Mantido por compatibilidade sem custo de duplicação.

### 1.2 Tratamento e Log de Erros
- **Situação Observada**: Centralizado em `client/src/features/dashboard/lib/dashboard.errors.ts` com fingerprint, `correlationId`, `errorId` e severidade. Todas as chamadas de API usam `logDashboardError(CODE, err)`. Nenhuma lógica de fallback é duplicada de forma descontrolada.

### 1.3 Mapeamento de Moedas e Saldos
- **Situação Observada**: `DASHBOARD_BALANCE_CURRENCIES` e metadados (`nameKey`, `symbol`, `decimals`, `logoUrl`) centralizados em `lib/dashboardBalanceCurrency.ts`.
- **Logos de Moedas**: `DASHBOARD_COIN_LOGO` centralizado em `lib/dashboardCoinLogos.ts`.
- **Componentes Visuais de Moeda**: `CurrencyLogo` (em `dashboard.parts.tsx`) e `CoinMark` (em `MiningAllocationPanel.tsx`). Ambos atendem especificidades locais (um lida com menu dropdown de balanço, o outro com barras e badges de alocação de mineração). Manter desacoplados evita overengineering prejudicial.

### 1.4 Inconsistência de Escala de Raios (Border Radius) e Contraste (P4 e P5)
- **Diagnóstico**: A principal duplicação caótica observada no módulo é a dispersão estilística:
  - Raios dispersos: `rounded-xl` (23), `rounded-2xl` (18), `rounded-full` (17), `rounded-3xl` (5), `rounded-lg` (4), `rounded-md` (2), `rounded-[2rem]` (1).
  - Cores de texto de apoio: 24 ocorrências de `text-gray-500`, `text-gray-600` e `text-gray-700` que falham na conformidade WCAG AA ($\ge 4.5:1$).
- **Ação Planejada**: Unificar a escala de design em 4 patamares consistentes sem criar abstrações desnecessárias no TypeScript:
  1. `rounded-2xl`: Cards principais de conteúdo (Card de KPI, Card de Histórico, Card de Afiliados, Card de Eficiência, Card de Atividade, Painel de Alocação e Slides do Carrossel).
  2. `rounded-xl`: Subcards internos, inputs de formulário, botões de ação e modais secundários.
  3. `rounded-lg`: Badges menores, tags e tags de status.
  4. `rounded-full`: Logos de moedas, avatares, barras de progresso contínuas e indicadores (dots) do carrossel.

---

## 2. Decisão de Abstrações (Evitando Overengineering)

- Não introduzir bibliotecas externas novas.
- Não introduzir hooks genéricos complexos que aumentem o acoplamento entre os componentes de mineração e afiliados.
- Centralizar o estado de conexão/sincronização de forma direta e limpa no componente pai (`DashboardPage.tsx`) com base nos retornos de rede e evento `window.navigator.onLine`.

---

## 3. Evidências da Fase 2

```text
EVIDÊNCIA-ID: EV-0005
Estado: VERIFICADO
Comando: npx vitest run features/dashboard
Ambiente: local
Resultado: 187 testes passando em 12 suítes
Arquivos: client/src/features/dashboard/**/*
Conclusão: Análise de duplicação concluída mantendo total integridade funcional.
```

---

## 4. Critérios do Gate da Fase 2

- [x] Clones e repetições catalogados.
- [x] Nenhuma abstração prematura ou overengineering introduzido.
- [x] Escala visual e tokens padronizados identificados para a Fase 5.
- [x] Suíte de 187 testes continua verde.
- [x] Commit da fase isolado.
