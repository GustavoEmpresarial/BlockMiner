import type { AdminAiHealthMetrics } from '../lib/admin.api';

/** Dashboard expects the server metrics tree; cast fields at use sites when shape evolves. */
type Metrics = AdminAiHealthMetrics & {
  economy: {
    shop: Array<{ name: string; hashRate: number; price: number; paybackDays: number | null }>;
    shopAvgPaybackDays: number | null;
    networkHashRateHs: number;
  };
  freeChannels: Record<string, number>;
  platform: Record<string, number>;
  spenders: {
    topOfferItems: Array<{ itemName: string; eventTitle: string; purchases: number; totalPol: number }>;
    totalPolSpentShopAllTime: number;
    totalPolSpentOffersAllTime: number;
  };
};

/** Single-hue horizontal bar list — magnitude comparison across named entities.
 * One series (no legend needed), bar length ∝ value vs. the list's max. */
function BarList({ rows, valueLabel }: { rows: Array<{ label: string; value: number; sub?: string }>; valueLabel: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-4 text-center text-xs text-slate-600">sem dados ainda</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
          <span className="text-right font-mono text-slate-600">{i + 1}.</span>
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-slate-300">{r.label}</span>
              {r.sub ? <span className="shrink-0 font-mono text-[10px] text-slate-600">{r.sub}</span> : null}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap font-mono font-bold text-emerald-400">{valueLabel(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="py-4 text-center text-xs text-slate-600">sem dados ainda</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left font-mono text-xs">
        <thead>
          <tr className="text-slate-600">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-1.5 font-normal uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-800/60">
              {row.map((cell, j) => (
                <td key={j} className={`whitespace-nowrap px-2 py-1.5 ${j === 0 ? 'text-slate-300' : 'text-emerald-400'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-emerald-900/40 bg-slate-950/60 p-4">
      <h4 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-500/80">{title}</h4>
      {children}
    </div>
  );
}

const pol = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} POL`;
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;

export function AiHealthDashboard({ metrics }: { metrics: Metrics }) {
  const { economy, spenders, platform, freeChannels, powerCohorts } = metrics;
  const { concentration } = powerCohorts;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="poder por idade de conta (antigo vs. novo)">
        <Table
          head={['coorte', 'usuários', 'h/s médio', '% da rede', 'pol/dia médio', 'payback hoje']}
          rows={powerCohorts.byAccountAge.map((c) => [
            c.cohort,
            String(c.userCount),
            c.avgHashRateHsPerUser.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
            `${c.networkSharePct.toFixed(2)}%`,
            `${c.estDailyPolPerAvgUser.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} POL`,
            c.estRoiYearsAtShopPrice != null ? `${c.estRoiYearsAtShopPrice.toFixed(2)} anos` : '—',
          ])}
        />
      </Card>

      <Card title="bloco ideal (payback de 2 a 2.5 anos, recalculado agora)">
        <BarList
          rows={[
            { label: 'bloco atual', value: economy.blockRewardPol },
            ...(economy.idealBlockRewardPolFor2y != null ? [{ label: 'ideal p/ 2.0 anos', value: economy.idealBlockRewardPolFor2y }] : []),
            ...(economy.idealBlockRewardPolFor2_5y != null ? [{ label: 'ideal p/ 2.5 anos', value: economy.idealBlockRewardPolFor2_5y }] : []),
          ]}
          valueLabel={(v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} POL`}
        />
        <p className="mt-3 font-mono text-[11px] text-slate-600">
          calculado com o preço médio atual da loja por H/s ÷ hashrate da rede — recalcula toda vez que a análise roda
        </p>
      </Card>

      <Card title="mini-games vs. quem comprou máquina (H/s ativo agora)">
        <BarList
          rows={[
            { label: 'grátis via mini-games (ativo)', value: freeChannels.gamesActiveHashRateNow },
            ...powerCohorts.byAccountAge.map((c) => ({ label: `investiu — ${c.cohort}`, value: c.avgHashRateHsPerUser, sub: 'méd./usuário' })),
          ]}
          valueLabel={(v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} H/s`}
        />
        <p className="mt-3 font-mono text-[11px] text-slate-600">
          {freeChannels.gamesActiveHashRateNowSharePct.toFixed(2)}% do hashrate ativo da rede é grátis (mini-games, temporário)
          {freeChannels.gamesEquivalentShopPriceIfBought != null ? ` · equivaleria a ${pol(freeChannels.gamesEquivalentShopPriceIfBought)} se comprado na loja` : ''}
        </p>
      </Card>

      <Card title="concentração de poder (todos disputam o mesmo bloco)">
        <BarList
          rows={[
            { label: `top 1% (${concentration.top1PctUserCount} contas)`, value: concentration.top1PctHashRateShare },
            { label: `top 10% (${concentration.top10PctUserCount} contas)`, value: concentration.top10PctHashRateShare },
            { label: 'os 50% de menor poder', value: concentration.bottom50PctHashRateShare },
          ]}
          valueLabel={(v) => `${v.toFixed(1)}%`}
        />
        <p className="mt-3 font-mono text-[11px] text-slate-600">
          {concentration.totalActiveUsers} contas ativas · mediana {concentration.medianHashRateHs.toLocaleString('pt-BR')} H/s
        </p>
      </Card>
      <Card title="top gastadores — loja (POL, histórico)">
        <BarList rows={spenders.topShopSpendersPol.map((s) => ({ label: s.username, value: s.totalPol, sub: `${s.unitsBought}x` }))} valueLabel={pol} />
      </Card>

      <Card title="top gastadores — ofertas (POL, histórico)">
        <BarList rows={spenders.topOfferSpendersPol.map((s) => ({ label: s.username, value: s.totalPol, sub: `${s.purchases}x` }))} valueLabel={pol} />
      </Card>

      <Card title="top depositantes (USD confirmado)">
        <BarList rows={spenders.topDepositorsUsd.map((s) => ({ label: s.username, value: s.totalUsd, sub: `${s.deposits}x` }))} valueLabel={usd} />
      </Card>

      <Card title="receita por evento de oferta">
        <Table
          head={['evento', 'compras', 'pol']}
          rows={spenders.offerEventRevenue.map((e) => [e.eventTitle, String(e.purchases), pol(e.totalPol)])}
        />
      </Card>

      <Card title="itens de oferta mais vendidos">
        <Table
          head={['item', 'evento', 'compras', 'pol']}
          rows={spenders.topOfferItems.map((it) => [it.itemName, it.eventTitle, String(it.purchases), pol(it.totalPol)])}
        />
      </Card>

      <Card title="payback da loja (dias mineração ÷ preço)">
        <Table
          head={['mineradora', 'h/s', 'preço', 'payback']}
          rows={economy.shop.map((s) => [
            s.name,
            s.hashRate.toLocaleString('pt-BR'),
            pol(s.price),
            s.paybackDays != null ? `${(s.paybackDays / 365).toFixed(2)} anos` : '—',
          ])}
        />
      </Card>

      <Card title="resumo rápido">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-xs">
          <dt className="text-slate-600">payback médio loja</dt>
          <dd className="text-emerald-400">{economy.shopAvgPaybackDays != null ? `${(economy.shopAvgPaybackDays / 365).toFixed(2)} anos` : '—'}</dd>
          <dt className="text-slate-600">hashrate da rede</dt>
          <dd className="text-emerald-400">{economy.networkHashRateHs.toLocaleString('pt-BR')} H/s</dd>
          <dt className="text-slate-600">total gasto loja</dt>
          <dd className="text-emerald-400">{pol(spenders.totalPolSpentShopAllTime)}</dd>
          <dt className="text-slate-600">total gasto ofertas</dt>
          <dd className="text-emerald-400">{pol(spenders.totalPolSpentOffersAllTime)}</dd>
          <dt className="text-slate-600">auto mining v2 (cap/dia)</dt>
          <dd className="text-emerald-400">{freeChannels.autoMiningV2DailyCapHsPerUser.toLocaleString('pt-BR')} H/s</dd>
          <dt className="text-slate-600">check-in permanente (7d)</dt>
          <dd className="text-emerald-400">{freeChannels.checkinPermanentHashRate7d.toLocaleString('pt-BR')} H/s</dd>
          <dt className="text-slate-600">usuários ativos 24h / 7d</dt>
          <dd className="text-emerald-400">{freeChannels.activeUsers24h} / {freeChannels.activeUsers7d}</dd>
          <dt className="text-slate-600">saques pendentes</dt>
          <dd className="text-emerald-400">{platform.pendingWithdrawals}</dd>
          <dt className="text-slate-600">suporte aberto</dt>
          <dd className="text-emerald-400">{platform.openSupportTickets}</dd>
        </dl>
      </Card>
    </div>
  );
}
