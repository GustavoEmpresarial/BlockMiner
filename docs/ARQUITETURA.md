# BlockMiner — Arquitetura (doutrina do monólito modular)

> Documento de referência canônico. Define COMO construir cada módulo do BlockMiner novo.
> Para a árvore de diretórios anotada e o checklist legacy→current, ver `ESTRUTURA_PROJETO.txt`.
> Para o mapa explorável, ver `mapa-mental.html`.

Para o **BlockMiner novo**, a escolha é um **monólito modular simples de verdade**: domínio primeiro, MVC/service/repository dentro do módulo, sem `domain/application/infrastructure` obrigatório, sem dezenas de camadas e sem depósitos globais.

A ideia é esta:

```text
blockminer/
│
├── server/
│   ├── modules/
│   ├── shared/
│   ├── core/
│   ├── workers/
│   ├── cron/
│   └── bootstrap/
│
├── client/
│
├── prisma/
│
├── scripts/
│
├── tests/
│
├── docker/
│
├── docs/
│
├── package.json
├── tsconfig.json
├── docker-compose.yml
└── .env.example
```

## 1. Estrutura completa

```text
blockminer/
│
├── server/
│   │
│   ├── bootstrap/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── routes.ts
│   │   ├── dependencies.ts
│   │   └── shutdown.ts
│   │
│   ├── core/
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── app.config.ts
│   │   │   ├── database.config.ts
│   │   │   ├── redis.config.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── database/
│   │   │   ├── prisma.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── redis/
│   │   │   ├── redis.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── http/
│   │   │   ├── middleware/
│   │   │   ├── errors/
│   │   │   └── http.ts
│   │   │
│   │   ├── logger/
│   │   │   ├── logger.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── queue/
│   │   │   ├── queue.ts
│   │   │   └── index.ts
│   │   │
│   │   └── socket/
│   │       ├── socket.ts
│   │       └── index.ts
│   │
│   ├── shared/
│   │   ├── constants/
│   │   ├── errors/
│   │   ├── types/
│   │   ├── utils/
│   │   └── validators/
│   │
│   ├── modules/
│   │
│   ├── workers/
│   │   ├── mining.worker.ts
│   │   ├── telegram.worker.ts
│   │   ├── notifications.worker.ts
│   │   └── index.ts
│   │
│   └── cron/
│       ├── checkin.cron.ts
│       ├── mining.cron.ts
│       ├── energy-tax.cron.ts
│       └── index.ts
│
├── client/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── tests/
│
├── scripts/
│
├── docs/
│
├── docker/
│
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── .env.example
└── README.md
```

Agora vem a parte mais importante: **`modules/`**.

---

## 2. Cada módulo é uma pequena aplicação

Por exemplo:

```text
server/modules/wallet/
│
├── wallet.controller.ts
├── wallet.service.ts
├── wallet.repository.ts
├── wallet.routes.ts
├── wallet.schemas.ts
├── wallet.types.ts
├── wallet.errors.ts
└── index.ts
```

Isso é o padrão.

Não:

```text
wallet/
├── domain/
├── application/
├── infrastructure/
├── presentation/
└── ...
```

Não precisamos disso.

---

## 3. O que cada arquivo faz

### Controller

Responsável exclusivamente pelo HTTP.

```text
wallet.controller.ts
```

Faz:

```text
request
   ↓
validação
   ↓
service
   ↓
response
```

Não deve conter regra financeira.

Exemplo conceitual:

```ts
export async function getBalance(req, res) {
    const userId = req.user.id;

    const balance = await walletService.getBalance(userId);

    return res.json(balance);
}
```

---

### Service

É o coração do módulo.

```text
wallet.service.ts
```

Contém:

* regras de negócio;
* cálculos;
* validações de negócio;
* coordenação de repositories;
* transações.

Exemplo:

```text
wallet.service
        │
        ├── wallet.repository
        ├── transaction.repository
        └── user.repository
```

O service **não deve saber como HTTP funciona**.

Nada de:

```ts
req.body
res.json()
```

dentro de service.

---

### Repository

Responsável pelo banco.

```text
wallet.repository.ts
```

Aqui ficam:

```text
Prisma
SQL
queries
transactions
```

Exemplo:

```ts
export async function findBalance(userId: string) {
    return prisma.wallet.findUnique({
        where: { userId }
    });
}
```

O controller nunca deveria fazer:

```ts
prisma.wallet.findUnique(...)
```

E o service também não deveria espalhar Prisma pela aplicação.

---

### Routes

```text
wallet.routes.ts
```

Só registra endpoints:

