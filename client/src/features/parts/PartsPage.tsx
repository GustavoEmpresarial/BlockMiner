import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Puzzle } from 'lucide-react';
import { MachineImage } from '../machines/components/MachineImage';
import { formatHashrate } from '../machines/lib/machines.shared';
import { getPartsOverview } from './lib/parts.api';
import type { PartMachinePriceDto, PartPriceBand, PartStackDto } from './lib/parts.types';

const BANDS: PartPriceBand[] = ['starter', 'mid', 'high', 'elite'];

function isBand(value: string): value is PartPriceBand {
  return (BANDS as string[]).includes(value);
}

export default function PartsPage() {
  const { t } = useTranslation();
  const [parts, setParts] = useState<PartStackDto[]>([]);
  const [machines, setMachines] = useState<PartMachinePriceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getPartsOverview()
      .then((res) => {
        if (cancelled) return;
        if (!res.data?.ok) {
          setError(true);
          return;
        }
        setParts(Array.isArray(res.data.parts) ? res.data.parts : []);
        setMachines(Array.isArray(res.data.machines) ? res.data.machines : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-12 pb-20 duration-700">
      <div className="space-y-2">
        <h1 className="text-3xl font-black uppercase tracking-tight text-white">{t('parts.title')}</h1>
        <p className="max-w-3xl text-sm font-medium text-slate-400">{t('parts.subtitle')}</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400" role="status">
          {t('parts.loading')}
        </p>
      ) : error ? (
        <p className="text-sm text-rose-300" role="alert">
          {t('parts.load_error')}
        </p>
      ) : (
        <>
          <section className="space-y-6" aria-labelledby="parts-inventory-heading">
            <div className="flex items-center gap-3">
              <Puzzle className="h-6 w-6 text-cyan-300" aria-hidden />
              <h2 id="parts-inventory-heading" className="text-lg font-black uppercase tracking-wide text-white">
                {t('parts.inventory_title')}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              {parts.map((part) => (
                <article
                  key={part.slug}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70"
                >
                  <div className="aspect-square bg-slate-900">
                    <img
                      src={part.imageUrl}
                      alt={t(`parts.items.${part.slug}`, { defaultValue: part.slug })}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-1 p-3">
                    <h3 className="text-sm font-bold text-white">
                      {t(`parts.items.${part.slug}`, { defaultValue: part.slug })}
                    </h3>
                    <p className="text-xs font-medium text-slate-400">
                      {t('parts.quantity')}{' '}
                      <span className="font-black text-cyan-200">{part.quantity}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-6" aria-labelledby="parts-prices-heading">
            <div className="space-y-2">
              <h2 id="parts-prices-heading" className="text-lg font-black uppercase tracking-wide text-white">
                {t('parts.prices_title')}
              </h2>
              <p className="max-w-3xl text-sm text-slate-400">{t('parts.prices_hint')}</p>
            </div>
            {machines.length === 0 ? (
              <p className="text-sm text-slate-400">{t('parts.empty_machines')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {machines.map((machine) => (
                  <article
                    key={machine.id}
                    className="flex gap-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                  >
                    <MachineImage
                      imageUrl={machine.imageUrl}
                      name={machine.name}
                      className="h-24 w-24 rounded-xl object-cover"
                      wrapperClassName="h-24 w-24 shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <h3 className="truncate text-base font-black text-white">{machine.name}</h3>
                        <p className="text-xs font-medium text-slate-400">
                          {formatHashrate(machine.baseHashRate)}
                          {' · '}
                          {t(`parts.band.${isBand(machine.band) ? machine.band : 'starter'}`)}
                        </p>
                      </div>
                      <ul className="space-y-2">
                        {machine.costs.map((cost) => {
                          const ratio = cost.required > 0 ? Math.min(1, cost.owned / cost.required) : 0;
                          return (
                            <li key={cost.slug}>
                              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                <span className="truncate text-slate-300">
                                  {t(`parts.items.${cost.slug}`, { defaultValue: cost.slug })}
                                </span>
                                <span className="shrink-0 font-bold text-slate-200">
                                  {t('parts.cost_count', { owned: cost.owned, required: cost.required })}
                                </span>
                              </div>
                              <div
                                className="h-1.5 overflow-hidden rounded-full bg-slate-800"
                                role="meter"
                                aria-valuemin={0}
                                aria-valuemax={cost.required}
                                aria-valuenow={Math.min(cost.owned, cost.required)}
                                aria-label={t(`parts.items.${cost.slug}`, { defaultValue: cost.slug })}
                              >
                                <div
                                  className="h-full rounded-full bg-cyan-400"
                                  style={{ width: `${Math.round(ratio * 100)}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
