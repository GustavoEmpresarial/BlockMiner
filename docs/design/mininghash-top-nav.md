# Arquitetura e Implementação da Barra de Navegação Horizontal no Topo (Fase 3)

Este documento registra a especificação, estrutura semântica, estratégia mobile e evidências de verificação da **Fase 3 do Redesign Visual do BlockMiner**, inspirada na linguagem do MiningHash.

---

## 1. Visão Geral da Arquitetura
A antiga barra lateral fixa (`aside w-72`) e o antigo cabeçalho secundário (`Header h-20`) foram substituídos por uma **barra de navegação horizontal única no topo** (`TopNav h-16`), de largura total e fixa (`sticky top-0 z-40`), liberando 100% da largura útil da viewport desktop para o conteúdo das 55 páginas de usuário. O painel administrativo (`/admin`) permanece 100% isolado com seu shell próprio em `AdminLayout`.

### Componentes Envolvidos:
- **`client/src/features/shell/components/TopNav.tsx`**: Componente central da TopNav, incorporando navegação por grupos, menus dropdown acessíveis, timers, notificações, seletor de idioma, pill de saldo POL, avatar de perfil, botão vermelho de logout e drawer móvel montado via `createPortal(document.body)`.
- **`client/src/features/shell/ProtectedLayout.tsx`**: Shell unificado das páginas autenticadas, removendo a margem lateral da sidebar e padronizando o espaçamento vertical (`pt-16` para o TopNav e `pb-20 lg:pb-0` para a barra inferior mobile).
- **`client/src/features/shell/components/TopNav.test.tsx`**: Suíte de testes automatizados com cobertura completa para desktop, dropdowns, drawer móvel, bottom nav e logout.

---

## 2. Estrutura de Agrupamento Semântico dos Menus (Conteúdo BlockMiner)

Em estrito cumprimento à regra de conteúdo ("O BlockMiner tem os próprios itens de menu... NAO copie os rótulos de menu deles, NAO use o mascote nem textos deles"), todas as rotas legítimas do BlockMiner foram preservadas e organizadas em 4 grupos conceituais de nível superior:

### 1. `MINERAÇÃO` (Ícone: `Cpu`)
- **Dashboard Central** (`/dashboard`, ícone `LayoutDashboard`)
- **Minhas Máquinas** (`/inventory`, ícone `Cpu`)
- **Inventário de Peças** (`/inventario`, ícone `Package`)
- **Estatísticas e Poder** (`/power-stats`, ícone `BarChart3`)
- **Impostos de Energia** (`/taxes`, ícone `Receipt` — com indicador de pendência quando houver taxa a pagar)

### 2. `GANHOS` (Ícone: `Gamepad2`)
- **Torneios** (`/tournaments`, ícone `Crosshair` — com badge numérico com a contagem de torneios ativos)
- **Jogos da Arena** (`/games`, ícone `Gamepad2`)
- **Check-in Diário** (`/checkin`, ícone `Calendar`)
- **Missões e Tarefas** (`/tasks`, ícone `ListChecks`)
- **Mini Pass** (`/mini-pass`, ícone `Trophy`)
- **Eventos de Queima** (`/burn`, ícone `Flame`)
- **Recompensas**:
  - `Faucet` (`/faucet`, ícone `Gift`)
  - `Offerwall Interna` (`/internal-offerwall`, ícone `LayoutGrid`)
  - `Offerwall Global` (`/offerwall`, ícone `Globe`)
  - `Anúncios PTC` (`/ptc`, ícone `Eye`)
  - `Shortlinks` (`/shortlinks`, ícone `Link`)
  - `Ler e Ganhar` (`/read-earn`, ícone `Sparkles`)
  - `YouTube Watch` (`/youtube`, ícone `Youtube`)
  - `Auto Mining` (`/auto-mining`, ícone `Zap`)

### 3. `MERCADO` (Ícone: `ShoppingCart`)
- **Loja de Equipamentos** (`/shop`, ícone `ShoppingCart`)
- **Ofertas Populares** (`/offers`, ícone `Tag` — com badge "HOT" pulsante quando houver eventos ao vivo)
- **Carteira & Depósitos** (`/wallet`, ícone `Wallet`)