```text
GET    /balance
GET    /transactions
POST   /deposit
POST   /withdraw
```

Exemplo conceitual:

```ts
router.get(
    "/balance",
    authMiddleware,
    walletController.getBalance
);
```

---

### Schemas

```text
wallet.schemas.ts
```

Validação de entrada.

Por exemplo:

```text
depositSchema
withdrawSchema
transactionQuerySchema
```

Não colocar regra de negócio complexa aqui.

---

### Types

```text
wallet.types.ts
```

Tipos TypeScript específicos do módulo:

```text
WalletBalance
DepositInput
WithdrawalInput
TransactionSummary
```

---

### Errors

```text
wallet.errors.ts
```

Erros específicos:

```text
InsufficientBalanceError
WithdrawalDisabledError
InvalidWalletError
```

Não colocar todos os erros do sistema aqui.

---

### index.ts

Esse arquivo é extremamente importante.

```text
wallet/index.ts
```

Ele é a **fronteira pública do módulo**.

Exemplo:

```ts
export {
    getWalletBalance,
    creditWallet,
    debitWallet
} from "./wallet.service.js";
```

Outro módulo deve consumir:

```ts
import { debitWallet } from "../wallet/index.js";
```

e não:

```ts
import { debitWallet } from "../wallet/wallet.service.js";
```

Isso permite reorganizar internamente o módulo depois sem quebrar o resto do sistema.

---

## 4. Módulos pequenos

Não precisamos criar 8 arquivos para tudo.

Um módulo simples pode ser:

```text
checkin/
├── checkin.controller.ts
├── checkin.service.ts
├── checkin.repository.ts
├── checkin.routes.ts
└── index.ts
```

Se só tiver uma regra simples:

```text
health/
├── health.controller.ts
├── health.routes.ts
└── index.ts
```

Não criar:

```text
health/
├── domain/
├── application/
├── infrastructure/
├── presentation/
├── dto/
├── types/
└── validators/
```

para três arquivos.

---

## 5. Módulos grandes

Quando um módulo realmente crescer, aí sim você divide.

Por exemplo:

```text
wallet/
│
├── deposit/
│   ├── deposit.controller.ts
│   ├── deposit.service.ts
│   ├── deposit.repository.ts
│   ├── deposit.routes.ts
│   └── deposit.types.ts
│
├── withdrawal/
│   ├── withdrawal.controller.ts
│   ├── withdrawal.service.ts
│   ├── withdrawal.repository.ts
│   ├── withdrawal.routes.ts
│   └── withdrawal.types.ts
│
├── balance/
│   ├── balance.service.ts
│   └── balance.repository.ts
│
├── transaction/
│   ├── transaction.service.ts
│   └── transaction.repository.ts
│
└── index.ts
```

Ou seja:

> **Subpastas são consequência do crescimento, não obrigação arquitetural.**

---

## 6. Os módulos do BlockMiner

Começar com algo próximo de:

```text
modules/
│
├── auth/
├── users/
│
├── wallet/
├── transactions/
├── deposits/
├── withdrawals/
│
├── mining/
├── machines/
├── inventory/
├── shop/
├── boosts/
├── auto-mining/
│
├── tournaments/
├── checkin/
├── energy-tax/
├── mini-pass/
│
├── offerwall/
├── offerwallme/
├── internal-offerwall/
├── zerads/
├── ptc/
├── shortlinks/
├── faucet/
├── read-earn/
├── traffic/
│
├── social/
├── chat/
├── notifications/
├── support/
│
├── referrals/
├── partner-games/
├── games/
│
├── antibot/
├── session/
│
├── banners/
├── transparency/
├── burn-events/
├── moneyrain/
├── swap/
├── pricing/
│
└── admin/
```

Mas **não transforme isso em 50 módulos automaticamente**.

Um módulo deve existir porque existe uma **fronteira funcional real**.

---

## 7. Admin

Não criar:

```text
admin/
    controllers/
    services/
    repositories/
```

para duplicar cada domínio.

O admin de mineração pertence a:

```text
modules/mining/
```

Então:

```text
mining/
├── mining.controller.ts
├── mining.admin.controller.ts
├── mining.service.ts
├── mining.repository.ts
├── mining.routes.ts
├── mining.admin.routes.ts
└── index.ts
```

Isso é muito melhor.

O mesmo vale para:

```text
wallet/
    wallet.admin.controller.ts

users/
    users.admin.controller.ts

machines/
    machines.admin.controller.ts
```

O domínio continua sendo dono da funcionalidade.

---

## 8. Workers

Workers não devem ficar espalhados pelos módulos.

A infraestrutura fica:

```text
server/workers/
```

