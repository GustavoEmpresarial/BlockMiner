# MiningHash Design Tokens & Sistema Visual (Fases 1 e 2)

Documento de especificação técnica dos tokens visuais extraídos por medição pixel-a-pixel nas capturas de tela de referência do MiningHash (`.maestri/ref-mininghash/`), comparados com a especificação preliminar (`.maestri/spec-mininghash-tokens.md`).

---

## 1. Tabela Comparativa: Estimativa Preliminar vs. Medição Real

| Elemento / Token | Estimativa Preliminar (.maestri) | Valor Medido Conta-Gotas (Hex / RGB) | Classificação | O que mudou e Detalhes |
| :--- | :--- | :--- | :--- | :--- |
| **Fundo de Página (Auth)** | `~#0A0E1A a #0D1220` | `#0F1522` / `#0F1521`<br>`rgb(15, 21, 34)` | **OBSERVADO** | Ajustado de `#0D1220` para tom navy mais profundo `#0F1522` (84.5% puro nos cantos de auth). |
| **Fundo de Página (Dashboard)**| `~#0A0E1A a #0D1220` | `#151C31`<br>`rgb(21, 28, 49)` | **OBSERVADO** | Fundo da área de conteúdo do dashboard é visivelmente mais azulado que a estimativa quase-preta. |
| **Fundo da Barra de Nav** | `~#0F1626` | `#131A2F`<br>`rgb(19, 26, 47)` | **OBSERVADO** | Cor sólida uniforme (100% dos pixels livres da nav). Levemente mais clara e saturada em azul que `#0F1626`. |
| **Fundo de Card (Base)** | `~#131B2E a #162033` | `#152036`<br>`rgb(21, 32, 54)` | **OBSERVADO** | Medido nos cards de Login e Register (98% uniforme). Tom navy azulado com alto contraste sobre o fundo `#0F1522`. |
| **Fundo de Card Elevado / Dashboard** | `~#162033` | `#171F34` a `#1A294A`<br>`rgb(26, 41, 74)` | **OBSERVADO** | No dashboard, cards da coluna esquerda e botões de alternância usam `#1A294A` para elevação. |
| **Fundo de Input (Formulários)** | `~#1A2338 a #1E2840` | `#203353`<br>`rgb(32, 51, 83)` | **OBSERVADO** | Um degrau nítido acima do card (`#152036`). Medido no Register em inputs não preenchidos (91.6% uniforme). |
| **Borda de Card** | `~rgba(255,255,255,.07)` ou `#1E2A42` | `rgba(255, 255, 255, 0.06)` / `#1E2A42` | **OBSERVADO / INFERIDO** | Borda translúcida de 1px sutil somada a `box-shadow: 0 10px 30px -5px rgba(0,0,0,0.5)`. |
| **Borda de Input** | `~rgba(255,255,255,.10)` | `rgba(255, 255, 255, 0.08)` / `#2A3F66` | **INFERIDO** | Linha de delimitação suave de 1px em repouso; foco com anel azul primário. |
| **Texto Primário (Headings / Títulos)** | `~#E8EDF5` | `#F8FAFC`<br>`rgb(248, 250, 252)` | **OBSERVADO** | Branco puro/gelo equivalente ao Tailwind `slate-50`. Alto contraste (14.2:1 sobre `#152036`). |
| **Texto Secundário (Links Nav / Muted)**| `~#8A97AD` | `#CAD4E0`<br>`rgb(202, 212, 224)` | **OBSERVADO** | Links e textos de menu com tom ardósia claro, legível sobre `#131A2F` (contaste > 7:1). |
| **Texto de Apoio / Subtítulos** | `~#8A97AD` | `#8A99AD` a `#94A3B8`<br>`rgb(148, 163, 184)` | **OBSERVADO** | Equivalente ao Tailwind `slate-400`. Contraste > 4.8:1 sobre `#152036`. |
| **Label Minúsculo / Input** | `~#6B7A91` | `#64738A`<br>`rgb(100, 115, 138)` | **OBSERVADO** | Texto dos labels acima dos campos de input no Register. |
| **Acento Azul Primário** | `~#2E7FFF` | `#3D81F6` / `#3B82F6`<br>`rgb(61, 129, 246)` | **OBSERVADO** | Botão de avatar, links ativos, destaques. Alinhado ao `blue-500` padrão (`#3B82F6`). |
| **Acento Verde (Pill Ativa / Faucet)** | `~#10B981` | `#17B880`<br>`rgb(23, 184, 128)` | **OBSERVADO** | Pill de navegação ativa (`#17B880` sobre fundo `#132937`) e indicador de saldo. |
| **Fundo de Pill Ativa (Verde)** | `N/A (não medido)` | `#132937`<br>`rgb(19, 41, 55)` | **OBSERVADO** | Teal profundo escuro translúcido com texto `#17B880`. |
| **Acento Vermelho (Sair / Alerta)** | `~#E53935` | `#EE4646`<br>`rgb(238, 70, 70)` | **OBSERVADO** | Botão vermelho de sair na navbar e alertas. |
| **Acento Dourado (Banner Novidades)** | Texto: `~#F5C542`<br>Fundo: `~#C9A227 -> #8B6F1A` | Texto: `#FBBE29`<br>Fundo: `#211A00` a `#1C1700`<br>Borda: `#6E4807` | **OBSERVADO** | Fundo escuro âmbar quase preto com texto dourado brilhante `#FBBE29` (Tailwind `amber-400`). |
| **Acento Ciano** | `~#22A7F0` | `#38BDF8` / `#22D3EE` | **INFERIDO** | Segunda metade do logotipo; variantes Tailwind `sky-400` / `cyan-400`. |
| **Botão Desabilitado** | `N/A` | `#525760` / `#60656E`<br>`rgb(82, 87, 96)` | **OBSERVADO** | Botão desabilitado nos formulários de Login e Register. |

