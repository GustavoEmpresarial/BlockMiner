# Fase 0: Reconhecimento e Preflight

- **Data**: 2026-10-03
- **Branch**: `fix/popup-taxa-energia`
- **Commit Base**: `ba5bd60` (`fix(wallet): reopen the wallet after the POL debit fix`)
- **Alvo**: `localhost` (Ambiente Local Isolado)
- **Estado do Gate G0**: `VERIFICADO`

---

## 1. Contexto do Repositório e Árvore do Escopo

O projeto **BlockMiner 2.1** é uma aplicação Fullstack composta por:
- **Frontend**: Single Page Application (SPA) em React 19, Vite, TypeScript, TailwindCSS, Zustand/Axios, i18next.
- **Backend**: Node.js (ES Modules, TypeScript 5.8), Express 5, Prisma ORM 7.9, PostgreSQL 15, Redis 7.
- **Arquitetura**: Monolito Modular (`server/modules/`, `server/core/`, `server/shared/`, `client/src/features/`).
- **Testes**:
  - Backend: Node.js Native Test Runner via `tsx --test` localizado em `tests/`.
  - Frontend: Vitest localizado em `client/` (`npm test`).
  - Carga: k6 em `tests/load` (symlink para `tests/performance`).
  - Segurança: Kali container (`kali-pentest`) com scripts em `tests/integration/security` (symlink para `tests/security`).

### Árvore Resumida dos Arquivos Alvo da Tarefa (Popup Taxa de Energia)
```text
client/
├── src/
│   ├── features/
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   │   ├── DashboardEnergyTaxModal.tsx        # ALVO PRINCIPAL: Modal popup com bug visual e redesign
│   │   │   │   └── DashboardEnergyTaxModal.test.tsx   # Testes unitários/integração do componente
│   │   │   ├── DashboardPage.tsx                      # Linha 317: Montagem do modal dentro do Dashboard
│   │   │   └── lib/
│   │   │       ├── dashboard.api.ts                   # getEnergyTaxSummary
│   │   │       └── dashboard.errors.ts                # logDashboardError
│   │   ├── shell/
│   │   │   ├── ProtectedLayout.tsx                    # Layout protegido (Header, Sidebar, main, Outlet)
│   │   │   └── components/
│   │   │       ├── Header.tsx                         # Topbar desktop (sticky top-0 z-30)
│   │   │       └── Sidebar.tsx                        # Topbar mobile (fixed top-0 z-40) e Bottom nav (fixed bottom-0 z-40)
│   │   └── taxes/
│   │       ├── components/TaxPayCurrencyPicker.tsx    # Seletor de moeda de pagamento (POL, BLK, SHIB)
│   │       └── lib/taxPayCurrency.ts                  # Utilitários de formatação e quotes
│   └── i18n/locales/
│       ├── en.json                                    # Chaves dashboard.energy_* e taxes.*
│       ├── pt-BR.json
│       └── es.json
server/
├── modules/
│   └── energy-tax/
│       ├── energyTax.controller.ts                    # Endpoints /api/energy-tax/*
│       ├── energyTax.routes.ts                        # GET /summary, POST /pay-daily
│       ├── energyTax.service.ts                       # Regras de taxa, quotes, isenção e liquidação
│       └── energyTax.repository.ts                    # Transações atômicas de débito e registro
tests/
├── energy-tax/
│   └── energyTax.service.test.mjs                     # Testes de serviço da taxa de energia
├── load -> performance                                # Symlink k6
└── integration/security -> ../security                # Symlink Kali
```

---

## 2. Inventário de Comandos e Scripts Reais

Conforme inspecionado em `package.json` (raiz) e `client/package.json`:
- **Frontend (client/)**:
  - Testes: `npm test` (`vitest run`)
  - Testes com foco: `npm test -- src/features/dashboard/components/DashboardEnergyTaxModal.test.tsx`
  - Build: `npm run build` (`vite build`)
  - Lint: `npm run lint` (`eslint .`)
  - Typecheck: `npm run typecheck` (`tsc --noEmit -p tsconfig.json`)
