# Fase 3: Contrato Client ↔ Servidor

- **Data**: 2026-10-03
- **Branch**: `fix/popup-taxa-energia`
- **Alvo**: `localhost`
- **Estado do Gate G3**: `VERIFICADO`

---

## 1. Inventário de Endpoints e Chamadas Client

| Método | Rota Exata | Chamada Client (SPA) | Autenticação | Rate Limit | Objetivo |
|---|---|---|---|---|---|
| `GET` | `/api/energy-tax/summary` | `dashboardApi.getEnergyTaxSummary()` | `requireAuth` | 60 req / 60s | Obter resumo da taxa semanal, cotações em POL/BLK/SHIB e status de isenção/pagamento |
| `POST` | `/api/energy-tax/pay-daily` | `api.post('/energy-tax/pay-daily', { currency })` | `requireAuth` | 10 req / 60s | Efetuar liquidação diária da taxa de energia com a moeda selecionada |
| `GET` | `/api/auth/session` | `checkSession({ silent: true })` | Cookie / Bearer | Padrão | Revalidar sessão e atualizar flags de estado do usuário pós-pagamento |

---

## 2. Matriz de Divergências Encontradas e Soluções

| Item | Frontend (`client`) | Backend (`server`) | Divergência | Resolução Padronizada |
|---|---|---|---|---|
| **Contrato de Rota GET** | `GET /energy-tax/summary` via wrapper `getEnergyTaxSummary()` | Montado em `/api/energy-tax/summary` | Nenhuma divergência | Contrato validado e idêntico |
| **Contrato de Rota POST** | `POST /energy-tax/pay-daily` enviando `{ currency: TaxPayCurrency }` | `postPayDaily` aceita `{ currency }` validado por `parseTaxPayCurrency` | Nenhuma divergência | Contrato validado e idêntico |
| **Moedas Suportadas** | `'POL'`, `'BLK'`, `'SHIB'` | `parseTaxPayCurrency` valida `'POL' \| 'BLK' \| 'SHIB'` | Nenhuma divergência | Enum tipado e sincronizado |
| **Estrutura de Cotações (`todayPayQuotes`)** | `TaxPayQuotes` (`Record<'POL'\|'BLK'\|'SHIB', { amount, balance, affordable }>`) | `todayPayQuotes` com `amount`, `balance`, `affordable` por moeda | Nenhuma divergência | Tipos compatíveis e testados |
| **Códigos de Erro** | `logDashboardError` captura `code` e `status` HTTP | `NOT_STARTED` (403), `ALREADY_PAID` (409), `NO_REWARDS` (400), `INSUFFICIENT_BALANCE` (400) | Nenhuma divergência | Códigos de erro estáveis e tipados |

---

## 3. Especificação do Contrato Tipado

### 3.1 `GET /api/energy-tax/summary`
- **Autenticação**: Obrigatória (`requireAuth`). Rejeita 401 se deslogado.
- **Headers**: `Accept: application/json`, `Cookie: ...` ou `Authorization: Bearer <token>`.
- **Response 200 OK**:
```json
{
  "ok": true,
  "active": true,
  "unpaidDays": 2,
  "todayDailyCharge": 0.00142857,
  "todayPaid": false,
  "todayExempt": false,
  "yesterdayRewards": 0.02,
  "fullRateTax": 0.003,
  "dailyRateTax": 0.001,
  "totalRewards7d": 0.02,
  "todayPayQuotes": {
    "POL": {
      "amount": 0.00142857,
      "balance": 1.5,
      "affordable": true
    },
    "BLK": {
      "amount": 0.015,
      "balance": 10.0,
      "affordable": true
    },
    "SHIB": {
      "amount": 250,
      "balance": 0,
      "affordable": false
    }
  }
}
```
- **Response 500 Internal Server Error**:
```json
{
  "ok": false,
  "message": "Erro ao carregar resumo."
}
```

### 3.2 `POST /api/energy-tax/pay-daily`
- **Autenticação**: Obrigatória (`requireAuth`).
- **Rate Limit**: 10 requisições por 60 segundos por IP/usuário.
- **Request Body**:
```json
{
  "currency": "POL"
}
```
*(Valores aceitos em `currency`: `"POL" | "BLK" | "SHIB"`)*.
- **Response 200 OK**:
```json
{
  "ok": true,
  "charge": 0.00142857,
  "currency": "POL"
}
```
- **Response 400 Bad Request (Sem recompensas)**:
```json
{
  "ok": false,
  "code": "NO_REWARDS",
  "message": "Você não possui recompensas pendentes para tributação hoje."
}
```
- **Response 400 Bad Request (Saldo insuficiente)**:
```json
{
  "ok": false,
  "code": "INSUFFICIENT_BALANCE",
  "message": "Saldo insuficiente em POL.",
  "required": 0.00142857,
  "available": 0.0001,
  "currency": "POL"
}
```
- **Response 409 Conflict (Já pago hoje)**:
```json
{
  "ok": false,
  "code": "ALREADY_PAID",
  "message": "Taxa de energia de hoje já foi quitada."
}
```

---

## 4. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0011
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/energy-tax/energyTax.service.test.mjs
Ambiente: local (localhost)
Resultado: 16 testes de cálculo, taxas e datas de vigência aprovados com sucesso.
Arquivos: tests/energy-tax/energyTax.service.test.mjs
Conclusão: Regras de negócio de taxas do backend satisfazem integralmente as premissas do contrato.
```

```text
EVIDÊNCIA-ID: EV-0012
Estado: VERIFICADO
Comando: npm test -- src/features/dashboard/components/DashboardEnergyTaxModal.test.tsx (em client/)
Ambiente: local (localhost)
Resultado: 13 testes do componente aprovados, cobrindo cenários de sucesso, erro de API, isenção e seleção de moeda.
Arquivos: client/src/features/dashboard/components/DashboardEnergyTaxModal.test.tsx
Conclusão: Consumo do contrato pelo client verificado e aprovado.
```

---

## 5. Conclusão do Gate G3

- [x] Inventário completo de endpoints e chamadas client documentado.
- [x] Matriz de divergências revisada e validada (zero divergências estruturais).
- [x] Contrato de request, response e códigos de erro estáveis formalizados.
- [x] Estado do Gate G3: `VERIFICADO`.
