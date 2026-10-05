import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox,
  ArrowRight,
  Zap,
  Cpu,
  Coins,
  Clock,
  CheckCircle2,
  PackageOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { useGameStore } from '../shell/lib/game.store';
import { getMachineDisplayImageUrl } from '../machines/lib/machineDisplayImage';
import { MachineImage } from '../machines/components/MachineImage';
import { formatHashrate } from '../machines/lib/machines.shared';
import {
  getRewardInbox,
  collectReward,
  collectAllRewards,
} from './lib/rewardInboxClient';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import StatusPill from '../../shared/components/StatusPill';
import type { StatusPillVariant } from '../../shared/components/StatusPill';

type RewardInboxItem = {
  id: number;
  status: string;
  source: string;
  rewardType: string;
  rewardValue: string | number;
  minerId: number | null;
  minerName: string | null;
  minerImageUrl: string | null;
  slotSize: number;
  durationHours: number | null;
  metaJson: Record<string, unknown> | null;
  createdAt: string;
};

const SOCKET_DEBOUNCE_MS = 160;

function notifyInventoryChanged(): void {
  window.dispatchEvent(new CustomEvent('bm-inventory-changed'));
}

function useSourceLabel(source: string): string {
  const { t } = useTranslation();
  if (source === 'checkin_milestone') return t('inventario.source_checkin');
  if (source === 'daily_task') return t('inventario.source_daily_task');
  if (source === 'offerwall') return t('inventario.source_offerwall');
  if (source === 'tournament') return t('inventario.source_tournament');
  if (source === 'youtuber_reward') return t('inventario.source_youtuber');
  if (source === 'burn_event') return t('inventario.source_burn');
  return source;
}