### 4. `COMUNIDADE` (Ícone: `Users`)
- **Indicações / Afiliados** (`/referrals`, ícone `UserPlus`)
- **Feed Social** (`/social`, ícone `Youtube`)
- **Programa de Criadores** (`/creator`, ícone `Star`)
- **Ranking Global** (`/ranking`, ícone `Trophy`)
- **Portal de Transparência** (`/transparency`, ícone `Eye`)
- **Roadmap** (`/roadmap`, ícone `Map`)
- **Manual do Jogador** (`/manual`, ícone `BookOpen`)
- **Calculadora de Mineração** (`/calculator`, ícone `BarChart3`)
- **Central de Suporte** (`/support`, ícone `LifeBuoy`)

---

## 3. Elementos de Ação à Direita
Seguindo o padrão visual da referência:
- **Timers Globais**: Offerwall timer e PTC session timer compactos e informativos.
- **Chat Comunitário**: Botão rápido de alternância de chat com indicador de menções pendentes.
- **Notificações**: Sino com contador numérico de não lidas e painel suspenso de histórico.
- **Idioma**: `LanguageSwitcher` integrado.
- **Pill de Saldo**: Indicador com ponto de status e valor formatado (ex.: `142.85 POL`), clicável com direcionamento direto para a `/wallet`.
- **Avatar do Usuário**: Caixa arredondada estilizada com a inicial do usuário e link para as configurações (`/settings`).
- **Botão Sair**: Botão vermelho de alto contraste com ícone `LogOut` no canto direito da barra superior, executando logout imediato.

---

## 4. Estratégia Mobile Justificada (< 1024px)
Forçar uma barra de menus horizontais suspensos em telas estreitas (320px a 768px) degrada gravemente a usabilidade: causa corte de dropdowns, exige toques múltiplos no topo da tela e polui a interface.

Por essa razão, adotou-se o padrão ergonômico moderno:
1. **Barra Fixa Inferior (Bottom Nav)**: Mantém os 5 destinos operacionais mais frequentes ao alcance do polegar:
   - `Início` (`/dashboard`)
   - `Máquinas` (`/inventory`)
   - `Ganhos` (`/tasks`)
   - `Loja` (`/shop`)
   - `Carteira` (`/wallet`)
2. **Drawer Completo no Topo (Hamburger Menu)**: Montado obrigatoriamente via `createPortal(document.body)` para evitar contaminação por stacking contexts ou `space-y-*`. O drawer apresenta todos os 30+ itens organizados por categoria, além de perfil, idioma e logout.

---

## 5. Acessibilidade e Teclado (WAI-ARIA)
- `aria-expanded` dinâmico em todos os botões de menu e diálogos.
- `aria-haspopup="menu"` e `role="menu"` / `role="menuitem"`.
- Navegação por teclado nos menus suspensos:
  - `Enter`, `Espaço` e `Seta para Baixo` abrem o submenu e focam o primeiro item.
  - `Setas para Cima/Baixo` ciclam o foco entre os itens do menu.
  - `Escape` fecha o menu imediatamente e devolve o foco ao botão disparador.
  - `Tab` permite sair do menu de forma natural.
- Todos os links e botões possuem contraste superior a **4.5:1 (WCAG AA Normal)** sobre a barra `#0F1522` e o submenu `#152036`.

---

## 6. Evidências do Gate Visual (Antes vs. Depois)

As capturas automatizadas com Playwright em 6 páginas distintas cobrindo 320px, 768px e 1440px comprovam as alterações e a total estabilidade geométrica sem scroll horizontal:

### Hashes MD5 Antes (Com Sidebar):
```
d34ae5f78252754a03d559e8451dd9b7  01-landing-desktop-1440.png
73c93235ca1a9cdfcbcaabc7c82594cc  01-landing-mobile-320.png
2b297573d1a9810d75d81def1a577168  01-landing-tablet-768.png
ba684183892cb63a6961277aa528fed7  02-login-desktop-1440.png
ced1740e76628e5c6b93072696cba9e5  02-login-mobile-320.png
ac73634ddde22cf8fcb38ae0cb9ea467  02-login-tablet-768.png
e352eb8f9e2dfbf3b72aed1172ccaef1  03-dashboard-desktop-1440.png
1066dfe88a494d6cf5c30ef1352e88f8  03-dashboard-mobile-320.png
b79f32aa0581908efeeb529fda7adb5c  03-dashboard-tablet-768.png
1587f05da89651898b4773db2bafecce  04-inventory-desktop-1440.png
59b84514d660c446f0461ce900325f55  04-inventory-mobile-320.png
91343d0282577dead6145cea318c2a3f  04-inventory-tablet-768.png
c2bdd92a0e3f2b789dd5105bf4c99b8b  05-shop-desktop-1440.png
02ea78c48e86a5c165c18d79752f9bc3  05-shop-mobile-320.png
2a69ecf9349b20267cb7a4891985c758  05-shop-tablet-768.png
0caddeef5835ee012e6f35b8b94a9946  06-transparency-desktop-1440.png
ecf6a33411c2a6c6205dfc81bc1d8688  06-transparency-mobile-320.png
5ca4100c6ac76f0ad3352b32d4036fb6  06-transparency-tablet-768.png
```

