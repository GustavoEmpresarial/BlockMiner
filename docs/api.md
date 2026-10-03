# BlockMiner — Catálogo e Especificação de APIs HTTP

> Documentação canônica de contratos e especificações de endpoints do BlockMiner (`current/`).
> Este documento reflete com exatidão o comportamento executável do backend, sem números mágicos nem promessas inexistentes.

---

## 1. Padrões Globais de API

### 1.1 Prefixo e Formato de Dados
- Todos os endpoints da API HTTP são prefixados por `/api/`.
- Todas as requisições com corpo enviam `Content-Type: application/json`.
- Todas as respostas retornam `Content-Type: application/json; charset=utf-8`.
- A validação de payloads utiliza schemas estritos Zod (`.strict()`), rejeitando quaisquer campos extras ou desconhecidos para prevenir *mass-assignment*.

### 1.2 Padrão de Envelope de Resposta
Todas as respostas da API utilizam um envelope consistente:
- **Sucesso (2xx)**:
  ```json
  {
    "ok": true,
    ...dados
  }
  ```
- **Erro (4xx / 5xx)**:
  ```json
  {
    "ok": false,
    "code": "CODIGO_ESTAVEL",
    "message": "Descrição amigável do erro"
  }
  ```

### 1.3 Autenticação e Autorização
- Endpoints protegidos exigem o middleware `requireAuth` (`server/core/http/middleware/auth.ts`).
- A autenticação é resolvida via cookie seguro de sessão (`auth_token`) ou header padrão `Authorization: Bearer <jwt>`.
- Requisições sem credenciais válidas recebem HTTP `401 Unauthorized`.

### 1.4 Rate Limiting
- Endpoints críticos contam com limitadores por janela deslizante em memória (`server/core/http/middleware/rateLimit.ts`).
- Ao estourar o limite, a API retorna HTTP `429 Too Many Requests`.

---

## 2. Módulo Swap (`/api/swap`)

O módulo de Swap viabiliza a conversão unidirecional interna de criptoativos minerados (`POL` e `SHIB`) para a moeda utilitária interna `BLK` (onde 1 BLK ≈ US$ 1.00).

### Invariantes de Negócio:
1. **Pares permitidos**: Estritamente `POL → BLK` e `SHIB → BLK`.
2. **Pares proibidos**: `BLK → POL`, `BLK → SHIB` (unidirecionalidade), `POL ↔ USDC`, `POL ↔ SHIB`.
3. **Cotação**: Servidor consulta cotação em tempo real via oráculo centralizado (`getPolUsdPrice`, `getShibUsdPrice`). Em caso de falha de conexão com os provedores externos (CoinGecko/Binance), o servidor aplica taxas conservadoras de fallback de segurança nomeadas:
   - `SWAP_FALLBACK_POL_USD = 0.09`
   - `SWAP_FALLBACK_SHIB_USD = 0.0000055`
4. **Precisão contábil**: O montante de saída `output` é calculado com precisão de 8 casas decimais (`Number((amount * rate).toFixed(8))`).

---

### 2.1 `GET /api/swap/balances`
Retorna os saldos atuais do usuário autenticado para as moedas envolvidas no swap e a cotação em USD vigente.

- **Método**: `GET`
- **Caminho**: `/api/swap/balances`
- **Autenticação**: Obrigatória (`requireAuth`)
- **Rate Limit**: 30 requisições a cada 60 segundos por IP/usuário

#### Respostas:
- **`200 OK`**:
  ```json
  {
    "ok": true,
    "balances": {
      "POL": 12.50000000,
      "SHIB": 450000,
      "BLK": 10.25000000
    },
    "prices": {
      "POL": 0.0915,
      "SHIB": 0.00000582,
      "BLK": 1
    }
  }
  ```
- **`401 Unauthorized`**:
  ```json
  {
    "ok": false,
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
  ```
- **`429 Too Many Requests`**:
  ```json
  {
    "ok": false,
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests"
  }
  ```
- **`500 Internal Server Error`**:
  ```json
  {
    "ok": false,
    "message": "Server error"
  }
  ```

---

### 2.2 `POST /api/swap/execute`
Executa a conversão atômica de saldo sob bloqueio pessimista (`FOR UPDATE`), deduzindo o saldo de origem, creditando o saldo em BLK, registrando a operação no ledger e invalidando os caches de saldo em memória.

- **Método**: `POST`
- **Caminho**: `/api/swap/execute`
- **Autenticação**: Obrigatória (`requireAuth`)
- **Rate Limit**: 30 requisições a cada 60 segundos por IP/usuário

#### Schema de Validação (Zod):
```typescript
z.object({
  fromAsset: z.enum(["POL", "SHIB"]),
  toAsset: z.literal("BLK"),
  amount: z.union([z.string().trim(), z.number()]),
}).strict()
```

