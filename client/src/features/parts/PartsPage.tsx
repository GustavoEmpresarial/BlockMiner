import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Coins,
  Combine,
  Cpu,
  Gift,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { MachineImage } from '../machines/components/MachineImage';
import { formatHashrate } from '../machines/lib/machines.shared';
import IconBadge from '../../shared/components/IconBadge';
import { craftPart, getPartsOverview, mergeMachine } from './lib/parts.api';
import {
  MERGE_CHARGE_MS,
  MERGE_FLASH_MS,
  MergeForgeOverlay,
  type MergeForgeSnapshot,
} from './components/MergeForgeOverlay';
import { FreePartsGuide } from './components/FreePartsGuide';
import type {
  MergeFeeOption,
  MergePaymentAsset,
  OwnedMergeCandidate,
  PartMachinePriceDto,
  PartDropRates,
  PartStackDto,
} from './lib/parts.types';
import {
  type PartRarityName,
  PART_RARITIES,
  partRarity,
  platesByRarity,
  totalPlatesCount,
} from './lib/mergeSlots';

const BLK_MINOR_UNITS = 100_000_000;

export const RARITY_THEME: Record<
  string,
  {
    nameKey: string;
    text: string;
    border: string;
    bg: string;
    badge: string;
    glow: string;
    card: string;
  }
> = {
  common: {
    nameKey: 'parts.rarity.common',
    text: 'text-slate-200',
    border: 'border-slate-500/50',
    bg: 'bg-slate-900/80',
    badge: 'bg-slate-700 text-slate-100 border-slate-500/60',
    glow: 'rgba(226, 232, 240, 0.3)',
    card: 'border-slate-700/80 hover:border-slate-500',
  },
  uncommon: {
    nameKey: 'parts.rarity.uncommon',
    text: 'text-emerald-300',
    border: 'border-emerald-500/60',
    bg: 'bg-emerald-950/40',
    badge: 'bg-emerald-800 text-emerald-200 border-emerald-500/60',
    glow: 'rgba(52, 211, 153, 0.4)',
    card: 'border-emerald-800/80 hover:border-emerald-500',
  },
  rare: {
    nameKey: 'parts.rarity.rare',
    text: 'text-sky-300',
    border: 'border-sky-500/60',
    bg: 'bg-sky-950/40',
    badge: 'bg-sky-800 text-sky-200 border-sky-500/60',
    glow: 'rgba(56, 189, 248, 0.45)',
    card: 'border-sky-800/80 hover:border-sky-500',
  },
  epic: {
    nameKey: 'parts.rarity.epic',
    text: 'text-purple-300',
    border: 'border-purple-500/60',
    bg: 'bg-purple-950/40',
    badge: 'bg-purple-800 text-purple-200 border-purple-500/60',
    glow: 'rgba(168, 85, 247, 0.5)',
    card: 'border-purple-800/80 hover:border-purple-500',
  },
  legendary: {
    nameKey: 'parts.rarity.legendary',
    text: 'text-amber-300',
    border: 'border-amber-500/70',
    bg: 'bg-amber-950/40',
    badge: 'bg-amber-700 text-amber-100 border-amber-400/70',
    glow: 'rgba(245, 158, 11, 0.55)',
    card: 'border-amber-800/80 hover:border-amber-500',
  },
};

type ForgePhase = 'idle' | 'charge' | 'flash' | 'reveal';
type MergeNotice = { tone: 'ok' | 'err'; key: string; name?: string };

function formatBlkAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const trimmed = value.toFixed(8).replace(/\.?0+$/, '');
  return trimmed === '' ? '0' : trimmed;
}

const MERGE_FEE_PERCENT_BLK = 15;
const MERGE_FEE_PERCENT_CRYPTO = 10;

function formatCoinAmount(value: number, asset: MergePaymentAsset, round: 'up' | 'down' = 'down'): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (asset === 'SHIB') {
    const whole = round === 'up' ? Math.ceil(value) : Math.floor(value * 100) / 100;
    return whole.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }
  return formatBlkAmount(value);
}

function candidateKey(c: OwnedMergeCandidate): string {
  return `${c.source ?? 'catalog'}:${c.minerId}:${c.currentLevel}`;
}

function coversBlk(balance: number, fee: number): boolean {
  return Math.round(balance * BLK_MINOR_UNITS) >= Math.round(fee * BLK_MINOR_UNITS);
}

