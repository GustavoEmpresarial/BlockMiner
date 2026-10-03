# BlockMiner — Arquitetura do Sistema

> Documento canônico de arquitetura técnica da aplicação BlockMiner (`current/`).
> Define o padrão estrutural, fronteiras funcionais, fluxo de dados, políticas de persistência, concorrência e estratégias de cache.

---

## 1. Visão Geral e Doutrina

O **BlockMiner** é estruturado como um **Monólito Modular Simples**:
- **Domínio Primeiro**: Cada funcionalidade de negócio vive dentro do seu módulo em `server/modules/`.
- **Camadas Claras**: Cada módulo encapsula suas rotas (`.routes.ts`), controladores (`.controller.ts`), regras de serviço (`.service.ts`), repositório de dados (`.repository.ts`) e contratos puros de domínio (`.types.ts`, `.pairs.ts`).
- **Sem Overengineering**: Ausência de estruturas hiper-fragmentadas (sem 50 pastas de infraestrutura artificial); módulos comunicam-se através de funções exportadas em seus respectivos pontos de entrada (`index.ts`).
- **Isolamento de Responsabilidade**:
  - `server/core/`: Componentes fundacionais (banco de dados, redis, logger, middleware HTTP, rate limiting).
  - `server/shared/`: Utilitários transversais de precificação, segurança e sanitização sem acoplamento a um único módulo.
  - `server/modules/`: Módulos de domínio de negócio.
  - `server/bootstrap/`: Montagem da aplicação Express, roteadores e ciclo de vida de inicialização/encerramento gracioso.
  - `client/`: Single Page Application (SPA) em React/TypeScript com rotas lazy e componentes isolados por funcionalidade.

---

## 2. Mapa Estrutural do Repositório

```text
current/
├── client/                      # Frontend SPA React + TypeScript + Tailwind
│   └── src/features/            # Módulos de UI (wallet, dashboard, machines, shop)
├── server/                      # Backend Node.js 22 + Express 5 + TypeScript
│   ├── bootstrap/               # app.ts, server.ts, dependências e shutdown
│   ├── core/                    # Configurações globais, prisma.ts, redis.ts, http
│   ├── shared/                  # cryptoPrice, authUser, security, utils
│   └── modules/                 # Módulos de domínio
│       ├── auth/                # Autenticação, registro, login, 2FA
│       ├── wallet/              # Saldos, depósitos HD Polygon, saques manuais e automáticos
│       ├── swap/                # Conversão unidirecional POL/SHIB -> BLK
│       ├── mining/              # Engine de mineração contínua e distribuição de blocos
│       ├── rooms/               # Gerenciamento de salas, racks e posicionamento de mineradoras
│       ├── shop/                # Loja de equipamentos e periféricos
│       ├── shortlinks/          # Tarefas de shortlink e proteção antibot
│       ├── games/               # Mini-games de hash rate adicional
│       └── admin/               # Gestão administrativa e trilha de auditoria
├── prisma/                      # schema.prisma e migrações relacionais
├── tests/                       # Suíte canônica (unit, integration, load, security, regression)
└── docs/                        # Documentação técnica e relatórios de auditoria
```

---

## 3. Fluxo de Dados e Fronteira de Confiança

```
[ Cliente SPA / Navegador ]
            │  HTTPS / JSON
            ▼
    [ Nginx Reverse Proxy ]
            │
            ▼
  [ Express App (Port 3000) ]
            │
  ┌─────────┴─────────────────────────────────────────┐
  │  Middlewares Globais:                              │
  │  - Helmet (Segurança de cabeçalhos)               │
  │  - CORS Config (Origens restritas e sanitizadas)  │
  │  - Cookie Parser / Body Parser JSON               │
  │  - Rate Limiter (Proteção de endpoints críticos)  │
  └─────────┬─────────────────────────────────────────┘
            │
            ▼
  [ Módulos de Rota (/api/*) ]
            │  requireAuth (Validação de sessão JWT/Cookie)
            │  validateBody (Schema Zod estrito .strict())
            ▼
  [ Controllers ]
            │  Tratamento de parâmetros e envelopes HTTP
            ▼
  [ Services ] ◄──────► [ Shared Services: cryptoPrice, authUser ]
            │  Regras de negócio, cálculos contábeis
            │  Invalidação de caches em memória
            ▼
  [ Repositories ]
            │  Lock pessimista (SELECT ... FOR UPDATE)
            ▼
  [ Prisma ORM (TxClient) ]
            │  Pool Pg com statement_timeout seguro
            ▼
  [ PostgreSQL Database ]
```

