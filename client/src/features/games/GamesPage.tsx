import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Brain, Grid3X3, Car, Plane, Layers } from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import AdRotator, { LEADERBOARD_ADS, POWER_STATS_ADS_300 } from './components/AdRotator';
import { GameCard, GameCardLink, TemporaryPowerSummary } from './components/games.parts';
import { getGameCooldownSeconds } from './lib/gameCooldownStore';

interface ActivePowersResponse {
  ok?: boolean;
  totalHashRate?: number;
}

interface Game2048HubStatus {
  ok?: boolean;
  allowNewStart?: boolean;
  cooldownSecondsRemaining?: number;
  activeSession?: unknown | null;
}

function useCooldownSeconds(game: string, tick: number): number {
  void tick;
  return getGameCooldownSeconds(game);
}

export default function GamesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [totalGamePower, setTotalGamePower] = useState(0);
  const [powerLoading, setPowerLoading] = useState(true);
  const [powerErrorKey, setPowerErrorKey] = useState<string | null>(null);
  const [powerFlash, setPowerFlash] = useState(false);
  const lastPowerRef = useRef<number | null>(null);

  const [cooldownTick, setCooldownTick] = useState(0);
  const memoryCd = useCooldownSeconds('memory', cooldownTick);
  const matchCd = useCooldownSeconds('match-3', cooldownTick);
  const cartCd = useCooldownSeconds('cart', cooldownTick);
  const skyCd = useCooldownSeconds('sky', cooldownTick);

  const [cooldown2048, setCooldown2048] = useState(0);
  const [allow2048Start, setAllow2048Start] = useState(true);
  const [has2048Session, setHas2048Session] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setCooldownTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const refreshPower = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setPowerLoading(true);
      setPowerErrorKey(null);
      const res = await api.get<ActivePowersResponse>('/games/active-powers');
      if (res.data?.ok) {
        const next = Number(res.data.totalHashRate) || 0;
        if (lastPowerRef.current !== null && next !== lastPowerRef.current) {
          setPowerFlash(true);
          window.setTimeout(() => setPowerFlash(false), 800);
        }
        lastPowerRef.current = next;
        setTotalGamePower(next);
      } else {
        setPowerErrorKey('load_failed');
      }
    } catch {
      setPowerErrorKey('load_failed');
    } finally {
      if (!silent) setPowerLoading(false);
    }
  }, []);

  const refresh2048 = useCallback(async () => {
    try {
      const res = await api.get<Game2048HubStatus>('/games/2048/status');
      if (res.data?.ok) {
        setCooldown2048(Math.max(0, Number(res.data.cooldownSecondsRemaining) || 0));
        setAllow2048Start(!!res.data.allowNewStart);
        setHas2048Session(!!res.data.activeSession);
      }
    } catch {
      /* hub card stays conservative */
    }
  }, []);

  useEffect(() => {
    void refreshPower({ silent: false });
  }, [refreshPower]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshPower({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshPower]);

  useEffect(() => {
    const id = window.setInterval(() => void refreshPower({ silent: true }), 50_000);
    return () => window.clearInterval(id);
  }, [refreshPower]);

  useEffect(() => {
    void refresh2048();
    const id = window.setInterval(() => void refresh2048(), 8000);
    return () => window.clearInterval(id);
  }, [refresh2048]);

  const chain2048Disabled =
    cooldown2048 > 0 || (!allow2048Start && !has2048Session);

  return (
    <div className="animate-in fade-in space-y-8 duration-1000" style={{ direction: 'ltr' }}>
      <AdRotator ads={LEADERBOARD_ADS} size="728x90" className="!my-2" />
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/50 p-4 shadow-xl sm:p-6 lg:flex-row lg:items-stretch lg:justify-between">
        <h1 className="min-w-0 shrink-0 text-3xl font-black uppercase italic leading-none tracking-tight text-white sm:text-4xl">
          {t('minerGames.brand_prefix')}
          <span className="text-primary">{t('minerGames.brand_suffix')}</span>
        </h1>
        <TemporaryPowerSummary
          t={t}
          totalGamePower={totalGamePower}
          loading={powerLoading}
          errorKey={powerErrorKey}
          flash={powerFlash}
          onRetry={() => void refreshPower({ silent: false })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        <GameCard
          title={t('minerGames.memory_sync_title')}
          description={t('minerGames.memory_sync_desc')}
          icon={Brain}
          color="from-blue-600 to-indigo-700"
          onClick={() => navigate('/games/memory')}
          disabled={memoryCd > 0}
          ctaStart={t('minerGames.cta_start')}
          cooldownLabel={t('minerGames.cooldown_label', { seconds: memoryCd })}
        />
        <GameCard
          title={t('minerGames.power_match_title')}
          description={t('minerGames.power_match_desc')}
          icon={Grid3X3}
          color="from-primary to-orange-700"
          onClick={() => navigate('/games/match-3')}
          disabled={matchCd > 0}
          ctaStart={t('minerGames.cta_start')}
          cooldownLabel={t('minerGames.cooldown_label', { seconds: matchCd })}
        />
        <GameCard
          title={t('minerGames.cart_rush_title')}
          description={t('minerGames.cart_rush_desc')}
          icon={Car}
          color="from-sky-500 to-blue-700"
          onClick={() => navigate('/games/cart')}
          disabled={cartCd > 0}
          ctaStart={t('minerGames.cta_start')}
          cooldownLabel={t('minerGames.cooldown_label', { seconds: cartCd })}
        />
        <GameCard
          title={t('minerGames.sky_runner_title')}
          description={t('minerGames.sky_runner_desc')}
          icon={Plane}
          color="from-sky-400 to-cyan-700"
          onClick={() => navigate('/games/sky')}
          disabled={skyCd > 0}
          ctaStart={t('minerGames.cta_start')}
          cooldownLabel={t('minerGames.cooldown_label', { seconds: skyCd })}
        />
        <GameCardLink
          to="/games/2048"
          title={t('game2048.title')}
          description={t('game2048.card_desc')}
          icon={Layers}
          color="from-emerald-600 to-teal-800"
          ctaLabel={t('game2048.open_game')}
          disabled={chain2048Disabled}
          cooldownMinutes={cooldown2048 > 0 ? Math.max(1, Math.ceil(cooldown2048 / 60)) : 0}
        />
      </div>
      <AdRotator ads={POWER_STATS_ADS_300} size="300x250" />
    </div>
  );
}
