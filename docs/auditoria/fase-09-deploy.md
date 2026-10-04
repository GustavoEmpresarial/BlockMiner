# Fase 9: Deploy em Produção e Verificação Funcional

- **Projeto**: BlockMiner (current/)
- **Data**: 2026-10-04
- **Branch de Origem**: `feature/dashboard-page-redesign` @ `e836214`
- **PR Develop**: PR #12 (Merge Commit `e5397cf`)
- **PR Release (main)**: PR #13 (Merge Commit `5b32955`)
- **Host de Produção**: `169.58.45.155` (VM IBM Cloud)
- **Banco de Produção**: `blockminer-db` (Porta 5432, SSL verify-full)
- **Estado do Gate G9**: `VERIFICADO` (com apontamento funcional no modal de alocação)

---

## 1. Verificação Pré-Deploy da VM de Produção

- **Comando executado**: `cd /root/blockminer-current && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git log -1 --oneline`
- **Branch observada na VM**: `main`
- **Commit anterior em produção**: `76cf03d` (Merge pull request #11 from GustavoEmpresarial/develop)
- **Host do banco verificado em `.env.production`**: `blockminer-db:5432` (preservado)
- **Estado de manutenção**: `SITE_MAINTENANCE=0` verificado e mantido

---

## 2. Deploy em Produção

- **Target**: `prod` (`/root/blockminer-current`, `docker-compose.yml`)
- **Git Ref**: `main` @ `5b32955`
- **Comando de Deploy**: `SKIP_SERVER_BUILD=1 ./deploy.sh --ref main` (backend intocado; apenas client SPA e documentação atualizados)
- **Compilação**:
  - Client dist: compilado via Vite (`client/dist/index.html` referenciando `index-BKUtcrs4.js` e CSS `index-CxWC0BM4.css`)
  - Orfãos de SPA purgados via `storage/scripts/purge-spa-orphans.py`
- **Migrations Prisma**: 26 migrations auditadas, nenhuma pendente (`Database schema is up to date!`)
- **Containers**:
  - `blockminer-current-app`: `healthy` (Up)
  - `blockminer-current-stats-materializer`: `Up`
  - `blockminer-current-phd`: `Up`
  - `blockminer-current-kafka`: `healthy` (Up)
  - `blockminer-current-redis`: `healthy` (Up)
  - `blockminer-current-nginx`: `Up`

### Evidências de Smoke e Health em Produção:
```text
EVIDÊNCIA-ID: EV-PROD-SMOKE-01
Estado: VERIFICADO
Comando: curl -sS -i http://127.0.0.1:5102/health
Ambiente: producao (host local 127.0.0.1:5102)
Resultado: HTTP/1.1 200 OK {"ok":true,"service":"blockminer"}
Conclusão: Servidor Express respondendo normalmente

EVIDÊNCIA-ID: EV-PROD-SMOKE-02
Estado: VERIFICADO
Comando: curl -sS -i http://127.0.0.1:5000/health
Ambiente: producao (Nginx reverso porta 5000)
Resultado: HTTP/1.1 200 OK
Conclusão: Nginx de produção roteando tráfego corretamente

EVIDÊNCIA-ID: EV-PROD-SMOKE-03
Estado: VERIFICADO
Comando: curl -sS -i -k https://blockminer.space/health
Ambiente: producao publica (Edge Caddy / Cloudflare)
Resultado: HTTP/2 200 {"ok":true,"service":"blockminer"}
Conclusão: Endpoint de saúde público operacional
```

---

## 3. Verificação Dinâmica no Browser (`https://blockminer.space/dashboard`)

Validação realizada via Playwright headless diretamente contra a aplicação publicada:

1. **Carregamento da Página**:
   - Status 200 OK, título "BlockMiner — Mine POL, Play Games, Earn Rewards".
   - Ausência de classes `animate-in fade-in` no container raiz de `DashboardPage.tsx` confirmada (`count: 0`).

2. **Badge de Sincronização**:
   - Elemento presente com acessibilidade:
     - `role="status"`
     - `aria-live="polite"`
     - Texto observado no teste de carga inicial: `RECONECTANDO...` (refletindo o estado dinâmico real da conexão Socket.IO/heartbeat).

3. **Carrossel de Banners (`BannerDetailModal`)**:
   - Modal acionado ao clicar no banner do carrossel (`/media/banners/instant-withdrawals-v5.webp`).
   - Bounding box do overlay `.fixed.inset-0.z-[100]`:
     - `x: 0, y: 0, width: 1280, height: 720`
     - `top: 0px`, `marginTop: 0px`
   - **Resultado**: Cobre 100% da viewport da tela, sem qualquer faixa no topo.

4. **Modal de Alocação de Mineração (`MiningAllocationPanel`)**:
   - Acionado ao clicar em `Editar split`.
   - Bounding box do overlay `.fixed.inset-0.z-50`:
     - `x: 0, y: 40, width: 1280, height: 680`
     - `top: 40px`, `marginTop: 40px`
   - **Causa Raiz Identificada**: O modal de alocação é renderizado como elemento irmão direto do painel dentro do container `<div className="space-y-10">` sem uso de `createPortal`. A regra CSS do Tailwind `.space-y-10 > :not([hidden]) ~ :not([hidden])` impõe `margin-top: 2.5rem` (40px) sobre o overlay `.fixed`, gerando uma faixa superior de 40px onde o Header permanece exposto.
   - **Mitigação Recomendada para Próxima Tarefa**: Envolver o modal de alocação em `createPortal(..., document.body)` (como foi feito no `DashboardEnergyTaxModal` e `BannerDetailModal`) ou adicionar `!mt-0` na div `.fixed.inset-0`.

---

## 4. Conclusão do Gate G9

O deploy em produção foi concluído com sucesso. A nova versão está em execução na branch `main` no commit `5b32955`.
