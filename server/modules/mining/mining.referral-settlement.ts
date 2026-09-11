/**
 * Lógica PURA de comissão de referral no fechamento de bloco (item 92) — sem I/O, testável
 * isolada. Porte fiel de legacy/server/models/database/settlementPure.ts
 * (`mergeSettlementBalanceDeltas` + `buildReferralEarningsRows`), adaptado ao current/.
 *
 * Contexto do bug: o `persistBlockRewards` do current/ creditava só o minerador e pulava a
 * comissão do indicador — documentado como pendência no cabeçalho de mining.repository.ts
 * ("Block settlement write skips: referral commission crediting"). Confirmado em produção:
 * `referral_earnings` parou de crescer em 12/08 04:10 (o handoff), enquanto a mineração
 * seguiu normal. Cada indicador ganha 10% do que seus indicados mineram, em POL e SHIB.
 *
 * Regra do lifetime_mined_pol (específica do current/, o legacy não tinha essa coluna aqui):
 * comissão de referral NÃO conta como "minerado". O minerador soma no lifetime; o indicador
 * recebe pol/shib mas com `lifetimeMinedDelta = 0`. Por isso o delta carrega os 3 campos.
 */

export const REFERRAL_MINING_COMMISSION_RATE = 0.1;

export type SettlementReward = {
  userId: number;
  rewardAmount: number;
  rewardAmountShib: number;
};

export type BalanceDelta = { polDelta: number; shibDelta: number; lifetimeMinedDelta: number };

export type ReferralEarningRow = {
  referrerId: number;
  referredId: number;
  amount: number;
  amountShib: number;
  source: string;
  createdAt: Date;
};

/**
 * Funde os rewards dos mineradores + as comissões dos indicadores num único mapa
 * userId → delta, pra creditar tudo em UM único UPDATE em lote (evita o lock-upgrade que
 * causava deadlock quando o crédito rodava depois dos inserts com FK — ver comentário no
 * `persistBlockRewards`). Um indicador que também minerou soma os dois no mesmo delta.
 */
export function mergeSettlementBalanceDeltas(
  minerRewards: readonly SettlementReward[],
  referrerByMinerId: ReadonlyMap<number, number | null>,
  commissionRate: number,
): Map<number, BalanceDelta> {
  const deltas = new Map<number, BalanceDelta>();

  const bump = (userId: number, pol: number, shib: number, lifetime: number) => {
    if (pol <= 0 && shib <= 0) return;
    const existing = deltas.get(userId);
    if (existing) {
      existing.polDelta += pol;
      existing.shibDelta += shib;
      existing.lifetimeMinedDelta += lifetime;
    } else {
      deltas.set(userId, { polDelta: pol, shibDelta: shib, lifetimeMinedDelta: lifetime });
    }
  };

  for (const reward of minerRewards) {
    const pol = reward.rewardAmount;
    const shib = reward.rewardAmountShib ?? 0;
    // Minerador: pol/shib no saldo E no lifetime (foi minerado por ele).
    bump(reward.userId, pol, shib, pol);

    const referrer = referrerByMinerId.get(reward.userId);
    // Guard: ninguém é indicador de si mesmo (dado corrompido não deve auto-creditar).
    if (referrer && referrer !== reward.userId) {
      const polCommission = pol > 0 ? pol * commissionRate : 0;
      const shibCommission = shib > 0 ? shib * commissionRate : 0;
      // Indicador: recebe pol/shib mas lifetime = 0 (comissão não é mineração dele).
      bump(referrer, polCommission, shibCommission, 0);
    }
  }

  return deltas;
}

/** Linhas do ledger `referral_earnings` (histórico/stats), uma por par indicado→indicador do bloco. */
export function buildReferralEarningsRows(
  minerRewards: readonly SettlementReward[],
  referrerByMinerId: ReadonlyMap<number, number | null>,
  blockNumber: number,
  createdAt: Date,
  commissionRate: number,
): ReferralEarningRow[] {
  const rows: ReferralEarningRow[] = [];
  for (const reward of minerRewards) {
    const referrer = referrerByMinerId.get(reward.userId);
    const pol = reward.rewardAmount;
    const shib = reward.rewardAmountShib ?? 0;
    if (!referrer || referrer === reward.userId || (pol <= 0 && shib <= 0)) continue;
    rows.push({
      referrerId: referrer,
      referredId: reward.userId,
      amount: pol > 0 ? pol * commissionRate : 0,
      amountShib: shib > 0 ? shib * commissionRate : 0,
      source: `mining_block_${blockNumber}`,
      createdAt,
    });
  }
  return rows;
}
