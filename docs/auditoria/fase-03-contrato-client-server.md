# Fase 3 — Contrato Client ↔ Servidor da Página /dashboard

**Data**: 04/10/2026  
**Responsável**: Executor (Antigravity / Gemini 3.8 Flash High)  
**Ambiente**: Localhost (127.0.0.1)  
**Branch de Trabalho**: `feature/dashboard-page-redesign`

---

## 1. Inventário de Endpoints Consumidos pela Feature `/dashboard`

| Método | Rota | Autenticação | Rate Limit | Handler no Servidor | Finalidade no Dashboard |
|---|---|---|---|---|---|
| `GET` | `/api/wallet/balance` | `requireAuth` | Padrão API | `balance.controller.ts:getBalance` | Saldo em carteira (POL, BLK, SHIB) |
| `GET` | `/api/mining/cycle` | `authenticateTokenOptional` | Padrão API | `mining.controller.ts:getMiningCycle` | Snapshot da rede, minerador e blocos |
| `PATCH` | `/api/mining/allocation` | `requireAuth` | Padrão API | `mining.controller.ts:patchMiningAllocation` | Atualiza divisão de hashrate POL/SHIB |
| `POST` | `/api/user/link-referral` | `requireAuth` | Padrão API | `user.controller.ts:linkReferral` | Vincula código de indicação de amigo |
| `GET` | `/api/rooms/slots` | `requireAuth` | Padrão API | `rooms.controller.ts:getSlotsSummary` | Racks livres e itens no inventário |
| `GET` | `/api/wallet/withdraw-fee-info` | `requireAuth` | Padrão API | `withdrawal.controller.ts:getWithdrawFeeInfo` | Progresso de isenção de taxa de saque |
| `GET` | `/api/energy-tax/summary` | `requireAuth` | 60 req/min | `energy-tax.controller.ts:getSummary` | Status de cobrança da taxa de energia |
| `GET` | `/api/banners` | Público | Padrão API | `banners.controller.ts:getActiveBanners` | Banners ativos para o carrossel |

---

## 2. Matriz de Divergências de Contrato

| Parâmetro / Aspecto | Frontend (`client/src/features/dashboard`) | Backend (`server/`) | Divergência | Resolução |
|---|---|---|---|---|
| `/api/wallet/balance` | Consome `balance`, `polBalance`, `blkBalance`, `shibBalance` via `mapWalletBalancePayload` | Retorna `{ ok: true, balance, polBalance, blkBalance, shibBalance, ... }` | Nenhuma | Conforme |
| `/api/mining/cycle` | Consome `blockHistory`, `miner`, `blockReward`, `blockRewardShib`, `blockCountdownSeconds` | Retorna snapshot sanitizado com histórico e miner | Nenhuma | Conforme |
| `/api/mining/allocation` | Envia `{ polBps: number }` (0 a 10000) | Valida via schema Zod e converte no motor de mineração | Nenhuma | Conforme |
| `/api/user/link-referral` | Envia `{ refCode: string }` sanitizado | Valida e vincula patrocinador | Nenhuma | Conforme |
| `/api/rooms/slots` | Consome `freeRacks`, `inventoryCount` | Retorna contagens agregadas de racks e inventário | Nenhuma | Conforme |
| `/api/wallet/withdraw-fee-info` | Consome `feeWaived`, `completionsToday`, `requiredForWaiver`, `feeAlreadyChargedToday` | Retorna progresso e waiver | Nenhuma | Conforme |
| `/api/energy-tax/summary` | Consome `active`, `unpaidDays`, `todayPaid`, `todayExempt` | Retorna status de auditoria fiscal de mineração | Nenhuma | Conforme |
| `/api/banners` | Consome array `banners` com `id`, `title`, `message`, `imageUrl`, `link`, `endsAt` | Retorna lista de banners ativos | Nenhuma | Conforme |

**Resultado da Matriz de Divergências**: **0 divergências** entre cliente e servidor.

---

## 3. Regra Especial de Dinheiro e Recompensa

- O frontend é **estritamente passivo** em relação a saldos, hashrate e recompensas.
- Nenhum valor monetário é manipulado ou enviado como autoridade pelo cliente.
- Valores ausentes ou em carregamento degradam com segurança para valores neutros (`—`, `0` ou estado vazio honesto), conforme requisito invariante.

---

## 4. Evidências da Fase 3

```text
EVIDÊNCIA-ID: EV-0006
Estado: VERIFICADO
Comando: npx vitest run features/dashboard/lib/dashboard.api.test.ts
Ambiente: local
Resultado: 9 testes passando (100% de sucesso nos contratos da API)
Arquivos: client/src/features/dashboard/lib/dashboard.api.ts
Conclusão: Contratos de endpoints e schemas validados sem divergência.
```

---

## 5. Critérios do Gate da Fase 3

- [x] Todos os 8 endpoints consumidos inventariados e mapeados para rotas do servidor.
- [x] Matriz de divergências preenchida e sem pendências.
- [x] Schemas de entrada e saída validados.
- [x] Regra de inviolabilidade de dados financeiros respeitada.
- [x] Testes de API da feature executados e verdes.
- [x] Commit separado da fase concluído.