Mas o processamento pertence ao módulo.

Exemplo:

```text
server/workers/
└── mining.worker.ts
```

Ele chama:

```text
modules/mining/
```

Então:

```text
worker
   ↓
mining service
   ↓
mining repository
   ↓
Prisma
```

---

## 9. Cron

Mesma ideia:

```text
server/cron/
├── mining.cron.ts
├── checkin.cron.ts
├── energy-tax.cron.ts
└── index.ts
```

O cron **agenda**.

Ele não deveria conter toda a regra de negócio.

Ruim:

```text
energy-tax.cron.ts
    500 linhas de regra
```

Bom:

```text
energy-tax.cron
      ↓
energyTaxService
      ↓
energyTaxRepository
```

---

## 10. Core

`core` é infraestrutura.

Não é lugar para regras do BlockMiner.

Pode conter:

```text
core/
├── config/
├── database/
├── redis/
├── logger/
├── queue/
├── socket/
└── http/
```

Exemplo:

```text
core/database/prisma.ts
```

é permitido.

Mas:

```text
core/miningRewardCalculator.ts
```

é errado.

Isso pertence a:

```text
modules/mining/
```

---

## 11. Shared

`shared` precisa ser **pequeno**.

```text
shared/
├── constants/
├── errors/
├── types/
├── utils/
└── validators/
```

Mas existe uma regra:

> Não coloque algo em `shared` simplesmente porque não sabe onde colocar.

Antes:

```text
shared/utils/foo.ts
```

pergunte:

> Isso é realmente usado por vários módulos e não pertence a nenhum domínio?

Se não:

```text
modules/<dono>/
```

---

## 12. O que NÃO teremos

No novo BlockMiner, ficam proibidos:

```text
server/
├── utils/
├── services/
├── models/
├── controllers/
├── routes/
└── validation/
```

como depósitos globais.

Também evitar:

```text
helpers/
misc/
common/
stuff/
temp/
old/
new/
backup/
```

Essas pastas inevitavelmente viram lixo.

---

## 13. Dependências

A regra:

```text
bootstrap
    ↓
modules
    ↓
shared/core
```

Um módulo:

```text
wallet
```

pode consumir:

```text
core
shared
```

e outro módulo através da **API pública dele**.

Por exemplo:

```text
mining
    ↓
wallet/index.ts
```

Nunca:

```text
mining
    ↓
wallet/wallet.repository.ts
```

---

## 14. Exemplo real de fluxo

Imagine o usuário iniciando mineração.

```text
HTTP
 ↓
mining.routes.ts
 ↓
mining.controller.ts
 ↓
mining.service.ts
 ↓
mining.repository.ts
 ↓
Prisma
```

Se mineração precisar creditar a carteira:

```text
mining.service
       ↓
wallet/index.ts
       ↓
wallet.service
       ↓
wallet.repository
       ↓
Prisma
```

Assim continua sendo **um monólito**.

Não existe HTTP entre módulos.

Não existe API interna.

Não existe microserviço.

É apenas código modularizado dentro do mesmo processo.

---

## 15. Banco de dados

Um único Prisma:

```text
prisma/
├── schema.prisma
└── migrations/
```

E uma única instância:

```text
server/core/database/prisma.ts
```

Todos os repositories usam essa instância.

Não:

```text
wallet/prisma.ts
mining/prisma.ts
users/prisma.ts
```

---

## 16. Transações

Transação pertence ao service/repository conforme a operação.

Exemplo:

```text
withdraw()
    ↓
BEGIN
    ↓
verifica saldo
    ↓
debita
    ↓
cria withdrawal
    ↓
COMMIT
```

O importante é não criar transações escondidas dentro de repositories que já estão sendo chamados dentro de outra transação.

O `tx` deve poder ser propagado quando necessário.

---

## 17. Testes

Manter os testes próximos da funcionalidade:

```text
wallet/
├── wallet.service.ts
├── wallet.repository.ts
├── wallet.controller.ts
├── wallet.routes.ts
│
├── wallet.service.test.ts
├── wallet.repository.test.ts
└── wallet.routes.test.ts
```

E testes maiores:

```text
tests/
├── integration/
├── e2e/
└── fixtures/
```

---

## 18. Frontend

Também orientado a domínio:

```text
client/
└── src/
    ├── app/
    ├── modules/
    │   ├── auth/
    │   ├── wallet/
    │   ├── mining/
    │   ├── machines/
    │   ├── inventory/
    │   ├── shop/
    │   ├── tournaments/
    │   └── offerwall/
    │
    ├── shared/
    └── core/
```

Por exemplo:

