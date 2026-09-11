import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type {
  AdminMiniPassLevelRewardRow,
  AdminMiniPassMissionRow,
  AdminMiniPassSeasonGetResponse,
  AdminMiniPassSeasonWriteResponse,
  AdminMinersListResponse,
} from '../lib/admin.types';
import {
  buildProgressionTiers,
  countRewardLevels,
  defaultSeasonDateRange,
  toDatetimeLocalValue,
  validateMissionDraft,
  validateRewardDraft,
  validateSeasonForm,
} from './adminMiniPassForm';
import {
  normalizeRewardCatalogItem,
  type MissionDraftState,
  type RewardCatalogItem,
  type RewardDraftState,
  type SeasonFormState,
} from './adminMiniPassSeason.parts';

function emptyRewardDraft(): RewardDraftState {
  return {
    level: 1,
    rewardKind: 'NONE',
    minerId: '',
    eventMinerId: '',
    hashRate: '',
    hashRateDays: '7',
    blkAmount: '',
    polAmount: '',
    titleEn: '',
    titlePtBR: '',
    titleEs: '',
  };
}

function emptyMissionDraft(): MissionDraftState {
  return {
    cadence: 'EVENT',
    missionType: 'PLAY_GAMES',
    targetValue: '1',
    xpReward: '50',
    titleEn: '',
    titlePtBR: '',
    titleEs: '',
    descriptionEn: '',
    descriptionPtBR: '',
    descriptionEs: '',
    gameSlug: '',
    sortOrder: '0',
  };
}

function emptySeasonForm(range: { startsAt: string; endsAt: string }): SeasonFormState {
  return {
    slug: '',
    titleEn: '',
    titlePtBR: '',
    titleEs: '',
    subtitleEn: '',
    subtitlePtBR: '',
    subtitleEs: '',
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    maxLevel: 10,
    xpPerLevel: 100,
    buyLevelPricePol: '1',
    completePassPricePol: '10',
    bannerImageUrl: '',
    isActive: true,
  };
}

export type AdminMiniPassSeasonState = ReturnType<typeof useAdminMiniPassSeason>;

