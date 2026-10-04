# Fase 9: Deploy em Produção — Correção Prioritária do Shell (Restauração da Sidebar Lateral)

- **Projeto**: BlockMiner (current/)
- **Data**: 2026-10-04
- **Branch de Origem**: `fix/restore-sidebar-shell` @ `096dd0c`
- **PR Develop**: PR #21 (Merge Commit `b5545e5`)
- **PR Release (main)**: PR #22 (Merge Commit `d1cc2ad`)
- **Host de Produção**: `169.58.45.155` (VM IBM Cloud)
- **Banco de Produção**: `blockminer-db` (Porta 5432, SSL verify-full)
- **Estado do Gate G9**: `VERIFICADO` (100% verde em suíte, build e verificação visual em 1440px e 320px)
- **Ponto de Restauração**: Branch `restore/pre-mininghash-20261004` e tag anotada `v-pre-mininghash-20261004` apontando para `ff8092a` (Rollback: `./deploy.sh --ref restore/pre-mininghash-20261004`)

---

## 1. Contexto e Motivação da Correção

Após a publicação da barra horizontal no topo (`TopNav`), o dono do produto esclareceu a diretriz de design: a instrução original requeria a aplicação da identidade visual do MiningHash (paleta de cores, tipografia, bordas, sombras e contrastes) sobre a **estrutura existente** do BlockMiner, sem substituir a barra lateral. A sidebar deve permanecer na lateral esquerda como sempre esteve.

Esta entrega restaura imediatamente a arquitetura estrutural desejada, mantendo 100% dos ganhos da fundação visual:
- `<Sidebar />` e `<Header />` voltam a ser renderizados pelo `ProtectedLayout`.
- `TopNav` sai do fluxo da aplicação.
- Toda a fundação visual (paleta `brandNavy` `#0F1522` a `#F8FAFC`, fonte `Inter`, `borderRadius` e `boxShadow`, saneamento de cores e correção de modais via `createPortal`) permanece ativa e preservada.
- O painel `/admin` permanece 100% intocado.

---

## 2. Verificação Pré-Deploy da VM de Produção

- **Comando executado**: `cd /root/blockminer-current && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git log -1 --oneline`
- **Branch observada na VM**: `main`
- **Commit anterior em produção**: `9d6ccad` (Merge pull request #19 from GustavoEmpresarial/develop — *release: redesign visual fase 3 - shell top-nav e suporte mobile*)
- **Host do banco verificado em `.env.production`**: `blockminer-db:5432` (preservado)
- **Estado de manutenção**: `SITE_MAINTENANCE=0` verificado e mantido

---

## 3. Deploy em Produção

- **Target**: `prod` (`/root/blockminer-current`, `docker-compose.yml`)
- **Git Ref**: `main` @ `d1cc2ad`
- **Comando de Deploy**: `SKIP_SERVER_BUILD=1 ./deploy.sh --ref main` (alteração restrita ao SPA do cliente)
- **Compilação**:
  - Client dist: compilado via Vite (`client/dist/index.html` referenciando bundle `assets/index-Bu24YsmW.js` e CSS `assets/index-NPxmeyyy.css`).
  - Orfãos de SPA purgados via `storage/scripts/purge-spa-orphans.py`.
- **Migrations Prisma**: 26 migrations auditadas, nenhuma pendente (`Database schema is up to date!`).
- **Containers Ativos**:
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

## 4. Verificação Pós-Deploy Rigorosa em Produção (`https://blockminer.space`)

Validação executada via Chromium headless contra o ambiente real publicado:

### 4.1 Rota `/dashboard` em 1440px (Desktop): Sidebar Lateral Restaurada
```text
EVIDÊNCIA-ID: EV-PROD-SIDEBAR-DESKTOP
Estado: VERIFICADO
Viewport: 1440px x 900px
Elemento: aside.hidden.md:flex (Desktop Sidebar)
Medições Reais (BoundingBox):
  - tag: ASIDE
  - rect: { x: 0, y: 0, width: 288, height: 900 }
  - display: flex
  - visibility: visible
  - Botões do TopNav horizontal no header: [] (removidos do fluxo)
Conclusão: A Sidebar está de volta na lateral esquerda (x=0, largura 288px), fixa e com navegação completa ativa.
```

### 4.2 Preservação da Fundação Visual (Cores Navy e Tipografia Inter)
```text
EVIDÊNCIA-ID: EV-PROD-VISUAL-PRESERVATION
Estado: VERIFICADO
Fundo do Body: rgb(15, 21, 34) (#0F1522)
Fundo dos Cards: rgb(21, 32, 54) (#152036)
Texto Principal: rgb(248, 250, 252) (#F8FAFC)
Tipografia: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
Conclusão: A estrutura original convive perfeitamente com a paleta moderna e tipografia Inter do redesign.
```

### 4.3 Navegação Mobile em 320px da Sidebar Original
```text
EVIDÊNCIA-ID: EV-PROD-SIDEBAR-MOBILE-320PX
Estado: VERIFICADO
Viewport: 320px x 640px
1. Top Bar Mobile: Presente em y=0, altura 56px, cobrindo 320px de largura com logo e atalhos.
2. Bottom Navigation Bar: Fixa no rodapé (y=576px, altura 64px), contendo 5 itens:
   ['INÍCIO', 'MÁQUINAS', 'LOJA', 'CARTEIRA', 'MENU'].
3. Abertura do Drawer Mobile:
   - Clique acionado no botão MENU da barra inferior.
   - Drawer <aside className="md:hidden"> transiciona para x=0 (translate-x-0).
   - Dimensões do drawer: { x: 0, y: 56, width: 288, height: 520 }.
   - 30 links de navegação renderizados e clicáveis.
```

---

## 5. Conclusão do Gate G9

A correção prioritária foi aplicada, aprovada e publicada em produção:
- A barra lateral de navegação retornou para a lateral esquerda (`w-72`).
- A paleta de cores `brandNavy` e a tipografia `Inter` continuam ativas globalmente.
- O `TopNav` foi removido do fluxo de renderização sem deixar regressões.
- Branch `main` em produção: `d1cc2ad`.
- Ponto de restauração para rollback caso necessário: `./deploy.sh --ref restore/pre-mininghash-20261004` (commit `ff8092a`).
