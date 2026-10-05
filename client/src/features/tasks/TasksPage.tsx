import { CalendarClock, CheckCircle2, CircleDashed, Gift, Loader2, PlayCircle } from 'lucide-react';
import IconBadge from '../../shared/components/IconBadge';
import { CADENCE_SECTIONS } from './lib/dailyTasksCadence';
import {
  cadenceLabel,
  formatIsoLocal,
  formatRewardSummary,
  statusLabel,
  taskDescription
} from './lib/dailyTasksHelpers';
import { useDailyTasksDashboard } from './lib/useDailyTasksDashboard';

export default function TasksPage() {
  const { t, loading, loadFailed, tasks, tasksByCadence, nextResetLabel, claimingId, load, claim } =
    useDailyTasksDashboard();

  const pageHeader = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
      <div className="flex items-center gap-3">
        <IconBadge icon={PlayCircle} variant="emerald" size="lg" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('dailyTasks.title')}</h1>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('dailyTasks.subtitle')}</p>
        </div>
      </div>
      {tasks.length > 0 && nextResetLabel && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 border-2 border-slate-800 rounded-xl shadow-[2px_2px_0px_#000000] text-xs text-slate-400 font-mono">
          <CalendarClock className="w-3.5 h-3.5 text-slate-500" aria-hidden />
          <span>{t('dailyTasks.earliest_reset')}:</span>
          <span className="font-bold text-white">{nextResetLabel}</span>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {pageHeader}
        <div className="h-[45vh] flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000]">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {pageHeader}

      <div className="flex flex-col gap-2">
        {!loadFailed && tasks.length > 0 ? (
          <nav className="flex flex-wrap gap-2 pt-1" aria-label={t('dailyTasks.nav_aria')}>
            {CADENCE_SECTIONS.map((c) => {
              const count = tasksByCadence[c]?.length ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    document.getElementById(`tasks-section-${c}`)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    })
                  }
                  className="rounded-xl border-2 border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-300 hover:border-slate-700 hover:text-white active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t(`dailyTasks.jump_${c}`)}
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>

      {loadFailed ? (
        <div className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-4 max-w-xl shadow-[4px_4px_0px_#000000]">
          <p className="text-slate-300 text-sm leading-relaxed font-medium">{t('dailyTasks.load_error_body')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-800 hover:bg-slate-700 active:translate-x-0.5 active:translate-y-0.5 border-2 border-slate-700 text-white shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('dailyTasks.retry')}
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40 p-16 text-center text-slate-400 font-medium">
          {t('dailyTasks.empty')}
        </div>
      ) : (
        <div className="space-y-10">
          {CADENCE_SECTIONS.map((cadence) => {
            const sectionTasks = tasksByCadence[cadence] || [];
            if (sectionTasks.length === 0) return null;
            return (
              <section
                key={cadence}
                id={`tasks-section-${cadence}`}
                className="scroll-mt-24 space-y-4"
                aria-labelledby={`tasks-heading-${cadence}`}
              >
                <h2
                  id={`tasks-heading-${cadence}`}
                  className="text-xs sm:text-sm font-black uppercase tracking-widest text-emerald-400 border-b-2 border-slate-800 pb-2.5"
                >
                  {t(`dailyTasks.section_${cadence}`)}
                </h2>
                <ul className="grid gap-4">
                  {sectionTasks.map((task) => {
                    const cur = Number(task.currentValue) || 0;
                    const tgt = Number(task.targetValue) || 1;
                    const pct = Math.min(100, (cur / Math.max(tgt, 1)) * 100);
                    const canClaim = task.status === 'completed';
                    const isClaimed = task.status === 'claimed';

                    return (
                      <li
                        key={task.id}
                        className="rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-[4px_4px_0px_#000000] transition-all"
                      >
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {isClaimed ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden />
                              ) : (
                                <CircleDashed className="w-5 h-5 text-slate-500 shrink-0" aria-hidden />
                              )}
                              <span
                                className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border shadow-sm ${
                                  task.status === 'claimed'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                    : task.status === 'completed'
                                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                      : task.status === 'in_progress'
                                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                                        : 'border-slate-700 bg-slate-800 text-slate-400'
                                }`}
                              >
                                {statusLabel(t, String(task.status))}
                              </span>
                              <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300">
                                {cadenceLabel(t, task.resetCadence)}
                              </span>
                            </div>
                            <p className="text-white font-bold leading-snug">{taskDescription(t, task)}</p>
                            <p className="text-[11px] text-slate-400 font-mono leading-snug">
                              {t('dailyTasks.period')}: {task.periodKey}
                              <span className="text-slate-600"> · </span>
                              {t('dailyTasks.next_reset')}: {formatIsoLocal(task.nextResetAt)}
                            </p>
                            <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
                              <Gift className="w-3.5 h-3.5 text-amber-400" aria-hidden />
                              {formatRewardSummary(t, task.reward)}
                            </p>
                            <div className="pt-1">
                              <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1 font-mono font-medium">
                                {t('dailyTasks.progress', {
                                  current: Number(cur.toFixed(4)),
                                  target: Number(tgt.toFixed(4))
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 w-full md:w-auto md:min-w-[12rem]">
                            <button
                              type="button"
                              disabled={!canClaim || claimingId === task.id}
                              onClick={() => void claim(task.id)}
                              className={`w-full px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] border-2 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                                canClaim && claimingId !== task.id
                                  ? 'bg-emerald-500 hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 border-emerald-400/80 shadow-emerald-900/30'
                                  : 'bg-slate-950/60 border-slate-800 text-slate-600 cursor-not-allowed opacity-40'
                              }`}
                            >
                              {claimingId === task.id ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                                  {t('dailyTasks.claiming')}
                                </span>
                              ) : (
                                t('dailyTasks.claim')
                              )}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      
    </div>
  );
}
