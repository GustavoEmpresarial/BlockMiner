import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Zap, TrendingUp, RefreshCw, Info, Cpu, Wifi } from 'lucide-react';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import SectionHeader from '../../shared/components/SectionHeader';
import StatCard from '../../shared/components/StatCard';
import { api } from '../../shared/auth/auth.store';
import { useGameStore } from '../shell/lib/game.store';
import { DEFAULT_MINER_IMAGE_URL, formatHashrate } from '../machines/lib/machines.shared';
import {
  DEFAULT_BLOCK_REWARD_POL,
  DEFAULT_BLOCK_INTERVAL_MIN,
  calcRewards,
  calcSelectedHashRate,
} from './lib/calculatorEngine';

interface ShopMiner {
  id: number;
  name: string;
  imageUrl?: string | null;
  baseHashRate: number;
}

export default function CalculatorPage() {
  const { t } = useTranslation();
  const { stats, initSocket } = useGameStore();

  const [miners, setMiners] = useState<ShopMiner[]>([]);
  const [loadingMiners, setLoadingMiners] = useState(true);

  const [myHashRateInput, setMyHashRateInput] = useState('');
  const [networkHashRateInput, setNetworkHashRateInput] = useState('');
  const [tokenPriceInput, setTokenPriceInput] = useState('0.35');
  const [tokenPriceLive, setTokenPriceLive] = useState<number | null>(null);
  const [tokenPriceManual, setTokenPriceManual] = useState(false);
  const [networkManual, setNetworkManual] = useState(false);
  const [myHashManual, setMyHashManual] = useState(false);
  const [selectedMiners, setSelectedMiners] = useState<Record<string, number>>({});

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  useEffect(() => {
    api
      .get('/shop/miners?pageSize=48')
      .then((res) => {
        if (res.data.ok) setMiners((res.data.miners || []) as ShopMiner[]);
      })
      .catch(() => {})
      .finally(() => setLoadingMiners(false));
  }, []);

  useEffect(() => {
    if (!networkManual && stats?.networkHashRate) {
      setNetworkHashRateInput(String(Math.round(stats.networkHashRate)));
    }
  }, [stats?.networkHashRate, networkManual]);

  useEffect(() => {
    if (!myHashManual && stats?.miner?.estimatedHashRate) {
      setMyHashRateInput(String(Math.round(stats.miner.estimatedHashRate)));
      setSelectedMiners({});
    }
  }, [stats?.miner?.estimatedHashRate, myHashManual]);

  useEffect(() => {
    api
      .get<{ ok: boolean; priceUsd: number | null }>('/wallet/pol-usd')
      .then((res) => {
        if (res.data?.ok && res.data.priceUsd && res.data.priceUsd > 0) {
          setTokenPriceLive(res.data.priceUsd);
          if (!tokenPriceManual) setTokenPriceInput(String(res.data.priceUsd));
        }
      })
      .catch(() => {
        if (stats?.tokenPrice) setTokenPriceInput(String(stats.tokenPrice));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = calcSelectedHashRate(miners, selectedMiners);
    if (h > 0) {
      setMyHashRateInput(String(h));
      setMyHashManual(true);
    }
  }, [selectedMiners, miners]);

  const myHash = parseFloat(myHashRateInput) || 0;
  const netHash = parseFloat(networkHashRateInput) || 0;
  const price = parseFloat(tokenPriceInput) || 0;

  const hashFromMiners = calcSelectedHashRate(miners, selectedMiners);

  const blockRewardLive = Number(stats?.blockReward);
  const blockIntervalLive = Number(stats?.blockIntervalMinutes);
  const blockRewardPol =
    Number.isFinite(blockRewardLive) && blockRewardLive > 0 ? blockRewardLive : DEFAULT_BLOCK_REWARD_POL;
  const blockIntervalMin =
    Number.isFinite(blockIntervalLive) && blockIntervalLive > 0
      ? blockIntervalLive
      : DEFAULT_BLOCK_INTERVAL_MIN;

  const { share, perBlock, perHour, perDay, perWeek, perMonth, toUSD, blocksPerDay } = calcRewards(
    myHash,
    netHash,
    price,
    { blockRewardPol, blockIntervalMin },
  );

  const handleMinerQty = (id: number, delta: number) => {
    const key = String(id);
    setSelectedMiners((prev: Record<string, number>) => {
      const curr = prev[key] || 0;
      const next = Math.max(0, curr + delta);
      if (next === 0) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  };

  const handleResetNetwork = () => {
    setNetworkManual(false);
    if (stats?.networkHashRate) setNetworkHashRateInput(String(Math.round(stats.networkHashRate)));
  };

  const handleResetMyHash = () => {
    setMyHashManual(false);
    setSelectedMiners({});
    if (stats?.miner?.estimatedHashRate) {
      setMyHashRateInput(String(Math.round(stats.miner.estimatedHashRate)));
    }
  };

  const clearMiners = () => {
    setSelectedMiners({});
    setMyHashRateInput('');
  };

  const resultRows = [
    { key: 'per_block', pol: perBlock, sub: t('calculator.every_n_min', { n: blockIntervalMin }) },
    { key: 'per_hour', pol: perHour, sub: '1h' },
    { key: 'per_day', pol: perDay, sub: '24h' },
    { key: 'per_week', pol: perWeek, sub: '7d' },
    { key: 'per_month', pol: perMonth, sub: '30d' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-4 pb-3 border-b-2 border-slate-800">
        <IconBadge icon={Calculator} variant="sky" size="lg" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('calculator.title')}</h1>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('calculator.subtitle')}</p>
        </div>
      </div>

      {(stats?.miner?.estimatedHashRate ?? 0) > 0 && (
        <Card className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={Wifi} variant="primary" size="md" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white">{t('calculator.auto_banner_title')}</p>
              <p className="text-[10px] text-slate-300 font-medium">
                {t('calculator.auto_banner_desc', {
                  hashRate: formatHashrate(stats?.miner?.estimatedHashRate ?? 0),
                  networkRate: stats?.networkHashRate ? formatHashrate(stats.networkHashRate) : '—',
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMyHashManual(false);
              setNetworkManual(false);
              setSelectedMiners({});
            }}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 whitespace-nowrap"
          >
            {t('calculator.auto_fill_btn')}
          </button>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card spacing="lg">
            <SectionHeader title={t('calculator.section_params')} icon={Cpu} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {t('calculator.my_hashrate_label')}
                  </label>
                  {(stats?.miner?.estimatedHashRate ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={handleResetMyHash}
                      className="flex items-center gap-1 text-[9px] font-bold text-sky-400 hover:text-sky-300 uppercase tracking-widest"
                    >
                      <Cpu className="w-3 h-3" /> {t('calculator.my_inventory_btn')}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  value={myHashRateInput}
                  onChange={(e) => {
                    setMyHashRateInput(e.target.value);
                    setMyHashManual(true);
                    setSelectedMiners({});
                  }}
                  placeholder="Ex: 150"
                  className="w-full border-2 border-slate-700 bg-slate-950 rounded-xl py-4 px-6 text-white text-sm shadow-[2px_2px_0px_#000000] focus:outline-none focus:border-sky-400"
                />
                {!myHashManual && (stats?.miner?.estimatedHashRate ?? 0) > 0 ? (
                  <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    {t('calculator.synced_inventory', {
                      value: formatHashrate(stats?.miner?.estimatedHashRate ?? 0),
                    })}
                  </p>
                ) : hashFromMiners > 0 ? (
                  <p className="text-[10px] text-primary font-bold flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {t('calculator.simulated_machines', { value: formatHashrate(hashFromMiners) })}
                  </p>
                ) : myHashManual && (stats?.miner?.estimatedHashRate ?? 0) > 0 ? (
                  <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    {t('calculator.manual_my_hash')}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {t('calculator.network_hashrate_label')}
                  </label>
                  <button
                    type="button"
                    onClick={handleResetNetwork}
                    className="flex items-center gap-1 text-[9px] font-bold text-sky-400 hover:text-sky-300 uppercase tracking-widest"
                  >
                    <RefreshCw className="w-3 h-3" /> {t('calculator.live_btn')}
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  value={networkHashRateInput}
                  onChange={(e) => {
                    setNetworkHashRateInput(e.target.value);
                    setNetworkManual(true);
                  }}
                  placeholder={
                    stats?.networkHashRate ? String(Math.round(stats.networkHashRate)) : 'Ex: 5000'
                  }
                  className="w-full border-2 border-slate-700 bg-slate-950 rounded-xl py-4 px-6 text-white text-sm shadow-[2px_2px_0px_#000000] focus:outline-none focus:border-sky-400"
                />
                {stats?.networkHashRate && !networkManual ? (
                  <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    {t('calculator.synced_network', { value: formatHashrate(stats.networkHashRate) })}
                  </p>
                ) : networkManual ? (
                  <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    {t('calculator.manual_network')}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {t('calculator.token_price_label')}
                  </label>
                  {tokenPriceLive && tokenPriceManual && (
                    <button
                      type="button"
                      onClick={() => {
                        setTokenPriceManual(false);
                        setTokenPriceInput(String(tokenPriceLive));
                      }}
                      className="flex items-center gap-1 text-[9px] font-bold text-sky-400 hover:text-sky-300 uppercase tracking-widest"
                    >
                      <RefreshCw className="w-3 h-3" /> {t('calculator.live_btn')}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={tokenPriceInput}
                  onChange={(e) => {
                    setTokenPriceInput(e.target.value);
                    setTokenPriceManual(true);
                  }}
                  placeholder="0.35"
                  className="w-full border-2 border-slate-700 bg-slate-950 rounded-xl py-4 px-6 text-white text-sm shadow-[2px_2px_0px_#000000] focus:outline-none focus:border-sky-400"
                />
                {tokenPriceLive && !tokenPriceManual ? (
                  <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    CoinGecko — ${tokenPriceLive.toFixed(4)} USD
                  </p>
                ) : tokenPriceManual && tokenPriceLive ? (
                  <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    Manual — ao vivo: ${tokenPriceLive.toFixed(4)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t('calculator.share_label')}
                </label>
                <div className="w-full border-2 border-slate-700 bg-slate-950 rounded-xl py-4 px-6 text-sm shadow-[2px_2px_0px_#000000]">
                  {share > 0 ? (
                    <span className="text-sky-400 font-black font-mono">{(share * 100).toFixed(6)}%</span>
                  ) : (
                    <span className="text-slate-400">{t('calculator.share_placeholder')}</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card spacing="lg">
            <SectionHeader
              title={t('calculator.section_simulate')}
              icon={Zap}
              iconVariant="amber"
              action={
                Object.keys(selectedMiners).length > 0 ? (
                  <button
                    type="button"
                    onClick={clearMiners}
                    className="text-[10px] font-bold text-slate-300 hover:text-red-300 uppercase tracking-widest"
                  >
                    {t('calculator.clear_selection')}
                  </button>
                ) : null
              }
            />

            {loadingMiners ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : miners.length === 0 ? (
              <p className="text-slate-300 text-sm text-center py-8">{t('calculator.no_miners')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {miners.map((m: ShopMiner) => {
                  const qty = selectedMiners[String(m.id)] || 0;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                        qty > 0 ? 'border-sky-500 bg-sky-500/10 shadow-[2px_2px_0px_#000000]' : 'border-slate-800 bg-slate-950/40'
                      }`}
                    >
                      <img
                        src={m.imageUrl || DEFAULT_MINER_IMAGE_URL}
                        alt={m.name}
                        className="w-12 h-12 object-contain rounded-xl bg-gray-900 p-1 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white truncate">{m.name}</p>
                        <p className="text-[10px] text-sky-400 font-bold">
                          {formatHashrate(m.baseHashRate)}
                        </p>
                        {qty > 0 && (
                          <p className="text-[9px] text-slate-400 font-bold">
                            {t('calculator.miner_total', {
                              value: formatHashrate(m.baseHashRate * qty),
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMinerQty(m.id, -1)}
                          disabled={qty === 0}
                          className="w-7 h-7 rounded-lg border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-100 font-black text-sm flex items-center justify-center disabled:bg-slate-900 disabled:text-slate-400 disabled:border-slate-800"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-sm font-black text-white font-mono">{qty}</span>
                        <button
                          type="button"
                          onClick={() => handleMinerQty(m.id, 1)}
                          className="w-7 h-7 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center justify-center shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card spacing="lg" className="sticky top-6">
            <SectionHeader title={t('calculator.section_results')} icon={TrendingUp} iconVariant="emerald" />

            {share > 0 ? (
              <div className="space-y-3">
                {resultRows.map(({ key, pol, sub }) => (
                  <StatCard
                    key={key}
                    icon={TrendingUp}
                    accent="text-emerald-400"
                    label={t(`calculator.${key}`)}
                    value={`${pol.toFixed(6)} POL`}
                    sub={price > 0 ? `${sub} · ≈ $${toUSD(pol)} USD` : sub}
                  />
                ))}

                <div className="flex gap-2 pt-2 border-t-2 border-slate-800 text-[9px] text-slate-400">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p>
                      {t('calculator.notes_reward', {
                        reward: blockRewardPol,
                        interval: blockIntervalMin,
                      })}
                    </p>
                    <p>{t('calculator.notes_blocks', { blocks: Math.round(blocksPerDay) })}</p>
                    <p>{t('calculator.notes_estimate')}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-300 py-10 space-y-3">
                <Calculator className="w-14 h-14 mx-auto text-slate-400" />
                <p className="text-xs font-bold uppercase tracking-widest">
                  {t('calculator.results_placeholder')}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