function RewardCard({
  item,
  onCollect,
  busy,
}: {
  item: RewardInboxItem;
  onCollect: (id: number) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const sourceLabel = useSourceLabel(item.source);
  const value = Number(item.rewardValue || 0);

  const imageUrl =
    item.rewardType === 'machine' && item.minerImageUrl
      ? getMachineDisplayImageUrl({ imageUrl: item.minerImageUrl, imageSource: undefined })
      : null;

  let typeLabel = '';
  let pillVariant: StatusPillVariant = 'neutral';
  let PillIcon: LucideIcon = PackageOpen;

  if (item.rewardType === 'machine') {
    typeLabel = t('inventario.type_machine');
    pillVariant = 'primary';
    PillIcon = Cpu;
  } else if (item.rewardType === 'pol') {
    typeLabel = t('inventario.type_pol');
    pillVariant = 'warning';
    PillIcon = Coins;
  } else if (item.rewardType === 'blk') {
    typeLabel = t('inventario.type_blk');
    pillVariant = 'orange';
    PillIcon = Coins;
  } else if (item.rewardType === 'temporary_power' || item.rewardType === 'hashrate_boost') {
    typeLabel = t('inventario.type_power');
    pillVariant = 'info';
    PillIcon = Zap;
  }

  return (
    <Card spacing="md" className="flex flex-col">
      <div className="flex items-start gap-4">
        <div className="relative h-16 w-16 shrink-0 rounded-2xl border-2 border-slate-800 bg-slate-950 p-3 flex items-center justify-center shadow-[2px_2px_0px_#000000]">
          {item.rewardType === 'machine' && imageUrl ? (
            <MachineImage
              imageUrl={imageUrl}
              name={item.minerName ?? ''}
              className="h-full w-full object-contain"
            />
          ) : (
            <PillIcon className="h-6 w-6 text-slate-200" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <StatusPill variant={pillVariant} icon={PillIcon} label={typeLabel} />
          <div className="text-sm font-bold text-white leading-snug">
            {item.rewardType === 'machine'
              ? (item.minerName ?? typeLabel)
              : item.rewardType === 'temporary_power' || item.rewardType === 'hashrate_boost'
              ? `${formatHashrate(value)}${item.durationHours != null ? ` · ${item.durationHours}h` : ''}`
              : `${value} ${typeLabel}`}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            {sourceLabel}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800/40 pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onCollect(item.id)}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 disabled:pointer-events-none disabled:bg-slate-800 disabled:text-slate-300 disabled:shadow-none"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t('inventario.collect')}
        </button>
      </div>
    </Card>
  );
}

export default function InventarioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<RewardInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectingId, setCollectingId] = useState<number | null>(null);
  const [collectingAll, setCollectingAll] = useState(false);
  const initSocket = useGameStore((s) => s.initSocket);
  const socket = useGameStore((s) => s.socket);
  const latestFetchIdRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const fetchData = useCallback(async ({ background = false } = {}) => {
    const requestId = ++latestFetchIdRef.current;
    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    try {
      if (!background) setLoading(true);
      const res = await getRewardInbox(ac.signal);
      if (requestId !== latestFetchIdRef.current) return;
      if (res.data?.ok && Array.isArray(res.data.items)) {
        setItems(
          res.data.items.filter(
            (row: unknown): row is RewardInboxItem =>
              row != null &&
              typeof row === 'object' &&
              'id' in row &&
              Number.isInteger(Number((row as { id: unknown }).id)) &&
              Number((row as { id: unknown }).id) > 0
          )
        );
      } else if (!axios.isCancel(ac.signal)) {
        toast.error(t('inventario.inbox_load_error'));
      }
    } catch (e) {
      if (!axios.isCancel(e) && requestId === latestFetchIdRef.current) {
        toast.error(t('inventario.inbox_load_error'));
      }
    } finally {
      if (requestId === latestFetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    initSocket();
    void fetchData();
    return () => {
      fetchAbortRef.current?.abort();
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchData, initSocket]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchData({ background: true });
    }, SOCKET_DEBOUNCE_MS);
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    socket.on('inventory:update', scheduleRefresh);
    return () => {
      socket.off('inventory:update', scheduleRefresh);
    };
  }, [socket, scheduleRefresh]);

  const handleCollect = useCallback(
    async (id: number) => {
      if (collectingId != null || collectingAll) return;
      const target = items.find((item) => item.id === id);
      setCollectingId(id);
      try {
        const res = await collectReward(id);
        if (res.data?.ok) {
          const rewardType = String(res.data.rewardType ?? target?.rewardType ?? '');
          if (rewardType === 'machine') {
            notifyInventoryChanged();
            toast.success(t('inventario.collected_machine_toast'), {
              action: {
                label: t('inventario.go_to_machines'),
                onClick: () => navigate('/inventory', { state: { refreshInventory: true } }),
              },
            });
          } else {
            toast.success(t('inventario.collected_toast'));
          }
          setItems((prev) => prev.filter((item) => item.id !== id));
        } else {
          toast.error(t('inventario.collect_error'));
        }
      } catch {
        toast.error(t('inventario.collect_error'));
      } finally {
        setCollectingId(null);
      }
    },
    [collectingId, collectingAll, items, navigate, t],
  );

  const handleCollectAll = useCallback(async () => {
    if (collectingId != null || collectingAll || items.length === 0) return;
    const machineCount = items.filter((item) => item.rewardType === 'machine').length;
    setCollectingAll(true);
    try {
      const res = await collectAllRewards();
      if (res.data?.ok) {
        const count = res.data.collected ?? items.length;
        const machines = Number(res.data.machinesCollected ?? machineCount);
        if (machines > 0) {
          notifyInventoryChanged();
          toast.success(t('inventario.collect_all_machines_toast', { count, machines }), {
            action: {
              label: t('inventario.go_to_machines'),
              onClick: () => navigate('/inventory', { state: { refreshInventory: true } }),
            },
          });
        } else {
          toast.success(t('inventario.collect_all_toast', { count }));
        }
        await fetchData({ background: true });
      } else {
        toast.error(t('inventario.collect_error'));
      }
    } catch {
      toast.error(t('inventario.collect_error'));
    } finally {
      setCollectingAll(false);
    }
  }, [collectingId, collectingAll, items, fetchData, navigate, t]);

  if (loading) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        <div className="flex items-center gap-4 pb-3 border-b-2 border-slate-800">
          <IconBadge icon={Inbox} variant="amber" size="lg" />
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('inventario.inbox_title')}</h1>
        </div>
        <Card>
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
          </div>
        </Card>
      </div>
    );
  }

  const anyBusy = collectingId != null || collectingAll;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-4">
          <IconBadge icon={Inbox} variant="amber" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('inventario.inbox_title')}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('inventario.inbox_subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill variant="primary" icon={Inbox} label={t('inventario.pending_count', { count: items.length })} />
          {items.length > 0 && (
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => void handleCollectAll()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 disabled:pointer-events-none disabled:bg-slate-800 disabled:text-slate-300 disabled:shadow-none"
            >
              {collectingAll ? (
                <div className="h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              {t('inventario.collect_all')}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-slate-600 bg-slate-800 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-100 shadow-[2px_2px_0px_#000000] hover:bg-slate-700"
          >
            {t('inventario.go_to_machines')}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
          <PackageOpen className="mb-4 h-12 w-12 text-slate-400" aria-hidden />
          <p className="text-base font-bold text-slate-200">{t('inventario.empty_title')}</p>
          <p className="mt-1 text-sm text-slate-400">{t('inventario.empty_hint')}</p>
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-slate-600 bg-slate-800 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-100 shadow-[2px_2px_0px_#000000] hover:bg-slate-700"
          >
            {t('inventario.go_to_machines')}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <RewardCard
              key={item.id}
              item={item}
              onCollect={(id) => void handleCollect(id)}
              busy={anyBusy}
            />
          ))}
        </div>
      )}

      
    </div>
  );
}
