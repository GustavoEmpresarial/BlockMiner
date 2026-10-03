# BlockMiner

> Plataforma de simulação e gamificação de mineração cripto com suporte a múltiplos ativos (`POL`, `SHIB`, `BLK`), salas e racks de hardware, oráculos de cotação em tempo real e economia tokenizada.

---

## 1. Visão Geral do Produto

O **BlockMiner** é um ecossistema completo onde os jogadores gerenciam mineradoras virtuais, posicionam equipamentos em racks customizados dentro de salas temáticas, acumulam poder de hash rate contínuo e mineram recompensas em criptoativos (`POL` e `SHIB`).

Os usuários contam com um módulo de **Swap Unidirecional**, permitindo converter os saldos de `POL` e `SHIB` minerados no token utilitário interno `BLK` (1 BLK ≈ US$ 1.00) para aquisição de novas mineradoras, upgrades de infraestrutura e expansão de salas sem intermediários manuais.

---

## 2. Pré-requisitos e Ambiente

- **Runtime**: Node.js `v22.x` (LTS recomendado: `v22.15.x` ou superior)
- **Gerenciador de Pacotes**: `npm` `v10.x` ou superior
- **Banco de Dados Relacional**: PostgreSQL `15+`
- **Cache e Locks Voláteis**: Redis `7+`
- **Mensageria de Eventos**: Kafka `3.9+` (KRaft single-node)
- **Containerização**: Docker e Docker Compose (opcional para rodar dependências locais)

---

## 3. Instalação e Configuração

### 3.1 Instalar dependências
```bash
npm install
```

### 3.2 Variáveis de Ambiente
Copie o template de desenvolvimento para o arquivo `.env`:
```bash
cp .env.example .env
```
> **Nota de Segurança**: O arquivo `.env` nunca deve conter credenciais de produção. O sistema possui guardas ativas em `server/core/database/prisma.ts` que bloqueiam a inicialização se uma connection string de produção for detectada em ambiente local.

Principais variáveis essenciais para desenvolvimento:
| Variável | Obrigatória | Valor Padrão / Exemplo Seguro | Descrição |
|---|---|---|---|
| `NODE_ENV` | Sim | `development` | Ambiente de execução |
| `PORT` | Sim | `3000` | Porta do servidor HTTP |
| `DATABASE_URL` | Sim | `postgresql://blockminer:dev_pass@localhost:5432/blockminer?schema=public` | Conexão PostgreSQL |
| `REDIS_URL` | Sim | `redis://127.0.0.1:6379` | Conexão Redis |
| `JWT_SECRET` | Sim | `dev-only-change-me` | Chave de assinatura de tokens de acesso |
| `JWT_REFRESH_SECRET` | Sim | `dev-only-change-me-too` | Chave de assinatura de refresh tokens |
| `COOKIE_SECRET` | Sim | `dev-only-change-me-as-well` | Chave de assinatura de cookies de sessão |

### 3.3 Inicializar Banco de Dados
Para gerar o cliente Prisma e sincronizar migrações:
```bash
npm run prisma:generate
npx prisma migrate dev
```

---

## 4. Scripts do Projeto

Os scripts definidos no `package.json` são:
- `npm run dev`: Inicia o servidor backend em modo de desenvolvimento com hot-reload (`tsx watch`).
- `npm run build`: Compila o código TypeScript para JavaScript em `dist/` (`tsc -p tsconfig.json`).
- `npm run typecheck`: Executa verificação estática de tipos sem emitir código (`tsc --noEmit`).
- `npm run start`: Inicia o backend compilado em produção (`node dist/server/bootstrap/server.js`).
- `npm test`: Executa a suíte de testes automatizados com o runner nativo do Node.js.
- `npm run test:coverage`: Executa a suíte de testes coletando métricas de cobertura de código.
- `npm run prisma:generate`: Gera os artefatos de tipo do cliente Prisma (`@prisma/client`).

---

## 5. Execução Local dos Serviços

Suba os serviços auxiliares (PostgreSQL, Redis e Kafka) via Docker Compose:
```bash
docker compose up -d db redis kafka
```

Em seguida, inicie o backend:
```bash
npm run dev
```
O servidor estará acessível em `http://localhost:3000`.

---

## 6. Suíte de Testes e Validação

Para executar os testes do módulo de swap e regressões financeiras:
```bash
./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/swap/*.test.mjs
```

Para rodar os testes de carga com k6 local:
```bash
./node_modules/.bin/tsx tests/performance/run-swap-k6.mjs
```

---

## 7. Módulo de Swap (`POL/SHIB → BLK`)

O sistema disponibiliza conversão direta e atômica sob bloqueio pessimista (`FOR UPDATE`):
- `GET /api/swap/balances`: Consulta saldos e cotações em tempo real.
- `POST /api/swap/execute`: Executa o débito de POL ou SHIB, credita BLK, gera registro em `transactions` e invalida imediatamente os caches de saldo (`balanceCache` e `authUserCache`).
- Consulte a documentação completa em [`docs/api.md`](docs/api.md) e [`server/modules/swap/README.md`](server/modules/swap/README.md).

---

## 8. Troubleshooting Básico

- **Erro de Conexão com o Banco de Dados (`ECONNREFUSED 5432`)**:
  - Verifique se o container PostgreSQL está em execução: `docker compose ps db`.
  - Verifique a variável `DATABASE_URL` no `.env`.
- **Erro de Guard-rail de Produção (`DATABASE_URL contains a known production identifier`)**:
  - Por segurança, o servidor recusa iniciar se o host do banco apontar para o domínio de produção ou IP da VPS externa. Certifique-se de apontar para `localhost` ou `127.0.0.1`.
- **Saldo Stale ou Não Refletido no Frontend**:
  - O serviço invalida automaticamente `balanceCache` e `authUserCache`. Verifique se o cliente disparou `onRefresh()` após o retorno de sucesso do endpoint `/api/swap/execute`.

---

## 9. Fluxo de Deploy e Rollback

O deploy é gerenciado exclusivamente via Git no servidor de homologação e produção:
```bash
# 1. Enviar alterações para o repositório remoto
git push origin <branch>

# 2. Executar deploy para ambiente de staging (teste prévio obrigatório)
./deploy.sh --target staging

# 3. Executar deploy de produção após validação
./deploy.sh --ref main
```

### Procedimento de Rollback:
Em caso de anomalia durante ou após o deploy:
1. Reverter para o commit estável anterior no Git: `git checkout <commit_anterior>`.
2. Acionar o script de deploy apontando para a referência estável: `./deploy.sh --ref <commit_anterior>`.
3. Validar a integridade dos health checks em `/api/health`.
