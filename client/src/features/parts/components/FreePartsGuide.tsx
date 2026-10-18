import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Bot, Droplets, Gift, LayoutGrid, Link as LinkIcon, MousePointerClick, Youtube } from 'lucide-react';
import { DEFAULT_PART_DROP_RATES, bpsToPercentLabel } from '../lib/parts.dropRates';
import type { PartDropRates } from '../lib/parts.types';

type RateKind = 'activity' | 'frequent' | 'offerwall';

const FREE_PART_SOURCES: readonly { key: string; to: string; icon: LucideIcon; rate: RateKind }[] = [
  { key: 'faucet', to: '/faucet', icon: Droplets, rate: 'activity' },
  { key: 'ptc', to: '/ptc', icon: MousePointerClick, rate: 'activity' },
  { key: 'automining', to: '/auto-mining', icon: Bot, rate: 'frequent' },
  { key: 'youtube', to: '/youtube', icon: Youtube, rate: 'frequent' },
  { key: 'shortlinks', to: '/shortlinks', icon: LinkIcon, rate: 'frequent' },
  { key: 'internal_offerwall', to: '/internal-offerwall', icon: Gift, rate: 'offerwall' },
  { key: 'offerwall', to: '/offerwall', icon: LayoutGrid, rate: 'offerwall' },
];

interface FreePartsGuideProps {
  rates?: PartDropRates | null;
  /** Hide the "buy in Offers" footer where it would be redundant. */
  showBuyHint?: boolean;
}

/** "How to get free parts": every activity that rolls a part drop, with its live chance. */
export function FreePartsGuide({ rates, showBuyHint = true }: FreePartsGuideProps) {
  const { t } = useTranslation();
  const r = rates ?? DEFAULT_PART_DROP_RATES;
  const chanceLabel = (kind: RateKind) => {
    if (kind === 'activity') return t('parts.free_guide.per_claim', { pct: bpsToPercentLabel(r.activityBps) });
    if (kind === 'frequent') return t('parts.free_guide.per_claim', { pct: bpsToPercentLabel(r.frequentActivityBps) });
    return t('parts.free_guide.per_offer', { pct: bpsToPercentLabel(r.offerwallMicroBps) });
  };

  return (
    <section
      aria-labelledby="free-parts-guide-title"
      data-testid="free-parts-guide"
      className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/20 p-4 sm:p-5 space-y-4 shadow-[2px_2px_0px_#000000]"
    >
      <div>
        <h3 id="free-parts-guide-title" className="text-sm font-black uppercase tracking-tight text-emerald-300">
          {t('parts.free_guide.title')}
        </h3>
        <p className="text-xs text-slate-400 font-medium mt-1">{t('parts.free_guide.subtitle')}</p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {FREE_PART_SOURCES.map(({ key, to, icon: Icon, rate }) => (
          <li key={key}>
            <Link
              to={to}
              data-testid={`free-parts-source-${key}`}
              className="flex h-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 transition-colors hover:border-emerald-500/50 hover:bg-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <span className="min-w-0">
                <span className="block text-xs font-black text-white">{t(`parts.free_guide.sources.${key}`)}</span>
                <span className="block text-[11px] text-slate-400">{chanceLabel(rate)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-slate-400 leading-relaxed">{t('parts.free_guide.how_it_works')}</p>
      {showBuyHint && (
        <p className="text-[11px] text-slate-400">
          {t('parts.free_guide.buy_hint')}{' '}
          <Link to="/offers" className="font-bold text-primary hover:underline">
            {t('parts.free_guide.buy_link')}
          </Link>
        </p>
      )}
    </section>
  );
}
