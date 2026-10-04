# Portal de Transparência Financeira e Operacional (`/transparency`)

## 📊 Resumo Rápido

| Item | Especificação |
|---|---|
| **Rota (client)** | `/transparency` (Pública, acessível a qualquer usuário logado ou anônimo) |
| **Componente Principal** | `client/src/features/transparency/TransparencyPage.tsx` |
| **Sub-componentes** | `components/transparency.charts.tsx` (KPIs, Donut Chart, Bar Chart, CategoryBar, StatCard), `components/transparency.wallets.tsx` (WalletsLiveSection, WalletCard, LiquidityPoolsPanel, ExternalInvestmentsPanel), `components/transparency.hardware.tsx` (HardwareSection, AntminerModelViewer, ROI Calculator), `components/transparency.ai-models.tsx` (AiInfrastructure3DSection, SubscriptionModelCard), `components/transparency.withdrawals.tsx` (WithdrawalsSection), `components/transparency.methodology.tsx` (MethodologyModal) |
| **Biblioteca Base** | `components/transparency.base.ts` (funções puras de normalização, cálculo de ROI, parsing, formatação monetária e constantes) |
| **Error Boundary** | `client/src/shared/components/TransparencyErrorBoundary.tsx` |
| **Endpoints REST Consumidos** | `GET /api/transparency` (ou `/entries`), `GET /api/transparency/wallets-live`, `GET /api/transparency/external-investments`, `GET /api/transparency/hardware-assets`, `GET /api/transparency/withdrawal-stats` |
| **Testes Automatizados** | `client/src/features/transparency/__tests__/TransparencyPage.test.tsx` e `tests/transparency/*.test.mjs` |

---

## 1. O que a Página Faz (Visão de Produto)

O **Portal de Transparência do BlockMiner** é o ambiente público de governança e prestação de contas da plataforma. Ele expõe para jogadores, investidores e comunidade a totalidade da saúde financeira, despesas operacionais, receitas, infraestrutura de hardware de mineração, modelos de inteligência artificial e liquidação de saques on-chain.

### 1.1 Princípios de Transparência Radical
1. **Zero Fabricação Numérica**: Nenhum valor, taxa de câmbio, hashrate, satoshi ou percentual é inventado, estimado ou projetado arbitrariamente. Todas as métricas são 100% derivadas da API pública ou de transações on-chain verificáveis. Se um dado não estiver disponível na API (como a cotação em USD de saques quando o oráculo não responder), o campo é omitido ou exibido com fallback seguro, sem preenchimento artificial.
2. **Separação Rigorosa de Fontes**: Despesas administrativas declaradas (servidores, licenças, salários) são auditáveis via notas e faturas; dados de tesouraria são lidos diretamente da blockchain Polygon; e a performance de hardware físico é alimentada por registros de recompensas em satoshis via Lightning Network.
3. **Privacidade e Proteção de Dados (Zero Excessive Data Exposure)**: Nenhuma chave privada, credencial de servidor, saldo individual de usuário, segredo ou endereço confidencial de infraestrutura interna é exposto no payload ou na interface.

---

## 2. Arquitetura de Navegação em Abas (Sticky Tab Bar) & Acessibilidade

Para resolver o problema de sobrecarga cognitiva de um scroll único contendo 11 seções densas, a página foi reestruturada com uma **barra de navegação em abas horizontal sticky** no topo da viewport.

### 2.1 Descrição Detalhada das Abas