- **Backend (raiz/)**:
  - Build: `npm run build` (`tsc -p tsconfig.json`)
  - Typecheck: `npm run typecheck` (`tsc --noEmit -p tsconfig.json`)
  - Testes Globais: `npm test` (`tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit --experimental-test-module-mocks tests/**/*.test.mjs`)
  - Teste focado: `./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/energy-tax/energyTax.service.test.mjs`
  - Prisma Generate: `npm run prisma:generate` (`prisma generate --schema prisma/schema.prisma`)
  - Proibidos terminantemente: `prisma migrate reset`, `deploy.sh`.

---

## 3. Inventário de Banco de Dados, Serviços e Isolamento

- **Ambiente Alvo**: Estritamente `localhost`. Vedado qualquer acesso ou mutação contra `blockminer.space` ou `dev.blockminer.space`.
- **Banco de Produção Proibido**: Hostname `blockminer-db` (161.97.176.125) - estritamente inacessível para testes e auditoria.
- **Banco de Teste Local Ativo**:
  - Container Docker: `blockminer-current-db` (PostgreSQL 15 Alpine), publicado em `127.0.0.1:5442`.
  - Redis Local Ativo: Container Docker `blockminer-current-redis` (Redis 7 Alpine), publicado em `127.0.0.1:6389`.
  - Status: Ambos containers iniciados e verificados em estado `healthy`.

### 3.1 Baseline de Falhas Pré-existentes no Repositório (Medição Pré-Trabalho)

Conforme exigido pelo Contrato V2 e V2.37, foi realizada a medição e catalogação rigorosa de todas as falhas pré-existentes na suíte global e no typecheck antes de qualquer modificação de código:
1. **Suíte Global de Testes (`npm test`)**:
   - Total executado: **2.348 testes**.
   - Testes passando: **2.309 testes**.
   - Falhas pré-existentes catalogadas: **39 falhas**.
   - Causas das 39 falhas pré-existentes:
     - 34 falhas decorrentes de `SCHEMA_OUT_OF_DATE` (tabelas com migrations pendentes no banco de teste local em módulos alheios como `user_stats_earnings_*` e `admin_actions`).
     - 4 falhas decorrentes de `redisMod.__enableRedisForTests is not a function` em testes de crons legados.
     - 1 falha de `VPN_PROXY_BLOCKED` por quota/bloqueio de API externa de IP intelligence.
2. **Typecheck Global (`npm run typecheck`)**:
   - Server: **74 erros TS** pré-existentes concentrados em `server/modules/games/`, `ip-intelligence/`, `referrals/`, `rooms/`, `shortlinks/`, `wallet/deposit/` e `wallet/withdrawal/auto-send.ts`.
   - Client: **67 erros TS** pré-existentes concentrados em `client/src/features/admin/`, `calculator/`, `games/`, `offers/`, `ptc/`, `referrals/`, `tournaments/` e `wallet/`.
3. **Conferência de Isolamento da Branch**:
   - Verificado com `(npm run typecheck 2>&1; cd client && npm run typecheck 2>&1) | grep -E "EnergyTaxModal|energy-tax|DashboardPage"`: **0 erros** nos arquivos do escopo.
   - Todos os 16 testes de `tests/energy-tax/` e 13 testes de `DashboardEnergyTaxModal.test.tsx` executados com **100% de aprovação**.
   - Nenhuma falha pré-existente tem qualquer relação com o escopo do modal de taxa de energia.

---

## 4. Diagnóstico Técnico dos Problemas Reportados

