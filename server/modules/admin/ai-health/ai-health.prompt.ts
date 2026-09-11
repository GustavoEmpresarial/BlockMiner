import type { AiHealthMetrics } from "./ai-health.metrics.js";

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: digits }) : "—";
}

export function buildAiHealthPrompt(m: AiHealthMetrics): string {
  const shopLines = m.economy.shop
    .map((s) => `- ${s.name}: ${fmt(s.hashRate, 0)} H/s por ${fmt(s.price, 4)} POL → payback ${s.paybackDays != null ? `${fmt(s.paybackDays / 365, 2)} anos` : "n/d"}`)
    .join("\n");

  return `Você é um analista econômico e de produto de um jogo de mineração cripto (BlockMiner). Os jogadores compram mineradoras virtuais em POL, instalam num rack, e ganham POL todo dia proporcional ao hashrate deles vs. o hashrate total da rede (emissão fixa e zero-sum). Analise a saúde do jogo em DUAS frentes separadas e dê notas de 0 a 10 pra cada uma, com justificativa curta:

1) SAÚDE DA PLATAFORMA (sustentabilidade econômica/negócio): inflação de hashrate grátis, payback da loja, fluxo de caixa (saques pendentes), carga operacional (suporte aberto).
2) SAÚDE DO USUÁRIO (experiência/engajamento): quão justo/atrativo é o jogo pra quem paga vs. quem não paga, se a loja está cara ou barata demais, retenção.

DADOS REAIS (produção, agora):

== Economia ==
Recompensa por bloco: ${fmt(m.economy.blockRewardPol, 4)} POL a cada ${fmt(m.economy.blockDurationMs / 60000, 1)} min
Emissão diária total: ${fmt(m.economy.dailyEmissionPol, 2)} POL/dia (fixo, dividido pro-rata pelo hashrate de cada jogador)
Hashrate ativo da rede: ${fmt(m.economy.networkHashRateHs, 0)} H/s (${m.economy.activeMinerRows} mineradoras ativas)
Taxa de emissão: ${m.economy.polPerHsPerDay.toFixed(8)} POL por H/s por dia

Preços da loja hoje (payback = tempo pra recuperar o preço em POL minerado):
${shopLines || "(nenhum item ativo na loja)"}
Payback médio da loja HOJE: ${m.economy.shopAvgPaybackDays != null ? `${fmt(m.economy.shopAvgPaybackDays / 365, 2)} anos` : "n/d"}

Recompensa de bloco IDEAL (recalculada agora, com os dados reais de agora — hashrate da rede e preço médio da loja) pra fazer o payback médio cair em:
  - 2.0 anos: ${m.economy.idealBlockRewardPolFor2y != null ? `${fmt(m.economy.idealBlockRewardPolFor2y, 4)} POL/bloco` : "n/d"} (hoje é ${fmt(m.economy.blockRewardPol, 4)} POL/bloco)
  - 2.5 anos: ${m.economy.idealBlockRewardPolFor2_5y != null ? `${fmt(m.economy.idealBlockRewardPolFor2_5y, 4)} POL/bloco` : "n/d"} (hoje é ${fmt(m.economy.blockRewardPol, 4)} POL/bloco)
IMPORTANTE: SEMPRE recalcule e reporte esses dois valores (2 anos e 2.5 anos) toda vez que essa análise rodar, usando os dados atuais — nunca reutilize um número de uma análise anterior. Se o bloco atual estiver MUITO diferente do ideal, isso significa que subir o bloco pra esse alvo vai aumentar a emissão diária total (mais POL saindo por dia), e quem já concentra hashrate (ver seção "conta antiga vs. nova"/concentração abaixo) vai receber a fatia desproporcional desse aumento — avise isso explicitamente se for o caso.

== Canais gratuitos de hashrate (diluem a fatia de quem paga, pois a emissão é zero-sum) ==
Auto Mining v2: até ${fmt(m.freeChannels.autoMiningV2DailyCapHsPerUser, 0)} H/s/dia por usuário, de graça, temporário (24h)
Check-in de marcos (últimos 7 dias): ${m.freeChannels.checkinPermanentMachineGrants7d} resgates de máquina PERMANENTE, totalizando ${fmt(m.freeChannels.checkinPermanentHashRate7d, 0)} H/s permanentes novos
Mini-games (jogos parceiros — boost TEMPORÁRIO de H/s, expira mas soma na disputa pelo bloco enquanto ativo):
  - H/s concedidos nos últimos 7 dias (soma de tudo que foi dado, mesmo já expirado): ${fmt(m.freeChannels.gamesHashRateGranted7d, 0)} H/s
  - H/s ativo AGORA rodando de graça vindo de mini-games: ${fmt(m.freeChannels.gamesActiveHashRateNow, 0)} H/s (${fmt(m.freeChannels.gamesActiveHashRateNowSharePct, 2)}% de todo o hashrate ativo da rede neste exato momento)
  - Se esse H/s ativo tivesse que ser COMPRADO na loja ao preço médio atual: custaria ${m.freeChannels.gamesEquivalentShopPriceIfBought != null ? `${fmt(m.freeChannels.gamesEquivalentShopPriceIfBought, 2)} POL` : "n/d"}
Usuários ativos 24h: ${m.freeChannels.activeUsers24h} | 7 dias: ${m.freeChannels.activeUsers7d}

IMPORTANTE — pense de verdade sobre isso: mini-game é grátis pro jogador, mas o H/s que ele dá compete pelo MESMO pool de emissão que o H/s de quem pagou por uma máquina de verdade. Compare o tamanho desse H/s de mini-game (ativo agora) com o hashrate médio de quem investiu (ver seção "conta antiga vs. nova" abaixo) e diga se isso dá uma vantagem indevida pra quem só joga sem pagar, dilui demais quem investiu, ou se o volume é pequeno o suficiente pra não importar.

== Plataforma/negócio ==
Total de usuários: ${m.platform.totalUsers}
Novos usuários 24h: ${m.platform.newUsers24h} | 7 dias: ${m.platform.newUsers7d}
Saques pendentes: ${m.platform.pendingWithdrawals}
Tickets de suporte abertos: ${m.platform.openSupportTickets}

== Big spenders / whales (histórico completo) ==
Top 10 quem mais gastou POL comprando mineradora na loja:
${m.spenders.topShopSpendersPol.map((s, i) => `${i + 1}. ${s.username}: ${fmt(s.totalPol, 4)} POL (${s.unitsBought} unidades)`).join("\n") || "(nenhum)"}
Total histórico gasto na loja: ${fmt(m.spenders.totalPolSpentShopAllTime, 2)} POL

Top 10 quem mais gastou POL em ofertas/eventos limitados:
${m.spenders.topOfferSpendersPol.map((s, i) => `${i + 1}. ${s.username}: ${fmt(s.totalPol, 4)} POL (${s.purchases} compras)`).join("\n") || "(nenhum)"}
Total histórico gasto em ofertas: ${fmt(m.spenders.totalPolSpentOffersAllTime, 2)} POL

Top 10 quem mais depositou dinheiro real (USD, na confirmação do depósito):
${m.spenders.topDepositorsUsd.map((s, i) => `${i + 1}. ${s.username}: US$ ${fmt(s.totalUsd, 2)} (${s.deposits} depósitos)`).join("\n") || "(nenhum registro com valor USD)"}

Receita por evento de oferta (todos os eventos, POL arrecadado):
${m.spenders.offerEventRevenue.map((e) => `- ${e.eventTitle}: ${fmt(e.totalPol, 2)} POL (${e.purchases} compras)`).join("\n") || "(nenhum)"}

Itens de oferta mais vendidos em POL:
${m.spenders.topOfferItems.map((it) => `- ${it.itemName} (${it.eventTitle}): ${fmt(it.totalPol, 2)} POL (${it.purchases} compras)`).join("\n") || "(nenhum)"}

== Conta antiga vs. conta nova (todos competindo pelo MESMO pool de ${fmt(m.economy.dailyEmissionPol, 1)} POL/dia) ==
${m.powerCohorts.byAccountAge
  .map(
    (c) =>
      `- ${c.cohort}: ${c.userCount} usuários, ${fmt(c.avgHashRateHsPerUser, 0)} H/s em média/usuário (${fmt(c.networkSharePct, 2)}% do hashrate da rede), ~${fmt(c.estDailyPolPerAvgUser, 4)} POL/dia por usuário médio${c.estRoiYearsAtShopPrice != null ? `, payback se comprasse esse hashrate hoje: ${fmt(c.estRoiYearsAtShopPrice, 2)} anos` : ""}`,
  )
  .join("\n")}

Concentração de poder de mineração (${m.powerCohorts.concentration.totalActiveUsers} usuários com hashrate ativo):
Top 1% dos usuários (${m.powerCohorts.concentration.top1PctUserCount} pessoas) controla ${fmt(m.powerCohorts.concentration.top1PctHashRateShare, 1)}% do hashrate da rede
Top 10% dos usuários (${m.powerCohorts.concentration.top10PctUserCount} pessoas) controla ${fmt(m.powerCohorts.concentration.top10PctHashRateShare, 1)}% do hashrate da rede
Os 50% com menos hashrate controlam só ${fmt(m.powerCohorts.concentration.bottom50PctHashRateShare, 2)}% do hashrate da rede
Hashrate mediano por usuário: ${fmt(m.powerCohorts.concentration.medianHashRateHs, 0)} H/s

Responda em português do Brasil, direto, sem enrolação. Formato:

## Saúde da plataforma — nota X/10
(2-4 frases, cite os números que mais pesam)

## Saúde do usuário — nota X/10
(2-4 frases, cite os números que mais pesam — inclua explicitamente se o H/s grátis de mini-game está dando vantagem desproporcional sobre quem investiu em máquina)

## Big spenders e ofertas
(2-4 frases: quem são os maiores gastadores, se a receita está concentrada em poucos usuários ou bem distribuída, qual oferta/evento rendeu mais)

## Conta antiga vs. conta nova
(2-4 frases: como o poder de mineração está distribuído entre veteranos e recém-chegados, se um jogador novo consegue competir de verdade pelo mesmo pool de emissão, e se a concentração top 1%/10% é saudável ou preocupante)

## Maiores riscos agora
- (lista curta, máximo 4 itens, cada um com 1 frase de causa e 1 de consequência)

## Bloco ideal (2 a 2.5 anos de payback)
(sempre cite os dois valores recalculados — POL/bloco pra 2 anos e pra 2.5 anos — comparando com o bloco atual, e se subir isso favorece desproporcionalmente quem já tem mais hashrate)

## Recomendação imediata
(1-2 frases, a ação de maior impacto pra fazer primeiro)`;
}
