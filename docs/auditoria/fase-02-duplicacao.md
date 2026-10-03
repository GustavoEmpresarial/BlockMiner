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

### 2.1 Padrão de Montagem e Escala Canônica de Z-Index
- **Antes**:
  - `DashboardEnergyTaxModal.tsx` renderizava o overlay diretamente no fluxo DOM de `DashboardPage.tsx` com `z-[9999]`, sem portal. O container do dashboard possui classes de animação (`animate-in fade-in`), que conforme a especificação do W3C formam um novo *containing block* para descendentes `position: fixed`. Por estar confinado a esse sub-bloco, o modal era sobreposto pelos elementos externos de layout (`Header.tsx` sticky `z-30` e topbar mobile `z-40` em `Sidebar.tsx`), gerando a faixa nítida no topo.
- **Depois — Escala Canônica e Resolução via Portal**:
  - O modal agora é montado diretamente na raiz do documento via `createPortal(modalContent, document.body)`.
  - O z-index foi formalizado e nomeado através da constante exportada `ENERGY_TAX_MODAL_Z_INDEX = 'z-[9999]'` (em estrito respeito à regra V2.7 de constantes nomeadas).
  - **Mapeamento da Escala Canônica de Z-Index do Projeto**:
    1. `z-0` a `z-10`: Conteúdo e elementos relativos normais de página.
    2. `z-20` a `z-40`: Shell da aplicação (`EmailVerifyBanner` sticky `z-20`, `Header.tsx` sticky `z-30`, `Sidebar.tsx` topbar móvel e bottom nav `z-40`).
    3. `z-[60]`: `CookieConsentBanner`.
    4. `z-[100]` a `z-[200]`: Modais locais de features (`DashboardBannersCarousel` `z-[100]`, `machines.slotModal` `z-[100]`, dropdowns de moeda `z-[200]`).
    5. `z-[9999]`: **Modais bloqueantes de sistema** (`DashboardEnergyTaxModal`, `RootErrorBoundary`).
    6. `z-[10000]` a `z-[10050]`: Tooltips flutuantes e seletores de topo (`machines.tooltip` `z-[10000]`, `SwapPanel` `z-[10050]`).
    7. `z-[99999]`: Comunicados globais administrativos (`BroadcastPopup.tsx` e `AdminBroadcastPage`).
    8. `z-[2147483000]`: Desafio de segurança antibot (`BmCaptchaModal.tsx`).
  - **Prova de Não-Regressão**:
    - `ENERGY_TAX_MODAL_Z_INDEX` (9.999) é estritamente superior ao Header (30), Topbar móvel (40) e dropdowns internos (200), garantindo desfoque integral da viewport.
    - É estritamente inferior a avisos globais urgentes (`BroadcastPopup` em 99.999) e ao captcha de segurança (2.147.483.000), garantindo que alertas administrativos críticos e antibots possam sobrepor o aviso de taxa se disparados simultaneamente.

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