### 4.1 Bug Visual da Faixa no Topo do Modal
- **Sintoma Observado**: Quando o popup "Taxa de Energia pendente" abre no dashboard, o overlay escurece e borra o conteúdo, porém uma faixa no topo da tela não recebe o fundo desfocado e continua nítida.
- **Causa Raiz Comprovada (H1 + H2 + H3)**:
  1. `DashboardEnergyTaxModal` era renderizado diretamente na árvore DOM de `DashboardPage.tsx` (linha 317).
  2. O elemento contêiner raiz de `DashboardPage.tsx` possui `className="space-y-10 animate-in fade-in duration-700"`. Em conformidade com a especificação CSS (CSS Transforms Module / CSS Animations), qualquer elemento com propriedades de animação, transform ou filter estabelece um **novo stacking context** e se torna o **containing block** para todos os seus descendentes, mesmo os que possuem `position: fixed`.
  3. `DashboardPage` está aninhada dentro de `<main>` em `ProtectedLayout.tsx`. O cabeçalho desktop (`Header.tsx`) possui `sticky top-0 z-30` e a barra móvel superior (`Sidebar.tsx`) possui `fixed top-0 z-40`. Ambos estão em nós DOM irmãos/ancestrais fora de `<main>`.
  4. Por estar enclausurado no containing block de `DashboardPage`, o `div` do modal com `fixed inset-0 z-[9999]` não era relativo à viewport global (`window`), e seu `z-[9999]` não conseguia sobrepor o `Header` ou a barra superior móvel. O `backdrop-blur-sm` afeta somente pixels pintados antes dele na mesma árvore de renderização, deixando a barra superior visível e nítida.
- **Solução Arquitetural Aprovada**:
  - Utilizar `createPortal(..., document.body)` para desvincular o modal do containing block animado de `DashboardPage` e atracá-lo diretamente à raiz da viewport (`document.body`).
  - Manter z-index padronizado e robusto (`z-50` / `z-[100]`), sobrepondo adequadamente o header do layout (`z-30`/`z-40`).
  - Assegurar cobertura de 100% da viewport incluindo suporte a `safe-area-inset-*`.
  - Travar o scroll do body (`overflow: hidden`) enquanto o modal estiver aberto, sem layout shift.

### 4.2 Referência Visual Externa (`mininghash.net`)
- **Tentativa de Acesso Direto**: Requisições diretas via `webfetch` e `curl` retornaram falha de TLS/Intercepção. A rede local intercepta o domínio via Cisco Umbrella / OpenDNS SubCA (`CN=Cisco Umbrella Secondary SubCA sao1-SG`), redirecionando para página de bloqueio/phish de segurança (`phish.opendns.com`).
- **Recuperação via Wayback Machine**: Foi localizado e inspecionado snapshot íntegro em `http://web.archive.org/web/20260414094608/https://mininghash.net/`.
- **Características Estéticas Concretas Observadas**:
  - Paleta escura: fundos em `#0b132b` e `#0a1628`.
  - Estilo Cartoon / Neo-brutalista moderno: bordas sólidas marcadas (`border: 2px/3px solid #000000`), sombras sólidas deslocadas (`box-shadow: 4px 4px 0px #000000` ou cores temáticas como dourado `#92400e`).
  - Glows neon: `drop-shadow(0 0 14px rgba(251, 191, 36, 0.55))`.
  - Tipografia: cabeçalhos destacados, números em mono (`JetBrains Mono`), contraste vibrante.
  - Botões táteis com chanfro e efeito de clique com deslocamento (`transform: translate(-2px, -2px)` em hover e retorno no active).
  - Alinhamento: o redesign do popup integrará esses elementos visuais táteis (cards de alto contraste, glow de energia âmbar/ouro, badge de economia, tipografia refinada e botões táteis) em perfeita harmonia com o tema cyberpunk do BlockMiner.

---

## 5. Evidências Coletadas

```text
EVIDÊNCIA-ID: EV-0001
Estado: VERIFICADO
Comando: git status --short && git branch --show-current && git log -n 1 --oneline
Ambiente: local (localhost)
Resultado: Branch ativa 'fix/popup-taxa-energia' no commit base ba5bd60. Árvore limpa exceto arquivos pré-existentes não monitorados (.maestri/, imagens na raiz e symlinks tests/load e tests/integration/security).
Arquivos: N/A
Conclusão: Isolamento Git confirmado na branch designada para a tarefa.
```

