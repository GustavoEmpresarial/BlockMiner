# Portal de Transparência Financeira (`/transparency`)

## 📊 Resumo Executivo

| Item | Especificação |
|---|---|
| **Rota (client)** | `/transparency` (Pública, acessível a qualquer usuário logado ou anônimo) |
| **Componente Principal** | `client/src/features/transparency/TransparencyPage.tsx` |
| **Sub-componentes** | `components/transparency.charts.tsx` (KPIs, Donut & Bar Charts, Weight Bars), `components/transparency.wallets.tsx` (WalletsLiveSection), `components/transparency.hardware.tsx` (HardwareSection & ASIC 3D), `components/transparency.ai-models.tsx` (AiInfrastructure3DSection), `components/transparency.withdrawals.tsx` (WithdrawalsSection), `components/transparency.methodology.tsx` (MethodologyModal) |
| **Error Boundary** | `client/src/shared/components/TransparencyErrorBoundary.tsx` |
| **Endpoints Consumidos** | `GET /api/transparency`, `GET /api/transparency/wallets-live`, `GET /api/transparency/external-investments`, `GET /api/transparency/hardware-assets`, `GET /api/transparency/withdrawal-stats` |
| **Testes** | `client/src/features/transparency/__tests__/TransparencyPage.test.tsx` e `tests/transparency/*.test.mjs` |

---

## 1. O que a Página Faz

O Portal de Transparência do BlockMiner abre publicamente para a comunidade e jogadores a totalidade da operação financeira e técnica da plataforma:
1. **Balanço Recorrente e Anual**: Exibição detalhada de custos de infraestrutura, servidores em nuvem, ferramentas de IA e desenvolvimento, marketing, jurídico e receitas operacionais.
2. **Saldo Líquido Operacional**: Diferença matemática estrita entre receitas mensais e despesas mensais (`totalIncMonthly - totalMonthly`), sem qualquer valor artificial ou projetado.
3. **Tesouraria On-Chain**: Leitura ao vivo das carteiras rastreadas na rede Polygon, saldos nativos e tokens (USDC), pools de liquidez e valores em custódia declarados com notas explicativas.
4. **Parque de Mineração Física ASIC**: Apresentação das unidades Antminer S19j Pro em operação, especificações elétricas, hashrate e recuperação contábil do investimento (ROI) em Satoshis via Lightning Network.
5. **Infraestrutura de Inteligência Artificial**: Modelos interativos 3D e histórico de investimento em computação de IA (Anthropic Claude Code, Google Gemini Pro).
6. **Comprovação de Saques**: Volume total pago em POL, contagem de transações liquidadas e link oficial do explorador Polygonscan.

---

## 2. Arquitetura de Navegação e Hierarquia de Layout

Para solucionar o acúmulo de 11 seções densas em um único scroll, a interface adota um sistema intuitivo de navegação rápida com abas temáticas e âncoras semânticas:

### 2.1 Categorias de Navegação Rápida
- **Todos os Dados** (`#all`): Visualização sequencial completa com espaçamento respirável e cards com hierarquia temática visual.
- **Visão Geral & Gráficos** (`#overview`): Hero, 5 KPI cards balanceados (sem cards órfãos) e distribuição mensal por categoria via Recharts.
- **Custos & Receitas** (`#financials`): Detalhamento contábil de itens de despesa em formato ledger com status de pagamento, além de cards de receitas operacionais e patrocínios.
- **Tesouraria & Carteiras** (`#treasury`): Carteiras Polygon ao vivo, chips de endereço com cópia e portfólio de investimentos externos.
- **Infraestrutura 3D** (`#infrastructure`): Mineração ASIC com visualizador 3D `@google/model-viewer` e showcase de modelos de IA.
- **Saques Comprovados** (`#withdrawals`): Métricas de saques pagos com link direto ao explorador de blocos.

### 2.2 Grid de KPIs Balanceado
- O grid de 5 cartões é distribuído em:
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4`
- Em resoluções médias (tablets e telas entre `sm` e `lg`), os cards se ajustam harmoniosamente sem deixar cartões órfãos esticados na última linha.

---

## 3. Integridade e Regras Invariantes

- **Zero Fabricação Numérica**: Valores em USD, saldos de carteiras, satoshis recuperados e percentuais são 100% derivados da API pública ou de cálculos de soma sobre as entradas reais.
- **Zero Excessive Data Exposure**: Nenhum dado confidencial, saldo de usuário individual, chave privada ou endereço interno não-público é exposto.
- **Internacionalização Rigorosa**:
  - Todas as 27 chaves originais do i18n são preservadas.
  - Os cabeçalhos de tabela anteriormente fixos em português ("Item / Descrição", "Provedor", "Valor USD", "Status") são agora internacionalizados via chaves `transparency.table.col_*` sincronizadas em `pt-BR`, `en` e `es`.
- **Acessibilidade WAI-ARIA**:
  - `h1` único no topo da página seguido de `h2` e `h3` em ordem semântica.
  - Gráficos possuem tabela/lista textual adjacente garantindo acessibilidade para leitores de tela.
  - Modais (como `MethodologyModal`) utilizam `createPortal` em `document.body` com `role="dialog"`, `aria-modal="true"`, foco preso e tecla `Escape`.
