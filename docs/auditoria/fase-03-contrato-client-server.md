# Fase 3: Contrato Client ↔ Servidor

- **Data**: 2026-10-03
- **Branch**: `fix/swap-pol-blk-balance`
- **Alvo**: `localhost`
- **Estado do Gate G3**: `VERIFICADO`

---

## 1. Inventário de Endpoints e Chamadas Client

| Método | Rota Exata | Chamada Client (SPA) | Autenticação | Rate Limit | Objetivo |
|---|---|---|---|---|---|
| `GET` | `/api/swap/balances` | `walletApi.getSwapBalances()` | `requireAuth` | 30 req / 60s | Obter saldos e cotações (POL, SHIB, BLK) |
| `POST` | `/api/swap/execute` | `walletApi.postSwapExecute(body)` | `requireAuth` | 30 req / 60s | Executar conversão atômica de POL/SHIB para BLK |
| `GET` | `/api/wallet/balance` | `walletApi.getBalance()` (via `onRefresh`) | `requireAuth` | Padrão | Atualizar saldos consolidados da carteira pós-swap |

---

## 2. Matriz de Divergências Encontradas e Soluções

| Item | Frontend Esperado (`client`) | Backend Anterior (`server`) | Divergência | Resolução Padronizada |
|---|---|---|---|---|
| **Payload Response `POST /api/swap/execute`** | Espera refletir novos saldos ou invocar `onRefresh()` | Devolvia apenas `{ ok: true, rate, output }` | O backend não retornava os saldos consolidados pós-transação na mesma resposta | O response de sucesso passa a incluir `balances: { POL, SHIB, BLK }` atualizados |
| **Invalidação de Cache de Saldo** | Espera que `walletApi.getBalance()` reflita o novo saldo de POL reduzido | Mantinha `balanceCache` em memória por 10s sem invalidação | O saldo antigo era servido da memória pelo TTL de 10s | `executeSwapForUser` dispara `invalidateBalanceCache(userId)` e `invalidateAuthUserCache(userId)` |
| **Códigos de Erro (`code`)** | Tratamento por `res.data.code` ou mensagem estável | Retornava strings ad-hoc em `message` sem `code` estável (exceto `invalid_pair`) | Falta de rastreabilidade de código estável | Padronização dos códigos: `SWAP_INVALID_PAIR`, `SWAP_INVALID_AMOUNT`, `SWAP_INSUFFICIENT_BALANCE`, `SWAP_OUTPUT_TOO_SMALL`, `SWAP_USER_NOT_FOUND` |
| **Strict Schema** | Envia apenas `fromAsset`, `toAsset`, `amount` | Schema com `.strict()` já ativo | Nenhuma divergência estrutural no body aceito | Mantido `.strict()` contra mass assignment |

---

## 3. Contrato Tipado Final

### 3.1 `GET /api/swap/balances`
- **Request**: Sem body. Header `Authorization: Bearer <token>` ou Cookie de sessão.
- **Response 200 OK**:
```json
{
  "ok": true,
  "balances": {
    "POL": 10.5,
    "SHIB": 500000,
    "BLK": 25.0
  },
  "prices": {
    "POL": 0.0912,
    "SHIB": 0.0000056,
    "BLK": 1.0
  }
}
```
- **Response 401 Unauthorized**:
```json
{
  "ok": false,
  "code": "AUTH_REQUIRED",
  "message": "Autenticação necessária."
}
```

### 3.2 `POST /api/swap/execute`
- **Request Body (Zod strict)**:
```json
{
  "fromAsset": "POL",
  "toAsset": "BLK",
  "amount": 5.0
}
```
- **Response 200 OK**:
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
- **Response 400 Bad Request (Exemplos de Erros com Códigos Estáveis)**:
```json
{
  "ok": false,
  "code": "SWAP_INSUFFICIENT_BALANCE",
  "message": "Insufficient POL balance"
}
```
```json
{
  "ok": false,
  "code": "SWAP_INVALID_AMOUNT",
  "message": "Invalid amount"
}
```
```json
{
  "ok": false,
  "code": "SWAP_INVALID_PAIR",
  "message": "Swap BLK→POL not supported (only POL→BLK and SHIB→BLK)"
}
```

---

## 4. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0008
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/swap/swap.service.test.mjs
Ambiente: local (localhost)
Resultado: 4/4 testes passando com validação rigorosa de contrato para pares válidos, pares inválidos e Zod strict schema.
Arquivos: tests/swap/swap.service.test.mjs, server/modules/swap/swap.routes.ts
Conclusão: O contrato client/server foi formalizado e não apresenta ambiguidades de tipos ou rotas.
```

---

## 5. Conclusão do Gate G3

O Gate G3 foi atendido: divergências mapeadas, contrato com códigos estáveis documentado e tipos rigorosamente alinhados entre frontend e backend.
