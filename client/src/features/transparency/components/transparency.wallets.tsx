import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  Server,
  ExternalLink,
  Wallet,
  Copy,
  Check as CheckIcon,
  Activity,
  ImageIcon,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import {
  INVESTMENT_WALLET_ADDRESS,
  isLegacyWallet,
  LiquidityPoolEntry,
  TrackedWalletEntry,
  getInvestmentBreakdown,
  WalletsLiveResponse,
  DISPLAY_MODE_CONFIG,
  DisplayModeKey,
  WALLETS_POLL_INTERVAL_MS,
  WALLETS_MAX_RETRIES,
} from './transparency.base';
import { useTranslation } from 'react-i18next';

export function WalletCard({ wallet, loading }: { wallet: TrackedWalletEntry; loading: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const mode = (wallet.displayMode ?? 'total_received') as DisplayModeKey;
  const cfg = DISPLAY_MODE_CONFIG[mode] ?? DISPLAY_MODE_CONFIG.total_received;
  const modeLabel = t(`transparency.wallets.mode_${mode}`, cfg.label);
  const explorerUrl = `${wallet.explorerBaseUrl || 'https://polygonscan.com/address'}/${wallet.address}`;
  const isManualValue = wallet.manualUsdValue != null;
  const isInvestment = wallet.address.toLowerCase() === INVESTMENT_WALLET_ADDRESS.toLowerCase();
  // Manual override hides the on-chain breakdown entirely.
  const investmentBreakdown = isInvestment && !isManualValue ? getInvestmentBreakdown(wallet) : null;
  const isDeprecated = isLegacyWallet(wallet);

  const handleCopy = () => {
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className={`rounded-2xl border ${isDeprecated ? 'border-red-500/40' : cfg.border} ${isDeprecated ? 'bg-red-950/10' : cfg.bg} overflow-hidden`}>
      <div className={`flex items-center gap-3 px-5 py-3.5 border-b ${isDeprecated ? 'border-red-500/20 bg-red-500/5' : `${cfg.headerBorder} ${cfg.headerBg}`}`}>
        <div className={`w-8 h-8 rounded-xl ${isDeprecated ? 'bg-red-500/15' : cfg.iconBg} flex items-center justify-center shrink-0`}>
          <Wallet className={`w-4 h-4 ${isDeprecated ? 'text-red-400' : cfg.iconColor}`} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white leading-tight truncate">{wallet.label || t('transparency.wallets.label_fallback')}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${isDeprecated ? 'text-red-400' : cfg.iconColor}`}>{modeLabel}</p>
        </div>
        {isDeprecated && (
          <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
            {t('transparency.wallets.deprecated_badge')}
          </span>
        )}
        {!isDeprecated && wallet.isActive === false && (
          <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 uppercase tracking-wider">{t('transparency.wallets.inactive_badge')}</span>
        )}
      </div>

      {isDeprecated && (
        <div className="mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-xs font-black text-red-300 uppercase tracking-wider mb-0.5">{t('transparency.wallets.deprecated_badge')}</p>
            <p className="text-[11px] text-red-300/70 leading-relaxed">{t('transparency.wallets.deprecated_description')}</p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
          <code className="text-[11px] text-gray-400 font-mono break-all flex-1 select-all">{wallet.address}</code>
          <button
            onClick={handleCopy}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label={copied ? t('transparency.wallets.copied') : t('transparency.wallets.copy_address')}
          >
            {copied ? <CheckIcon className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className={`rounded-xl border ${isDeprecated ? 'border-red-500/15' : isManualValue ? 'border-amber-500/25' : 'border-white/8'} bg-black/20 p-4`}>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2 flex-wrap">
            <span>
              {isManualValue ? t('transparency.wallets.manual_value_label', 'Valor declarado') : modeLabel}
              {' · '}
              {!isManualValue && mode === 'current_balance' && wallet.chains && wallet.chains.length > 1 ? t('transparency.wallets.multi_chain') : 'Polygon'}
            </span>
            {!isManualValue && mode === 'current_balance' && wallet.fetchedAt && (
              <span className="text-gray-700 normal-case tracking-normal font-normal">
                · {t('transparency.wallets.updated')} {new Date(wallet.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {isManualValue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[9px] font-black tracking-wider normal-case">
                <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
                {t('transparency.wallets.off_chain_badge', 'Off-chain')}
              </span>
            )}
          </p>
          {isManualValue && wallet.manualValueNote && (
            <p className="mb-2 text-[11px] text-amber-200/80 leading-snug">{wallet.manualValueNote}</p>
          )}
          {loading
            ? <div className="h-8 w-40 bg-white/5 rounded-lg animate-pulse" />
            : mode === 'current_balance'
              ? <>
                  {wallet.valueUsd != null
                    ? <>
                        <p className="text-2xl font-black text-white">
                          ${wallet.valueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-sm text-gray-500 ml-2">USD</span>
                        </p>
                        {wallet.valuePol != null && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {wallet.valuePol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {t('transparency.wallets.pol_liquid')}
                          </p>
                        )}
                        {isInvestment && investmentBreakdown && (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="rounded-lg bg-white/5 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-widest text-gray-500">Saldo Liquido</p>
                              <p className="text-sm font-black text-white">
                                ${investmentBreakdown.liquidUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="rounded-lg bg-white/5 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-widest text-gray-500">LPs Ativas</p>
                              <p className="text-sm font-black text-white">
                                ${investmentBreakdown.lpUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            {investmentBreakdown.liquidStableUsd > 0 && (
                              <div className="rounded-lg bg-white/5 px-3 py-2 sm:col-span-2">
                                <p className="text-[10px] uppercase tracking-widest text-gray-500">Stablecoins Liquidas</p>
                                <p className="text-sm font-black text-white">
                                  ${investmentBreakdown.liquidStableUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    : <p className="text-sm text-gray-600">{t('transparency.wallets.unavailable')}</p>
                  }
                </>
              : wallet.valueUsd != null || wallet.valuePol != null
                ? <>
                    {wallet.valueUsd != null
                      ? <p className="text-2xl font-black text-white">
                          ${wallet.valueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-sm text-gray-500 ml-2">USD</span>
                        </p>
                      : null
                    }
                    {wallet.valuePol != null && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {wallet.valuePol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        <span className={`ml-1 ${cfg.valueBadge}`}>{wallet.assetSymbol || 'POL'}</span>
                      </p>
                    )}
                  </>
                : <p className="text-sm text-gray-600">{t('transparency.wallets.unavailable')}</p>
          }
        </div>

        {!loading && mode === 'current_balance' && wallet.chains && wallet.chains.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3 h-3 text-amber-400" aria-hidden="true" />
              {t('transparency.wallets.chains_breakdown')}
            </p>
            {wallet.chains.map(c => (
              <div key={c.chainId} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-black text-white bg-white/8 rounded px-1.5 py-0.5 shrink-0 uppercase">{c.name}</span>
                  <span className="text-[10px] text-gray-500">
                    {c.nativeBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {c.nativeSymbol}
                  </span>
                  {c.tokens.length > 0 && (
                    <span className="text-[9px] text-gray-700">+{c.tokens.length} token{c.tokens.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <span className="text-[11px] font-black text-white shrink-0">
                  {c.totalChainUsd != null
                    ? `$${c.totalChainUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 ${isDeprecated ? 'bg-red-500/10 text-red-400' : cfg.chainBadge}`}>
            {wallet.chain || 'polygon'}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 bg-white/5 text-slate-400">
            {wallet.assetSymbol || 'POL'}
          </span>
          {isInvestment && (
            <a
              href={`https://debank.com/profile/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              DeBank <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


export function LiquidityPoolsPanel({ wallets }: { wallets: TrackedWalletEntry[] }) {
  const { t } = useTranslation();

  // Only active pools — grouped by chain
  const pools = wallets
    .flatMap((w) => (w.liquidityPools ?? []).filter((p) => p.status === 'active').map((p) => ({ ...p, walletAddress: w.address })));

  const grouped = pools.reduce<Record<string, Array<LiquidityPoolEntry & { walletAddress: string }>>>((acc, p) => {
    const key = (p.chainName || 'unknown').toUpperCase();
    acc[key] ||= [];
    acc[key].push(p);
    return acc;
  }, {});

  if (pools.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-violet-400" aria-hidden="true" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            {t('transparency.wallets.tab_liquidity_pools')}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/2 px-4 py-8 text-center text-sm text-gray-500">
          {t('transparency.wallets.no_liquidity_pools')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-violet-400" aria-hidden="true" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
          {t('transparency.wallets.tab_liquidity_pools')}
        </p>
      </div>
      <div className="space-y-5">
        {Object.entries(grouped).map(([chainName, chainPools]) => (
          <div key={chainName} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 bg-emerald-500/10 text-emerald-300">
                {chainName}
              </span>
              <span className="text-[10px] text-gray-500">
                {chainPools.length} pool{chainPools.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {chainPools.map((nft) => (
                <a
                  key={`${nft.contractAddress}:${nft.tokenId}`}
                  href={nft.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="overflow-hidden rounded-3xl border border-emerald-500/15 bg-gradient-to-b from-emerald-950/20 to-slate-950/40 hover:border-emerald-500/30 shadow-lg shadow-emerald-950/10 transition-colors group"
                >
                  <div className="p-3 pb-0">
                    {nft.imageUrl ? (
                      <div className="w-full overflow-hidden rounded-2xl border border-white/8 bg-black/20 flex items-center justify-center" style={{ minHeight: 320 }}>
                        <div className="h-full w-full max-w-[220px] flex items-center justify-center" style={{ aspectRatio: '10 / 16' }}>
                          <img
                            src={nft.imageUrl}
                            alt={nft.name || nft.poolLabel || `LP NFT #${nft.tokenId}`}
                            className="max-w-full max-h-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.02]"
                            onError={(e: SyntheticEvent<HTMLImageElement>) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) parent.style.display = 'none';
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-violet-950/20" style={{ minHeight: 320 }}>
                        <div className="h-full w-full max-w-[220px] flex items-center justify-center" style={{ aspectRatio: '10 / 16' }}>
                          <ImageIcon className="w-10 h-10 text-violet-900" aria-hidden="true" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 pt-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-1 bg-emerald-500/10 text-emerald-300">
                          {t('transparency.wallets.active_pools')}
                        </span>
                        <p className="text-base font-black text-violet-100 truncate mt-1">
                          {nft.poolLabel || nft.name || `LP NFT #${nft.tokenId}`}
                        </p>
                        <p className="text-[11px] text-violet-200/60 truncate mt-0.5">
                          NFT #{nft.tokenId}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-violet-500 group-hover:text-violet-300 shrink-0 mt-0.5" aria-hidden="true" />
                    </div>
                    {nft.liquidityUsd != null && (
                      <p className="text-lg font-black text-white">
                        ${nft.liquidityUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                    <div className="rounded-xl bg-black/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-widest text-violet-200/40 mb-1">Wallet</p>
                      <p className="text-[11px] text-violet-200/55 truncate font-mono">{nft.walletAddress}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


type ExternalInvestment = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  amountInvestedUsd: number | string;
  amountWithdrawnUsd: number | string;
  roiForecast: string | null;
};

function formatUsd(value: number | string): string {
  const n = Number(value) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ExternalInvestmentCard({ investment }: { investment: ExternalInvestment }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-white/8 bg-white/2 p-5 space-y-4">
      <div className="flex items-center gap-3">
        {investment.imageUrl ? (
          <img src={investment.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-white/10" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 grid place-items-center">
            <TrendingUp className="w-5 h-5 text-gray-500" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{investment.name}</p>
          {investment.linkUrl && (
            <a
              href={investment.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
            >
              {investment.linkUrl.replace(/^https?:\/\//, '')}
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {investment.description && (
        <p className="text-xs leading-relaxed text-gray-400">{investment.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3 border-t border-white/8 pt-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600">
            {t('transparency.external_investments.invested', 'Investido')}
          </p>
          <p className="text-sm font-black text-white">{formatUsd(investment.amountInvestedUsd)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600">
            {t('transparency.external_investments.withdrawn', 'Sacado')}
          </p>
          <p className="text-sm font-black text-white">{formatUsd(investment.amountWithdrawnUsd)}</p>
        </div>
      </div>

      {investment.roiForecast && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-violet-400">
            {t('transparency.external_investments.roi_forecast', 'Previsão de ROI')}
          </p>
          <p className="text-xs font-bold text-violet-200">{investment.roiForecast}</p>
        </div>
      )}
    </div>
  );
}

function ExternalInvestmentsPanel() {
  const { t } = useTranslation();
  const [investments, setInvestments] = useState<ExternalInvestment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transparency/external-investments')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.ok) setInvestments(json.investments ?? []);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);

  if (investments === null) {
    return <div className="rounded-2xl border border-white/8 bg-white/2 h-48 animate-pulse" />;
  }

  if (investments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/2 px-4 py-10 text-center">
        <p className="text-sm font-black text-white uppercase tracking-widest">
          {t('transparency.wallets.tab_external_investments', 'Outros Investimentos')}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          {t('transparency.external_investments.empty', 'Nenhum investimento externo cadastrado no momento.')}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {investments.map((inv) => (
        <ExternalInvestmentCard key={inv.id} investment={inv} />
      ))}
    </div>
  );
}

function dedupeWalletsByAddress(wallets: TrackedWalletEntry[]): TrackedWalletEntry[] {
  const seen = new Set<string>();
  return wallets.filter((w) => {
    const key = w.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function WalletsLiveSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<WalletsLiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [warming, setWarming] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'liquidity_pools' | 'bot_sport' | 'external_investments'>('overview');

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    const fetchWallets = async () => {
      try {
        const res = await fetch('/api/transparency/wallets-live');
        if (cancelled || !res.ok) return;
        const json: WalletsLiveResponse = await res.json();
        if (!json.ok) return;

        if (json.warming || !json.wallets?.length) {
          // Server cache is still warming — show indicator and schedule retry
          setWarming(true);
          setLoading(false);
          if (retries < WALLETS_MAX_RETRIES) {
            retries++;
            setTimeout(() => { if (!cancelled) void fetchWallets(); }, WALLETS_POLL_INTERVAL_MS);
          }
          return;
        }

        setWarming(false);
        setData(json);
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchWallets();
    return () => { cancelled = true; };
  }, []);

  const wallets = data?.wallets ?? [];
  const activeWallets = dedupeWalletsByAddress(wallets.filter((w) => !isLegacyWallet(w)));
  const legacyWallets = dedupeWalletsByAddress(wallets.filter((w) => isLegacyWallet(w)));
  const showSection = loading || warming || wallets.length > 0;
  if (!showSection) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ['overview', t('transparency.wallets.tab_overview')],
          ['liquidity_pools', t('transparency.wallets.tab_liquidity_pools')],
          ['bot_sport', t('transparency.wallets.tab_bot_sport')],
          ['external_investments', t('transparency.wallets.tab_external_investments', 'Outros Investimentos')],
        ] as const).map(([tabKey, label]) => {
          const active = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                active
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                  : 'bg-black/20 text-gray-500 border border-white/8 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <>
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('transparency.wallets.section_title')}</p>
        {warming && (
          <span className="ml-2 flex items-center gap-1.5 text-[10px] text-amber-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {t('transparency.wallets.warming')}
          </span>
        )}
        {data?.polUsdPrice != null && (
          <span className="ml-auto text-[10px] text-gray-600">
            1 POL ≈ ${data.polUsdPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USD
          </span>
        )}
      </div>
      {(loading || warming) && !wallets.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl border border-white/8 bg-white/2 h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {activeWallets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeWallets.map(w => (
                <WalletCard key={w.id ?? w.address} wallet={w} loading={loading} />
              ))}
            </div>
          )}

          {legacyWallets.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {t('transparency.wallets.legacy_section_title')}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {legacyWallets.map(w => (
                  <WalletCard key={w.id ?? w.address} wallet={w} loading={loading} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {activeTab === 'liquidity_pools' && !loading && !warming && (
        <LiquidityPoolsPanel wallets={wallets} />
      )}

      {activeTab === 'liquidity_pools' && (loading || warming) && !wallets.length && (
        <div className="rounded-2xl border border-white/8 bg-white/2 h-48 animate-pulse" />
      )}

      {activeTab === 'bot_sport' && (
        <div className="rounded-2xl border border-white/8 bg-white/2 px-4 py-10 text-center">
          <p className="text-sm font-black text-white uppercase tracking-widest">
            {t('transparency.wallets.tab_bot_sport')}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {t('transparency.wallets.coming_soon')}
          </p>
        </div>
      )}

      {activeTab === 'external_investments' && <ExternalInvestmentsPanel />}
    </div>
  );
}

// ─── Main page component ─────────────────────────────────────────────────────

/**
 * Public transparency portal page.
 * Displays all active expense/income entries with charts, KPI cards and
 * the on-chain investment wallet snapshot.
 *
 * All user-visible strings are internationalised via react-i18next.
 * Renders an in-page error state when the API call fails, and per-image
 * onError handlers prevent broken-image UI glitches.
 */
