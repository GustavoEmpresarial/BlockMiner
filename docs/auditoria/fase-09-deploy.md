# Fase 9: Deploy em Produção — Redesign Visual Shell TopNav e Suporte Mobile (Entrega 2)

- **Projeto**: BlockMiner (current/)
- **Data**: 2026-10-04
- **Branch de Origem**: `feature/mininghash-top-nav` @ `c2f9838`
- **PR Develop**: PR #18 (Merge Commit `39fafb0`)
- **PR Release (main)**: PR #19 (Merge Commit `9d6ccad`)
- **Host de Produção**: `169.58.45.155` (VM IBM Cloud)
- **Banco de Produção**: `blockminer-db` (Porta 5432, SSL verify-full)
- **Estado do Gate G9**: `VERIFICADO` (100% verde em suíte, build, typecheck sem regressão e auditoria rigorosa de responsividade)
- **Ponto de Restauração**: Branch `restore/pre-mininghash-20261004` e tag anotada `v-pre-mininghash-20261004` apontando para `ff8092a` (Rollback: `./deploy.sh --ref restore/pre-mininghash-20261004`)

---

## 1. Verificação Pré-Deploy da VM de Produção

- **Comando executado**: `cd /root/blockminer-current && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git log -1 --oneline`
- **Branch observada na VM**: `main`
- **Commit anterior em produção**: `275dc98` (Merge pull request #17 from GustavoEmpresarial/develop — *release: redesign visual fases 1 e 2 - fundacao mininghash*)
- **Host do banco verificado em `.env.production`**: `blockminer-db:5432` (preservado)
- **Estado de manutenção**: `SITE_MAINTENANCE=0` verificado e mantido

---

## 2. Conteúdo da Entrega (Shell TopNav e Suporte Mobile)

A entrega da Fase 3 do redesign visual substitui a arquitetura de navegação herdada por uma experiência alinhada ao MiningHash:
- **Barra de Navegação Horizontal no Topo (`TopNav`)**: Substitui permanentemente a antiga sidebar fixa de 288px e o header de 80px.
- **Grupos de Navegação**: 4 categorias principais (`PRINCIPAL`, `GANHAR`, `LOJA`, `SOCIAL & FUN`) com submenus suspensos acessíveis via mouse e teclado (Tab, Setas Cima/Baixo/Esquerda/Direita, Home, End e Escape).
- **Drawer Mobile via `createPortal`**: Menu lateral retrátil para dispositivos móveis (`< 1024px`) montado diretamente em `document.body` com `aria-modal="true"`, foco gerenciado e fechamento em backdrop e tecla Escape.
- **Bottom Navigation Bar**: Barra de navegação inferior fixa com 5 atalhos rápidos para mobile (`/dashboard`, `/inventory`, `/games`, `/shop`, `/wallet`).
- **Sanitização de Layout e Modais**:
  - `SupportPage.tsx` refatorado para montar via `createPortal(..., document.body)`.
  - Calibração de viewport ultra-estreito (320px/360px/414px) garantindo que o gatilho de menu permaneça 100% visível e clicável dentro dos limites da tela.
  - Correção de internacionalização para cópia de encerramento de sessão (`Logout` em inglês, `common.logout`).
- **Isolamento de Segurança**: O diretório `/admin` **não** foi tocado em nenhum momento.

---

## 3. Deploy em Produção

- **Target**: `prod` (`/root/blockminer-current`, `docker-compose.yml`)
- **Git Ref**: `main` @ `9d6ccad`
- **Comando de Deploy**: `SKIP_SERVER_BUILD=1 ./deploy.sh --ref main` (alteração restrita ao SPA do cliente)
- **Compilação**:
  - Client dist: compilado via Vite (`client/dist/index.html` referenciando bundle `assets/index-CDnfdDf1.js` e CSS `assets/index-DXb9oVFb.css`).
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

Validação executada via Chromium headless com medição real de geometria e navegação interativa no ambiente publicado:

### 4.1 Geometria do Gatilho Mobile em 320px
```text
EVIDÊNCIA-ID: EV-PROD-GEOMETRY-320PX
Estado: VERIFICADO
Viewport: 320px x 640px
Elemento: button[aria-label="Abrir menu de navegação completo"]
Medições Reais (BoundingBox):
  - x: 270px
  - y: 12.5px
  - width: 38px
  - height: 38px
  - Borda direita: 270 + 38 = 308px (estritamente <= 320px da viewport)
Conclusão: O botão hambúrguer está 100% visível e contido na tela em 320px, sem qualquer overflow horizontal.
```

### 4.2 Interação com o Drawer Mobile em 320px
- **Ação**: Disparo de clique sobre o botão hambúrguer.
- **Resultado**: Drawer `[role="dialog"][aria-label="Menu de Navegação Mobile"]` aberto com sucesso.
- **Visibilidade**: `true` (visível, com backdrop-blur ativo).
- **Montagem**: Confirmada diretamente no elemento `BODY` (`createPortal`).
- **Rotas Mapeadas**: 32 rotas de usuário disponíveis na lista do drawer.

### 4.3 Acessibilidade a Rotas Fora da Bottom Nav
Verificação de rotas ausentes na barra inferior (`bottom nav`), navegadas com sucesso através do drawer:
1. `/faucet`: Presente no drawer (`label: "Faucet"`). Clique efetuado com navegação comprovada para `https://blockminer.space/faucet`.
2. `/tournaments`: Presente no drawer (`label: "Torneios"`).
3. `/tasks`: Presente no drawer (`label: "Tarefas"`).

### 4.4 Responsividade em Viewports 768px (Tablet) e 1440px (Desktop)
- **768px (Tablet)**: Barra compacta com layout limpo e bottom bar ativa para tablets portrait.
- **1440px (Desktop)**: TopNav completo com 4 grupos de botões principais visíveis:
  `[ 'PRINCIPAL', 'GANHAR', 'LOJA', 'SOCIAL & FUN' ]`. Submenus acessíveis e alinhados.

### 4.5 Internacionalização do Botão de Logout
- **Ação**: Alternância de idioma para Inglês (`en`) através do componente `LanguageSwitcher`.
- **Verificação**:
  - `tag`: `BUTTON`
  - `aria-label`: `"Logout"`
  - `title`: `"Logout"`
- **Conclusão**: Exibe `"Logout"` perfeitamente, sem resquício da chave crua `common.logout`.

---

## 5. Conclusão do Gate G9

A Entrega 2 do Redesign Visual (Shell TopNav, Drawer Mobile, Bottom Navigation e sanitizações associadas) está em plena operação em produção sem falhas ou regressões.
Branch `main` em produção: `9d6ccad`.
Ponto de restauração para rollback caso necessário: `./deploy.sh --ref restore/pre-mininghash-20261004`.
