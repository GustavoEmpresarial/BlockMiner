import type { Dispatch, SetStateAction } from 'react';
import type { WalletTFunction } from '../lib/wallet.i18n';
import {
    AlertTriangle,
    ExternalLink,
    Loader2,
    LogOut,
    AlertCircle,
    ShieldCheck,
    Send,
    Clock,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { isAddress } from 'ethers';
import type { PendingDepositRow } from '../lib/wallet.types';
import { canUseInjectedDepositChannel } from '../../../shared/utils/depositChannel';
import { WalletConnectWordmark } from './walletPage.utils';
import { preloadWalletConnectProvider } from '../lib/walletConnectProvider';

export interface WalletDepositTabProps {
    t: WalletTFunction;
    depositChannel: string;
    setDepositChannel: Dispatch<SetStateAction<string>>;
    systemContractAddress: string | null;
    systemDepositAddress: string | null;
    walletConnectConfigured: boolean;
    kitConnected: boolean;
    isConnected: boolean;
    isConnecting: boolean;
    polygonHdFeatureVisible: boolean;
    polygonHdDepositEnabled: boolean;
    polygonHdMissingEnvKeys: string[];
    polygonHdMinPol: number;
    polygonHdLoadError: string;
    polygonHdAddress: string;
    injectedDiscovery: 'scanning' | 'none' | 'found';
    detectedWalletName: string | null;
    evmAccount: string | null | undefined;
    depositForm: { amount: string };
    setDepositForm: Dispatch<SetStateAction<{ amount: string }>>;
    pendingDeposits: PendingDepositRow[];
    minDepositPol: number;
    blockConfirmations: number;
    depositVerifyMaxAttempts: number;
    showWalletSessionCancel: boolean;
    isActionLoading: boolean;
    copyToClipboard: (text: string) => void;
    connectWalletConnect: () => Promise<unknown> | void;
    connect: (opts?: { useBrowserExtension?: boolean }) => Promise<unknown> | void;
    cancelWalletSession: () => Promise<unknown> | void;
    handleAutoDeposit: () => void | Promise<void>;
}

/** Deposit tab: channel selector (smart contract / WalletConnect / Polygon HD) + express deposit + pending list. Extracted from WalletPage. */
export function WalletDepositTab({
    t,
    depositChannel,
    setDepositChannel,
    systemContractAddress,
    systemDepositAddress,
    walletConnectConfigured,
    kitConnected,
    isConnected,
    isConnecting,
    polygonHdFeatureVisible,
    polygonHdDepositEnabled,
    polygonHdMissingEnvKeys,
    polygonHdMinPol,
    polygonHdLoadError,
    polygonHdAddress,
    injectedDiscovery,
    detectedWalletName,
    evmAccount,
    depositForm,
    setDepositForm,
    pendingDeposits,
    minDepositPol,
    blockConfirmations,
    depositVerifyMaxAttempts,
    showWalletSessionCancel,
    isActionLoading,
    copyToClipboard,
    connectWalletConnect,
    connect,
    cancelWalletSession,
    handleAutoDeposit,
}: WalletDepositTabProps) {
    // Do not preload WalletConnect/AppKit on mount — that chunk init feels like a full
    // page reload. Warm only on hover/focus of the WalletConnect control (below).

    return (
                                <form onSubmit={(e) => e.preventDefault()} className="space-y-6 sm:space-y-8">
                                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setDepositChannel('smart_contract')}
                                            disabled={
                                                !canUseInjectedDepositChannel(
                                                    systemContractAddress,
                                                    systemDepositAddress,
                                                )
                                            }
                                            className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                                                depositChannel === 'smart_contract'
                                                    ? 'border-primary bg-primary/15 text-white shadow-lg shadow-primary/10'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            {t('wallet.deposit_options.smart_contract')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDepositChannel('walletconnect')}
                                            onPointerEnter={preloadWalletConnectProvider}
                                            onFocus={preloadWalletConnectProvider}
                                            disabled={!walletConnectConfigured}
                                            className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all flex flex-col items-center justify-center gap-2 px-2 ${
                                                depositChannel === 'walletconnect'
                                                    ? 'border-primary bg-primary/15 text-white shadow-lg shadow-primary/10'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            <WalletConnectWordmark
                                                className={`h-3 sm:h-3.5 w-auto max-w-[min(100%,7.5rem)] object-contain shrink-0 ${
                                                    depositChannel === 'walletconnect'
                                                        ? 'brightness-0 invert opacity-95'
                                                        : 'brightness-0 invert opacity-45'
                                                }`}
                                                alt={t('wallet.deposit_options.walletconnect_logo_alt')}
                                            />
                                            <span className="text-center leading-tight">
                                                {t('wallet.deposit_options.walletconnect')}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDepositChannel('polygon_hd')}
                                            className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                                                depositChannel === 'polygon_hd'
                                                    ? 'border-primary bg-primary/15 text-white shadow-lg shadow-primary/10'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}
                                        >
                                            {t('wallet.polygon_hd.option_label')}
                                        </button>
                                    </div>
                                    {depositChannel !== 'polygon_hd' ? (
                                        <p className="text-[9px] text-slate-600 font-bold text-center leading-relaxed">
                                            {t('wallet.deposit_options.hint')}
                                        </p>
                                    ) : null}
                                    {depositChannel !== 'polygon_hd' &&
                                    depositChannel === 'smart_contract' &&
                                    kitConnected ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed">
                                            {t('wallet.web3_deposit.hint_disconnect_for_contract')}
                                        </p>
                                    ) : null}
                                    {depositChannel !== 'polygon_hd' &&
                                    depositChannel === 'walletconnect' &&
                                    isConnected &&
                                    !kitConnected ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed">
                                            {t('wallet.web3_deposit.hint_disconnect_for_wc')}
                                        </p>
                                    ) : null}
                                    {!polygonHdFeatureVisible && depositChannel !== 'polygon_hd' ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed px-1">
                                            {t('wallet.polygon_hd.server_env_hint')}
                                        </p>
                                    ) : null}
                                    {polygonHdFeatureVisible &&
                                    !polygonHdDepositEnabled &&
                                    polygonHdMissingEnvKeys.length > 0 &&
                                    depositChannel !== 'polygon_hd' ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed px-1">
                                            {t('wallet.polygon_hd.disabled_hint_keys', {
                                                keys: polygonHdMissingEnvKeys.join(', ')
                                            })}
                                        </p>
                                    ) : null}
                                    {depositChannel === 'polygon_hd' ? (
                                        !polygonHdFeatureVisible ? (
                                            <div className="p-5 sm:p-6 rounded-3xl border border-amber-500/30 bg-amber-950/20 space-y-3">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-amber-200">
                                                    {t('wallet.polygon_hd.title')}
                                                </h4>
                                                <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
                                                    {t('wallet.polygon_hd.server_flag_off_panel')}
                                                </p>
                                            </div>
                                        ) : (
                                        <div className="p-5 sm:p-6 rounded-3xl border border-teal-500/25 bg-teal-950/20 flex flex-col gap-4 min-h-[280px] max-w-xl mx-auto w-full">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-teal-300">
                                                    {t('wallet.polygon_hd.title')}
                                                </h4>
                                                <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                    {t('wallet.polygon_hd.body')}
                                                </p>
                                                <p className="text-[9px] text-slate-500 font-bold">
                                                    {t('wallet.polygon_hd.network_hint')}
                                                </p>
                                                <div
                                                    role="alert"
                                                    className="rounded-xl border border-amber-500/45 bg-amber-950/40 px-3 py-2 sm:px-3.5 sm:py-2.5 flex gap-2 sm:gap-2.5 items-start shadow-md shadow-amber-950/20"
                                                >
                                                    <AlertTriangle
                                                        className="w-4 h-4 sm:w-4 sm:h-4 text-amber-400 shrink-0 mt-0.5"
                                                        aria-hidden
                                                    />
                                                    <div className="space-y-1 min-w-0">
                                                        <p className="text-[11px] sm:text-xs font-black uppercase tracking-wide text-amber-100 leading-snug">
                                                            {t('wallet.polygon_hd.min_deposit_banner_title', {
                                                                min: polygonHdMinPol
                                                            })}
                                                        </p>
                                                        <p className="text-[10px] sm:text-[11px] font-bold text-amber-100/90 leading-relaxed">
                                                            {t('wallet.polygon_hd.min_deposit_banner_warning')}
                                                        </p>
                                                    </div>
                                                </div>
                                                {polygonHdLoadError ? (
                                                    <p className="text-[9px] text-rose-300 font-bold whitespace-pre-wrap">
                                                        {polygonHdLoadError}
                                                    </p>
                                                ) : polygonHdAddress ? (
                                                    <>
                                                        <div className="flex justify-center p-3 bg-white rounded-2xl self-center">
                                                            <QRCodeSVG
                                                                value={polygonHdAddress}
                                                                size={168}
                                                                level="M"
                                                                title={t('wallet.polygon_hd.qr_alt')}
                                                            />
                                                        </div>
                                                        <p className="text-[10px] font-mono text-teal-100/90 font-bold break-all text-center">
                                                            {polygonHdAddress}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 justify-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(polygonHdAddress)}
                                                                className="py-2.5 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest border border-teal-500/40 text-teal-200 hover:bg-teal-950/50"
                                                            >
                                                                {t('wallet.polygon_hd.copy')}
                                                            </button>
                                                            <a
                                                                href={`https://polygonscan.com/address/${polygonHdAddress}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="py-2.5 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-700 border border-slate-600 inline-flex items-center gap-1"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                {t('wallet.polygon_hd.open_explorer')}
                                                            </a>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="text-[9px] text-slate-500 font-bold flex items-center gap-2">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        {t('wallet.processing')}
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
                                        <div className="p-5 sm:p-6 rounded-3xl border border-indigo-500/25 bg-indigo-950/20 flex flex-col gap-4 min-h-[280px]">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-indigo-300">
                                                {t('wallet.web3_deposit.title')}
                                            </h4>
                                            <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                {depositChannel === 'smart_contract'
                                                    ? systemContractAddress &&
                                                      isAddress(String(systemContractAddress).trim())
                                                        ? t('wallet.web3_deposit.smart_contract_hint')
                                                        : systemDepositAddress &&
                                                            isAddress(String(systemDepositAddress).trim())
                                                          ? t('wallet.web3_deposit.treasury_browser_hint')
                                                          : t('wallet.web3_deposit.no_deposit_config')
                                                    : t('wallet.deposit_options.walletconnect_hint')}
                                            </p>
                                            {depositChannel === 'smart_contract' && !isConnected ? (
                                                <p className="text-[10px] text-center font-bold leading-relaxed text-slate-400">
                                                    {injectedDiscovery === 'scanning'
                                                        ? t('wallet.web3_deposit.injected_scanning')
                                                        : injectedDiscovery === 'none'
                                                          ? t('wallet.web3_deposit.no_browser_wallet')
                                                          : detectedWalletName?.toLowerCase().includes('rabby')
                                                            ? t('wallet.web3_deposit.injected_detected_rabby')
                                                            : t('wallet.web3_deposit.injected_detected_name', {
                                                                  name: detectedWalletName ?? 'Web3',
                                                              })}
                                                </p>
                                            ) : null}
                                            {depositChannel === 'walletconnect' && !walletConnectConfigured ? (
                                                <p className="text-[9px] text-amber-300/90 font-bold leading-relaxed">
                                                    {t('wallet.web3_deposit.wc_missing_build')}
                                                </p>
                                            ) : null}
                                            {depositChannel === 'walletconnect' && walletConnectConfigured ? (
                                                <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                    {t('wallet.web3_deposit.wc_explorer_domains_hint')}
                                                </p>
                                            ) : null}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void (depositChannel === 'walletconnect'
                                                                ? connectWalletConnect()
                                                                : connect({ useBrowserExtension: true }))
                                                        }
                                                        disabled={isConnecting}
                                                        className="flex-1 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-95 transition-opacity disabled:opacity-50 flex flex-col sm:flex-row items-center justify-center gap-2 px-3"
                                                    >
                                                        {depositChannel === 'walletconnect' &&
                                                        walletConnectConfigured &&
                                                        !isConnecting ? (
                                                            <WalletConnectWordmark
                                                                className="h-3 w-auto max-w-[6.5rem] object-contain brightness-0 invert shrink-0"
                                                                alt={t('wallet.deposit_options.walletconnect_logo_alt')}
                                                            />
                                                        ) : null}
                                                        <span>
                                                            {isConnecting
                                                                ? t('wallet.web3_deposit.connecting')
                                                                : depositChannel === 'smart_contract'
                                                                    ? t('wallet.web3_deposit.connect_browser')
                                                                    : walletConnectConfigured
                                                                        ? t('wallet.web3_deposit.connect_wc')
                                                                        : t('wallet.web3_deposit.connect_browser')}
                                                        </span>
                                                    </button>
                                                    {showWalletSessionCancel ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => void cancelWalletSession()}
                                                            className="sm:min-w-[140px] py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-600 text-slate-300 hover:bg-slate-800/80 transition-colors"
                                                        >
                                                            {t('wallet.web3_deposit.cancel_connection')}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {isConnected && evmAccount ? (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-emerald-300/90 font-mono font-bold break-all">
                                                        {t('wallet.web3_deposit.linked_label')}: {evmAccount}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => void cancelWalletSession()}
                                                        className="w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest border border-rose-500/40 text-rose-300/90 hover:bg-rose-950/40 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <LogOut className="w-3.5 h-3.5" />
                                                        {t('wallet.web3_deposit.disconnect')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="text-[9px] text-slate-600 font-bold">
                                                    {t('wallet.web3_deposit.link_prompt')}
                                                </p>
                                            )}
                                            <p className="text-[9px] text-slate-500 font-bold mt-auto">
                                                {t('wallet.web3_deposit.min_deposit', { min: minDepositPol })}
                                            </p>
                                        </div>

                                        <div className="p-5 sm:p-6 rounded-3xl border border-slate-800/80 bg-slate-950/50 flex flex-col gap-4 min-h-[280px]">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-200">
                                                {t('wallet.express_deposit')}
                                            </h4>
                                            <div className="flex gap-3">
                                                <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-slate-500 leading-relaxed font-bold">
                                                    {t('wallet.express_mode_note', { n: blockConfirmations })}
                                                </p>
                                            </div>
                                            <div className="flex gap-3">
                                                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-slate-500 leading-relaxed font-bold">
                                                    {t('wallet.web3_deposit.express_safety')}
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                                                    {t('wallet.amount_to_add')}
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={depositForm.amount}
                                                    onChange={(e) => setDepositForm({ amount: e.target.value })}
                                                    placeholder="0.00"
                                                    className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-2xl py-4 px-4 text-slate-200 text-sm font-black transition-all outline-none"
                                                />
                                                <p className="text-[9px] text-slate-600 font-bold ml-1">
                                                    {t('wallet.min_deposit_hint', { min: minDepositPol })}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAutoDeposit}
                                                disabled={
                                                    isActionLoading ||
                                                    (!systemDepositAddress && !systemContractAddress)
                                                }
                                                className="w-full mt-auto min-h-[44px] py-4 sm:py-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-tight sm:tracking-[0.1em] transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                <Send className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                                                {systemContractAddress
                                                    ? t('wallet.web3_deposit.deposit_pol_button')
                                                    : t('wallet.express_deposit')}
                                            </button>
                                            {!systemDepositAddress && !systemContractAddress ? (
                                                <p className="text-[10px] text-amber-300 font-bold text-center">
                                                    {t('wallet.web3_deposit.no_deposit_config')}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    )}

                                    {/* Painel de depósitos em verificação */}
                                    {pendingDeposits.length > 0 && (
                                        <div className="space-y-3 animate-in fade-in duration-500">
                                            <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                                {t('wallet.pending_deposits_title')}
                                            </h4>
                                            <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-hide">
                                                {pendingDeposits.map(dep => {
                                                    const isPending =
                                                        dep.status === 'pending_verification';
                                                    const isOk = dep.status === 'completed';
                                                    return (
                                                        <div key={dep.id} className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                                                            isPending ? 'bg-indigo-500/5 border-indigo-500/20' :
                                                            isOk ? 'bg-emerald-500/5 border-emerald-500/20' :
                                                            'bg-red-500/5 border-red-500/20'
                                                        }`}>
                                                            <div className="flex items-center gap-3">
                                                                {isPending
                                                                    ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                                                                    : isOk
                                                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                                                        : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                                                                }
                                                                <div>
                                                                    <p className="text-[9px] font-mono text-slate-400">
                                                                        {dep.txHash
                                                                              ? `${dep.txHash.slice(0, 10)}...${dep.txHash.slice(-6)}`
                                                                              : 'N/A'}
                                                                    </p>
                                                                    <p className="text-[9px] text-slate-600">
                                                                        {isPending ? (
                                                                            <>
                                                                                {t('wallet.verifying_attempt', {
                                                                                    current: dep.verifyAttempts,
                                                                                    max:
                                                                                        dep.verifyMaxAttempts ??
                                                                                        depositVerifyMaxAttempts
                                                                                })}
                                                                                {typeof dep.confirmationsCurrent ===
                                                                                    'number' && dep.confirmationsRequired ? (
                                                                                    <span className="block mt-0.5 text-indigo-300/90">
                                                                                        {dep.txReverted
                                                                                            ? t('wallet.web3_deposit.tx_reverted_hint')
                                                                                            : dep.txMined === false
                                                                                              ? t('wallet.web3_deposit.tx_pending_mined')
                                                                                              : t('wallet.web3_deposit.confirmations', {
                                                                                                    current: Math.min(
                                                                                                        dep.confirmationsCurrent,
                                                                                                        dep.confirmationsRequired
                                                                                                    ),
                                                                                                    required: dep.confirmationsRequired
                                                                                                })}
                                                                                    </span>
                                                                                ) : null}
                                                                            </>
                                                                        ) : isOk ? (
                                                                            `+${Number(dep.amount).toFixed(4)} POL`
                                                                        ) : (
                                                                            dep.failReason || t('wallet.status_failed')
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {dep.txHash ? (
                                                                    <a
                                                                        href={`https://polygonscan.com/tx/${dep.txHash}`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-slate-600 hover:text-primary transition-colors"
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                ) : null}
                                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                                                    isPending ? 'text-indigo-300 bg-indigo-400/10' :
                                                                    isOk ? 'text-emerald-300 bg-emerald-400/10' :
                                                                    'text-red-300 bg-red-400/10'
                                                                }`}>
                                                                    {isPending ? t('wallet.status_verifying') : isOk ? t('wallet.status_credited') : t('wallet.status_failed')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </form>
    );
}