#### Corpo da Requisição (JSON):
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `fromAsset` | `string` | Sim | Moeda de origem: `"POL"` ou `"SHIB"`. |
| `toAsset` | `string` | Sim | Moeda de destino: Estritamente `"BLK"`. |
| `amount` | `number \| string` | Sim | Quantia a ser convertida (deve ser número positivo finito). |

Exemplo de payload:
```json
{
  "fromAsset": "POL",
  "toAsset": "BLK",
  "amount": 5.0
}
```

#### Respostas:
- **`200 OK`**:
  ```json
  {
    "ok": true,
    "rate": 0.0915,
    "output": 0.4575,
    "balances": {
      "POL": 7.50000000,
      "SHIB": 450000,
      "BLK": 10.70750000
    }
  }
  ```

- **`400 Bad Request`**:
  - **Par não permitido**:
    ```json
    {
      "ok": false,
      "code": "invalid_pair",
      "message": "Swap POL→USDC not supported (only POL→BLK and SHIB→BLK)"
    }
    ```
  - **Tentativa de converter BLK (proibido)**:
    ```json
    {
      "ok": false,
      "code": "invalid_pair",
      "message": "BLK cannot be swapped to withdrawable currencies"
    }
    ```
  - **Quantia inválida (zero, negativa ou não numérica)**:
    ```json
    {
      "ok": false,
      "code": "SWAP_INVALID_AMOUNT",
      "message": "Invalid amount"
    }
    ```
  - **Saldo insuficiente**:
    ```json
    {
      "ok": false,
      "code": "SWAP_INSUFFICIENT_BALANCE",
      "message": "Insufficient POL balance"
    }
    ```
  - **Saída menor que a precisão mínima (8 decimais)**:
    ```json
    {
      "ok": false,
      "code": "SWAP_OUTPUT_TOO_SMALL",
      "message": "Output amount too small"
    }
    ```
  - **Campos adicionais não permitidos (Zod Strict)**:
    ```json
    {
      "ok": false,
      "code": "VALIDATION_ERROR",
      "message": "Unrecognized key(s) in object"
    }
    ```

- **`401 Unauthorized`**: Requisição sem token ou cookie de sessão.
- **`429 Too Many Requests`**: Limite de taxa excedido.

---

## 3. Módulo Carteira (`/api/wallet`) — Relação com Swap

### 3.1 `GET /api/wallet/balance`
Consulta os saldos consolidados do usuário para exibição em dashboard e barra superior da carteira.

- **Método**: `GET`
- **Caminho**: `/api/wallet/balance`
- **Autenticação**: Obrigatória (`requireAuth`)
- **Cache**: Em memória via `balanceCache` com TTL padrão de 10 segundos.

#### Resposta `200 OK`:
```json
{
  "ok": true,
  "balance": 7.50000000,
  "polBalance": 7.50000000,
  "shibBalance": 450000,
  "blkBalance": 10.70750000,
  "blkLocked": 0
}
```

#### Garantia de Invalidação Síncrona:
Ao finalizar o `POST /api/swap/execute`, o servidor chama explicitamente:
1. `invalidateBalanceCache(userId)`
2. `invalidateAuthUserCache(userId)`

Dessa forma, a chamada subsequente `walletApi.getBalance()` disparada pelo gatilho `onRefresh()` do frontend obtém imediatamente o saldo atualizado diretamente do PostgreSQL, eliminando a exibição de saldo *stale*.

---

## 4. Dicionário de Códigos de Erro da API de Swap

| Código HTTP | Código Estável (`code`) | Causa | Ação Recomendada ao Cliente |
|---|---|---|---|
| `400` | `invalid_pair` | Par diferente de `POL->BLK` ou `SHIB->BLK` | Exibir mensagem informando moedas aceitas. |
| `400` | `SWAP_INVALID_AMOUNT` | Quantia `<=` 0, NaN ou nula | Solicitar quantia positiva válida. |
| `400` | `SWAP_INSUFFICIENT_BALANCE` | Saldo menor que o montante solicitado | Atualizar saldos e alertar insuficiência. |
| `400` | `SWAP_OUTPUT_TOO_SMALL` | Conversão resulta em 0 BLK | Solicitar montante maior para conversão. |
| `400` | `SWAP_USER_NOT_FOUND` | Usuário inexistente no banco durante tx | Reautenticar jogador. |
| `400` | `VALIDATION_ERROR` | Violação de schema Zod (ex: payload sujo) | Higienizar corpo da requisição. |
| `401` | `UNAUTHORIZED` | Sessão expirada ou ausente | Redirecionar para login. |
| `429` | `RATE_LIMIT_EXCEEDED` | Mais de 30 requisições por minuto | Aguardar janela de resfriamento. |