export default function PartsPage() {
  const { t } = useTranslation();
  const forgeSectionRef = useRef<HTMLDivElement>(null);

  const [parts, setParts] = useState<PartStackDto[]>([]);
  const [ownedCandidates, setOwnedCandidates] = useState<OwnedMergeCandidate[]>([]);
  const [blkBalance, setBlkBalance] = useState(0);
  const [paymentAsset, setPaymentAsset] = useState<MergePaymentAsset>('BLK');
  const [feePercentBlk, setFeePercentBlk] = useState(MERGE_FEE_PERCENT_BLK);
  const [feePercentCrypto, setFeePercentCrypto] = useState(MERGE_FEE_PERCENT_CRYPTO);
  const [dropRates, setDropRates] = useState<PartDropRates | null>(null);

  // Selected candidate for forge workbench
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<ForgePhase>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<MergeNotice | null>(null);

  // Filter state for user's owned machines
  const [filterMode, setFilterMode] = useState<'ready' | 'all' | 'catalog'>('ready');
  const [catalogSource, setCatalogSource] = useState<'all' | 'catalog' | 'offer'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRarityTab, setSelectedRarityTab] = useState<string>('all');

  const applyOverview = useCallback(
    (data: {
      ok?: boolean;
      parts?: PartStackDto[];
      machines?: PartMachinePriceDto[];
      ownedMergeCandidates?: OwnedMergeCandidate[];
      blkBalance?: number;
      mergeFeePercentBlk?: number;
      mergeFeePercentCrypto?: number;
      dropRates?: PartDropRates;
    }) => {
      if (!data?.ok) {
        setError(true);
        return;
      }
      const balance = Number(data.blkBalance);
      setBlkBalance(Number.isFinite(balance) ? balance : 0);
      if (Number.isFinite(Number(data.mergeFeePercentBlk))) setFeePercentBlk(Number(data.mergeFeePercentBlk));
      if (Number.isFinite(Number(data.mergeFeePercentCrypto))) setFeePercentCrypto(Number(data.mergeFeePercentCrypto));
      if (data.dropRates) setDropRates(data.dropRates);

      const nextParts = Array.isArray(data.parts) ? data.parts : [];
      const nextCandidates = Array.isArray(data.ownedMergeCandidates) ? data.ownedMergeCandidates : [];

      setParts(nextParts);
      setOwnedCandidates(nextCandidates);

      setSelectedCandidateKey((current) => {
        if (current != null && nextCandidates.some((c) => candidateKey(c) === current)) {
          return current;
        }
        // Auto-select first ready machine, then first owned pair, then first owned machine
        const firstReady =
          nextCandidates.find((c) => c.canMerge) ??
          nextCandidates.find((c) => c.hasMachinePair) ??
          nextCandidates.find((c) => c.ownedCount > 0);
        if (firstReady) return candidateKey(firstReady);
        return nextCandidates[0] ? candidateKey(nextCandidates[0]) : null;
      });
      setError(false);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const overview = await getPartsOverview();
      if (overview.data?.ok) applyOverview(overview.data);
    } catch {
      setError(true);
    }
  }, [applyOverview]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getPartsOverview()
      .then((res) => {
        if (!cancelled) applyOverview(res.data);
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
  }, [applyOverview]);

  // Derived state
  const selectedCandidate = useMemo(
    () => ownedCandidates.find((c) => candidateKey(c) === selectedCandidateKey) ?? null,
    [ownedCandidates, selectedCandidateKey],
  );

  const feeOptions: MergeFeeOption[] = useMemo(
    () =>
      selectedCandidate?.feeOptions?.length
        ? selectedCandidate.feeOptions
        : selectedCandidate
          ? [
              {
                asset: 'BLK',
                feePercent: feePercentBlk,
                feeUsd: selectedCandidate.mergeFeeBlk,
                amount: selectedCandidate.mergeFeeBlk,
                usdPrice: 1,
                balance: blkBalance,
                affordable: coversBlk(blkBalance, selectedCandidate.mergeFeeBlk),
              },
            ]
          : [],
    [selectedCandidate, feePercentBlk, blkBalance],
  );
  const selectedFee = feeOptions.find((o) => o.asset === paymentAsset) ?? feeOptions[0] ?? null;
  const blkFeeOption = feeOptions.find((o) => o.asset === 'BLK') ?? null;
  const canForgeSelected = Boolean(
    selectedCandidate &&
      selectedCandidate.hasMachinePair &&
      selectedCandidate.hasParts &&
      !selectedCandidate.isMaxLevel &&
      selectedFee?.affordable,
  );

  const totalPlates = useMemo(() => totalPlatesCount(parts), [parts]);
  const rarityCounts = useMemo(() => platesByRarity(parts), [parts]);

  const ownedOnly = useMemo(() => ownedCandidates.filter((c) => c.ownedCount > 0), [ownedCandidates]);
  const catalogCount = ownedCandidates.length;

  const mergeableCandidates = useMemo(
    () => ownedCandidates.filter((c) => c.canMerge),
    [ownedCandidates],
  );
  const mergeableCount = mergeableCandidates.length;

  // Auto toggle filter mode: if player has ready machines, start on 'ready', otherwise 'all'
  useEffect(() => {
    if (mergeableCount > 0) {
      setFilterMode('ready');
    } else {
      setFilterMode('all');
    }
  }, [mergeableCount]);

  // Filtered owned machines
  const filteredCandidates = useMemo(() => {
    return ownedCandidates.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!c.name.toLowerCase().includes(q)) return false;
      }
      if (filterMode === 'ready') return c.canMerge;
      if (filterMode === 'all') return c.ownedCount > 0;
      if (catalogSource !== 'all' && (c.source ?? 'catalog') !== catalogSource) return false;
      return true;
    });
  }, [ownedCandidates, searchQuery, filterMode, catalogSource]);

  // Filtered parts: always display the 6 catalog parts for the selected rarity tab, even when quantity is 0
  const filteredParts = useMemo(() => {
    if (selectedRarityTab === 'all') {
      const owned = parts.filter((p) => p.quantity > 0);
      if (owned.length > 0) return owned;
      return parts.filter((p) => partRarity(p) === 'common');
    }
    return parts.filter((p) => partRarity(p) === selectedRarityTab);
  }, [parts, selectedRarityTab]);

  const [craftingKey, setCraftingKey] = useState<string | null>(null);

  const handleCraftPart = async (partSlug: string, fromRarity: string, count = 1) => {
    const key = `${partSlug}:${fromRarity}`;
    if (craftingKey) return;
    setCraftingKey(key);
    try {
      const res = await craftPart(partSlug, fromRarity, count);
      if (res.data?.ok) {
        toast.success(
          `Fundido com sucesso: ${res.data.consumed}x ${t(`parts.items.${partSlug}`, { defaultValue: partSlug })} (${t(RARITY_THEME[fromRarity]?.nameKey)}) → ${res.data.crafted}x ${t(RARITY_THEME[res.data.targetRarity]?.nameKey)}!`,
        );
        void load();
      }
    } catch (err: unknown) {
      const msg =
        isAxiosError(err) && err.response?.data?.message ? err.response.data.message : 'Falha ao fundir peças.';
      toast.error(msg);
    } finally {
      setCraftingKey(null);
    }
  };

  const handleSelectCandidate = (c: OwnedMergeCandidate) => {
    setSelectedCandidateKey(candidateKey(c));
    forgeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [forgeSnapshot, setForgeSnapshot] = useState<MergeForgeSnapshot | null>(null);
  const [forgeResultName, setForgeResultName] = useState<string | undefined>(undefined);

  const closeForgeOverlay = useCallback(() => {
    setPhase('idle');
    setForgeSnapshot(null);
    setForgeResultName(undefined);
  }, []);

  const handleForge = async () => {
    if (!selectedCandidate || !canForgeSelected || !selectedFee || phase !== 'idle') return;

    const fromTheme = RARITY_THEME[selectedCandidate.currentTier] ?? RARITY_THEME.common;
    const toTheme = RARITY_THEME[selectedCandidate.targetTier] ?? RARITY_THEME.uncommon;
    setForgeSnapshot({
      name: selectedCandidate.name,
      imageUrl: selectedCandidate.imageUrl,
      from: {
        name: selectedCandidate.currentTierName,
        level: selectedCandidate.currentLevel,
        glow: fromTheme.glow,
        badge: fromTheme.badge,
        border: fromTheme.border,
      },
      to: {
        name: selectedCandidate.targetTierName,
        level: selectedCandidate.targetLevel,
        glow: toTheme.glow,
        badge: toTheme.badge,
        border: toTheme.border,
      },
      fromHashRate: selectedCandidate.currentHashRate,
      toHashRate: selectedCandidate.targetHashRate,
      boostPercent: selectedCandidate.boostPercent,
    });
    setForgeResultName(undefined);
    setNotice(null);
    setPhase('charge');

    const request = mergeMachine(
      selectedCandidate.minerId,
      [],
      selectedCandidate.source ?? 'catalog',
      selectedCandidate.currentLevel,
      selectedFee.asset,
    );
    const [outcome] = await Promise.allSettled([request, new Promise((r) => setTimeout(r, MERGE_CHARGE_MS))]);

    if (outcome.status === 'rejected' || !outcome.value.data?.ok) {
      let key = 'parts.merge_error';
      if (outcome.status === 'rejected') {
        const err: unknown = outcome.reason;
        if (isAxiosError(err) && err.response?.data?.messageKey) key = String(err.response.data.messageKey);
      }
      closeForgeOverlay();
      setNotice({ tone: 'err', key });
      return;
    }

    const name = outcome.value.data.name;
    setForgeResultName(name);
    setPhase('flash');
    await new Promise((r) => setTimeout(r, MERGE_FLASH_MS));
    setPhase('reveal');
    setNotice({ tone: 'ok', key: 'parts.merge_success', name });
    void load();
  };

  const currentTierTheme = selectedCandidate ? RARITY_THEME[selectedCandidate.currentTier] ?? RARITY_THEME.common : RARITY_THEME.common;
  const targetTierTheme = selectedCandidate ? RARITY_THEME[selectedCandidate.targetTier] ?? RARITY_THEME.uncommon : RARITY_THEME.uncommon;

  return (
    <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {forgeSnapshot && phase !== 'idle' ? (
        <MergeForgeOverlay
          stage={phase}
          snapshot={forgeSnapshot}
          resultName={forgeResultName}
          onClose={closeForgeOverlay}
        />
      ) : null}
      

      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-slate-800">
        <div className="flex items-center gap-3.5">
          <IconBadge icon={Combine} variant="amber" size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                {t('sidebar.merge')}
              </h1>
              <span className="hidden sm:inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-300">
                Oficina de Fusão
              </span>
            </div>
          </div>
        </div>

        {/* Top Badges / KPIs */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-800 bg-slate-900/80 px-3.5 py-2 shadow-[2px_2px_0px_#000000]">
            <Coins className="h-4 w-4 text-amber-400" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold leading-none">Saldo BLK</p>
              <p className="text-xs font-black text-white font-mono leading-tight mt-0.5">
                {formatBlkAmount(blkBalance)} BLK
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-800 bg-slate-900/80 px-3.5 py-2 shadow-[2px_2px_0px_#000000]">
            <Layers className="h-4 w-4 text-sky-400" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold leading-none">Suas Peças</p>
              <p className="text-xs font-black text-sky-300 font-mono leading-tight mt-0.5">
                {totalPlates} {totalPlates === 1 ? 'peça' : 'peças'}
              </p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-2xl border-2 px-3.5 py-2 shadow-[2px_2px_0px_#000000] ${
              mergeableCount > 0
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                : 'border-slate-800 bg-slate-900/80 text-slate-400'
            }`}
          >
            <Zap className={`h-4 w-4 ${mergeableCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <div>
              <p className="text-[9px] uppercase tracking-wider font-bold leading-none">Prontas p/ Fusão</p>
              <p className="text-xs font-black font-mono leading-tight mt-0.5">
                {mergeableCount} {mergeableCount === 1 ? 'modelo' : 'modelos'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Regra da taxa da forja */}
      <div
        data-testid="merge-fee-rules"
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] font-semibold text-slate-400"
      >
        <span className="inline-flex items-center gap-1.5 font-black uppercase tracking-wider text-slate-300">
          <Coins className="h-3.5 w-3.5 text-amber-400" />
          Taxa da forja
        </span>
        <span>
          <b className="text-amber-300">{feePercentBlk}%</b> do valor base em BLK
        </span>
        <span className="text-slate-600">·</span>
        <span>
          <b className="text-emerald-300">{feePercentCrypto}%</b> em POL/SHIB
        </span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-300">
          -{feePercentBlk - feePercentCrypto}% pagando em cripto
        </span>
      </div>

      {/* Notice Banner */}
      {notice ? (
        <div
          className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-xs font-bold shadow-[2px_2px_0px_#000000] animate-in fade-in duration-300 ${
            notice.tone === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
              : 'border-red-500/40 bg-red-950/40 text-red-200'
          }`}
        >
          {notice.tone === 'ok' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          )}
          <span className="flex-1">
            {notice.name ? t(notice.key, { name: notice.name }) : t(notice.key)}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* 1. BANCADA DA FORJA DE MÁQUINAS (FORGE WORKBENCH)        */}
      {/* ======================================================== */}
      <div
        ref={forgeSectionRef}
        className="relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/90 p-6 md:p-8 shadow-[4px_4px_0px_#000000]"
      >
        <div className="absolute top-0 right-0 h-40 w-40 bg-amber-500/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-40 w-40 bg-emerald-500/5 blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-base font-black uppercase tracking-wider text-white">
              Bancada de Fusão
            </h2>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300 font-bold">
              <Zap className="h-3 w-3" />
              {selectedCandidate ? `+${selectedCandidate.boostPercent}% Hashrate` : '+30% a +200%'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sky-300 font-bold">
              <Coins className="h-3 w-3" />
              Taxa: {feePercentBlk}% em BLK · {feePercentCrypto}% em POL/SHIB
            </span>
          </div>
        </div>

        {selectedCandidate ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.2fr] items-center gap-6">
            {/* Slots: 2 Máquinas Idênticas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  1. Duas Máquinas Idênticas ({selectedCandidate.currentTierName})
                </p>
                <span className="text-xs font-mono font-bold text-slate-300">
                  Possui: <span className={selectedCandidate.hasMachinePair ? 'text-emerald-400 font-black' : 'text-red-400'}>{selectedCandidate.ownedCount}/2</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                {[1, 2].map((slotNum) => {
                  const hasThisMachine = selectedCandidate.ownedCount >= slotNum;

                  return (
                    <div
                      key={slotNum}
                      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 p-4 text-center transition-all min-h-[160px] shadow-[2px_2px_0px_#000000] ${
                        hasThisMachine
                          ? `${currentTierTheme.border} ${currentTierTheme.bg}`
                          : 'border-dashed border-red-500/40 bg-red-950/20'
                      }`}
                    >
                      {hasThisMachine ? (
                        <>
                          <div className="h-20 w-20 mb-2 flex items-center justify-center">
                            <MachineImage
                              imageUrl={selectedCandidate.imageUrl}
                              name={selectedCandidate.name}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${currentTierTheme.badge}`}
                          >
                            Nível {selectedCandidate.currentLevel} · {selectedCandidate.currentTierName}
                          </span>
                          <p className="text-xs font-bold text-white mt-1 truncate max-w-full px-1">
                            {selectedCandidate.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {formatHashrate(selectedCandidate.currentHashRate)}
                          </p>
                        </>
                      ) : (
                        <div className="space-y-1.5 py-4 text-center">
                          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-red-950/60 border border-red-500/40 text-red-400">
                            <X className="h-5 w-5" />
                          </div>
                          <p className="text-xs font-black text-red-300 uppercase tracking-wide">
                            Falta 1 Máquina
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Compre ou ganhe outra cópia
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Peças Necessárias */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2 mt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Wrench className="h-3 w-3 text-sky-400" />
                  Peças Necessárias para a Fusão:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {selectedCandidate.partsRecipe.map((p) => {
                    const hasEnough = p.owned >= p.required;
                    return (
                      <div
                        key={`${p.slug}:${p.rarity}`}
                        className={`flex items-center gap-2 rounded-xl p-2 border ${
                          hasEnough
                            ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                            : 'border-red-500/30 bg-red-950/20 text-red-300'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold truncate">
                            {t(`parts.items.${p.slug}`, { defaultValue: p.slug })}
                          </p>
                          <p className="text-[9px] font-mono opacity-80">
                            {p.owned} / {p.required}
                          </p>
                        </div>
                        {hasEnough ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Símbolo de Fusão */}
            <div className="hidden lg:flex flex-col items-center justify-center px-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-700 bg-slate-800 text-amber-400 shadow-[2px_2px_0px_#000000]">
                <Sparkles className="h-6 w-6" />
              </div>
            </div>

            {/* Máquina Resultado & Ação */}
            <div className="space-y-4 rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-5 shadow-[2px_2px_0px_#000000]">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  2. Resultado da Fusão ({selectedCandidate.targetTierName})
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${targetTierTheme.badge}`}
                >
                  Nível {selectedCandidate.targetLevel} · {selectedCandidate.targetTierName}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div
                  className={`h-24 w-24 shrink-0 rounded-2xl border-2 ${targetTierTheme.border} ${targetTierTheme.bg} p-2 flex items-center justify-center overflow-hidden shadow-lg`}
                >
                  <MachineImage
                    imageUrl={selectedCandidate.imageUrl}
                    name={selectedCandidate.name}
                    className="h-full w-full object-contain"
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <h3 className="text-base font-black text-white truncate">
                    {selectedCandidate.name} ({selectedCandidate.targetTierName})
                  </h3>

                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-400 text-[11px]" title="Poder das 2 máquinas somadas">
                      2x {formatHashrate(selectedCandidate.currentHashRate)} ({formatHashrate(selectedCandidate.currentHashRate * 2)})
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      {formatHashrate(selectedCandidate.targetHashRate)} (+{selectedCandidate.boostPercent}% bônus)
                    </span>
                  </div>

                </div>
              </div>

              {/* Forma de pagamento da taxa */}
              {!selectedCandidate.isMaxLevel ? (
                <div className="space-y-1.5" data-testid="merge-payment">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pagar taxa com</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {feeOptions.map((opt) => {
                      const active = selectedFee?.asset === opt.asset;
                      const isCrypto = opt.asset !== 'BLK';
                      return (
                        <button
                          key={opt.asset}
                          type="button"
                          onClick={() => setPaymentAsset(opt.asset)}
                          title={`Saldo: ${formatCoinAmount(opt.balance, opt.asset)} ${opt.asset}`}
                          className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                            active
                              ? isCrypto
                                ? 'border-emerald-400 bg-emerald-500/10'
                                : 'border-amber-400 bg-amber-500/10'
                              : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                          }`}
                        >
                          <span className="flex items-center justify-between text-[10px] font-black uppercase text-slate-300">
                            {opt.asset}
                            <span className={isCrypto ? 'text-emerald-400' : 'text-slate-500'}>{opt.feePercent}%</span>
                          </span>
                          <span
                            className={`block truncate font-mono text-[11px] font-bold ${
                              opt.affordable ? 'text-white' : 'text-red-400'
                            }`}
                          >
                            {formatCoinAmount(opt.amount, opt.asset, 'up')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedFee ? (
                    <p className="text-[10px] text-slate-500">
                      Saldo: {formatCoinAmount(selectedFee.balance, selectedFee.asset)} {selectedFee.asset}
                      {selectedFee.asset !== 'BLK' ? ` · ≈ ${formatBlkAmount(selectedFee.feeUsd)} BLK` : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Botão de Ação */}
              <button
                type="button"
                onClick={handleForge}
                disabled={!canForgeSelected || phase !== 'idle'}
                className={`w-full flex items-center justify-center gap-2.5 rounded-2xl py-3.5 px-6 text-sm font-black uppercase tracking-wider transition-all shadow-[4px_4px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 ${
                  canForgeSelected
                    ? 'border-2 border-emerald-400 bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer animate-pulse'
                    : 'border-2 border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed'
                }`}
              >
                {phase !== 'idle' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('parts.merging')}
                  </>
                ) : !selectedCandidate.hasMachinePair ? (
                  <>
                    <Cpu className="h-4 w-4" />
                    {t('parts.merge_need_machines')} ({selectedCandidate.ownedCount}/2)
                  </>
                ) : !selectedCandidate.hasParts ? (
                  <>
                    <Wrench className="h-4 w-4" />
                    {t('parts.merge_need_parts')}
                  </>
                ) : !selectedFee?.affordable ? (
                  <>
                    <Coins className="h-4 w-4" />
                    Saldo de {selectedFee?.asset ?? 'BLK'} insuficiente
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 fill-current" />
                    Fundir pagando {formatCoinAmount(selectedFee.amount, selectedFee.asset)} {selectedFee.asset}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 text-xs font-medium space-y-2">
            <Cpu className="h-10 w-10 mx-auto text-slate-700 mb-2" />
            <p className="font-bold text-slate-300 text-sm">Selecione uma mineradora abaixo</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Escolha uma mineradora que você possui para colocá-la na bancada da forja.
            </p>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. SUAS MINERADORAS PARA FUSÃO (CATÁLOGO DO JOGADOR)     */}
      {/* ======================================================== */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                <Cpu className="h-5 w-5 text-amber-400" />
                {filterMode === 'catalog' ? 'Catálogo de Fusão' : 'Suas Mineradoras para Merge'}
              </h2>
              {mergeableCount > 0 ? (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-300">
                  {mergeableCount} {mergeableCount === 1 ? 'pronta para fundir' : 'prontas para fundir'}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {filterMode === 'catalog'
                ? `Todos os ${catalogCount} modelos que podem ser fundidos (Loja + Ofertas). Junte 2 iguais para evoluir.`
                : 'Máquinas que você possui agrupadas por modelo e nível de raridade.'}
            </p>
          </div>

          {/* Toggle: Somente Prontas vs Todas as Suas */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border-2 border-slate-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFilterMode('ready')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                filterMode === 'ready'
                  ? 'bg-emerald-500 text-slate-950 shadow-[2px_2px_0px_#000000]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              Prontas para Fundir ({mergeableCount})
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                filterMode === 'all'
                  ? 'bg-slate-800 text-white shadow-[2px_2px_0px_#000000]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Todas as Suas ({ownedOnly.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('catalog')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                filterMode === 'catalog'
                  ? 'bg-amber-500 text-slate-950 shadow-[2px_2px_0px_#000000]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Combine className="h-3.5 w-3.5" />
              Catálogo de Fusão ({catalogCount})
            </button>
          </div>
        </div>

        {filterMode === 'catalog' ? (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['all', `Todas (${catalogCount})`],
                ['catalog', `Loja (${ownedCandidates.filter((c) => (c.source ?? 'catalog') === 'catalog').length})`],
                ['offer', `Ofertas (${ownedCandidates.filter((c) => c.source === 'offer').length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCatalogSource(key)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  catalogSource === key
                    ? 'border-amber-500 bg-amber-500/15 text-amber-200'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar máquina..."
                className="rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        {/* Grade de Mineradoras do Jogador */}
        {filteredCandidates.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCandidates.map((c) => {
              const isSelected = selectedCandidateKey === candidateKey(c);
              const tierTheme = RARITY_THEME[c.currentTier] ?? RARITY_THEME.common;
              const nextTierTheme = RARITY_THEME[c.targetTier] ?? RARITY_THEME.uncommon;

              return (
                <div
                  key={candidateKey(c)}
                  onClick={() => handleSelectCandidate(c)}
                  className={`group relative flex flex-col rounded-2xl border-2 p-4 transition-all hover:scale-[1.01] shadow-[3px_3px_0px_#000000] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected
                      ? 'border-amber-400 bg-slate-900 ring-2 ring-amber-400/30'
                      : `${tierTheme.card} ${tierTheme.bg}`
                  }`}
                >
                  {/* Top Bar: Rarity Badge & Count */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${tierTheme.badge}`}
                    >
                      Nível {c.currentLevel} · {c.currentTierName}
                    </span>

                    <span
                      className={`font-mono text-xs font-black px-2 py-0.5 rounded-md ${
                        c.hasMachinePair
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {c.ownedCount} / 2
                    </span>
                  </div>

                  {/* Machine Image */}
                  <div className="aspect-[4/3] bg-slate-950/70 rounded-xl p-3 mb-3 flex items-center justify-center overflow-hidden">
                    <MachineImage
                      imageUrl={c.imageUrl}
                      name={c.name}
                      className="h-full w-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>

                  {/* Title & Hashrate */}
                  <div className="space-y-1.5 flex-1">
                    <h3 className="text-sm font-black text-white truncate">
                      {c.source === 'offer' ? (
                        <span className="mr-1.5 rounded bg-fuchsia-500/20 px-1.5 py-0.5 align-middle text-[9px] font-black uppercase text-fuchsia-300">
                          Oferta
                        </span>
                      ) : null}
                      {c.name}
                    </h3>

                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-slate-400 font-bold" title="Poder das 2 máquinas somadas">
                        2x {formatHashrate(c.currentHashRate)} ({formatHashrate(c.currentHashRate * 2)})
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-500" />
                      <span className="font-bold text-emerald-400">
                        {formatHashrate(c.targetHashRate)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 font-mono">
                      Evolução:{' '}
                      <span className={`font-bold ${nextTierTheme.text}`}>
                        {c.targetTierName} (+{c.boostPercent}%)
                      </span>
                    </p>
                  </div>

                  {/* Status Banner */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold">
                    {c.canMerge ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-black text-[11px]">
                        <Zap className="h-3.5 w-3.5 fill-current" />
                        PRONTA PARA FUSÃO
                      </span>
                    ) : c.ownedCount === 0 ? (
                      <Link
                        to={c.source === 'offer' ? '/offers' : '/shop'}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sky-400 hover:text-sky-300 text-[11px]"
                      >
                        Você não tem · {c.source === 'offer' ? 'ver Ofertas' : 'ver Loja'}
                      </Link>
                    ) : !c.hasMachinePair ? (
                      <span className="text-slate-500 text-[11px]">Falta {2 - c.ownedCount} máquina ({c.ownedCount}/2)</span>
                    ) : !c.hasParts ? (
                      <span className="text-red-400 text-[11px]">Faltam peças</span>
                    ) : (
                      <span className="text-amber-400 text-[11px]">Falta saldo p/ taxa</span>
                    )}

                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-amber-300 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/30 p-10 text-center space-y-3">
            <Cpu className="h-10 w-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">
              {filterMode === 'ready'
                ? 'Nenhuma máquina pronta para fundir agora.'
                : filterMode === 'catalog'
                  ? 'Nenhuma máquina encontrada.'
                  : 'Você não possui mineradoras para merge.'}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {filterMode === 'ready'
                ? 'Para fundir, você precisa de pelo menos 2 máquinas idênticas do mesmo nível, peças da receita e saldo em BLK.'
                : 'Adquira mineradoras na Loja ou ganhe em missões e eventos para começar a fundir!'}
            </p>
            {filterMode !== 'catalog' ? (
              <button
                type="button"
                onClick={() => setFilterMode('catalog')}
                className="mr-2 inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-black transition-colors"
              >
                Ver Catálogo de Fusão ({catalogCount})
              </button>
            ) : null}
            {filterMode === 'ready' && ownedOnly.length > 0 ? (
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 text-xs font-bold transition-colors"
              >
                Ver todas as suas máquinas ({ownedOnly.length})
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. SUAS PEÇAS & COMPONENTES (BOLSA DO JOGADOR)           */}
      {/* ======================================================== */}
      {/* 3. BOLSA DE PEÇAS & OFICINA DE FUSÃO DE COMPONENTES      */}
      {/* ======================================================== */}
      <div className="space-y-4 pt-4 border-t-2 border-slate-800">
        <FreePartsGuide rates={dropRates} />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
              <Puzzle className="h-5 w-5 text-sky-400" />
              Sua Bolsa de Peças & Oficina de Fusão
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {t('parts.bag_subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button
              type="button"
              onClick={() => setSelectedRarityTab('all')}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                selectedRarityTab === 'all'
                  ? 'border-sky-500 bg-sky-500/20 text-white'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
              }`}
            >
              Todas ({totalPlates})
            </button>
            {PART_RARITIES.map((r) => {
              const count = rarityCounts[r];
              const theme = RARITY_THEME[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRarityTab(r)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedRarityTab === r
                      ? `${theme.border} ${theme.bg} ${theme.text}`
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {t(theme.nameKey)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {filteredParts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
            {filteredParts.map((part) => {
              const r = partRarity(part);
              const theme = RARITY_THEME[r];
              const canCraft = r !== 'legendary' && part.quantity >= 5;
              const maxCraftCount = Math.floor(part.quantity / 5);
              const isCraftingThis = craftingKey === `${part.slug}:${r}`;

              return (
                <div
                  key={`${part.slug}:${r}`}
                  className={`relative flex flex-col justify-between rounded-2xl border-2 p-3 text-left shadow-[2px_2px_0px_#000000] transition-all ${theme.bg} ${theme.card}`}
                >
                  <div>
                    <div className="aspect-square bg-slate-950/60 rounded-xl p-2 mb-2 flex items-center justify-center border border-slate-800/80">
                      <img
                        src={part.imageUrl}
                        alt={part.slug}
                        className="h-full w-full object-contain [image-rendering:pixelated] drop-shadow"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase ${theme.badge}`}>
                          {t(theme.nameKey)}
                        </span>
                        <span className="font-mono text-xs font-black text-white bg-slate-800 px-1.5 py-0.5 rounded shadow-sm">
                          x{part.quantity}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white truncate" title={t(`parts.items.${part.slug}`, { defaultValue: part.slug })}>
                        {t(`parts.items.${part.slug}`, { defaultValue: part.slug })}
                      </p>
                    </div>
                  </div>

                  {/* Ação de Fusão de Peças (5 -> 1) */}
                  {r !== 'legendary' ? (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                      {canCraft ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isCraftingThis}
                            onClick={() => void handleCraftPart(part.slug, r, 1)}
                            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 active:translate-x-0.5 active:translate-y-0.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-[1px_1px_0px_#000000] transition-all disabled:opacity-50"
                            title="Fundir 5 peças para 1 de raridade superior"
                          >
                            {isCraftingThis ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Combine className="h-3 w-3" />
                            )}
                            5 → 1
                          </button>
                          {maxCraftCount > 1 ? (
                            <button
                              type="button"
                              disabled={isCraftingThis}
                              onClick={() => void handleCraftPart(part.slug, r, maxCraftCount)}
                              className="px-2 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-black uppercase transition-all"
                              title={`Fundir tudo (${maxCraftCount * 5}x → ${maxCraftCount}x)`}
                            >
                              Max
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-[9px] font-semibold text-slate-500 text-center">
                          {part.quantity}/5 para fundir
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-800 bg-slate-900/40 p-8 text-center space-y-3">
            <Gift className="h-10 w-10 text-slate-600 mx-auto" />
            <div>
              <p className="text-sm font-bold text-slate-300">
                Sua bolsa de peças está vazia no momento.
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {t('parts.bag_empty_hint')}
              </p>
            </div>
            <Link
              to="/offerwall"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-black uppercase tracking-wider transition-colors"
            >
              <Gift className="h-4 w-4" />
              Ir para o Offerwall
            </Link>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. TABELA DE NÍVEIS & RARIDADES (ÁRVORE DO JOGO)          */}
      {/* ======================================================== */}
      <div className="space-y-4 pt-4 border-t-2 border-slate-800">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-amber-400" />
          <h2 className="text-base font-black uppercase tracking-wider text-white">
            {t('parts.rarity_tree_title')}
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border-2 border-slate-800 bg-slate-900/60 shadow-[3px_3px_0px_#000000]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400 border-b-2 border-slate-800 font-black">
              <tr>
                <th className="p-3.5">Nível</th>
                <th className="p-3.5">Raridade</th>
                <th className="p-3.5">Cor</th>
                <th className="p-3.5">Requisito de Fusão</th>
                <th className="p-3.5">Multiplicador de Poder</th>
                <th className="p-3.5">Taxa da Forja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-medium">
              {[
                { lvl: 1, name: 'Common (Comum)', color: 'Branco / Cinza', badgeColor: 'text-slate-300', req: 'Nível básico de fábrica', bonus: '1.0x (Poder Padrão)', fee: '—' },
                { lvl: 2, name: 'Uncommon (Incomum)', color: 'Verde', badgeColor: 'text-emerald-400 font-bold', req: '2x Máquinas Comuns idênticas + peças comuns', bonus: '+30% Hashrate', fee: `${feePercentBlk}% em BLK · ${feePercentCrypto}% em POL/SHIB` },
                { lvl: 3, name: 'Rare (Raro)', color: 'Azul', badgeColor: 'text-sky-400 font-bold', req: '2x Máquinas Incomuns idênticas + peças incomuns', bonus: '+75% Hashrate', fee: `${feePercentBlk}% em BLK · ${feePercentCrypto}% em POL/SHIB` },
                { lvl: 4, name: 'Epic (Épico)', color: 'Roxo', badgeColor: 'text-purple-400 font-bold', req: '2x Máquinas Raras idênticas + peças raras', bonus: '+130% Hashrate', fee: `${feePercentBlk}% em BLK · ${feePercentCrypto}% em POL/SHIB` },
                { lvl: 5, name: 'Legendary (Lendário)', color: 'Dourado / Laranja', badgeColor: 'text-amber-400 font-bold', req: '2x Máquinas Épicas idênticas + peças épicas', bonus: '+200% Hashrate (Topo do Jogo)', fee: `${feePercentBlk}% em BLK · ${feePercentCrypto}% em POL/SHIB` },
              ].map((tier) => (
                <tr key={tier.lvl} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-white">Nível {tier.lvl}</td>
                  <td className="p-3.5 font-bold text-white">{tier.name}</td>
                  <td className={`p-3.5 ${tier.badgeColor}`}>{tier.color}</td>
                  <td className="p-3.5 text-slate-300">{tier.req}</td>
                  <td className="p-3.5 font-bold text-emerald-400">{tier.bonus}</td>
                  <td className="p-3.5 font-mono text-amber-300">{tier.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