```text
modules/wallet/
├── pages/
├── components/
├── hooks/
├── api/
├── types/
└── index.ts
```

Assim backend e frontend usam o mesmo vocabulário:

```text
server/modules/wallet/
client/src/modules/wallet/
```

Isso resolve uma das coisas que estava incomodando no BlockMiner atual.

---

## 19. A regra de ouro

A arquitetura inteira pode ser resumida assim:

```text
                    BLOCKMINER
                        │
          ┌─────────────┴─────────────┐
          │                           │
        CLIENT                      SERVER
          │                           │
       modules                    modules
          │                           │
      wallet ──────────────────── wallet
      mining ──────────────────── mining
      shop ────────────────────── shop
      users ───────────────────── users
```

Cada módulo é responsável pela sua própria funcionalidade.

E dentro dele:

```text
             MODULE
                │
      ┌─────────┼─────────┐
      │         │         │
 controller  service  repository
      │         │         │
      └─────────┴─────────┘
                │
             database
```

É simples.

É previsível.

É escalável.

E principalmente: **não cria uma floresta de pastas só para parecer arquiteturalmente sofisticado.**

---

## 20. Estrutura final adotada

```text
blockminer/
│
├── server/
│   │
│   ├── bootstrap/
│   │
│   ├── core/
│   │   ├── config/
│   │   ├── database/
│   │   ├── http/
│   │   ├── logger/
│   │   ├── queue/
│   │   ├── redis/
│   │   └── socket/
│   │
│   ├── shared/
│   │   ├── constants/
│   │   ├── errors/
│   │   ├── types/
│   │   ├── utils/
│   │   └── validators/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── wallet/
│   │   ├── mining/
│   │   ├── machines/
│   │   ├── inventory/
│   │   ├── shop/
│   │   ├── tournaments/
│   │   ├── offerwall/
│   │   ├── ptc/
│   │   ├── social/
│   │   ├── support/
│   │   └── ...
│   │
│   ├── workers/
│   └── cron/
│
├── client/
│   └── src/
│       ├── app/
│       ├── modules/
│       ├── shared/
│       └── core/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── tests/
├── scripts/
├── docker/
├── docs/
│
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── .env.example
└── README.md
```

Essa é a base adotada para reconstruir o BlockMiner: **monólito modular simples, domínio como fronteira, MVC/service/repository, subpastas somente quando o módulo realmente crescer e zero depósitos globais de negócio.**

---

## 📊 Estado atual do projeto

**Direção:** reconstrução limpa do BlockMiner.

**Arquitetura escolhida:** 🟢 monólito modular simples.

**Backend:** `core + shared + modules + workers + cron + bootstrap`.

**Módulos:** cada domínio possui seu próprio controller/service/repository/routes.

**Clean Architecture obrigatória:** ❌

**Microserviços:** ❌

**Global `services/`, `models/`, `controllers/`, `utils/`:** ❌

**Prisma:** uma única instância central.

**Frontend:** organizado pelos mesmos domínios do backend.

**Regra principal:** começar simples e só criar subpastas quando a complexidade real justificar.

---

## 21. `server/` é o backend, `client/` é o frontend

**`server/` é o backend**. O frontend é outra aplicação dentro do mesmo projeto, normalmente `client/`.

E a mesma filosofia se aplica no frontend: **monólito modular simples**, organizado por funcionalidade, sem transformar cada página em uma floresta de pastas.

```text
blockminer/
│
├── server/                 # BACKEND
│   ├── core/
│   ├── shared/
│   ├── modules/
│   ├── workers/
│   ├── cron/
│   └── bootstrap/
│
├── client/                 # FRONTEND
│   └── src/
│       ├── app/
│       ├── modules/
│       ├── shared/
│       └── core/
│
├── prisma/
├── scripts/
├── tests/
├── docs/
├── docker/
│
├── package.json
├── tsconfig.json
└── docker-compose.yml
```

### Frontend fala o mesmo vocabulário do backend

```text
server/modules/wallet/
client/src/modules/wallet/
```

Isso deixa muito mais fácil trabalhar.

#### Wallet

```text
client/src/modules/wallet/
├── pages/
│   ├── WalletPage.tsx
│   └── TransactionsPage.tsx
│
├── components/
│   ├── BalanceCard.tsx
│   ├── TransactionList.tsx
│   └── WithdrawalForm.tsx
│
├── wallet.api.ts
├── wallet.hooks.ts
├── wallet.types.ts
└── index.ts
```

#### Mining

