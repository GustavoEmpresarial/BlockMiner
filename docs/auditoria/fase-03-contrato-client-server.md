# Fase 3: Contrato Client ↔ Servidor

- **Data**: 2026-10-03
- **Branch**: `feature/transparency-page-redesign`
- **Alvo**: `localhost`
- **Estado do Gate G3**: `VERIFICADO`

---

## 1. Inventário de Endpoints e Chamadas Client

A página `/transparency` consome exclusivamente a superfície pública de leitura montada em `/api/transparency`:

| Método | Rota Exata | Chamador Client (SPA) | Autenticação | Rate Limit | Resposta Esperada (200) |
|---|---|---|---|---|---|
| `GET` | `/api/transparency` | `TransparencyPage.tsx:63` | Pública | 60 req / 60s | `{ ok: true, entries: TransparencyEntry[], asOf: string }` |
| `GET` | `/api/transparency/wallets-live` | `TransparencyPage.tsx:67` | Pública | 60 req / 60s | `{ ok: true, wallets: TrackedWalletEntry[], asOf: string }` |
| `GET` | `/api/transparency/external-investments` | `transparency.wallets.tsx:432` | Pública | 60 req / 60s | `{ ok: true, investments: ExternalInvestmentEntry[] }` |
| `GET` | `/api/transparency/hardware-assets` | `transparency.hardware.tsx:143` | Pública | 60 req / 60s | `{ ok: true, assets: HardwareAssetEntry[] }` |
| `GET` | `/api/transparency/withdrawal-stats` | `transparency.withdrawals.tsx:13` | Pública | 60 req / 60s | `{ ok: true, totalPol: number, totalCount: number, totalUsd: number \| null }` |

---

## 2. Matriz de Divergências Encontradas e Soluções

| Item | Frontend (`client`) | Backend (`server`) | Divergência | Resolução Padronizada |
|---|---|---|---|---|
| **Rotas e Métodos** | Todos utilizam `GET` relativo a `/api/transparency/*` | Express router montado em `/api/transparency` com `publicLimiter` | Nenhuma divergência | Contratos de rota alinhados |
| **Campos de Entradas (`entries`)** | Consome `id`, `name`, `amountUsd`, `period`, `category`, `type`, `isPaid`, `provider`, `providerUrl`, `imageUrl` | Retorna exatamente essas propriedades tipadas com `Prisma.Decimal` convertido para número | Nenhuma divergência | Schema consistente |
| **Campos de Carteiras (`wallets`)** | Consome `address`, `label`, `valueUsd`, `totalUsd`, `chain`, `displayMode`, `isActive`, `includeInTotals`, `liquidityPools` | `mapWalletForPublic` normaliza flags legadas e provê `valueUsd` e `liquidityPools` | Nenhuma divergência | Tipos compatíveis |
| **Cabeçalhos de Tabela Hardcoded (P4)** | Tabelas continham cabeçalhos fixos em português no JSX | Frontend deve ler via i18n (`transparency.table.col_*`) | Divergência de internacionalização (P4) | Chaves padronizadas no i18n nos 3 idiomas |

---

## 3. Especificação do Contrato Tipado

### 3.1 `GET /api/transparency`
- **Request**: Sem body, sem parâmetros obrigatórios.
- **Headers**: `Accept: application/json`.
- **Response 200 OK**:
```json
{
  "ok": true,
  "entries": [
    {
      "id": 1,
      "type": "expense",
      "category": "infrastructure",
      "name": "Hetzner Dedicated Server",
      "provider": "Hetzner",
      "providerUrl": "https://hetzner.com",
      "imageUrl": "/media/transparency/hetzner.png",
      "amountUsd": 120.0,
      "amountOriginal": null,
      "currencyCode": "USD",
      "period": "monthly",
      "isPaid": true,
      "isActive": true,
      "isOnChain": false,
      "blockchain": null,
      "direction": null,
      "referenceUrl": null,
      "notes": null,
      "sortOrder": 1,
      "updatedAt": "2026-09-20T00:00:00.000Z"
    }
  ],
  "asOf": "2026-09-20T00:00:00Z"
}
```

### 3.2 `GET /api/transparency/wallets-live`
- **Request**: Sem body.
- **Response 200 OK**:
```json
{
  "ok": true,
  "wallets": [
    {
      "id": 1,
      "label": "Polygon Treasury",
      "address": "0x56a655787f73ffab2cbdb702008adacb60f1c9fc",
      "chain": "polygon",
      "assetSymbol": "USDC",
      "explorerBaseUrl": "https://polygonscan.com/address",
      "displayMode": "live",
      "isActive": true,
      "includeInTotals": true,
      "manualUsdValue": null,
      "manualValueNote": null,
      "warming": false,
      "totalUsd": 25000.0,
      "valueUsd": 25000.0,
      "valuePol": 1500.0,
      "chains": [],
      "tokens": [],
      "nfts": [],
      "fetchedAt": "2026-09-20T00:00:00.000Z",
      "liquidityPools": []
    }
  ],
  "asOf": "2026-09-20T00:00:00Z"
}
```

### 3.3 `GET /api/transparency/withdrawal-stats`
- **Request**: Sem body.
- **Response 200 OK**:
```json
{
  "ok": true,
  "totalPol": 1450.25,
  "totalCount": 320,
  "totalUsd": 145.02
}
```

---

## 4. Evidências de Validação

```text
EVIDÊNCIA-ID: EV-0010
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/transparency/transparency.public.exports.test.mjs
Ambiente: local (localhost)
Resultado: 4/4 testes passando com 100% de sucesso, confirmando que os handlers públicos mapeiam corretamente wallets, snapshots, pools de liquidez e valores em USD.
Arquivos: tests/transparency/transparency.public.exports.test.mjs, server/modules/transparency/transparency.controller.ts
Conclusão: Contratos da API pública verificados dinamicamente com respostas íntegras e estáveis.
```

```text
EVIDÊNCIA-ID: EV-0011
Estado: VERIFICADO
Comando: npm test -- src/features/transparency (em client/)
Ambiente: local (localhost / vitest v3.2.7)
Resultado: 3/3 testes passando com 100% de sucesso, confirmando que o client consome os contratos sem incompatibilidades.
Arquivos: client/src/features/transparency/__tests__/TransparencyPage.test.tsx
Conclusão: Consumo dos contratos pelo frontend validado e sem divergências.
```

---

## 5. Conclusão do Gate G3

- [x] Inventário completo de endpoints públicos e chamadores client documentado.
- [x] Matriz de divergências revisada e validada (zero divergências estruturais na API).
- [x] Contratos tipados de leitura pública formalizados e verificados por testes.
- [x] Estado do Gate G3: `VERIFICADO`.
