# Financeiro (admin)

## 📊 Resumo rápido

| | |
|---|---|
| **Rota (client)** | `/admin/finance` |
| **Componente** | `client/src/features/admin/finance/AdminFinancePage.tsx` |
| **Chamadas de API** | `client/src/features/admin/lib/admin.api.ts` — `listPendingWithdrawals`, `approveWithdrawal`, `rejectWithdrawal`, `completeWithdrawal` |
| **Rotas servidor** | `server/modules/wallet/wallet.admin.routes.ts` → `GET/POST /admin/wallet/withdrawals/*` (atrás de `requireAdminAuth`) |
| **Controller/service/repo** | `server/modules/wallet/withdrawal/{withdrawal.controller.ts, withdrawal.service.ts, withdrawal.repository.ts}` |
| **Auto-envio** | `server/modules/wallet/withdrawal/withdrawal.auto-send.ts` (cron, hot wallet / CoinEx) |
| **Tabela do banco** | `transaction` (Prisma model `Transaction`, `type` = `withdrawal` ou `shib_withdrawal`) |
| **Testes** | `tests/wallet/withdrawal.repository.test.mjs`, `withdrawal.admin.controller.test.mjs`, `withdrawal.auto-send.characterization.test.mjs`, `withdrawal.fee-info.integration.test.mjs`, `shib-withdraw-min.test.mjs` |

## 1. O que essa página faz

Mostra a fila de saques que precisam de ação do admin (`pending`/`approved`/`processing`) e um histórico somente-leitura dos últimos 50 saques concluídos/rejeitados/falhados. Três ações: **Aprovar**, **Rejeitar**, **Concluir** (marcar como enviado com o hash da transação on-chain).

## 2. Status e transições

```
pending ──approve──> approved ──complete──> completed
   │                     │
   └──────reject─────────┘
             │
             v
         rejected  (saldo devolvido)

approved ──(robô de auto-envio)──> processing ──> completed
                                              └──> failed (saldo devolvido)
```

- **`pending`**: acabou de ser solicitado pelo usuário, saldo já reservado (debitado) na criação.
- **`approved`**: admin aprovou; elegível pro robô de auto-envio (`withdrawal.auto-send.ts`) pegar no próximo tick.
- **`processing`**: o robô reivindicou a linha pra transmitir on-chain (via `claimWithdrawalForSend`, guarda atômica).
- **`completed`**: enviado, com `txHash` real. Nunca devolve saldo (já foi debitado na criação, não é "reservado e depois debitado de novo").
- **`rejected`**: admin rejeitou manualmente pela tela. Devolve o saldo reservado (`amount + fee`).
- **`failed`**: o robô de auto-envio tentou e não conseguiu transmitir (ex: CoinEx cancelou). Também devolve o saldo. **Distinção importante**: `rejected` é sempre ação humana; `failed` é sempre o robô — antes dessa reescrita o servidor só gravava `"failed"` nos dois casos, e a tela mostrava "Rejeitado"/"Falhou" como coisas diferentes sem nunca produzir "Rejeitado" de verdade. Corrigido nesta passada.

## 3. Regras de negócio

- **Taxa**: 2.5% (`WITHDRAWAL_FEE_PERCENT`), calculada em `Prisma.Decimal` (não `Number`/float) pra evitar erro de arredondamento — 8 casas decimais.
- **Isenção de taxa**: usuário com ≥10 conclusões de offerwall/anúncio no mesmo dia UTC (`WITHDRAWAL_FEE_WAIVER_REQUIRED`).
- **Mínimo POL**: `WITHDRAW_MIN_POL = 10`. SHIB tem mínimo dinâmico (`WITHDRAW_MIN_SHIB_USD = 0.1` convertido pelo preço ao vivo).
- **Um saque pendente por vez, por tipo** (POL e SHIB contam separado) — reforçado dentro da mesma transação de banco que debita o saldo, evitando corrida entre checagem e débito.
- **Reserva de saldo**: ao criar o saque, `amount + fee` é debitado do `polBalance` (ou `shibBalance` pra SHIB) imediatamente, dentro de uma `$transaction` atômica junto com a criação da linha.
- **Guarda atômica nas ações do admin** (adicionada nesta reescrita): aprovar/rejeitar/concluir agora usam `updateMany` com condição de status anterior (mesmo padrão já usado pelo robô de auto-envio em `claimWithdrawalForSend`), em vez de ler-depois-escrever. Dois cliques concorrentes na mesma linha (dois admins, ou admin + robô) não conseguem mais os dois "vencerem" — quem perde recebe `409`.

## 4. Auto-envio (visão geral, não reescrito nesta passada)

`withdrawal.auto-send.ts` roda via cron, pega linhas `approved`, reivindica atomicamente (`approved → processing`), e tenta enviar via hot wallet ou CoinEx (`WITHDRAWAL_VIA_COINEX`). Autolimitado por `WITHDRAWAL_AUTO_SEND` (desligado por padrão neste ambiente — sem chave privada configurada aqui, é dry-run). Trava por lock distribuído via Redis quando disponível, senão lock em processo único.

**Limitação conhecida, não corrigida nesta passada**: `countAutoSentToday` conta todos os saques `completed` do dia (auto-enviados ou concluídos manualmente pelo admin), não só os de fato auto-enviados — o comentário original já documenta isso como aproximação conservadora (prefere contar a mais do que a menos, pra nunca estourar o limite diário por engano). Corrigir de verdade exigiria uma coluna nova marcando "foi auto-enviado" — fora de escopo aqui.

## 5. O que foi mudado nesta reescrita

- Guarda atômica nas 3 ações do admin (evita corrida de dois cliques simultâneos).
- Log de erro (`log.error`) nos `catch` que antes engoliam a exceção silenciosamente.
- Separação `rejected` (admin) vs `failed` (robô) — só vale daqui pra frente, histórico antigo não foi migrado.
- Removido fallback morto no client (`data.items`, nunca usado pelo servidor).
- Doc-comments nas funções de `admin.api.ts` apontando rota + arquivo servidor exato.
- Layout visual da tela redesenhado (numa passada anterior, sem mudança de lógica).
