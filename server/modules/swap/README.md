# Módulo Swap

O módulo de **Swap** é responsável pela conversão unidirecional interna de criptoativos de mineração (`POL` e `SHIB`) para o token de utilidade interno `BLK` (onde 1 BLK ≈ US$ 1.00).

---

## 1. Regras de Negócio e Invariantes

1. **Unidirecionalidade Estrita**:
   - Apenas os pares `POL → BLK` e `SHIB → BLK` são permitidos no sistema (`VALID_SWAP_PAIRS` em `swap.pairs.ts`).
   - É expressamente proibido converter `BLK` de volta para moedas sacáveis (`BLK → POL`, `BLK → SHIB`) ou swaps diretos entre moedas externas (`POL ↔ USDC`, `POL ↔ SHIB`).
   - Pares não suportados são rejeitados tanto na camada de rota (Zod `swapSchema.strict()`) quanto na camada de controle e serviço (`isValidSwapPair`).

2. **Cotação e Autoridade do Servidor**:
   - A precificação em USD é obtida via oráculo centralizado de cotações (`cryptoPrice.ts` -> `getPolUsdPrice`, `getShibUsdPrice`).
   - Se os oráculos externos (CoinGecko / Binance) estiverem indisponíveis ou retornarem zero, taxas conservadoras de fallback de segurança são aplicadas:
     - `SWAP_FALLBACK_POL_USD = 0.09` (USD por POL)
     - `SWAP_FALLBACK_SHIB_USD = 0.0000055` (USD por SHIB)
   - O cliente SPA nunca dita a taxa de câmbio nem o montante de saída: o cálculo `output = Number((amountNum * safeRate).toFixed(8))` é de autoridade estrita do servidor.
   - Operações cujo `output` resulte em zero após arredondamento a 8 casas decimais são rejeitadas com `SWAP_OUTPUT_TOO_SMALL`.

3. **Atomicidade, Bloqueio Concorrente e Integridade Financeira**:
   - Todas as mutações de saldo e auditoria são executadas dentro de uma `$transaction` atômica do Prisma com timeout e isolamento adequados.
   - **Bloqueio Pessimista (`FOR UPDATE`)**: `findUserBalancesTx` executa `SELECT id FROM users WHERE id = ${userId} FOR UPDATE` para serializar requisições paralelas do mesmo usuário e impedir double-spending ou saldo negativo.
   - O saldo de origem é verificado dentro da transação após aquisição do bloqueio: se `user.polBalance < amountNum` (ou `user.shibBalance < amountNum`), a transação sofre rollback imediato com `SWAP_INSUFFICIENT_BALANCE`.
   - **Auditoria no Ledger Financeiro**: Cada operação concluída com êxito insere atomicamente uma linha na tabela `transactions` com:
     - `userId`: ID do usuário autenticado
     - `type`: `"swap"`
     - `amount`: valor debitado da moeda de origem
     - `status`: `"completed"`
     - `completedAt`: timestamp atual
     - `usdRateAtConfirmation`: taxa/cotação aplicada
     - `usdValueAtConfirmation`: valor creditado em BLK (`output`)

4. **Invalidação Síncrona de Cache de Saldo**:
   - O backend utiliza caches em memória para otimizar leitura:
     - `balanceCache` em `server/modules/wallet/balance/balance.service.ts` (TTL padrão de 10s).
     - `authUserCache` em `server/shared/security/authUser.ts` (TTL padrão de 30s).
   - Imediatamente após a confirmação do commit da transação no banco, o serviço executa:
     - `invalidateBalanceCache(userId)`
     - `invalidateAuthUserCache(userId)`
   - Isso elimina qualquer estado *stale* (desatualizado): chamadas imediatas do frontend via `onRefresh()` para `GET /api/wallet/balance` retornam o novo saldo debitado sem atraso perceptível.

---

## 2. Especificação de Endpoints

### `GET /api/swap/balances`
Retorna os saldos atuais do jogador para as moedas participantes do swap e as cotações vigentes em USD.

- **Autenticação**: Requer sessão autenticada (`requireAuth`).
- **Rate Limit**: 30 requisições / 60 segundos por IP/sessão (`swapLimiter`).
- **Headers Requeridos**: Cookie de sessão ou header de autorização válido.
- **Resposta Sucesso (200 OK)**:
  ```json
  {
    "ok": true,
    "balances": {
      "POL": 15.5,
      "SHIB": 500000,
      "BLK": 12.35
    },
    "prices": {
      "POL": 0.0912,
      "SHIB": 0.00000574,
      "BLK": 1
    }
  }
  ```
