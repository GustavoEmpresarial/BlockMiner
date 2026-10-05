import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  BookOpen,
  ExternalLink,
  KeyRound,
  Loader2,
  Sparkles,
  X,
  PartyPopper,
} from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import type { TFunction } from 'i18next';
import { isAxiosError } from 'axios';
import type {
  ReadEarnPublicCampaign as ReadEarnCampaign,
  ReadEarnPublicCampaignsResponse as ReadEarnCampaignsResponse,
  ReadEarnRewardSnapshot as ReadEarnReward,
  ReadEarnRedeemResponse,
} from './read-earn.types';

function formatEndsAt(iso: string, locale: string | undefined) {
  try {
    return new Date(iso).toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function rewardSummary(reward: ReadEarnReward, t: TFunction) {
  if (!reward) return '';
  const rt = String(reward.rewardType || '').toLowerCase();
  if (rt === 'hashrate') {
    const days = Number(reward.hashrateValidityDays) > 0 ? Number(reward.hashrateValidityDays) : 7;
    return t('readEarn.reward_hashrate', {
      value: String(reward.rewardAmount ?? '—'),
      days: String(days),
    });
  }
  if (rt === 'blk') {
    return t('readEarn.reward_blk', { value: String(reward.rewardAmount ?? '—') });
  }
  if (rt === 'machine') {
    return t('readEarn.reward_machine', {
      minerId: String(reward.rewardMinerId ?? '—'),
      level: String(Math.floor(Number(reward.rewardAmount)) || 1),
    });
  }
  return '';
}

export default function ReadEarn() {
  const { t, i18n } = useTranslation();
  const [campaigns, setCampaigns] = useState<ReadEarnCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCampaign, setModalCampaign] = useState<ReadEarnCampaign | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successReward, setSuccessReward] = useState<ReadEarnReward | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ReadEarnCampaignsResponse>('/read-earn/campaigns');
      if (res.data?.ok) setCampaigns(res.data.campaigns || []);
      else toast.error(t('readEarn.load_error'));
    } catch {
      toast.error(t('readEarn.load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = (c: ReadEarnCampaign) => {
    setModalCampaign(c);
    setCode('');
    setSuccessReward(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalCampaign(null);
    setCode('');
    setSuccessReward(null);
  };

  const handleRedeem = async () => {
    if (!modalCampaign || !code.trim()) return;
    setSubmitting(true);
    setSuccessReward(null);
    try {
      const res = await api.post<ReadEarnRedeemResponse>('/read-earn/redeem', {
        campaignId: modalCampaign.id,
        code: code.trim(),
      });
      const d = res.data;
      if (d?.ok && d.reward) {
        setSuccessReward(d.reward);
        await load();
        return;
      }
      const errCode = d?.code;
      if (errCode === 'READ_EARN_ALREADY_CLAIMED') {
        toast.error(t('readEarn.error_claimed'));
      } else if (errCode === 'READ_EARN_UNAVAILABLE') {
        toast.error(t('readEarn.error_unavailable'));
      } else {
        toast.error(t('readEarn.error_unavailable'));
      }
    } catch (e: unknown) {
      const errCode = isAxiosError(e) ? (e.response?.data as { code?: string } | undefined)?.code : undefined;
      const status = isAxiosError(e) ? e.response?.status : undefined;
      if (errCode === 'READ_EARN_ALREADY_CLAIMED') toast.error(t('readEarn.error_claimed'));
      else if (status === 400 && errCode !== 'READ_EARN_UNAVAILABLE') {
        toast.error(t('readEarn.error_invalid'));
      } else toast.error(t('readEarn.error_unavailable'));
    } finally {
      setSubmitting(false);
    }
  };

  const locale = i18n.language || undefined;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={Sparkles} variant="violet" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              {t('readEarn.title')}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">
              {t('readEarn.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="h-[40vh] flex flex-col items-center justify-center gap-4 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">{t('common.loading')}</p>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="p-10 text-center text-slate-400 font-medium space-y-3">
          <BookOpen className="w-12 h-12 mx-auto text-slate-600 opacity-40" />
          <p>{t('readEarn.empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {campaigns.map((c: ReadEarnCampaign) => (
            <Card
              as="li"
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="min-w-0">
                <h2 className="font-black text-white text-lg tracking-tight">{c.title}</h2>
                <p className="text-xs text-slate-400 mt-1 font-medium font-mono">
                  {t('readEarn.ends')}: {formatEndsAt(c.expiresAt, locale)}
                </p>
                <a
                  href={c.partnerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-violet-400 hover:text-violet-300 mt-3 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('readEarn.read_article')}
                </a>
              </div>
              <button
                type="button"
                onClick={() => openModal(c)}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <KeyRound className="w-4 h-4" />
                {t('readEarn.submit_code')}
              </button>
            </Card>
          ))}
        </ul>
      )}

      {modalCampaign && typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeModal}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="read-earn-modal-title"
                  className="relative w-full max-w-md rounded-3xl border-2 border-slate-800 bg-slate-900 p-6 sm:p-7 shadow-[4px_4px_0px_#000000] space-y-4"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={closeModal}
                    className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
                    aria-label={t('readEarn.cancel')}
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {!successReward ? (
                    <>
                      <div className="pb-2 border-b-2 border-slate-800 pr-8">
                        <h2
                          id="read-earn-modal-title"
                          className="text-lg font-black uppercase tracking-tight text-white"
                        >
                          {t('readEarn.modal_title')}
                        </h2>
                        <p className="text-xs text-slate-400 font-medium mt-1 line-clamp-2">{modalCampaign.title}</p>
                      </div>
                      <div className="space-y-2 pt-1">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {t('readEarn.code_label')}
                        </label>
                        <input
                          type="text"
                          autoComplete="off"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          placeholder={t('readEarn.code_placeholder')}
                          className="w-full rounded-xl bg-slate-950 border-2 border-slate-700 px-4 py-3 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-primary shadow-[2px_2px_0px_#000000]"
                        />
                      </div>
                      <div className="flex gap-2.5 justify-end pt-3">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="px-4 py-2.5 rounded-xl border-2 border-slate-700 bg-slate-900 text-slate-200 text-xs font-black uppercase tracking-wider hover:text-white hover:border-slate-600 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {t('readEarn.cancel')}
                        </button>
                        <button
                          type="button"
                          disabled={submitting || !code.trim()}
                          onClick={handleRedeem}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 active:translate-x-0.5 active:translate-y-0.5 text-white text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {t('readEarn.submitting')}
                            </>
                          ) : (
                            t('readEarn.submit')
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <motion.div
                      className="text-center py-4 space-y-4"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35 }}
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.05 }}
                        className="inline-flex p-4 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500/40 shadow-[2px_2px_0px_#000000]"
                      >
                        <PartyPopper className="w-10 h-10 text-emerald-400" />
                      </motion.div>
                      <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight">{t('readEarn.success_title')}</h3>
                        <p className="text-emerald-400 font-mono font-bold text-sm mt-1">
                          {rewardSummary(successReward, t)}
                        </p>
                        <p className="text-slate-400 text-xs font-medium mt-2">{t('readEarn.success_hint')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeModal}
                        className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-white text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {t('readEarn.done')}
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