```text
EVIDÊNCIA-ID: EV-0002
Estado: VERIFICADO
Comando: docker compose --profile local-db up -d db redis && docker ps
Ambiente: local (localhost)
Resultado: Containers 'blockminer-current-db' (porta 5442) e 'blockminer-current-redis' (porta 6389) iniciados com sucesso e com status healthy.
Arquivos: docker-compose.yml
Conclusão: Banco de teste local e cache Redis isolados e disponíveis em localhost.
```

```text
EVIDÊNCIA-ID: EV-0003
Estado: VERIFICADO
Comando: ./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/energy-tax/energyTax.service.test.mjs
Ambiente: local (localhost)
Resultado: 16 testes de regra de negócio da taxa de energia executados e 100% aprovados (pass: 16, fail: 0).
Arquivos: tests/energy-tax/energyTax.service.test.mjs
Conclusão: Backend de taxa de energia está íntegro e operacional no ambiente de testes.
```

```text
EVIDÊNCIA-ID: EV-0004
Estado: VERIFICADO
Comando: npm test -- src/features/dashboard/components/DashboardEnergyTaxModal.test.tsx (em client/)
Ambiente: local (localhost)
Resultado: 13 testes unitários existentes do componente DashboardEnergyTaxModal executados e 100% aprovados.
Arquivos: client/src/features/dashboard/components/DashboardEnergyTaxModal.test.tsx
Conclusão: Linha de base de testes do frontend verificada antes de qualquer alteração de código.
```

```text
EVIDÊNCIA-ID: EV-0005
Estado: VERIFICADO
Comando: npm run build (em client/)
Ambiente: local (localhost)
Resultado: Build do Vite concluído com sucesso em 16.21s gerando artefatos em client/dist.
Arquivos: client/vite.config.ts
Conclusão: Pipeline de empacotamento do frontend está funcional e sem quebras de dependência.
```

```text
EVIDÊNCIA-ID: EV-0006
Estado: VERIFICADO
Comando: curl -v -m 10 https://mininghash.net/ && curl -s http://web.archive.org/web/20260414094608/https://mininghash.net/
Ambiente: local / internet pública
Resultado: Acesso direto interceptado por Cisco Umbrella (OpenDNS bloqueio phish). Snapshot histórico 2026 recuperado com sucesso via Wayback Machine, revelando CSS inline com temática dark (#0b132b), bordas cartoon 3px solid, sombras sólidas 6px e neon glows.
Arquivos: .maestri/tarefa-popup-taxa-energia.md
Conclusão: Estética da referência documentada com evidências concretas para embasar o redesign sem inventar dados.
```

```text
EVIDÊNCIA-ID: EV-0007-BASELINE
Estado: VERIFICADO
Comando: npm test 2>&1 | grep "^not ok" | wc -l && (npm run typecheck 2>&1 | grep -c "error TS") && (cd client && npm run typecheck 2>&1 | grep -c "error TS")
Ambiente: local (localhost)
Resultado: 39 falhas pré-existentes em 2.348 testes (34 SCHEMA_OUT_OF_DATE, 4 redisMod, 1 VPN_PROXY_BLOCKED); 74 erros de typecheck no server e 67 no client. Verificado 0 erros nos arquivos da branch.
Arquivos: tests/, server/, client/
Conclusão: Baseline de falhas e dívida técnica pré-existente documentado e formalmente desvinculado do escopo desta tarefa.
```

---

## 6. Gate da Fase 0

- [x] Branch `fix/popup-taxa-energia` confirmada e registrada.
- [x] Árvore inicial de arquivos inspecionada.
- [x] Comandos reais de teste e build identificados e validados.
- [x] Banco de dados de teste isolado e saudável em `127.0.0.1:5442`.
- [x] Banco de produção `blockminer-db` estritamente resguardado.
- [x] Baseline de 39 falhas pré-existentes na suíte e 141 erros de typecheck catalogados sem relação com a branch.
- [x] Causa raiz do bug da faixa no topo comprovada com base em stacking contexts e containing blocks.
- [x] Referência de design obtida e documentada.
- [x] Relatório `docs/auditoria/fase-00-reconhecimento.md` emitido com evidências EV-0001 a EV-0007-BASELINE.
- [x] Estado do Gate G0: `VERIFICADO`.