export function useAdminMiniPassSeason() {
  const { t } = useTranslation();
  const { seasonId: seasonIdParam } = useParams();
  const navigate = useNavigate();
  const isNew = seasonIdParam === 'new';
  const range = isNew ? defaultSeasonDateRange() : { startsAt: '', endsAt: '' };

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [seasonId, setSeasonId] = useState<number | null>(
    isNew ? null : parseInt(seasonIdParam ?? '', 10),
  );
  const [form, setForm] = useState<SeasonFormState>(() => emptySeasonForm(range));
  const [rewards, setRewards] = useState<AdminMiniPassLevelRewardRow[]>([]);
  const [missions, setMissions] = useState<AdminMiniPassMissionRow[]>([]);
  const [rewardCatalogQuery, setRewardCatalogQuery] = useState('');
  const [rewardCatalogLoading, setRewardCatalogLoading] = useState(false);
  const [rewardCatalogItems, setRewardCatalogItems] = useState<RewardCatalogItem[]>([]);
  const [selectedShopMiner, setSelectedShopMiner] = useState<RewardCatalogItem | null>(null);
  const [selectedEventMiner, setSelectedEventMiner] = useState<RewardCatalogItem | null>(null);
  const [rewardDraft, setRewardDraft] = useState<RewardDraftState>(emptyRewardDraft);
  const [missionDraft, setMissionDraft] = useState<MissionDraftState>(emptyMissionDraft);

  const progressionRows = useMemo(
    () => buildProgressionTiers(form.maxLevel, form.xpPerLevel),
    [form.maxLevel, form.xpPerLevel],
  );
  const rewardCoverage = useMemo(() => countRewardLevels(rewards, form.maxLevel), [rewards, form.maxLevel]);
  const rewardDraftCheck = useMemo(() => validateRewardDraft(rewardDraft), [rewardDraft]);
  const catalogKind =
    rewardDraft.rewardKind === 'SHOP_MINER' || rewardDraft.rewardKind === 'EVENT_MINER'
      ? rewardDraft.rewardKind
      : null;
  const rewardCatalogOptions = useMemo(
    () => rewardCatalogItems.filter((x) => x.kind === catalogKind),
    [rewardCatalogItems, catalogKind],
  );

  const load = useCallback(async () => {
    if (isNew || seasonId == null) {
      setLoading(false);
      return;
    }
    if (Number.isNaN(seasonId)) {
      setLoading(false);
      toast.error(t('adminMiniPass.errors.invalid_season_id'));
      navigate('/admin/mini-pass');
      return;
    }
    try {
      setLoading(true);
      const res = await api.get<AdminMiniPassSeasonGetResponse>(`/admin/mini-pass/seasons/${seasonId}`);
      if (!res.data.ok || !('season' in res.data) || !res.data.season) {
        toast.error(t('adminMiniPass.errors.season_not_found'));
        navigate('/admin/mini-pass');
        return;
      }
      const m = res.data.season;
      const titles = m.titleI18n || {};
      const subs = m.subtitleI18n || {};
      setForm({
        slug: m.slug || '',
        titleEn: titles.en || '',
        titlePtBR: titles.ptBR || '',
        titleEs: titles.es || '',
        subtitleEn: subs.en || '',
        subtitlePtBR: subs.ptBR || '',
        subtitleEs: subs.es || '',
        startsAt: m.startsAt ? toDatetimeLocalValue(m.startsAt) : '',
        endsAt: m.endsAt ? toDatetimeLocalValue(m.endsAt) : '',
        maxLevel: m.maxLevel || 10,
        xpPerLevel: m.xpPerLevel || 100,
        buyLevelPricePol: String(m.buyLevelPricePol ?? '0'),
        completePassPricePol: String(m.completePassPricePol ?? '0'),
        bannerImageUrl: m.bannerImageUrl || '',
        isActive: Boolean(m.isActive),
      });
      setRewards(m.levelRewards ?? []);
      setMissions(m.missions ?? []);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || t('adminMiniPass.errors.load_failed'));
      navigate('/admin/mini-pass');
    } finally {
      setLoading(false);
    }
  }, [isNew, seasonId, navigate, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!catalogKind) return;
    let cancelled = false;
    void (async () => {
      try {
        setRewardCatalogLoading(true);
        const res = await api.get<AdminMinersListResponse>('/admin/miners', {
          params: { limit: 20, filter: 'active', withEvents: 1, q: rewardCatalogQuery.trim() },
        });
        if (cancelled) return;
        const rows = Array.isArray(res.data?.miners)
          ? res.data.miners.map(normalizeRewardCatalogItem)
          : [];
        setRewardCatalogItems(rows);
      } catch (err) {
        if (!cancelled) {
          setRewardCatalogItems([]);
          const msg = readAxiosResponseMessage(err);
          if (msg) toast.error(msg);
        }
      } finally {
        if (!cancelled) setRewardCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalogKind, rewardCatalogQuery]);

  useEffect(() => {
    if (rewardDraft.rewardKind !== 'SHOP_MINER') setSelectedShopMiner(null);
    if (rewardDraft.rewardKind !== 'EVENT_MINER') setSelectedEventMiner(null);
  }, [rewardDraft.rewardKind]);

  useEffect(() => {
    if (
      rewardDraft.rewardKind === 'SHOP_MINER' &&
      selectedShopMiner &&
      rewardCatalogQuery.trim() !== selectedShopMiner.name
    ) {
      setSelectedShopMiner(null);
      setRewardDraft((prev) => ({ ...prev, minerId: '' }));
    }
    if (
      rewardDraft.rewardKind === 'EVENT_MINER' &&
      selectedEventMiner &&
      rewardCatalogQuery.trim() !== selectedEventMiner.name
    ) {
      setSelectedEventMiner(null);
      setRewardDraft((prev) => ({ ...prev, eventMinerId: '' }));
    }
  }, [rewardCatalogQuery, rewardDraft.rewardKind, selectedShopMiner, selectedEventMiner]);

  const saveSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateSeasonForm(form);
    if (errs.length) {
      toast.error(t(`adminMiniPass.errors.${errs[0]}`, errs[0]));
      return;
    }
    try {
      setSaving(true);
      const titleI18n = { en: form.titleEn, ptBR: form.titlePtBR, es: form.titleEs };
      const subtitleI18n =
        form.subtitleEn || form.subtitlePtBR || form.subtitleEs
          ? { en: form.subtitleEn, ptBR: form.subtitlePtBR, es: form.subtitleEs }
          : null;
      const body = {
        slug: form.slug.trim().toLowerCase(),
        titleI18n,
        subtitleI18n,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        maxLevel: Number(form.maxLevel),
        xpPerLevel: Number(form.xpPerLevel),
        buyLevelPricePol: form.buyLevelPricePol,
        completePassPricePol: form.completePassPricePol,
        bannerImageUrl: form.bannerImageUrl || null,
        isActive: form.isActive,
      };
      if (isNew) {
        const res = await api.post<AdminMiniPassSeasonWriteResponse>('/admin/mini-pass/seasons', body);
        if (res.data.ok && res.data.season?.id) {
          toast.success(t('adminMiniPass.season.created'));
          navigate(`/admin/mini-pass/${res.data.season.id}`);
        }
      } else {
        await api.put(`/admin/mini-pass/seasons/${seasonId}`, body);
        toast.success(t('adminMiniPass.season.updated'));
        await load();
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || t('adminMiniPass.errors.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const addReward = async () => {
    if (!seasonId) {
      toast.error(t('adminMiniPass.errors.save_season_first'));
      return;
    }
    const check = validateRewardDraft(rewardDraft);
    if (!check.ok) {
      toast.error(t(`adminMiniPass.errors.${check.errorKey}`));
      return;
    }
    const level = Number(rewardDraft.level);
    if (level > Number(form.maxLevel)) {
      toast.error(t('adminMiniPass.errors.reward_level_over_max'));
      return;
    }
    try {
      const titleI18n =
        rewardDraft.titleEn || rewardDraft.titlePtBR || rewardDraft.titleEs
          ? { en: rewardDraft.titleEn, ptBR: rewardDraft.titlePtBR, es: rewardDraft.titleEs }
          : null;
      await api.post(`/admin/mini-pass/seasons/${seasonId}/level-rewards`, {
        level,
        rewardKind: rewardDraft.rewardKind,
        minerId: rewardDraft.minerId ? Number(rewardDraft.minerId) : null,
        eventMinerId: rewardDraft.eventMinerId ? Number(rewardDraft.eventMinerId) : null,
        hashRate: rewardDraft.hashRate ? Number(rewardDraft.hashRate) : null,
        hashRateDays: rewardDraft.hashRateDays ? Number(rewardDraft.hashRateDays) : null,
        blkAmount: rewardDraft.blkAmount || null,
        polAmount: rewardDraft.polAmount || null,
        titleI18n,
      });
      toast.success(t('adminMiniPass.season.reward_added'));
      await load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || t('adminMiniPass.errors.reward_failed'));
    }
  };

  const deleteReward = async (id: number) => {
    if (!window.confirm(t('adminMiniPass.confirm_delete_reward'))) return;
    try {
      await api.delete(`/admin/mini-pass/seasons/${seasonId}/level-rewards/${id}`);
      toast.success(t('adminMiniPass.deleted'));
      await load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || t('adminMiniPass.errors.delete_failed'));
    }
  };

  const addMission = async () => {
    if (!seasonId) {
      toast.error(t('adminMiniPass.errors.save_season_first'));
      return;
    }
    const check = validateMissionDraft(missionDraft);
    if (!check.ok) {
      toast.error(t(`adminMiniPass.errors.${check.errorKey}`));
      return;
    }
    try {
      const descriptionI18n =
        missionDraft.descriptionEn.trim() ||
        missionDraft.descriptionPtBR.trim() ||
        missionDraft.descriptionEs.trim()
          ? {
              en: missionDraft.descriptionEn.trim(),
              ptBR: missionDraft.descriptionPtBR.trim(),
              es: missionDraft.descriptionEs.trim(),
            }
          : null;
      await api.post(`/admin/mini-pass/seasons/${seasonId}/missions`, {
        cadence: missionDraft.cadence,
        missionType: missionDraft.missionType,
        targetValue: missionDraft.targetValue,
        xpReward: Number(missionDraft.xpReward),
        titleI18n: {
          en: missionDraft.titleEn,
          ptBR: missionDraft.titlePtBR,
          es: missionDraft.titleEs,
        },
        descriptionI18n,
        gameSlug: missionDraft.gameSlug || null,
        sortOrder: Number(missionDraft.sortOrder) || 0,
      });
      toast.success(t('adminMiniPass.season.mission_added'));
      setMissionDraft((prev) => ({
        ...prev,
        descriptionEn: '',
        descriptionPtBR: '',
        descriptionEs: '',
        titleEn: '',
        titlePtBR: '',
        titleEs: '',
      }));
      await load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || t('adminMiniPass.errors.mission_failed'));
    }
  };

  const deleteMission = async (id: number) => {
    if (!window.confirm(t('adminMiniPass.confirm_delete_mission'))) return;
    try {
      await api.delete(`/admin/mini-pass/seasons/${seasonId}/missions/${id}`);
      toast.success(t('adminMiniPass.deleted'));
      await load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || t('adminMiniPass.errors.delete_failed'));
    }
  };

  const applyQuickRewardTemplate = async () => {
    if (!seasonId) return;
    const max = Math.max(1, Math.min(500, parseInt(String(form.maxLevel), 10) || 1));
    const have = new Set((rewards || []).map((r) => r.level));
    const missing: number[] = [];
    for (let level = 1; level <= max; level += 1) {
      if (!have.has(level)) missing.push(level);
    }
    if (missing.length === 0) {
      toast.info(t('adminMiniPass.season.template_none'));
      return;
    }
    setTemplateBusy(true);
    try {
      for (const level of missing) {
        await api.post(`/admin/mini-pass/seasons/${seasonId}/level-rewards`, {
          level,
          rewardKind: 'NONE',
          minerId: null,
          eventMinerId: null,
          hashRate: null,
          hashRateDays: null,
          blkAmount: null,
          polAmount: null,
          titleI18n: null,
        });
      }
      toast.success(t('adminMiniPass.season.template_done', { count: missing.length }));
      await load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || t('adminMiniPass.errors.template_failed'));
    } finally {
      setTemplateBusy(false);
    }
  };

  const sortedRewards = [...(rewards || [])].sort((a, b) => a.level - b.level);

  return {
    t,
    id: seasonIdParam,
    navigate,
    isNew,
    range,
    loading,
    setLoading,
    saving,
    setSaving,
    templateBusy,
    setTemplateBusy,
    seasonId,
    setSeasonId,
    form,
    setForm,
    rewards,
    setRewards,
    missions,
    setMissions,
    rewardCatalogQuery,
    setRewardCatalogQuery,
    rewardCatalogLoading,
    setRewardCatalogLoading,
    rewardCatalogItems,
    setRewardCatalogItems,
    selectedShopMiner,
    setSelectedShopMiner,
    selectedEventMiner,
    setSelectedEventMiner,
    rewardDraft,
    setRewardDraft,
    missionDraft,
    setMissionDraft,
    progressionRows,
    rewardCoverage,
    rewardDraftCheck,
    rewardCatalogOptions,
    load,
    saveSeason,
    addReward,
    deleteReward,
    addMission,
    deleteMission,
    applyQuickRewardTemplate,
    sortedRewards,
  };
}
