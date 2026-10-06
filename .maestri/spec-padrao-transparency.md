# PADRAO VISUAL BLOCKMINER — extraido de /transparency

O dono apontou a pagina /transparency do PROPRIO BlockMiner como o padrao que ele
quer no site inteiro. Palavras dele: "portal transparencia esta top, eu quero o site
inteiro assim".

Isto NAO e copia de site externo. E padronizar o app na linguagem que ja existe e que
o dono aprovou. Os valores abaixo foram lidos do codigo, nao estimados.

A versao anterior desta spec so extraia o CARD. O que faz a pagina bonita e o HERO.
Sem o hero, a casca fica chapada. Os dois entram juntos.

## Fonte de verdade no repo

client/src/features/transparency/TransparencyPage.tsx (hero na secao do titulo, por volta da linha 403)
client/src/features/transparency/components/transparency.charts.tsx
client/src/features/transparency/components/transparency.wallets.tsx

## HERO (obrigatorio; nao reduzir ao card)

Bloco:
  relative rounded-3xl overflow-hidden border-2 border-slate-800
  bg-gradient-to-br from-[#0c1220] via-slate-900 to-[#101b33]
  p-6 sm:p-8
  shadow-[0_0_35px_rgba(59,130,246,0.1),6px_6px_0px_#000000]
  A sombra e DUPLA: halo azul suave e solida de 6px.

Camada de brilho, filha do bloco, sem capturar clique:
  absolute inset-0 pointer-events-none
  bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.15),transparent_60%)]

Icone do titulo:
  w-12 h-12 rounded-2xl bg-primary/15 border-2 border-primary/30
  shadow-[3px_3px_0px_#000000]
  glifo: drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]

Titulo:
  text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none

Subtitulo:
  text-xs text-primary/80 font-bold uppercase tracking-wider

Pilula de status:
  rounded-full border-2 border-emerald-500/30 bg-emerald-950/30
  shadow-[2px_2px_0px_#000000]
  ponto w-2 h-2 rounded-full bg-emerald-400 animate-pulse

Numa barra cheia (header) nao aplique a sombra solida de 6px: ela vaza a viewport.
No header valem o gradiente diagonal e a camada radial. O badge ao lado do titulo
da barra e menor: w-10 h-10 rounded-xl, mesmo vocabulario.

## Superficie apoiada e overlay flutuante

SUPERFICIE APOIADA (card, painel dentro da pagina, campo, botao): bg-slate-900/60, translucido, pode deixar o fundo aparecer.

OVERLAY FLUTUANTE (modal, dropdown, menu, painel em portal, drawer): fundo OPACO, obrigatorio. Translucido aqui deixa o conteudo da pagina atravessar e torna o texto ilegivel.

BACKDROP de overlay continua translucido de proposito, porque a funcao dele e escurecer a pagina, nao esconde-la. Nao deixe o backdrop opaco: isso cobre a tela inteira de preto.

O token bg-slate-900/60 e fundo de card. Em overlay flutuante use um slate solido do tema, sem alpha (bg-slate-900). Mantenha border-2 border-slate-800, rounded-3xl e shadow-[4px_4px_0px_#000000]. backdrop-blur e bem-vindo com o fundo opaco, nao no lugar dele.

Faixa interna de cabecalho ou rodape (bg-slate-950/40) compoe sobre esse container opaco. Ela nao fica translucida sobre a pagina.

## Os tokens do padrao (copiar exatamente)

CARD / PAINEL
  rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 space-y-4
  shadow-[4px_4px_0px_#000000]
  Isto e superficie apoiada. Nao use este fundo num overlay flutuante.

CARD QUE CONTEM TABELA (sem padding, conteudo encosta na borda)
  rounded-3xl border-2 border-slate-800 bg-slate-900/60 overflow-hidden
  shadow-[4px_4px_0px_#000000]
  cabecalho interno: px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/40

CABECALHO DE SECAO (dentro do card)
  wrapper: flex items-center gap-2.5 pb-2 border-b border-slate-800/80
  badge de icone: w-8 h-8 rounded-xl bg-primary/10 border border-primary/25
                  flex items-center justify-center text-primary
                  shadow-[2px_2px_0px_#000000]
  titulo: caixa alta, bold, tracking aberto

BADGE DE ICONE TEMATICO
  mesma forma do acima, trocando primary pela cor do tema da secao
  (emerald para valores positivos/recebidos, amber para alerta, violet para
  investimento, sky para saques). Mantenha a sombra solida de 2px.

ICONE FANTASMA (barra densa, varios controles lado a lado)
  O badge NAO se repete em fila. Seis caixas iguais poluem a navbar.
  O badge ancora titulo e secao. Numa barra com muitos icones, o controle e fantasma:
  h-9 w-9 rounded-xl, sem borda, sem fundo e sem sombra no estado normal
  glifo text-slate-400
  hover: text-white bg-slate-800/60, sem borda e sem sombra
  aberto: bg-slate-800 text-white, sem borda
  focus-visible com anel. A area clicavel nao encolhe.

ITEM DE MENU ATIVO
  border-2 border-primary/25 bg-primary/10 text-primary
  shadow-[2px_2px_0px_#000000]
  inativo: sem borda, so hover

PILLS DE ABA
  ativa:   borda e fundo na cor de acento, texto da mesma cor
  inativa: borda slate-800, fundo transparente, texto muted
  cada uma com icone a esquerda e rotulo em caixa alta

CARD DE METRICA (KPI)
  label pequeno em caixa alta a esquerda + badge de icone a direita
  numero grande em fonte mono, peso alto
  linha de descricao pequena embaixo

STATUS PILL
  pequena, arredondada total, com icone + rotulo
  verde para concluido, amber para pendente

ENDERECO / VALOR TECNICO
  fonte mono, dentro de caixa com fundo mais escuro e borda sutil,
  com botoes de copiar e abrir ao lado

## O que isto NAO e

- NAO e mudanca de estrutura. A sidebar fica no lado, w-72 no desktop.
  Drawer mobile e bottom nav ficam onde estao. Nao reorganize secoes,
  nao mude navegacao, nao mova conteudo.
- NAO e mudanca de conteudo. Nenhum texto novo, nenhum numero novo, nenhum dado
  novo exposto. Tudo que esta na tela continua na tela, no mesmo lugar.
- E troca de casca visual: hero, card, cabecalho de secao, badge de icone, pill,
  tabela e KPI passam a usar o padrao acima.

## Primitivos

Card, SectionHeader, IconBadge, StatCard, StatusPill e TabPills ja existem em
client/src/shared/components. Use-os quando couberem. Nao recrie.
