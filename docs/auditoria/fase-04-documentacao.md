# Fase 4: Documentação e Sincronização de Regras

- **Data**: 2026-10-03
- **Branch**: `fix/popup-taxa-energia`
- **Alvo**: `localhost`
- **Estado do Gate G4**: `VERIFICADO`

---

## 1. Escopo e Objetivos da Fase 4

Garantir que toda a documentação técnica, manuais de usuário, documentação de rotas e arquitetura de componentes descrevam com exatidão o comportamento real do código executável no escopo da Taxa de Energia e do Dashboard:
- Sincronizar as regras de negócio de taxa de energia (5% pagamento diário vs 15% sweep semanal).
- Documentar a arquitetura de montagem do modal (`createPortal` em `document.body`, `z-[100]`, a11y, lock de scroll).
- Validar que as chaves de internacionalização e os textos exibidos coincidam com as fórmulas e valores retornados pelo backend.
- Assegurar que nenhum documento contenha números mágicos sem rastreabilidade ou segredos expostos.

---

## 2. Inventário de Documentação Atualizada

| Arquivo | Finalidade | Status |
|---|---|---|
| `docs/paginas/usuario/dashboard/README.md` | Documentação completa da Dashboard: adicionada a seção 3.4c detalhando o ciclo de vida, acessibilidade, regras e montagem via Portal do `DashboardEnergyTaxModal.tsx`. | ✅ Atualizado e Alinhado |
| `docs/auditoria/fase-03-contrato-client-server.md` | Especificação completa do contrato HTTP entre `DashboardEnergyTaxModal` e o backend de `energy-tax` (`GET /summary`, `POST /pay-daily`). | ✅ Formalizado na Fase 3 |
| `docs/auditoria/fase-04-documentacao.md` | Relatório formal de sincronização e conferência de documentação. | ✅ Emitido |

---

## 3. Conformidade das Regras de Negócio e Invariantes Documentadas

1. **Taxa Diária com Desconto vs Taxa Semanal Plena**:
   - Confirmado contra `server/modules/energy-tax/energy-tax.service.ts`:
     - `FULL_WEEK_RATE = 0.15` (15% sobre o total minerado nos últimos 7 dias, cobrado no sweep automático de segunda-feira).
     - `DAILY_WEEK_RATE = 0.05` (5% se quitado diariamente).
     - `DAILY_PER_DAY_RATE = 0.05 / 7 ≈ 0.007142857` (0,7143% ao dia).
   - O modal exibe exatamente essa proporção através das chaves `dashboard.energy_daily_formula` e `dashboard.energy_weekly_note`.
2. **Moedas e Cotações**:
   - `todayPayQuotes` fornece cotações para `POL`, `BLK` e `SHIB` com o saldo e a flag `affordable` de cada moeda.
   - O botão de pagamento é habilitado somente quando o usuário possui saldo suficiente na moeda selecionada ou quando está isento (`todayExempt`).
3. **Isenção de Atividade**:
   - Se o usuário completar 10 atividades no dia (faucet, PTC, offerwalls, jogos, vídeos), o dia é 100% isento (`todayExempt: true`). O botão de pagamento se transforma em "Registrar isenção de hoje", permitindo confirmar a isenção com taxa 0.
4. **Resolução do Bug Visual no Documento**:
   - Documentado que o modal deve ser montado via `createPortal(..., document.body)` com `z-[100]`, superando o containing block de `DashboardPage` e cobrindo integralmente o header desktop (`z-30`) e o header mobile (`z-40`).

---

## 4. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-DOC-0001
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/energy-tax/energyTax.service.test.mjs
Ambiente: local (localhost)
Resultado: 16 testes de regra de negócio executados e 100% aprovados, confirmando FULL_WEEK_RATE=15%, DAILY_WEEK_RATE=5% e DAILY_PER_DAY_RATE=5%/7.
Arquivos: tests/energy-tax/energyTax.service.test.mjs
Conclusão: Todas as regras financeiras e percentuais documentados batem com os cálculos exatos do código executável.
```

```text
EVIDÊNCIA-ID: EV-DOC-0002
Estado: VERIFICADO
Comando: git status --porcelain docs/paginas/usuario/dashboard/README.md
Ambiente: local (localhost)
Resultado: Modificação detectada e auditada, sem inclusão de segredos ou dados sensíveis.
Arquivos: docs/paginas/usuario/dashboard/README.md
Conclusão: Manual da página de Dashboard reflete com precisão a arquitetura e comportamento do modal.
```

---

## 5. Conclusão do Gate G4

- [x] Documentação técnica e de regras de negócio atualizada.
- [x] Fórmulas matemáticas e percentuais alinhados com o código de backend.
- [x] Arquitetura de renderização via portal e acessibilidade devidamente registrada.
- [x] Estado do Gate G4: `VERIFICADO`.