```text
client/src/modules/mining/
├── pages/
│   ├── MiningPage.tsx
│   └── MachinesPage.tsx
│
├── components/
│   ├── MiningCard.tsx
│   ├── MachineCard.tsx
│   ├── MiningStats.tsx
│   └── BoostPanel.tsx
│
├── mining.api.ts
├── mining.hooks.ts
├── mining.types.ts
└── index.ts
```

#### Tournaments

```text
client/src/modules/tournaments/
├── pages/
├── components/
├── tournaments.api.ts
├── tournaments.hooks.ts
├── tournaments.types.ts
└── index.ts
```

---

### E o `shared/` do frontend?

Também precisa ser pequeno.

```text
client/src/shared/
├── components/
│   ├── Button/
│   ├── Modal/
│   ├── Table/
│   └── Loading/
│
├── hooks/
│   ├── useDebounce.ts
│   └── useMediaQuery.ts
│
├── utils/
├── types/
└── constants/
```

Só entra aqui algo realmente reutilizável.

Por exemplo:

```text
Button
Modal
Table
useDebounce
formatDate
```

Não:

```text
shared/
├── walletUtils.ts
├── miningUtils.ts
├── tournamentUtils.ts
├── offerwallUtils.ts
```

Essas coisas pertencem aos respectivos módulos.

---

### `core/` no frontend

Também tem coisas de infraestrutura da aplicação:

```text
client/src/core/
├── api/
│   ├── client.ts
│   └── interceptors.ts
│
├── auth/
│   ├── auth.ts
│   └── session.ts
│
├── router/
│   └── router.tsx
│
├── websocket/
│   └── socket.ts
│
├── web3/
│   ├── wagmi.ts
│   └── wallet.ts
│
└── i18n/
    ├── config.ts
    └── locales/
```

---

### `app/`

É o ponto de entrada.

```text
client/src/app/
├── App.tsx
├── main.tsx
├── providers.tsx
└── routes.tsx
```

Então:

```text
main.tsx
   ↓
App.tsx
   ↓
providers
   ↓
router
   ↓
module/page
```

---

### E páginas?

Aqui tem uma diferença importante.

**Não fazer**:

```text
pages/
├── wallet/
├── mining/
├── shop/
├── inventory/
├── tournaments/
├── offerwall/
└── ...
```

como uma pasta global.

**Fazer**:

```text
modules/
├── wallet/
│   └── pages/
├── mining/
│   └── pages/
├── shop/
│   └── pages/
└── tournaments/
    └── pages/
```

Assim cada funcionalidade é dona de tudo que pertence a ela.

---

### O resultado

Backend:

```text
server/modules/wallet/
├── wallet.controller.ts
├── wallet.service.ts
├── wallet.repository.ts
├── wallet.routes.ts
└── index.ts
```

Frontend:

```text
client/src/modules/wallet/
├── pages/
├── components/
├── wallet.api.ts
├── wallet.hooks.ts
├── wallet.types.ts
└── index.ts
```

Você olha para `wallet` e encontra **praticamente tudo relacionado à wallet** nos dois lados.

Isso é muito melhor do que o modelo do BlockMiner atual, em que é preciso procurar:

```text
client/pages/
client/shared/
client/api/
client/web3/
server/controllers/
server/services/
server/models/
server/utils/
server/modules/
server/routes/
server/validation/
```

---

### Uma observação importante

**Monólito modular não significa que frontend e backend precisam ser um único código.**

Eles continuam sendo aplicações diferentes:

```text
                 BLOCKMINER
                     │
          ┌──────────┴──────────┐
          │                     │
       CLIENT                 SERVER
      React 19               Node/Express
          │                     │
       modules               modules
          │                     │
          └────── HTTP ─────────┘
```

No deploy, continua tendo:

```text
Nginx
   │
   ├── Frontend
   │
   └── Backend API
```

e o backend continua conversando com:

```text
PostgreSQL
Redis
BullMQ
Socket.IO
Blockchain
```

Tudo continua sendo **um monólito modular**, porque a aplicação de negócio continua centralizada, mesmo tendo frontend e backend separados.

---

## 📊 Estado atual do projeto (resumo final)

**Projeto novo:** BlockMiner reconstruído do zero.

**Backend:** `server/` → monólito modular simples.

**Frontend:** `client/` → modular por funcionalidade.

**Correspondência:**

```text
server/modules/wallet
        ↕
client/src/modules/wallet
```

**Frontend global:** somente `app`, `core` e `shared`.

**Backend global:** somente `bootstrap`, `core`, `shared`, `workers` e `cron`.

**Regra:** nenhuma pasta global para acumular código específico de domínio.

**Arquitetura:** 🟢 monólito modular simples em ambos os lados.