| Chave Interna | Rótulo da Aba | Ícone | O que Exibe |
|---|---|---|---|
| `all` | **Todos os Dados** (`t('transparency.nav.all')`) | `LayoutGrid` | Visualização linear e completa de todos os painéis e seções da página em sequência, permitindo leitura vertical ininterrupta com espaçamento balanceado. |
| `overview` | **Visão Geral & Gráficos** (`t('transparency.nav.overview')`) | `BarChart2` | Painel visual contendo: **(1)** Gráfico Donut (distribuição mensal por categoria com Recharts), **(2)** Lista textual acessível de valores e cores por categoria, **(3)** Gráfico de Barras verticais de custos por categoria, e **(4)** Barras horizontais de peso relativo percentual de cada categoria no orçamento mensal total. |
| `expenses` | **Custos & Receitas** (`t('transparency.nav.financials')`) | `Receipt` | **(1)** Tabela contábil detalhada com cabeçalhos internacionalizados (`transparency.table.col_*`), discriminando Item/Descrição, Provedor, Valor em USD e Status de Liquidação (Pago/Pendente); **(2)** Seção de Receitas Operacionais e Patrocínios, com badges destacados de valor mensal e categoria (revenue, sponsorship, etc.). |
| `treasury` | **Tesouraria & Carteiras** (`t('transparency.nav.treasury')`) | `Wallet` | Módulo de ativos financeiros on-chain com sub-navegação em 4 abas internas: **(a)** *Visão Geral*: Carteiras Polygon ao vivo, saldos em USDC e POL, cotação ao vivo (1 POL ≈ $X USD), cópia de endereço com 1 clique e link para o Polygonscan, além de carteiras descontinuadas com alertas e notas explicativas; **(b)** *Pools de Liquidez*: Posições de liquidez descentralizada; **(c)** *Bot Sport*: Estado/comunicado de recursos futuros; **(d)** *Outros Investimentos*: Portfólio de investimentos externos e custódia declarada com notas explicativas. |
| `infrastructure` | **Hardware & IA 3D** (`t('transparency.nav.infrastructure')`) | `Cpu` | **(1)** *Infraestrutura de IA e Nuvem*: Modelos 3D interativos (Google Model Viewer) para o mascote Clawd (Anthropic Claude Code), Gemini Pro (Google Cloud) e Cloud VPS (Contabo), com custos mensais, tags tecnológicas e links oficiais; **(2)** *Parque de Mineração ASIC*: Visualizador 3D do Antminer S19j Pro com shaders PBR metálicos, especificações técnicas (Watts, Hashrate), custo de aquisição, cotação atual do BTC/USD, total acumulado recuperado em Satoshis e USD, % de ROI alcançado e previsão de break-even. |
| `withdrawals` | **Saques** (`t('transparency.nav.withdrawals')`) | `ArrowUpRight` | Métricas consolidadas de liquidação de saques da plataforma: volume total pago em POL, valor total equivalente em USD (quando disponível), quantidade total de transações processadas e link direto de auditoria no explorador de blocos Polygonscan. |

*(Nota: O Hero Banner inicial, o Grid de Indicadores KPI e a nota de rodapé com o acionador do Modal de Metodologia permanecem persistentemente visíveis em todas as abas).*

### 2.2 Guia de Navegação Completa por Teclado (WAI-ARIA Tablist)

A barra de abas foi construída em estrita conformidade com as diretrizes de acessibilidade W3C/WAI-ARIA para o padrão *Tabs Pattern*:
- **Estrutura Semântica**: O container da navegação possui `role="tablist"` com `aria-label="Seções do Portal de Transparência"`. Cada botão possui `role="tab"`, `id="tab-{key}"`, `aria-controls="panel-{key}"` e `aria-selected={true|false}`. Cada painel de conteúdo possui `role="tabpanel"`, `id="panel-{key}"` e `aria-labelledby="tab-{key}"`.
- **Roving tabindex**: A aba ativa possui `tabIndex={0}`, enquanto todas as abas inativas possuem `tabIndex={-1}`, garantindo que o usuário de teclado não precise dar Tab por todas as abas para alcançar o conteúdo.
- **Teclas de Direção (Setas)**:
  - `ArrowRight`: Avança o foco e ativa ciclicamente a próxima aba (`(index + 1) % 6`). Ao atingir a última aba ("Saques"), retorna para a primeira ("Todos os Dados").
  - `ArrowLeft`: Retrocede o foco e ativa ciclicamente a aba anterior (`(index - 1 + 6) % 6`). Ao atingir a primeira aba ("Todos os Dados"), salta para a última ("Saques").
- **Teclas de Extremidade**:
  - `Home`: Salta imediatamente o foco e a seleção para a primeira aba ("Todos os Dados").
  - `End`: Salta imediatamente o foco e a seleção para a última aba ("Saques").
- **Interação com Conteúdo**:
  - `Tab`: Move o foco do cabeçalho da aba diretamente para o primeiro elemento focável dentro do painel ativo (`role="tabpanel"`).
  - `Shift + Tab`: Retorna o foco do conteúdo do painel de volta para a aba ativa na barra de navegação.

