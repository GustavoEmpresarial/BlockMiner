# Fase 2: Duplicação e Consolidação Estrutural

- **Data**: 2026-10-03
- **Branch**: `fix/popup-taxa-energia`
- **Alvo**: `localhost`
- **Estado do Gate G2**: `VERIFICADO`

---

## 1. Escopo e Objetivos da Fase 2

Identificar e consolidar duplicações estruturais relevantes no escopo do popup de Taxa de Energia (`DashboardEnergyTaxModal.tsx` e dependências), mantendo estrita parcimônia contra overengineering:
- Padronizar ciclo de vida de modais no dashboard (portal para `document.body`, escala de `z-index`, captura de tecla Escape).
- Consolidar formatação monetária e de cotas entre `features/taxes` e `features/dashboard`.
- Garantir que não existam cálculos ou fontes de verdade concorrentes entre client e server.

---

## 2. Duplicações Identificadas e Estratégia de Consolidação

### 2.1 Padrão de Montagem e Stacking Context de Modais no Dashboard
- **Antes**:
  - `DashboardBannersCarousel.tsx` utiliza `createPortal(..., document.body)` com `z-[100]`, backdrop blur e listener de `Escape`.
  - `DashboardEnergyTaxModal.tsx` renderizava o overlay diretamente no fluxo DOM de `DashboardPage.tsx` com `z-[9999]`, sem portal, ficando aprisionado no containing block gerado pelo `animate-in fade-in` do dashboard e gerando o bug visual da faixa no topo.
- **Depois**:
  - Unificação do padrão arquitetural: `DashboardEnergyTaxModal` utilizará `createPortal(..., document.body)`, alinhando-se a `DashboardBannersCarousel` com `z-[100]`, cobertura total da viewport, listener de tecla `Escape`, retorno de foco e trava de rolagem no `body`.

### 2.2 Formatação de Valores e Moedas
- **Antes**:
  - `DashboardEnergyTaxModal.tsx` continha uma função local `formatPol6(value: number)` que formatava números fixos em 6 casas decimais com sufixo `POL`.
  - Simultaneamente, utilizava `formatTaxPayAmount` de `features/taxes/lib/taxPayCurrency.ts` para formatar cotações em POL/BLK/SHIB.
- **Depois**:
  - Padronização no uso de `formatTaxPayAmount` para todas as cotações monetárias exibidas ao usuário, mantendo formatação de precisão consistente de acordo com a moeda selecionada (`POL` com 4 casas, `BLK` com 2 casas, `SHIB` com separador de milhar).

### 2.3 Fonte de Verdade dos Valores de Taxa
- **Auditoria de Integridade**:
  - Foi verificado se o frontend realizava cálculos locais de taxa, desconto ou saldo.
  - Constatado que o componente consome integralmente os dados calculados pelo servidor via `getEnergyTaxSummary()` (`todayDailyCharge`, `fullRateTax`, `totalRewards7d`, `todayPayQuotes`).
  - Nenhuma regra financeira ou taxa é calculada no cliente; a fonte única de verdade permanece 100% no backend (`energyTax.service.ts`), em conformidade com o Contrato V2 e OWASP Business Logic.

---

## 3. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0009
Estado: VERIFICADO
Comando: grep -rn "createPortal" client/src/features/dashboard/
Ambiente: local (localhost)
Resultado: DashboardBannersCarousel.tsx e dashboard.parts.tsx utilizam createPortal em document.body com z-[100].
Arquivos: client/src/features/dashboard/components/DashboardBannersCarousel.tsx
Conclusão: Padrão canônico de portal no dashboard identificado para replicação no DashboardEnergyTaxModal.
```

```text
EVIDÊNCIA-ID: EV-0010
Estado: VERIFICADO
Comando: npm test -- src/features/dashboard/components/DashboardEnergyTaxModal.test.tsx (em client/)
Ambiente: local (localhost)
Resultado: 13/13 testes passando antes da refatoração.
Arquivos: client/src/features/dashboard/components/DashboardEnergyTaxModal.test.tsx
Conclusão: Suíte de testes do modal pronta para receber as asserções de portal e acessibilidade.
```

---

## 4. Conclusão do Gate G2

- [x] Duplicações de ciclo de vida de modais catalogadas e alinhadas ao padrão `createPortal(..., document.body)`.
- [x] Formatação de moedas consolidada em torno de `formatTaxPayAmount`.
- [x] Ausência de cálculos concorrentes no cliente confirmada.
- [x] Estado do Gate G2: `VERIFICADO`.