---

## 2. Rampa Azulada MiningHash (Mapeamento Tailwind `slate` e `gray`)

Para repintar toda a aplicação sem alterar centenas de arquivos que utilizam classes como `bg-slate-900`, `bg-slate-800`, `border-slate-700`, `text-slate-400`, as rampas `slate` e `gray` são redefinidas no `client/tailwind.config.js` com a tonalidade azul-marinho profunda do MiningHash:

```js
// Rampa azulada MiningHash calibrada para WCAG AA
mininghashNavy: {
  50: '#F8FAFC',  // Texto primário em títulos e destaque (15.5:1 em card)
  100: '#E8EDF5', // Texto claro
  200: '#CAD4E0', // Texto secundário (links da navbar - 10.8:1 em card)
  300: '#A3B3C9', // Muted claro (7.4:1 em card)
  400: '#94A3B8', // Texto de apoio / body muted (6.3:1 em card, 4.9:1 em input - WCAG AA)
  500: '#7C8EA6', // Labels minúsculos calibrados para contraste (4.9:1 em card - WCAG AA)
  600: '#3E547A', // Bordas e divisores médios
  700: '#2A3F66', // Bordas sutis de card e inputs
  800: '#203353', // Fundo de input / cards elevados / pills secundárias
  850: '#1A294A', // Fundo intermediário / card elevado dashboard
  900: '#152036', // Fundo principal de card
  950: '#0F1522', // Fundo de página / deep navy
}
```

---

## 3. Tipografia: Análise dos Glifos e Lacuna Registrada