---

## 3. Hierarquia Visual e Identidade Temática

### 3.1 Eliminação da Casca Cinza Uniforme
A interface anterior sofria de monotonia visual gerada pela repetição mecânica das classes `border-white/8` e `bg-white/[0.02]` em todas as seções. O redesign eliminou 100% dessas classes (0 ocorrências em todo o código-fonte da funcionalidade), substituindo-as por uma identidade temática neo-brutalista de alto contraste com sombras duras (`shadow-[..._#000000]`), bordas de 2px e paletas temáticas específicas:
- **Hero Banner**: Borda `border-slate-800`, fundo degradê `from-[#0c1220] via-slate-900 to-[#101b33]` com iluminação radial azul (`rgba(59,130,246,0.15)`) e badge pulsante verde de auditoria.
- **Custos e Despesas**: Tons de Ardósia/Âmbar (`border-amber-500/30`, badge `Receipt` em âmbar).
- **Receitas Operacionais e Patrocínios**: Tons de Esmeralda (`border-emerald-500/30`, `bg-emerald-950/15`, texto `text-emerald-400`).
- **Tesouraria On-Chain**: Violeta para saldos correntes (`border-violet-500/20`), Esmeralda para total recebido, Azul Celeste para saídas e Vermelho Alerta (`border-red-500/50`) para carteiras legadas.
- **Mineração ASIC**: Gradiente de alta densidade `from-slate-900 via-emerald-950/15 to-slate-900` com acentos em ciano/esmeralda.
- **Modelos de IA**: Cores oficiais dos provedores: Laranja `#F25F22` para Anthropic Claude, Azul `#4E82EE` para Google Gemini e Azul Royal `#0084FF` para Contabo Cloud VPS.
- **Saques Confirmados**: Tons de Azul Céu (`border-sky-500/30`, `bg-sky-950/15`, texto `text-sky-400`).

### 3.2 Grid de KPIs Balanceado (Sem Card Órfão)
O sumário de indicadores no topo da página exibe 5 cartões estatísticos principais:
1. **Custo Mensal Recorrente** (`t('transparency.kpi.monthly_cost')`): Normalização de custos mensais.
2. **Receita Mensal** (`t('transparency.kpi.total_income')`): Total de receitas mensais recorrentes declaradas.
3. **Saldo Líquido Operacional** (`t('transparency.kpi.net_balance')`): Diferença matemática estrita entre receita e despesa mensal.
4. **Custo Anual Projetado** (`t('transparency.kpi.annual_cost')`): Custo anual de operação (12 meses) somado a eventuais despesas únicas.
5. **Tesouraria On-Chain** (`t('transparency.kpi.treasury')`): Soma dos saldos consolidados em USD das carteiras ativas.

- **Resolução Responsiva**: Em telas grandes (`xl`), os 5 cards ocupam 5 colunas perfeitas (`xl:grid-cols-5`). Em telas médias/tablets (`sm:grid-cols-2`), o quinto card (Tesouraria) recebe a classe `sm:col-span-2 lg:col-span-1 xl:col-span-1`, expandindo horizontalmente na segunda linha e eliminando o problema do card órfão esticado ou desalinhado.

---

## 4. Modal de Metodologia e Auditoria (`MethodologyModal`)

O modal explicativo de metodologia é aberto a partir do rodapé ("Como esses dados são auditados?"):
- **Montagem via Portal**: Renderizado através de `createPortal(modal, document.body)` com `z-[9999]`, escapando de qualquer contexto de empilhamento local da página.
- **Backdrop com Desfoque**: Camada de sobreposição em tela cheia com `bg-black/80 backdrop-blur-md`.
- **Acessibilidade WAI-ARIA**: Possui `role="dialog"`, `aria-modal="true"`, `aria-labelledby="methodology-title"` e botão de fechar com `aria-label`.
- **Focus Trap Ativo**: Ao abrir, captura o foco no card do modal. Teclar `Tab` ou `Shift + Tab` mantém o foco preso ciclicamente entre o botão fechar e os links internos.
- **Fechamento e Scroll Lock**: Suporta fechamento pela tecla `Escape`, clique no botão `X` ou clique no backdrop escurecido. Ao abrir, bloqueia a rolagem do `document.body` (`overflow: hidden`) com compensação da largura da barra de rolagem (`scrollbarWidth`), garantindo *zero layout shift*. Ao fechar, restaura automaticamente o scroll e retorna o foco ao botão de abertura no rodapé.
- **Os 3 Pilares Metodológicos Explicados**:
  1. *Manual (Admin)*: Despesas com servidores, ferramentas e salários inseridas com comprovação fiscal e notas explicativas.
  2. *On-Chain (Automático)*: Leitura direta e transparente de saldos em tokens e moedas nativas nas carteiras públicas da Polygon.
  3. *Off-Chain*: Máquinas de mineração física ASIC e ferramentas de inteligência artificial monitoradas externamente.

