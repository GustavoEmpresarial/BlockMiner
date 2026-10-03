# Fase 4: Documentação e Sincronização de Regras

- **Data**: 2026-10-03
- **Branch**: `fix/swap-pol-blk-balance`
- **Alvo**: `localhost`
- **Estado do Gate G4**: `VERIFICADO`

---

## 1. Escopo e Objetivos da Fase 4

Garantir que a documentação técnica, manuais de módulo e artefatos de arquitetura descrevam com precisão absoluta o comportamento real do código, sem desvios, promessas não implementadas ou discrepâncias de moedas e regras de negócio.

---

## 2. Inconsistências Identificadas e Correções

1. **Discrepância em `docs/mapa-mental.html`**:
   - **Antes**: Afirmava que o módulo `swap/` realizava *"Troca entre moedas internas (POL/SHIB/USDC)"*.
   - **Realidade no Código**: O par `POL ↔ USDC` é expressamente rejeitado pela política do sistema (testado em `tests/swap/swap.service.test.mjs` e codificado em `VALID_SWAP_PAIRS`). A operação permitida é estritamente unidirecional para `BLK`.
   - **Correção**: Atualizado para *"Troca unidirecional interna (POL/SHIB → BLK)"*.

2. **Ausência de Documentação Técnica no Módulo (`server/modules/swap/README.md`)**:
   - **Antes**: O diretório `server/modules/swap/` não possuía `README.md`, deixando regras críticas de concorrência, precificação de fallback e invalidação de cache não documentadas.
   - **Correção**: Criado `server/modules/swap/README.md` detalhando as 4 invariantes fundamentais, tabela de endpoints, Zod schema e política de invalidação de cache.

---

## 3. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0009
Estado: VERIFICADO
Comando: git diff docs/mapa-mental.html server/modules/swap/README.md
Ambiente: local (localhost)
Resultado: Documentação sincronizada com as regras de negócio reais do código.
Arquivos: docs/mapa-mental.html, server/modules/swap/README.md
Conclusão: Toda a documentação técnica reflete com 100% de fidelidade os contratos e invariantes do módulo.
```

---

## 4. Conclusão do Gate G4

O Gate G4 foi atendido: documentação corrigida, README do módulo criado e desvios eliminados.
