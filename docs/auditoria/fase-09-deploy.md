# Fase 9: Deploy em Produção — Hotfix Mining Allocation Modal Portal

- **Projeto**: BlockMiner (current/)
- **Data**: 2026-10-04
- **Branch de Origem**: `hotfix/mining-allocation-modal-portal` @ `4554ab8`
- **PR Develop**: PR #14 (Merge Commit `fa81d61`)
- **PR Release (main)**: PR #15 (Merge Commit `ff8092a`)
- **Host de Produção**: `169.58.45.155` (VM IBM Cloud)
- **Banco de Produção**: `blockminer-db` (Porta 5432, SSL verify-full)
- **Estado do Gate G9**: `VERIFICADO` (100% de conformidade geométrica e funcional)

---

## 1. Verificação Pré-Deploy da VM de Produção

- **Comando executado**: `cd /root/blockminer-current && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git log -1 --oneline`
- **Branch observada na VM**: `main`
- **Commit anterior em produção**: `5b32955` (Merge pull request #13 from GustavoEmpresarial/develop)
- **Host do banco verificado em `.env.production`**: `blockminer-db:5432` (preservado)
- **Estado de manutenção**: `SITE_MAINTENANCE=0` verificado e mantido

---

## 2. Deploy em Produção

- **Target**: `prod` (`/root/blockminer-current`, `docker-compose.yml`)
- **Git Ref**: `main` @ `ff8092a`
- **Comando de Deploy**: `SKIP_SERVER_BUILD=1 ./deploy.sh --ref main` (mudança restrita ao client SPA)
- **Compilação**:
  - Client dist: compilado via Vite (`client/dist/index.html` referenciando `index-NUQ9Ui21.js` e CSS `index-CxWC0BM4.css`)
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

## 3. Verificação Dinâmica e Medição Real de Geometria (`https://blockminer.space/dashboard`)

Validação executada via Playwright headless em ambiente real contra a aplicação em produção:

```text
EVIDÊNCIA-ID: EV-PROD-GEOMETRY-01
Estado: VERIFICADO
Elemento: Modal de Alocação de Mineração (MiningAllocationPanel - .fixed.inset-0.z-50)
Ação: Disparo do botão "Editar split" no painel de alocação
Medição Coletada:
  - parentElement: "BODY" (confirmando montagem via createPortal)
  - rect: { x: 0, y: 0, width: 1280, height: 720, top: 0, bottom: 720 }
  - top: "0px"
  - marginTop: "0px"
  - paddingTop: "16px"
Conclusão: BUG DA FAIXA 40px ELIMINADO. O overlay cobre 100% da viewport da tela,
           sobrepondo o Header sticky sem nenhuma brecha ou margem.

EVIDÊNCIA-ID: EV-PROD-GEOMETRY-02
Estado: VERIFICADO
Elemento: Carrossel de Banners (BannerDetailModal - .fixed.inset-0.z-[100])
Ação: Disparo do slide de banner ativo
Medição Coletada:
  - parentElement: "BODY"
  - rect: { x: 0, y: 0, width: 1280, height: 720, top: 0, bottom: 720 }
  - top: "0px"
  - marginTop: "0px"
Conclusão: Continua cobrindo 100% da tela em createPortal com top=0 e marginTop=0.

EVIDÊNCIA-ID: EV-PROD-GEOMETRY-03
Estado: VERIFICADO
Elemento: Modal de Taxa de Energia (DashboardEnergyTaxModal - .fixed.inset-0.z-[9999])
Ação: Renderização com sumário de pendência ativo
Medição Coletada:
  - parentElement: "BODY"
  - rect: { x: 0, y: 0, width: 1280, height: 720, top: 0, bottom: 720 }
  - top: "0px"
  - marginTop: "0px"
Conclusão: Continua cobrindo 100% da tela em createPortal com top=0 e marginTop=0.
```

---

## 4. Conclusão do Gate G9

O hotfix foi aplicado, publicado e verificado com sucesso.
Os três modais do Dashboard (`MiningAllocationPanel`, `BannerDetailModal` e `DashboardEnergyTaxModal`) encontram-se agora padronizados com montagem via `createPortal(..., document.body)`, eliminando qualquer efeito colateral de regras de espaçamento de containers e garantindo cobertura fullscreen perfeita.
A branch `main` de produção está sincronizada no commit `ff8092a`.