---

## 5. Regras de Negócio e Derivação Financeira (Fórmulas do Código)

Todas as operações numéricas foram conferidas diretamente em `client/src/features/transparency/components/transparency.base.ts`:

### 5.1 Fórmulas de Normalização de Despesas e Receitas
- **`toMonthly(amountUsd, period)`**:
  - `period === 'daily'`: `amountUsd * 30` (multiplica por 30 dias).
  - `period === 'monthly'`: `amountUsd` (permanece inalterado).
  - `period === 'annual'`: `amountUsd / 12` (divide por 12 meses).
  - Qualquer outro período (incluindo `one_time`): retorna `0` (despesas únicas não compõem a métrica de custo mensal recorrente).
- **`toAnnual(amountUsd, period)`**:
  - `period === 'daily'`: `amountUsd * 365` (multiplica por 365 dias).
  - `period === 'monthly'`: `amountUsd * 12` (multiplica por 12 meses).
  - Qualquer outro período (incluindo `one_time`): retorna `amountUsd` (incorporado integralmente ao custo anual).

### 5.2 Saldo Líquido Operacional (`netBalance`)
$$\text{netBalance} = \text{totalIncMonthly} - \text{totalMonthly}$$
- Se $\text{netBalance} \ge 0$: Exibe texto em verde com o subtítulo `transparency.kpi.net_positive` ("Superávit mensal operacional").
- Se $\text{netBalance} < 0$: Exibe texto em vermelho com o subtítulo `transparency.kpi.net_deficit` ("Déficit mensal operacional").
- Valor formatado: `fmt(Math.abs(netBalance), true)`.

### 5.3 Tesouraria On-Chain (`treasuryTotal`)
$$\text{treasuryTotal} = \sum \text{walletTreasuryUsd}(w)$$
- **Filtro de Inclusão (`walletCountsInTreasury`)**:
  - Carteiras descontinuadas (`isLegacyWallet`: endereço `0x1CA03755C5132e238aE4E0f50d4929EA0D58b897`, `0x404CBeC8eC6F59e28C5F3D9e5b6080DA344792E7` ou com `isActive === false`) retornam `0` no total de tesouraria.
  - Carteiras com flag explícita `includeInTotals === false` retornam `0`.
  - Apenas carteiras ativas e marcadas para consolidação compõem o valor de tesouraria.

---

## 6. Internacionalização Completa (i18n)

### 6.1 Cabeçalhos da Tabela de Despesas
Os cabeçalhos da tabela contábil são 100% internacionalizados através das chaves `transparency.table.col_*`:
- `transparency.table.col_name`: *"Item / Descrição"* (pt-BR) | *"Item / Description"* (en) | *"Ítem / Descripción"* (es)
- `transparency.table.col_provider`: *"Provedor"* (pt-BR) | *"Provider"* (en) | *"Proveedor"* (es)
- `transparency.table.col_amount`: *"Valor USD"* (pt-BR) | *"Amount USD"* (en) | *"Monto USD"* (es)
- `transparency.table.col_status`: *"Status"* (pt-BR) | *"Status"* (en) | *"Estado"* (es)

