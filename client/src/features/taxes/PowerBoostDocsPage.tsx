import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Rocket, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';

const SYSTEM_ROWS = [
  'system_faucet',
  'system_shortlinks',
  'system_youtube',
  'system_autoMining',
] as const;

const HOW_STEPS = ['how_it_works_s1', 'how_it_works_s2', 'how_it_works_s6', 'how_it_works_s3', 'how_it_works_s4', 'how_it_works_s5'] as const;
const IMPORTANT_KEYS = ['important_1', 'important_2', 'important_3', 'important_4'] as const;
const FAQ_KEYS = ['faq_1_q', 'faq_1_a', 'faq_2_q', 'faq_2_a', 'faq_3_q', 'faq_3_a'] as const;

export default function PowerBoostDocsPage() {
  const { t } = useTranslation();
  const cost = 0.01;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={Rocket} variant="amber" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('powerBoost.docs.title')}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('powerBoost.docs.intro')}</p>
          </div>
        </div>
        <Link
          to="/taxes"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white hover:border-slate-600 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('powerBoost.docs.back')}
        </Link>
      </div>

      <div className="space-y-8">
        <Card className="p-6 sm:p-7 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 font-mono">
            {t('powerBoost.how_it_works_title')}
          </h2>
          <ol className="space-y-3">
            {HOW_STEPS.map((key, idx) => (
              <li
                key={key}
                className="flex gap-3.5 rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-4 text-sm leading-relaxed text-slate-200 font-medium shadow-[1px_1px_0px_#000000]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-black text-amber-400 font-mono">
                  {idx + 1}
                </span>
                <span>{t(`powerBoost.${key}`, { cost })}</span>
              </li>
            ))}
          </ol>
        </Card>

        <section className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 font-mono px-1">
            {t('powerBoost.docs.duration_title')}
          </h2>
          <Card variant="table">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/90 text-[10px] uppercase tracking-widest text-slate-400 border-b-2 border-slate-800 font-mono">
                <tr>
                  <th className="px-5 py-3.5">
                    {t('powerBoost.table_system')}
                  </th>
                  <th className="px-5 py-3.5">
                    {t('powerBoost.table_normal')}
                  </th>
                  <th className="px-5 py-3.5 text-emerald-400">
                    {t('powerBoost.table_boosted')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-800/80">
                {SYSTEM_ROWS.map((key) => (
                  <tr key={key} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-white">{t(`powerBoost.${key}`)}</td>
                    <td className="px-5 py-3.5 text-slate-400 font-medium">{t('powerBoost.duration_24h')}</td>
                    <td className="px-5 py-3.5 font-black text-emerald-400 font-mono">{t('powerBoost.duration_7d')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <Card className="p-6 sm:p-7 space-y-4 border-amber-500/30 bg-amber-950/20 shadow-[2px_2px_0px_#000000]">
          <div className="flex items-center gap-2.5 pb-2 border-b-2 border-amber-500/20">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-black uppercase tracking-tight text-amber-200">{t('powerBoost.important_title')}</h2>
          </div>
          <ul className="space-y-3">
            {IMPORTANT_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3 text-sm leading-relaxed text-slate-200 font-medium">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={3} />
                <span className={key === 'important_3' ? 'font-black text-white' : undefined}>
                  {t(`powerBoost.${key}`)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 sm:p-7 space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 font-mono">
            {t('powerBoost.docs.examples_title')}
          </h2>
          <div className="space-y-2 rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300 font-medium leading-relaxed shadow-[1px_1px_0px_#000000]">
            <p>{t('powerBoost.docs.example_today')}</p>
            <p>{t('powerBoost.docs.example_tomorrow')}</p>
          </div>
        </Card>

        <Card className="p-6 sm:p-7 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 font-mono">
            {t('powerBoost.docs.faq_title')}
          </h2>
          <dl className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-4 shadow-[1px_1px_0px_#000000]">
                <dt className="text-sm font-black uppercase tracking-tight text-white">{t(`powerBoost.docs.${FAQ_KEYS[i * 2]}`)}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-300 font-medium">
                  {t(`powerBoost.docs.${FAQ_KEYS[i * 2 + 1]}`)}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-4 border-slate-800 bg-slate-950/60 text-xs font-medium leading-relaxed text-slate-400 shadow-[1px_1px_0px_#000000]">
          {t('powerBoost.footer_note')}
        </Card>
      </div>
    </div>
  );
}