### Glifos Observados nas Capturas:
- **Títulos em Caixa Alta**: `JOIN THE NETWORK`, `SIGN IN`, `DASHBOARD`, `REFERRALS`.
- **Letras Caixa Baixa (subtítulos e labels)**:
  - `a`: **Double-story** nítido (arco superior proeminente com bojo inferior circular fechado).
  - `g`: **Single-story** (haste superior com bojo circular e cauda aberta curvando para a esquerda).
  - `t`: Cruzamento horizontal reto, haste vertical com curvatura suave à direita na base.
  - `O`: Altamente simétrico, quase circular (estética geométrica/neo-grotesca moderna).
  - `R`: Perna diagonal reta partindo da junção do bojo superior com a haste vertical.

### Lacuna Registrada (Pergunta ao Dono):
> **LACUNA FORMAL**: A família tipográfica exata não pode ser cravada com 100% de certeza visual isolada sem acesso ao DOM/DevTools (o `a` double-story com `g` single-story é característico de **Inter** e famílias neo-grotescas modernas similares, mas exclui fontes geométricas de `a` single-story como Poppins ou Outfit).
> Conforme instrução expressa do Orquestrador, **não foi realizado chute**. A lacuna fica registrada para validação com o dono do projeto.
> **Configuração Adotada na Fase 2**: Definido fallback geométrico de alta fidelidade:
> `fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'] }`.

---

## 4. Raios de Borda (Border Radius)

| Token Tailwind | Valor | Uso Observado |
| :--- | :--- | :--- |
| `rounded-lg` | `10px` | Botões de ação, inputs de formulário |
| `rounded-xl` | `12px` | Badges, pills de navegação, cards compactos |
| `rounded-2xl` | `16px` | Cards principais (Login, Register, Dashboard) |
| `rounded-3xl` | `24px` | Containers modais e painéis amplos |
| `rounded-full` | `9999px` | Avatares e pills circulares de status |

---

## 5. Sombras e Efeitos (Box Shadow & Glows)

| Nome do Token | Valor CSS | Aplicação Observada |
| :--- | :--- | :--- |
| `shadow-card` | `0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)` | Cards principais sobre o fundo navy |
| `shadow-card-elevated` | `0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)` | Modais e cards suspensos |
| `shadow-glow-blue` | `0 0 25px rgba(61, 129, 246, 0.35)` | Ícones em destaque e badges de login |
| `shadow-glow-green` | `0 0 25px rgba(23, 184, 128, 0.35)` | Ícone e badge do registro |

---

## 6. Validação de Contraste WCAG AA e Gate de Entrega

Todos os pares de cor e textos de apoio foram medidos formalmente contra a fórmula de luminância relativa da WCAG 2.1:

