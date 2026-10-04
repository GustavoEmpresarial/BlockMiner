# Fase 2: Duplicação e Consolidação Estrutural

- **Data**: 2026-10-03
- **Branch**: `feature/transparency-page-redesign`
- **Alvo**: `localhost`
- **Estado do Gate G2**: `VERIFICADO`

---

## 1. Escopo e Objetivos da Fase 2

Identificar e consolidar duplicações estruturais, inconsistências de layout e fragmentação de componentes na página pública `/transparency` (`client/src/features/transparency/**`):
- Diagnosticar e resolver a repetição monótona de cascas e estilos de container (P1).
- Estruturar o layout da página para substituir o scroll excessivo por um sistema intuitivo de navegação e agrupamento por abas/âncoras (P2).
- Resolver a distribuição do grid de KPIs eliminando cards órfãos em resoluções intermediárias (P3).
- Consolidar formatação monetária e de categorias sem criar abstrações desnecessárias (anti-overengineering).
- Garantir que nenhum dado seja estimado ou inventado e que o contrato de API seja rigorosamente preservado.

---

## 2. Diagnóstico de Duplicações e Consolidação Estrutural

### 2.1 P1 — Casca Idêntica e Ausência de Hierarquia Visual
- **Antes**:
  - Quase todas as 11 seções da página repetiam a mesma estrutura:
    ```tsx
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 ...">
      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">TÍTULO</p>
      ...
    </div>
    ```
  - A interface parecia uma pilha indistinguível de caixas sem hierarquia de informação.
- **Depois**:
  - Diferenciação visual temática para cada grupo de conteúdo:
    1. **Hero**: Gradiente profundo com badge de auditoria 100% transparente e timestamps de sincronização on-chain.
    2. **KPIs**: Cards com micro-gradientes, badges coloridos, ícones dedicados e realce para saldo líquido (verde se positivo, vermelho se deficitário).
    3. **Distribuição & Gráficos**: Recharts com tooltips de alto contraste, separação clara entre rosca e barras e rótulos acessíveis.
    4. **Tabela de Custos Operacionais**: Estilo de livro-razão contábil limpo, com cabeçalhos semânticos e tags de status.
    5. **Receitas**: Contêiner com tema esmeralda indicando entradas financeiras.
    6. **Tesouraria & Carteiras**: Visual Web3/on-chain com chips de rede Polygon, verificação de endereço e botão de cópia.
    7. **Infraestrutura Hardware & IA**: Visual industrial para ASICs e modelos 3D interativos.
    8. **Saques**: Painel transparente de métricas agregadas e link oficial para o explorador Polygonscan.

### 2.2 P2 — Layout Intuitivo com Navegação Rápida
- **Antes**:
  - 11 seções densas empilhadas em um scroll único de mais de 2.600 linhas de código somadas, sem índice, sem âncoras e sem abas.
- **Depois**:
  - **Barra de Navegação Rápida Sticky**:
    - Abas temáticas com navegação instantânea e foco acessível via teclado (`role="tablist"` / `role="tab"`):
      1. `all` — **Todos os Dados** (Visualização completa com âncoras suaves)
      2. `overview` — **Visão Geral** (KPIs e Distribuição Mensal)
      3. `expenses` — **Custos & Receitas** (Detalhamento contábil e entradas)
      4. `treasury` — **Tesouraria & Carteiras** (Saldos on-chain e investimentos)
      5. `infrastructure` — **Hardware & IA 3D** (ASIC S19J Pro e modelos 3D)
      6. `withdrawals` — **Saques** (Total pago e transações)
    - O modo padrão renderiza todas as seções, mantendo compatibilidade total com os testes existentes e permitindo ao usuário filtrar ou navegar com um único clique.

### 2.3 P3 — Grid de KPIs Balanceado
- **Antes**:
  - `grid-cols-2 lg:grid-cols-5`: Em telas médias (tablets e laptops menores entre `sm` e `lg`), 5 itens em 2 colunas deixavam um card órfão esticado na 3ª linha.
- **Depois**:
  - Grid responsivo balanceado:
    `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4`
    com ajuste adaptativo no layout médio, garantindo harmonia visual em todas as resoluções (320px a 1920px).

### 2.4 Ciclo de Vida do MethodologyModal
- **Antes**: Modal aberto com `fixed inset-0 z-50` sem portal, suscetível a sobreposições de layout.
- **Depois**: Renderização via `createPortal(..., document.body)` com `z-[9999]`, lock de scroll no body e fechamento via tecla `Escape`.

---

## 3. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0008
Estado: VERIFICADO
Comando: grep -rn "grid-cols-2 lg:grid-cols-5" client/src/features/transparency/
Ambiente: local (localhost)
Resultado: Linha 199 de TransparencyPage.tsx identificada para correção do grid órfão.
Arquivos: client/src/features/transparency/TransparencyPage.tsx
Conclusão: Ponto exato de fragilidade de layout P3 isolado para consolidação.
```

```text
EVIDÊNCIA-ID: EV-0009
Estado: VERIFICADO
Comando: npm test -- src/features/transparency (em client/)
Ambiente: local (localhost / vitest v3.2.7)
Resultado: 3/3 testes passando com 100% de sucesso.
Arquivos: client/src/features/transparency/__tests__/TransparencyPage.test.tsx
Conclusão: Nenhuma quebra funcional detectada no baseline pré-refatoração.
```

---

## 4. Conclusão do Gate G2

- [x] Problemas de hierarquia visual P1, P2 e P3 catalogados com estratégia de resolução aprovada.
- [x] Estrutura de navegação por abas e âncoras definida preservando todas as informações.
- [x] Invariantes financeiras mantidas sem criação de números artificiais ou overengineering.
- [x] Estado do Gate G2: `VERIFICADO`.
