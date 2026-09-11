import type { WalletTFunction } from '../lib/wallet.i18n';
import {
    Wallet as WalletIcon,
    ShieldCheck,
    Copy,
    RefreshCw,
    Smartphone,
    Loader2,
} from 'lucide-react';

const headerWalletShort = (addr: string) =>
    addr.length >= 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

export interface WalletHeaderProps {
    t: WalletTFunction;
    isLoading: boolean;
    isLoadingLinkedWallet: boolean;
    linkedWalletAddress: string | null | undefined;
    connectedWallet: { address: string } | null;
    isLinkConnecting: boolean;
    isLinking: boolean;
    copyToClipboard: (text: string) => void;
    clearConnectedSession: () => void;
    connectLinkedWallet: () => Promise<unknown> | void;
    unlinkWallet: () => Promise<boolean>;
    linkWallet: () => Promise<boolean>;
    loadSavedWallet: () => Promise<unknown> | void;
    fetchWalletData: () => Promise<boolean> | void;
}

/** Wallet page header: hero title + linked/connected-wallet actions + refresh. Extracted from WalletPage. */
export function WalletHeader({
    t,
    isLoading,
    isLoadingLinkedWallet,
    linkedWalletAddress,
    connectedWallet,
    isLinkConnecting,
    isLinking,
    copyToClipboard,
    clearConnectedSession,
    connectLinkedWallet,
    unlinkWallet,
    linkWallet,
    loadSavedWallet,
    fetchWalletData,
}: WalletHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tighter italic flex items-center gap-3">
                    <div className="p-2 bg-primary/20 rounded-2xl">
                        <WalletIcon className="w-8 h-8 text-primary" />
                    </div>
                    {t('wallet.hero_wallet').toUpperCase()}{' '}
                    <span className="text-primary">{t('wallet.hero_terminal').toUpperCase()}</span>
                </h1>
                <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] pl-1">
                    {t('wallet.hero_subtitle')}
                </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
                {isLoadingLinkedWallet ? (
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" aria-hidden />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {t('wallet.web3_deposit.loading_wallet', { defaultValue: 'Loading wallet…' })}
                        </span>
                    </div>
                ) : linkedWalletAddress ? (
                    <>
                        <div className="flex items-center gap-3 p-1.5 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl backdrop-blur-xl">
                            <div className="flex items-center gap-2 pl-3 pr-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                                <span className="text-[9px] font-black text-emerald-400/90 uppercase tracking-widest hidden sm:inline">
                                    {t('wallet.web3_deposit.wallet_linked', { defaultValue: 'Linked' })}
                                </span>
                                <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[100px] font-mono">
                                    {headerWalletShort(linkedWalletAddress)}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => copyToClipboard(linkedWalletAddress)}
                                className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-white"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                clearConnectedSession();
                                void connectLinkedWallet();
                            }}
                            disabled={isLinkConnecting || isLinking}
                            className="px-4 py-3 bg-slate-900/80 border border-slate-600 text-slate-200 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            {t('wallet.web3_deposit.change_wallet', { defaultValue: 'Change wallet' })}
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                const ok = await unlinkWallet();
                                if (ok) void fetchWalletData();
                            }}
                            disabled={isLinking}
                            className="px-4 py-3 bg-transparent border border-slate-600 text-slate-300 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800/80 transition-all disabled:opacity-50"
                        >
                            {t('wallet.web3_deposit.unlink_wallet', { defaultValue: 'Unlink' })}
                        </button>
                    </>
                ) : connectedWallet ? (
                    <>
                        <div className="flex items-center gap-3 p-1.5 bg-slate-900/50 border border-amber-800/40 rounded-2xl backdrop-blur-xl">
                            <div className="flex items-center gap-2 pl-3 pr-4">
                                <div className="w-2 h-2 rounded-full animate-pulse bg-amber-400" />
                                <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[100px] font-mono">
                                    {headerWalletShort(connectedWallet.address)}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => copyToClipboard(connectedWallet.address)}
                                className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-white"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                const ok = await linkWallet();
                                if (ok) {
                                    await loadSavedWallet();
                                    void fetchWalletData();
                                }
                            }}
                            disabled={isLinking}
                            className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 border border-emerald-400/30 disabled:opacity-50"
                        >
                            {isLinking ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                                    {t('wallet.web3_deposit.linking_wallet', { defaultValue: 'Linking…' })}
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-4 h-4" aria-hidden />
                                    {t('wallet.web3_deposit.save_link_wallet', { defaultValue: 'Save / link wallet' })}
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={clearConnectedSession}
                            disabled={isLinking}
                            className="px-4 py-3 bg-transparent border border-slate-600 text-slate-300 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800/80 transition-all disabled:opacity-50"
                        >
                            {t('wallet.web3_deposit.cancel_connection')}
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={() => void connectLinkedWallet()}
                        disabled={isLinkConnecting}
                        className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 border border-indigo-400/30 shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                    >
                        {isLinkConnecting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                                {t('wallet.web3_deposit.connecting')}
                            </>
                        ) : (
                            <>
                                <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
                                {t('wallet.web3_deposit.connect_browser_wallet', {
                                    defaultValue: 'Connect wallet',
                                })}
                            </>
                        )}
                    </button>
                )}

                <button
                    onClick={fetchWalletData}
                    className="p-3 bg-slate-900/50 hover:bg-slate-800 text-slate-500 hover:text-white rounded-2xl transition-all border border-slate-800/50 backdrop-blur-xl"
                >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>
        </div>
    );
}