### 6.2 Tradução Integral em Espanhol (`es.json`)
Das 235 chaves sob o namespace `transparency` no arquivo `es.json`:
- **217 chaves** foram traduzidas para espanhol autêntico e natural.
- **18 termos** permanecem idênticos ao inglês por se tratarem de marcas registradas, nomes de hardwares ou termos técnicos consagrados da indústria Web3:
  `Bitmain`, `Antminer S19J Pro`, `Hashrate`, `Satoshis`, `BTC/USD`, `USD`, `Manual (admin)`, `Marketing`, `Legal`, `DeBank`, `Polygonscan`, `hot wallets`, `No`, `POL`, `Tx`, `Bot Sport`, `Multi-Chain`, `Off-chain`.

---

## 7. Guia Operacional para Suporte e Atendimento

Este guia orienta agentes de suporte no esclarecimento de dúvidas e diagnóstico de questionamentos relacionados aos dados de transparência.

### 7.1 Matriz de Endpoints Públicos (`/api/transparency/*`)

| Endpoint | Método | Descrição | Comportamento na UI |
|---|---|---|---|
| `/api/transparency` (ou `/entries`) | `GET` | Retorna lista de despesas e receitas ativas. | Popula os KPIs, a tabela de custos, os cards de receitas e os gráficos Recharts. Em caso de falha, exibe banner de erro amigável (`transparency.connection_error`). |
| `/api/transparency/wallets-live` | `GET` | Retorna snapshots on-chain das carteiras rastreadas na Polygon. | Se `warming: true`, exibe indicador pulsante de aquecimento de cache e aciona polling silencioso a cada 12 segundos até 10 retentativas (`WALLETS_POLL_INTERVAL_MS = 12000`, `WALLETS_MAX_RETRIES = 10`). |
| `/api/transparency/withdrawal-stats` | `GET` | Retorna total de saques em POL e contagem de transações liquidadas. | Popula os cards da aba "Saques". Se `totalUsd` ou `polUsdPrice` forem nulos, a UI exibe o valor em POL e oculta a conversão em USD sem inventar valores. |
| `/api/transparency/external-investments` | `GET` | Retorna lista de investimentos externos e reservas declaradas. | Popula o painel "Outros Investimentos" na aba de Tesouraria. |
| `/api/transparency/hardware-assets` | `GET` | Retorna ativos de mineração física ASIC, logs de lucro em satoshis e métricas de ROI. | Popula o visualizador 3D do Antminer e os cards de hashrate e recuperação de capital. |

### 7.2 FAQ de Atendimento ao Minerador

**P: Os dados de saques mostrados na página são reais? Como posso conferir?**  
*R*: Sim, 100% dos saques listados correspondem a transações confirmadas na blockchain Polygon. O minerador pode clicar no link oficial "Polygonscan" disponibilizado no próprio cartão da aba Saques para inspecionar as transferências diretamente no explorador público de blocos.

**P: Por que algumas carteiras aparecem com aviso de "Legada / Descontinuada"?**  
*R*: O BlockMiner migrou sua infraestrutura de custódia e depósitos para novos contratos e carteiras. As carteiras antigas continuam públicas para garantir rastreabilidade histórica completa, mas possuem a indicação de descontinuação e seus saldos são estritamente excluídos do indicador principal de Tesouraria.

**P: Como é calculado o progresso de retorno (ROI) da mineradora Antminer?**  
*R*: O sistema registra periodicamente os satoshis minerados pela máquina física via pool de mineração. Esses satoshis são convertidos para dólares com base na cotação oficial do Bitcoin (BTC/USD) capturada no momento da liquidação. O percentual recuperado é a divisão exata entre o total acumulado em USD e o custo de compra original do equipamento ($640,00 USD).

**P: Por que o saldo mensal líquido pode aparecer negativo em determinado mês?**  
*R*: Isso reflete a realidade operacional do projeto. Em meses com aquisição de equipamentos, manutenções extraordinárias ou investimentos em ferramentas de IA e servidores dedicados, os custos podem superar as receitas operacionais imediatas, gerando um déficit mensal temporário custeado pelas reservas da tesouraria.

**P: Como um usuário com deficiência motora pode navegar na página?**  
*R*: Toda a barra de abas responde às teclas de seta (`ArrowLeft` e `ArrowRight`), além de `Home` e `End`. O usuário pode navegar entre as seções temáticas sem usar o mouse e utilizar a tecla `Tab` para entrar no conteúdo da seção selecionada. O modal de auditoria pode ser fechado a qualquer momento pressionando `Escape`.