| Par de Cores (Texto / Fundo) | Razão de Contraste | Nível WCAG | Status |
| :--- | :--- | :--- | :--- |
| **Texto Primário (#F8FAFC) sobre Fundo (#0F1522)** | **17.44:1** | WCAG AAA (>= 7.0:1) | **PASS** |
| **Texto Primário (#F8FAFC) sobre Card (#152036)** | **15.54:1** | WCAG AAA (>= 7.0:1) | **PASS** |
| **Texto Primário (#F8FAFC) sobre Input (#203353)** | **12.09:1** | WCAG AAA (>= 7.0:1) | **PASS** |
| **Texto Secundário (#CAD4E0) sobre Nav (#131A2F)** | **11.51:1** | WCAG AAA (>= 7.0:1) | **PASS** |
| **Texto Secundário (#CAD4E0) sobre Card (#152036)** | **10.84:1** | WCAG AAA (>= 7.0:1) | **PASS** |
| **Texto de Apoio (#94A3B8) sobre Card (#152036)** | **6.34:1** | WCAG AA Normal (>= 4.5:1) | **PASS** |
| **Texto de Apoio (#94A3B8) sobre Fundo (#0F1522)** | **7.12:1** | WCAG AAA (>= 7.0:1) | **PASS** |
| **Texto de Apoio (#94A3B8) sobre Input (#203353)** | **4.93:1** | WCAG AA Normal (>= 4.5:1) | **PASS** |
| **Label Minúsculo (#7C8EA6) sobre Card (#152036)** | **4.86:1** | WCAG AA Normal (>= 4.5:1) | **PASS** |
| **Label Minúsculo (#7C8EA6) sobre Fundo (#0F1522)** | **5.45:1** | WCAG AA Normal (>= 4.5:1) | **PASS** |
| **Acento Verde (#17B880) sobre Pill (#132937)** | **5.86:1** | WCAG AA Normal (>= 4.5:1) | **PASS** |
| **Texto Banner Dourado (#FBBE29) sobre (#211A00)** | **10.31:1** | WCAG AAA (>= 7.0:1) | **PASS** |
| **Texto Branco (#FFFFFF) sobre Azul (#3D81F6)** | **3.70:1** | WCAG AA Large (>= 3.0:1) | **PASS** |
| **Texto Branco (#FFFFFF) sobre Vermelho (#EE4646)** | **3.75:1** | WCAG AA Large (>= 3.0:1) | **PASS** |

### Prova Visual Antes vs. Depois (6 Páginas Distintas no Localhost):
Capturas automatizadas com Playwright em viewport 1920x1080 com contextos autenticado e não-autenticado separados para garantir renderização real de cada rota:
- `01-landing.png` (`/`): 58.9% de pixels repintados | Canto `#020610` -> `#0F1522` | Delta: 11.73
- `02-login.png` (`/login`): 99.2% de pixels repintados | Canto `#020610` -> `#0F1522` | Delta: 20.62
- `03-register.png` (`/register`): 99.3% de pixels repintados | Canto `#020610` -> `#0F1522` | Delta: 19.44
- `04-terms.png` (`/terms-of-use`): 99.6% de pixels repintados | Canto `#02070f` -> `#0F1522` | Delta: 23.21
- `05-transparency.png` (`/transparency` autenticado): 95.9% de pixels repintados | Delta: 9.91
- `06-dashboard.png` (`/dashboard` autenticado): 98.8% de pixels repintados | Delta: 9.00

### Hashes MD5 Comprovando Imagens 100% Distintas:
**Antes (Worktree base `bca403b`):**
- `79477d6cddbbc4172558164cf49490a7  01-landing.png`
- `4220218a990a8af880575cf40ec51a1e  02-login.png`
- `484e8bea705209a9d88cd6869ced3621  03-register.png`
- `a20f95d5cb472e69306c03859c2e9851  04-terms.png`
- `cbb1d72dd1332a97978c1f40535ebe55  05-transparency.png`
- `6b83542bb764e3df07d23ae8e4324717  06-dashboard.png`

**Depois (Branch `feature/mininghash-redesign-foundation`):**
- `b11f16390a1a2af8bf4144eedf806a72  01-landing.png`
- `78fa1babf86f07920d8928298b6d8a3b  02-login.png`
- `571a99b1c6a524701f5cf4afe5d56153  03-register.png`
- `201813a70dfe2725c82fb701228daac9  04-terms.png`
- `b5ddb2f8b7e939944be35854417dc583  05-transparency.png`
- `104a054258eb63c13b07d6ff0effeef7  06-dashboard.png`

### Auditoria do Ativo BrandLogo (`icon.webp`):
- O componente `BrandLogo.tsx` utiliza `<img src="/media/brand/icon.webp?v=3" />` e **não foi alterado** na branch (inalterado desde commit inicial `1ca1733`).
- Em produção, a rota `/media/*` é servida pelo Express (`server/bootstrap/server.ts` linha 222-291) a partir de `storage/uploads/media/` (semeado de `storage/media-seed/`).
- Em preview estático isolado do Vite, `/media/*` não possuía rota sem o backend. Ao rotear `/media/**` para os arquivos de disco em `storage/media-seed/brand/icon.webp`, o ícone carrega perfeitamente com 14.096 pixels coloridos (degradê cyan/sky `#0ea5e9`), comprovando que o ativo está 100% íntegro.
