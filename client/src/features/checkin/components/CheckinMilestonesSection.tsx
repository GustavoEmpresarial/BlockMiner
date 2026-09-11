import { useTranslation } from 'react-i18next';
import { Check, Lock, Trophy } from 'lucide-react';
import type { CheckinMilestone } from '../lib/checkin.types';
import {
  milestoneDayLabel,
  milestoneDescription,
  milestoneRewardLine,
  milestoneStatusLabel,
  milestoneTitle,
  normalizeMilestoneRewardType,
  resolveMilestoneState,
  sortMilestones,
} from '../lib/checkinHelpers';

export function CheckinMilestonesSection({ milestones }: { milestones: CheckinMilestone[] | undefined }) {
  const { t } = useTranslation();
  const sorted = sortMilestones(milestones);
  if (sorted.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em]">
          {t('checkin.milestones.title')}
        </h3>
        <p className="text-xs text-slate-600 max-w-xl mx-auto">{t('checkin.milestones.description')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((m) => (
          <MilestoneCard key={m.id} milestone={m} />
        ))}
      </div>
    </div>
  );
}

function MilestoneCard({ milestone: m }: { milestone: CheckinMilestone }) {
  const { t } = useTranslation();
  const state = resolveMilestoneState(m);
  const rewardKind = normalizeMilestoneRewardType(m.rewardType);
  const title = milestoneTitle(t, m);
  const line = milestoneRewardLine(t, m);
  const description = milestoneDescription(t, m);
  const statusLabel = milestoneStatusLabel(t, state);

  const borderClass =
    state === 'claimed'
      ? 'border-emerald-500/35'
      : state === 'eligible'
        ? 'border-amber-500/40 ring-1 ring-amber-500/20'
        : 'border-gray-800 opacity-80';
  const iconBg =
    state === 'claimed'
      ? 'bg-emerald-500/15 text-emerald-400'
      : state === 'eligible'
        ? 'bg-amber-500/15 text-amber-400'
        : 'bg-slate-900 text-slate-600';

  const showMachineImage = rewardKind === 'machine' && m.minerImageUrl;
  const showPolBadge = rewardKind === 'pol';
  const machinePower = Number(m.minerBaseHashRate ?? m.powerAmount);

  return (
    <div className={`bg-gray-800/30 border rounded-2xl p-5 flex items-start gap-4 ${borderClass}`}>
      {showMachineImage ? (
        <div className="w-12 h-12 rounded-xl shrink-0 bg-slate-900/60 border border-slate-700/60 overflow-hidden flex items-center justify-center">
          <img src={m.minerImageUrl!} alt={m.minerName ?? ''} className="w-full h-full object-contain" />
        </div>
      ) : showPolBadge ? (
        <div
          className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-black text-sm ${iconBg}`}
        >
          POL
        </div>
      ) : (
        <div className={`p-3 rounded-xl shrink-0 ${iconBg}`}>
          {state === 'locked' ? <Lock className="w-5 h-5" /> : <Trophy className="w-5 h-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          {milestoneDayLabel(t, m.dayThreshold).toUpperCase()}
        </p>
        <p className="text-sm font-bold text-white truncate">{title}</p>
        {rewardKind === 'machine' && machinePower > 0 ? (
          <p className="text-xs font-black text-amber-300 mt-1 tracking-wide">+{machinePower} H/s</p>
        ) : line ? (
          <p className="text-xs text-slate-400 mt-1">{line}</p>
        ) : null}
        {description ? (
          <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{description}</p>
        ) : null}
        <p className="text-[10px] font-bold uppercase tracking-wider mt-2 text-slate-500">{statusLabel}</p>
      </div>
      {state === 'claimed' ? <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-1" /> : null}
    </div>
  );
}