---

## 4. O Módulo de Swap (`server/modules/swap/`)

### 4.1 Responsabilidade e Invariantes
O módulo gerencia a conversão de criptoativos de mineração (`POL` e `SHIB`) para o token interno de governança e compras `BLK`.

1. **Unidirecionalidade Estrita**: O token `BLK` é intransferível e não-sacável para a blockchain externa. Nenhum par reverso (`BLK → POL`, `BLK → SHIB`) ou par direto de saque (`POL ↔ USDC`) é aceito pelo domínio.
2. **Autoridade do Servidor**: Toda cotação e valor de saída é computado pelo backend:
   - Cotação obtida via `getPolUsdPrice()` e `getShibUsdPrice()` em `server/shared/cryptoPrice/cryptoPrice.ts`.
   - Se o oráculo externo falhar, o serviço emprega taxas conservadoras de fallback de segurança nomeadas:
     - `SWAP_FALLBACK_POL_USD = 0.09`
     - `SWAP_FALLBACK_SHIB_USD = 0.0000055`
   - O cálculo contábil aplica 8 casas decimais:
     ```typescript
     output = Number((amountNum * rate).toFixed(8));
     ```
3. **Serialização Concorrente e Integridade Financeira**:
   - Para impedir ataques de *double-spending* e saldo negativo decorrentes de requisições simultâneas, o repositório executa bloqueio pessimista a nível de linha no PostgreSQL:
     ```sql
     SELECT id FROM users WHERE id = ${userId} FOR UPDATE;
     ```
   - O saldo de origem é comparado após o bloqueio. Se `saldo < quantia`, a transação é revertida com erro tipado `SWAP_INSUFFICIENT_BALANCE`.
4. **Auditoria Transacional no Ledger**:
   - Cada operação bem-sucedida insere atomicamente uma linha na tabela `transactions`:
     - `type: "swap"`
     - `status: "completed"`
     - `amount`: quantia debitada
     - `usdRateAtConfirmation`: cotação utilizada
     - `usdValueAtConfirmation`: quantia creditada em BLK (`output`)
5. **Estratégia de Invalidação de Cache Síncrona**:
   - O BlockMiner possui dois caches em memória para performance de leitura:
     - `balanceCache` em `server/modules/wallet/balance/balance.service.ts` (TTL 10s)
     - `authUserCache` em `server/shared/security/authUser.ts` (TTL 30s)
   - Imediatamente após a confirmação da transação do banco, o serviço invoca `invalidateBalanceCache(userId)` e `invalidateAuthUserCache(userId)`.
   - Como resultado, chamadas subsequentes disparadas pela interface (como `onRefresh()` para `GET /api/wallet/balance`) recebem o saldo real e atualizado diretamente do PostgreSQL.

---

## 5. Persistência de Dados e Transações

- **Banco de Dados**: PostgreSQL 15 executando com pooling gerenciado via `pg.Pool` e `@prisma/adapter-pg`.
- **Pool de Conexões**: Parametrizado via `PG_POOL_MAX` (padrão 20 conexões), com `statement_timeout` de 30s e `idle_in_transaction_session_timeout` de 30s para evitar travamentos silenciosos.
- **Tipagem de Transações**: Funções de repositório que aceitam o cliente transacional utilizam o tipo canônico `TxClient` exportado por `server/core/database/prisma.ts`.

---

## 6. Mensageria e Eventos em Tempo Real

- **Redis 7**: Cache volátil, bloqueios distribuídos temporários e controle de sessões.
- **Kafka KRaft**: Barramento de eventos assíncronos (`bm.earnings.v1`) para consolidação de ganhos de mineração de alto volume sem gargalo no banco relacional.
- **Socket.IO**: Comunicação bidirecional com os clientes para atualizações de blocos minerados e eventos de rede.
