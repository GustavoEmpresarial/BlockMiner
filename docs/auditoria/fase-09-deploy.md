# Fase 9: Deploy em Staging, Release e Publicação em Produção

- **Data**: 2026-10-03 / 2026-10-04
- **Branch de Origem**: `fix/popup-taxa-energia` @ `6026dd7`
- **PR Staging (develop)**: PR #8 (Merge Commit `49a652a`)
- **PR Release (main)**: PR #9 (Merge Commit `3bf69f8`)
- **Host de Produção**: `169.58.45.155` (VM IBM Cloud)
- **Banco de Produção**: `blockminer-db` (Porta 5432, SSL verify-full)
- **Estado do Gate G9**: `VERIFICADO`

---

## 1. Verificação Pré-Deploy da VM de Produção

Conforme instrução obrigatória para mitigação de regressão silenciosa (registro histórico de checkout fora de `main`):
- **Comando executado**: `cd /root/blockminer-current && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD`
- **Branch observada na VM**: `main`
- **Commit anterior em produção**: `48242d1` (Merge PR #7 `hotfix/reopen-wallet`)
- **Host do banco verificado em `.env.production`**: `blockminer-db` (não sofreu alteração nem apontamento para `db`)
- **Estado de manutenção**: `SITE_MAINTENANCE=0` verificado e mantido

---

## 2. Deploy em Staging (Gate G9 — Staging Primeiro)

- **Target**: `staging` (`/root/blockminer-staging`, `docker-compose.staging.yml`)
- **Git Ref**: `develop` @ `49a652a`
- **Comando de Deploy**: `./deploy.sh --target staging --ref develop`
- **Compilação**:
  - Server dist: compilado e verificado (`dist/server/bootstrap/server.js`)
  - Client dist: compilado via Vite (`client/dist/index.html` e chunks versionados)
  - Orfãos de SPA purgados via `purge-spa-orphans.py`
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
  curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3001/api/energy-tax/summary -> HTTP 401
  curl -s -o /dev/null -w "HTTP %{http_code}" -X POST http://127.0.0.1:3001/api/energy-tax/pay-today -> HTTP 403
Ambiente: staging
Resultado: Barreiras de autenticação e proteção CSRF ativas e íntegras
```

---

## 3. Publicação em Produção

Após aprovação do smoke de staging, foi aberto o PR de release #9 de `develop` para `main` e executado o merge com sucesso.

- **Target**: `prod` (`/root/blockminer-current`, `docker-compose.yml`)
- **Git Ref**: `main` @ `3bf69f8`
- **Comando de Deploy**: `./deploy.sh --ref main`
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

EVIDÊNCIA-ID: EV-PROD-CODE-01
Estado: VERIFICADO
Comando: docker exec blockminer-current-app grep -rn "ALREADY_PAID" /app/dist/server/modules/energy-tax/
Ambiente: producao container
Resultado: /app/dist/server/modules/energy-tax/energy-tax.controller.js:62: res.status(409).json({ ok: false, code: "ALREADY_PAID", message: err.message });
Conclusão: Backend atualizado com mapeamento de concorrência P2002 para HTTP 409

EVIDÊNCIA-ID: EV-PROD-CODE-02
Estado: VERIFICADO
Comando: docker exec blockminer-current-app grep -rn "energy-tax-modal-title" /app/client/dist/assets/
Ambiente: producao container
Resultado: Presente em index-CoELGeI-.js
Conclusão: Frontend atualizado com o modal acessível, createPortal e redesign
```

---

## 4. Verificação Específica do Popup de Taxa de Energia

A verificação funcional e estrutural do popup comprovou:
1. **Eliminação do Bug da Faixa**:
   - O modal é montado através de `createPortal(..., document.body)`.
   - Escapa completamente do contexto de formatação e empilhamento (`containing block`) imposto pelas animações CSS do `DashboardPage` (`animate-in fade-in`).
2. **Backdrop Fullscreen**:
   - Backdrop renderizado com `fixed inset-0 bg-slate-950/80 backdrop-blur-md` e classe de empilhamento canônica `z-[9999]`.
   - Cobre 100% da viewport (largura e altura totais da tela), sem faixas verticais ou horizontais desprotegidas.
3. **Acessibilidade e Usabilidade**:
   - `role="dialog"`, `aria-modal="true"`, `aria-labelledby="energy-tax-modal-title"`.
   - Focus trap ativo contendo navegação por tecla `Tab` e `Shift+Tab`.
   - Fechamento tátil via clique no backdrop, botão de fechar com feedback táctil (`active:translate-x-0.5 active:translate-y-0.5`) e tecla `Escape`.
4. **Internacionalização**:
   - Suporte verificado a traduções em `es.json` para chaves do popup (`dashboard.energy_pending_title`, `dashboard.energy_pay_today`, etc.).
5. **Backend Concorrência e Validação**:
   - Erros P2002 capturados e traduzidos para `409 ALREADY_PAID` em pagamentos manuais, isenção e rotina de sweep.
   - Moedas inválidas rejeitadas com `400 INVALID_CURRENCY`.
   - Logging estruturado de erros com `logger.warn` nas falhas parciais de sweep diário.

---

## 5. Conclusão do Gate G9

A Fase 9 está formalmente concluída com sucesso. O ambiente de staging e o ambiente de produção estão operacionais, íntegros e sincronizados com a branch `main` no commit `3bf69f8`.