- **Respostas de Erro**:
  - `401 Unauthorized`: Sem sessão autenticada (`{ "ok": false, "code": "UNAUTHORIZED", "message": "Authentication required" }`).
  - `429 Too Many Requests`: Excedeu o limite de requisições (`{ "ok": false, "code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests" }`).
  - `500 Internal Server Error`: Falha ao consultar saldos ou oráculo (`{ "ok": false, "message": "Server error" }`).

---

### `POST /api/swap/execute`
Executa a conversão atômica unidirecional do ativo informado para BLK.

- **Autenticação**: Requer sessão autenticada (`requireAuth`).
- **Rate Limit**: 30 requisições / 60 segundos por IP/sessão (`swapLimiter`).
- **Validação de Schema (Zod)**:
  ```typescript
  export const swapSchema = z
    .object({
      fromAsset: z.enum(["POL", "SHIB"]),
      toAsset: z.literal("BLK"),
      amount: z.union([z.string().trim(), z.number()]),
    })
    .strict();
  ```
  *(Qualquer campo adicional no payload acarreta rejeição 400 por `.strict()`)*.

- **Payload de Requisição**:
  ```json
  {
    "fromAsset": "POL",
    "toAsset": "BLK",
    "amount": 5.0
  }
  ```

- **Resposta Sucesso (200 OK)**:
  ```json
  {
    "ok": true,
    "rate": 0.0912,
    "output": 0.456,
    "balances": {
      "POL": 10.5,
      "SHIB": 500000,
      "BLK": 12.806
    }
  }
  ```

- **Respostas de Erro (400 Bad Request)**:
  - Par Inválido:
    ```json
    {
      "ok": false,
      "code": "invalid_pair",
      "message": "Swap POL→USDC not supported (only POL→BLK and SHIB→BLK)"
    }
    ```
  - Tentativa de Swap Reverso (BLK como origem):
    ```json
    {
      "ok": false,
      "code": "invalid_pair",
      "message": "BLK cannot be swapped to withdrawable currencies"
    }
    ```
  - Quantia Inválida (negativa, zero ou NaN):
    ```json
    {
      "ok": false,
      "code": "SWAP_INVALID_AMOUNT",
      "message": "Invalid amount"
    }
    ```
  - Saldo Insuficiente:
    ```json
    {
      "ok": false,
      "code": "SWAP_INSUFFICIENT_BALANCE",
      "message": "Insufficient POL balance"
    }
    ```
  - Saída Mínima Não Atingida (arredondamento a 8 decimais = 0):
    ```json
    {
      "ok": false,
      "code": "SWAP_OUTPUT_TOO_SMALL",
      "message": "Output amount too small"
    }
    ```
  - Usuário Não Encontrado na Transação:
    ```json
    {
      "ok": false,
      "code": "SWAP_USER_NOT_FOUND",
      "message": "User not found"
    }
    ```
  - Erro Inesperado:
    ```json
    {
      "ok": false,
      "code": "SWAP_ERROR",
      "message": "<mensagem técnica segura>"
    }
    ```

---

## 3. Rastreabilidade com a Interface (SPA)

- O componente `SwapPanel.tsx` (`client/src/features/wallet/components/SwapPanel.tsx`) integra-se diretamente com:
  - `walletApi.getSwapBalances()` -> `GET /api/swap/balances`
  - `walletApi.postSwapExecute(...)` -> `POST /api/swap/execute`
- Ao receber `{ ok: true, balances }`, a interface atualiza o estado local e dispara `onRefresh()` para sincronizar `GET /api/wallet/balance`.
- Como o backend agora invalida tanto `balanceCache` quanto `authUserCache`, o `GET /api/wallet/balance` atende com dados frescos do banco, garantindo que o saldo em POL e o novo saldo em BLK coincidam perfeitamente.

---

## 4. Testes e Evidências Dinâmicas

A integridade do módulo é garantida por suítes dedicadas:
1. `tests/swap/swap.regression.test.mjs`:
   - Regressão do bug de dedução imediata de saldo POL.
   - Invalidação síncrona de cache (`balanceCache` e `authUserCache`).
   - Auditoria na tabela `transactions`.
   - Concorrência de duas requisições paralelas simultâneas (double spend prevenido por `FOR UPDATE`).
   - Integridade transacional e rollback sem mutações espúrias.
   - Rejeição de pares e valores inválidos.
2. `tests/swap/swap.service.test.mjs`:
   - Validação canônica de `isValidSwapPair`.
   - Contrato estrito com `swapSchema` importado da rota oficial.
3. `tests/performance/swap-load.k6.js`:
   - Carga concorrente com 10 VUs processando 1.746 requisições sem erros 5xx e latência p95 de 8.47ms em escrita.
4. `tests/security/kali_swap_pentest.py`:
   - Bateria de testes de segurança com container Kali contra injeção, bypass de autenticação e IDOR.
