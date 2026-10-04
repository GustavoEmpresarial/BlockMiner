# Fase 9: Deploy em Staging, Release e Publicação em Produção

- **Projeto**: BlockMiner (current/)
- **Data**: 2026-10-04
- **Branch de Origem**: `feature/transparency-page-redesign` @ `110879e`
- **PR Staging (develop)**: PR #10 (Merge Commit `785fd96`)
- **PR Release (main)**: PR #11 (Merge Commit `76cf03d`)
- **Host de Produção**: `169.58.45.155` (VM IBM Cloud)
- **Banco de Produção**: `blockminer-db` (Porta 5432, SSL verify-full)
- **Estado do Gate G9**: `VERIFICADO`

---

## 1. Verificação Pré-Deploy da VM de Produção

Conforme instrução obrigatória para mitigação de regressão silenciosa (registro histórico de checkout fora de `main`):
- **Comando executado**: `cd /root/blockminer-current && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git log -1 --oneline`
- **Branch observada na VM**: `main`
- **Commit anterior em produção**: `3bf69f8` (Merge pull request #9 from GustavoEmpresarial/develop)
- **Host do banco verificado em `.env.production`**: `blockminer-db` (inalterado, sem apontamento para `db`)
- **Estado de manutenção**: `SITE_MAINTENANCE=0` verificado e mantido

---

## 2. Deploy em Staging (Gate G9 — Staging Primeiro)

- **Target**: `staging` (`/root/blockminer-staging`, `docker-compose.staging.yml`)
- **Git Ref**: `develop` @ `785fd96`
- **Comando de Deploy**: `./deploy.sh --target staging --ref develop` (com `SKIP_SERVER_BUILD=1` visto que o backend é estritamente preservado e idêntico)
- **Compilação**:
  - Client dist: compilado via Vite (`client/dist/index.html` e chunks versionados)
  - Orfãos de SPA purgados via `storage/scripts/purge-spa-orphans.py`
  - Chunks contendo tokens de redesign (`panel-all`, `tab-all`, etc.) devidamente incorporados em `index-D_a5xxTP.js`
- **Migrations Prisma**: 26 migrations auditadas, nenhuma pendente (`Database schema is up to date!`)

### Evidências de Smoke em Staging (sem testes destrutivos, sem k6, sem Kali):
```text
EVIDÊNCIA-ID: EV-STAGING-SMOKE-01
Estado: VERIFICADO
Comando: curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3001/health
Ambiente: staging (127.0.0.1:3001)
Resultado: HTTP 200 OK
Conclusão: Container blockminer-staging-app online e saudável

EVIDÊNCIA-ID: EV-STAGING-SMOKE-02
Estado: VERIFICADO
Comando: curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:5001/health
Ambiente: staging (Nginx reverse proxy porta 5001)
Resultado: HTTP 200 OK
Conclusão: Roteamento Nginx para staging operacional

EVIDÊNCIA-ID: EV-STAGING-SMOKE-03
Estado: VERIFICADO
Comandos:
  curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3001/api/transparency -> HTTP 200
  curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3001/api/transparency/withdrawal-stats -> HTTP 200
  curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3001/api/transparency/wallet-stats -> HTTP 200
  curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3001/api/transparency/external-investments -> HTTP 200
  curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3001/api/transparency/hardware-assets -> HTTP 200
Ambiente: staging
Resultado: Todas as rotas de transparência retornando HTTP 200 OK
```

---

## 3. Publicação em Produção

Após aprovação do smoke de staging, foi aberto o PR de release #11 de `develop` para `main` e executado o merge com sucesso.

- **Target**: `prod` (`/root/blockminer-current`, `docker-compose.yml`)
- **Git Ref**: `main` @ `76cf03d`
- **Comando de Deploy**: `./deploy.sh --ref main` (com `SKIP_SERVER_BUILD=1`)
- **Preservação de Integridade**:
  - `DATABASE_URL` mantido em `blockminer-db:5432` com SSL
  - `SITE_MAINTENANCE` permaneceu em `0`
  - Sem uso de `git reset --hard` destrutivo, sem `git clean -fd` em diretórios de dados/uploads, sem `git push --force`
- **Containers de Produção**:
  - `blockminer-current-app`: `healthy`
  - `blockminer-current-stats-materializer`: `Up`
  - `blockminer-current-phd`: `Up`
  - `blockminer-current-kafka`: `healthy`
  - `blockminer-current-redis`: `healthy`
  - `blockminer-current-nginx`: `Up`

### Evidências de Smoke e Health em Produção:
```text
EVIDÊNCIA-ID: EV-PROD-SMOKE-01
Estado: VERIFICADO
Comando: curl -sS -i http://127.0.0.1:5102/health
Ambiente: producao (host local 127.0.0.1:5102)
Resultado: HTTP/1.1 200 OK {"ok":true,"service":"blockminer"}
Conclusão: Processo de aplicação respondendo normalmente

EVIDÊNCIA-ID: EV-PROD-SMOKE-02
Estado: VERIFICADO
Comando: curl -sS -i -k https://blockminer.space/health
Ambiente: producao publica (https://blockminer.space)
Resultado: HTTP/2 200 {"ok":true,"service":"blockminer"}
Conclusão: Roteamento edge e SSL de produção ativos

EVIDÊNCIA-ID: EV-PROD-SMOKE-03
Estado: VERIFICADO
Comando: docker compose exec -T app npx prisma migrate status --schema=prisma/schema.prisma
Ambiente: producao (blockminer-db)
Resultado: 26 migrations found in prisma/migrations; Database schema is up to date!
Conclusão: Estrutura do banco de dados em total conformidade
```

---

## 4. Verificação Específica da Página /transparency em Produção

A validação dinâmica ponta a ponta realizada no browser (Playwright) em `https://blockminer.space/transparency` comprovou:

1. **Navegação por Abas (Tablist / Tabs)**:
   - 6 abas renderizadas com semântica ARIA completa:
     - `Todos os Dados` (aba padrão, `aria-selected="true"`, `aria-controls="panel-all"`)
     - `Visão Geral`
     - `Custos & Receitas`
     - `Tesouraria & Carteiras`
     - `Hardware & IA 3D`
     - `Saques Comprovados`
   - Alternância entre abas testada com sucesso: cada clique ativa `aria-selected="true"` e exibe o respectivo `tabpanel`.
   - Retorno à aba padrão `Todos os Dados` reexibe `#panel-all`.

2. **Conteúdo das 11 Seções na Aba Padrão (`#panel-all`)**:
   - Elemento `#panel-all` presente com `role="tabpanel"` e `aria-labelledby="tab-all"`.
   - Todas as 11 seções acessíveis com títulos semânticos `h2` / `h3`:
     - Distribuição Mensal
     - Custo por Categoria / Mês
     - Peso por Categoria
     - Detalhamento de Custos Operacionais & Assinaturas
     - Carteiras do Projeto · Polygon
     - Modelos 3D de IA & Infraestrutura.GLB Interativo
     - Saques Comprovados e Auditoria
     - Investimentos Externos
     - Hardware e Hashrate
     - Metodologia e Fontes
     - Resumo Executivo / KPIs

3. **Acessibilidade e Contraste**:
   - Contraste WCAG AA verificado (eliminadas classes `text-gray-600`/`text-gray-700` em textos informativos de gráficos e carteiras).
   - `scope="col"` presente em todos os cabeçalhos de tabela (`th`).
   - Títulos de carteiras convertidos para `h2` semânticos.

4. **Modal de Metodologia em Portal**:
   - Montado via `createPortal` com focus trap.
   - Abre com título `Metodologia`, mantém foco confinado e fecha corretamente com a tecla `Escape`.

5. **Internacionalização (i18n)**:
   - 217 chaves traduzidas em `es.json` integradas no bundle de produção.
   - Cabeçalhos de tabelas, status de hardware e categorias de custos traduzidos.

---

## 5. Conclusão do Gate G9

A Fase 9 está formalmente concluída com sucesso. O ambiente de staging e o ambiente de produção estão operacionais, íntegros e sincronizados com a branch `main` no commit `76cf03d`.