### Hashes MD5 Depois (Com TopNav e Header Mobile Otimizado):
```
43607cc3f32a933785183607589ad597  01-landing-desktop-1440.png
0a86acf03101d3b54596dcde5061b1f3  01-landing-mobile-320.png
c11f85b9eb3f2eaf052606c1a4643308  01-landing-tablet-768.png
ba684183892cb63a6961277aa528fed7  02-login-desktop-1440.png
ced1740e76628e5c6b93072696cba9e5  02-login-mobile-320.png
ac73634ddde22cf8fcb38ae0cb9ea467  02-login-tablet-768.png
6da632b75eee2aba5eb6ffd93923e74a  03-dashboard-desktop-1440.png
a07f74d57daf544733ce90847646f16b  03-dashboard-mobile-320.png
bb4674770d74ca350fb7cc0bcfe6c4a9  03-dashboard-tablet-768.png
b358544cfd555e033ac6afaa06ecfc74  04-inventory-desktop-1440.png
40c26b0c56d66ad03c75890e94724a80  04-inventory-mobile-320.png
aa1645b9986391b71e65d099696f184b  04-inventory-tablet-768.png
03bcdf0e3e4ab0fda5478097933026ea  05-shop-desktop-1440.png
bea36d6fa2a270c3dad456d70f3d6945  05-shop-mobile-320.png
615b5f5dd4f805238b42202d503690bf  05-shop-tablet-768.png
988045afcd7890ca00eb9c8ed25828f5  06-transparency-desktop-1440.png
948f4b39123d44d131747b319fa1ca47  06-transparency-mobile-320.png
5bd779b9b903db6c74f62dc913a87fa4  06-transparency-tablet-768.png
```

### Prova de Alcance Integral das Rotas e Mobile 320px/360px/414px:
- **Resoluções Testadas**: 320px, 360px e 414px.
- **Posição do Hamburger**: Em 320px (`x=270, right=308 <= 320`), em 360px (`x=310, right=348 <= 360`), em 414px (`x=364, right=402 <= 414`). O botão está 100% visível, clicável e nunca sofre corte.
- **Total de Rotas no Mobile Drawer + Bottom Nav**: 32 rotas únicas (todas as 31 rotas da aplicação, incluindo `/settings`, mais links auxiliares).
- **Rotas Inalcançáveis**: **zero (0)**.

---

## 7. Auditoria de Modais Legados e Stacking Context
Auditamos todos os arquivos da pasta `client/src/features/` em busca de modais com `fixed inset-0` e verificamos o uso de `createPortal`:

- **Modais com Portal (Imunes a Stacking Context)**:
  - `TopNav.tsx` (Mobile Drawer — `createPortal(document.body)`)
  - `SupportPage.tsx` (Ticket Modal — atualizado para `createPortal(document.body)`)
  - `DashboardBannersCarousel.tsx` (`createPortal`)
  - `DashboardEnergyTaxModal.tsx` (`createPortal`)
  - `MiningAllocationPanel.tsx` (`createPortal`)
  - `ShopPurchaseModal.tsx` (`createPortal`)
  - `machines.slotModal.tsx` (`createPortal`)
  - `machines.dismantleModal.tsx` (`createPortal`)
  - `machines.quantityModal.tsx` (`createPortal`)
  - `OffersPage.tsx` (`createPortal`)
  - `transparency.methodology.tsx` (`createPortal`)

- **Modais Legados sem Portal (Mapeados para saneamento futuro)**:
  - `burn-events/BurnEventsPage.tsx` (Modal de queima)
  - `internal-offerwall/internalOfferwall.parts.tsx` (Modal de detalhes de oferta)
  - `read-earn/ReadEarnPage.tsx` (Modal de leitura)
  - `inventory2/components/Inventory2RoomContent.tsx` (Diálogos de sala)
  - `games/components/GameTurnstileModal.tsx` (Turnstile captcha gate)
  - `bm-captcha/BmCaptchaModal.tsx` (Anti-bot captcha modal)
  - `shell/broadcast/BroadcastPopup.tsx` (Broadcast de aviso global)
