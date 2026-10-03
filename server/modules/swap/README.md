# Módulo Swap

O módulo de **Swap** é responsável pela conversão unidirecional interna de criptoativos de mineração (`POL` e `SHIB`) para o token de utilidade interno `BLK` (onde 1 BLK ≈ US$ 1.00).

---

## 1. Regras de Negócio e Invariantes

1. **Unidirecionalidade Estrita**:
   - Apenas os pares `POL → BLK` e `SHIB → BLK` são válidos (`VALID_SWAP_PAIRS`).
   - É estritamente proibido converter `BLK` de volta para ativos sacáveis (`BLK → POL`, `BLK → SHIB`) ou swaps entre moedas sacáveis (`POL ↔ USDC`, `POL ↔ SHIB`).
2. **Cotação e Taxas**:
   - A precificação USD é obtida via oráculo compartilhado `cryptoPrice` (`getPolUsdPrice`, `getShibUsdPrice`).
   - Se os oráculos externos estiverem inacessíveis, são empregadas taxas de segurança conservadoras nomeadas (`SWAP_FALLBACK_POL_USD = 0.09` e `SWAP_FALLBACK_SHIB_USD = 0.0000055`).
   - O cliente SPA nunca dita a cotação nem o montante de saída: todo cálculo é estritamente de autoridade do servidor.
3. **Atomicidade e Integridade de Saldo**:
   - Débito do ativo de origem e crédito em `blkBalance` ocorrem dentro da mesma `$transaction` do Prisma.
   - O saldo de origem nunca pode ficar negativo (`polBalance >= amountNum`).
   - Proteção de concorrência com bloqueio pessimista ou verificação atômica de saldo.
4. **Invalidação de Cache Imediata**:
   - Após a efetivação no banco de dados, o serviço invalida os caches em memória:
     - `invalidateBalanceCache(userId)` em `server/modules/wallet/balance/balance.service.ts` (TTL padrão de 10s).
     - `invalidateAuthUserCache(userId)` em `server/shared/security/authUser.ts` (TTL padrão de 30s).
   - Isso garante que chamadas subsequentes a `GET /api/wallet/balance` retornem imediatamente o saldo atualizado sem atraso perceptível para o jogador.

---

## 2. Endpoints

### `GET /api/swap/balances`
- **Auth**: Requer autenticação de sessão (`requireAuth`).
- **Rate Limit**: 30 requisições / 60 segundos.
- **Resposta**: Retorna saldos (`POL`, `SHIB`, `BLK`) e cotações correntes.

### `POST /api/swap/execute`
- **Auth**: Requer autenticação de sessão (`requireAuth`).
- **Rate Limit**: 30 requisições / 60 segundos.
- **Validação**: Zod `swapSchema.strict()`.
- **Payload**:
  ```json
  {
    "fromAsset": "POL",
    "toAsset": "BLK",
    "amount": 5.0
  }
  ```
- **Resposta Sucesso (200)**:
  ```json
  {
    "ok": true,
    "rate": 0.0912,
    "output": 0.456,
    "balances": {
      "POL": 5.5,
      "SHIB": 500000,
      "BLK": 25.456
    }
  }
  ```
- **Respostas de Erro (400)**: Códigos de erro estáveis padronizados (`SWAP_INVALID_PAIR`, `SWAP_INVALID_AMOUNT`, `SWAP_INSUFFICIENT_BALANCE`, `SWAP_OUTPUT_TOO_SMALL`).
