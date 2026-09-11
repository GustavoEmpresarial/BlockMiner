import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { WalletTFunction } from '../lib/wallet.i18n';
import { ShieldCheck, RefreshCw, Smartphone, ArrowUpCircle } from 'lucide-react';
import type { WithdrawFeeInfo } from '../lib/wallet.types';
import { WALLET_MIN_WITHDRAW_POL } from '../lib/wallet.validation';

export interface WithdrawalChallenge {
    challengeToken: string;
    ttlMinutes: number;
    pendingAmount: number;
    pendingAddress: string;
}

export interface WalletWithdrawTabProps {
    t: WalletTFunction;
    isActionLoading: boolean;
    withdrawalChallenge: WithdrawalChallenge | null;
    setWithdrawalChallenge: Dispatch<SetStateAction<WithdrawalChallenge | null>>;
    withdrawalCode: string;
    setWithdrawalCode: Dispatch<SetStateAction<string>>;
    withdrawForm: { address: string; amount: string };
    setWithdrawForm: Dispatch<SetStateAction<{ address: string; amount: string }>>;
    withdrawFeeInfo: WithdrawFeeInfo | null;
    isConnected: boolean;
    evmAccount: string | null | undefined;
    balanceAmount: number;
    polPrice: number;
    handleWithdraw: (e: FormEvent<HTMLFormElement>) => void;
    handleWithdrawalCodeSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

/** Withdraw tab: POL only (SHIB withdraw blocked). */
export function WalletWithdrawTab({
    t,
    isActionLoading,
    withdrawalChallenge,
    setWithdrawalChallenge,
    withdrawalCode,
    setWithdrawalCode,
    withdrawForm,
    setWithdrawForm,
    withdrawFeeInfo,
    isConnected,
    evmAccount,
    balanceAmount,
    polPrice,
    handleWithdraw,
    handleWithdrawalCodeSubmit,
}: WalletWithdrawTabProps) {
    if (withdrawalChallenge) {
        return (
            <form onSubmit={handleWithdrawalCodeSubmit} className="space-y-6">
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl mb-2">
                        <ShieldCheck className="w-7 h-7 text-amber-400" />
                    </div>
                    <h3 className="text-white font-black text-sm uppercase tracking-widest">{t('wallet.withdraw_flow.verify_title')}</h3>
                    <p className="text-slate-400 text-[11px] font-medium">
                        {t('wallet.withdraw_flow.code_sent_ttl', { minutes: withdrawalChallenge.ttlMinutes })}
                    </p>
                    <p className="text-slate-500 text-[10px]">
                        {t('wallet.withdraw_flow.withdraw_of')} <span className="text-white font-black">{withdrawalChallenge.pendingAmount.toFixed(4)} POL</span> {t('wallet.withdraw_flow.to')} <span className="text-slate-300 font-mono text-[9px]">{withdrawalChallenge.pendingAddress.slice(0, 8)}...{withdrawalChallenge.pendingAddress.slice(-6)}</span>
                    </p>
                </div>
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.withdraw_flow.code_label')}</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={withdrawalCode}
                        onChange={(e) => setWithdrawalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl py-5 px-6 text-slate-200 text-2xl font-black text-center tracking-[0.4em] transition-all outline-none"
                        autoFocus
                    />
                </div>
                <button
                    type="submit"
                    disabled={isActionLoading || withdrawalCode.length !== 6}
                    className="w-full py-4 sm:py-5 bg-gradient-to-r from-amber-500 to-orange-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-3xl font-black text-xs sm:text-sm uppercase tracking-tight sm:tracking-[0.2em] transition-all shadow-2xl shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                    {isActionLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    {isActionLoading ? t('wallet.withdraw_flow.verifying') : t('wallet.withdraw_flow.confirm')}
                </button>
                <button
                    type="button"
                    onClick={() => { setWithdrawalChallenge(null); setWithdrawalCode(''); }}
                    className="w-full py-3 text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                    {t('wallet.withdraw_flow.cancel')}
                </button>
            </form>
        );
    }

    return (
        <form onSubmit={handleWithdraw} className="space-y-4 sm:space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.recipient_address')}</label>
                    <div className="relative group">
                        <input
                            type="text"
                            value={withdrawForm.address}
                            onChange={(e) => setWithdrawForm(prev => ({ ...prev, address: e.target.value }))}
                            placeholder="0x..."
                            className="w-full bg-slate-900 border border-slate-800 group-hover:border-slate-700 focus:border-primary rounded-2xl py-5 pl-5 pr-12 text-slate-200 text-xs font-mono transition-all outline-none"
                        />
                        {isConnected && (
                            <button
                                type="button"
                                onClick={() => setWithdrawForm(prev => ({ ...prev, address: evmAccount ?? '' }))}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-primary hover:text-white transition-colors"
                                title={t('wallet.use_connected_wallet_hint')}
                            >
                                <Smartphone className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.amount_pol')}</label>
                    <div className="relative group">
                        <input
                            type="number"
                            step="0.000001"
                            value={withdrawForm.amount}
                            onChange={(e) => setWithdrawForm(prev => ({ ...prev, amount: e.target.value }))}
                            placeholder="0.00"
                            className="w-full bg-slate-900 border border-slate-800 group-hover:border-slate-700 focus:border-primary rounded-2xl py-5 px-5 text-slate-200 text-sm font-black transition-all outline-none"
                        />
                        <button
                            type="button"
                            onClick={() => setWithdrawForm(prev => ({ ...prev, amount: balanceAmount.toString() }))}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-primary hover:text-white uppercase tracking-widest transition-all"
                        >
                            Max
                        </button>
                    </div>
                    <p className="text-[9px] text-slate-600 font-bold ml-2">{t('wallet.min_withdraw_hint', { min: WALLET_MIN_WITHDRAW_POL })}</p>
                </div>
            </div>

            {withdrawFeeInfo && (
                <div className={`rounded-2xl p-4 border ${withdrawFeeInfo.feeWaived ? 'border-emerald-500/30 bg-emerald-950/30' : 'border-amber-500/30 bg-amber-950/20'}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">{t('wallet.withdraw_flow.fee_title')}</p>
                            {withdrawFeeInfo.feeWaived ? (
                                <p className="text-emerald-400 text-xs font-black uppercase">{t('wallet.withdraw_flow.fee_waived')}</p>
                            ) : (
                                <p className="text-amber-400 text-xs font-black">{t('wallet.withdraw_flow.fee_applied', { percent: withdrawFeeInfo.feePercent })}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">
                                {t('wallet.withdraw_flow.external_offers_today')}
                            </p>
                            <p className={`text-xs font-black ${withdrawFeeInfo.feeWaived ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {withdrawFeeInfo.completionsToday}/{withdrawFeeInfo.requiredForWaiver}
                            </p>
                            {!withdrawFeeInfo.feeWaived && (
                                <p className="text-[9px] text-slate-600 mt-0.5">
                                    {t('wallet.withdraw_flow.offers_for_waiver', { count: withdrawFeeInfo.requiredForWaiver - withdrawFeeInfo.completionsToday })}
                                </p>
                            )}
                        </div>
                    </div>
                    {!withdrawFeeInfo.feeWaived && (
                        <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
                            <div
                                className="bg-amber-500 h-1 rounded-full transition-all"
                                style={{ width: `${Math.min(100, (withdrawFeeInfo.completionsToday / withdrawFeeInfo.requiredForWaiver) * 100)}%` }}
                            />
                        </div>
                    )}
                </div>
            )}

            <div className="bg-slate-900/50 rounded-3xl p-3 sm:p-6 border border-slate-800/50 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">{t('wallet.withdraw_flow.network_protocol_fee')}</p>
                    <p className="text-emerald-400 text-xs font-black uppercase">{t('wallet.withdraw_flow.gas_covered')}</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">{t('wallet.withdraw_flow.you_receive')}</p>
                    {(() => {
                        const gross = parseFloat(withdrawForm.amount) || 0;
                        const feeRate = withdrawFeeInfo && !withdrawFeeInfo.feeWaived ? withdrawFeeInfo.feePercent / 100 : 0;
                        const net = gross * (1 - feeRate);
                        return (
                            <p className="text-xl font-black text-white italic">
                                {net.toFixed(4)} POL
                                {polPrice > 0 && (
                                    <span className="block text-[10px] text-slate-500 not-italic font-bold">
                                        ≈ ${(net * polPrice).toFixed(2)} USD
                                    </span>
                                )}
                            </p>
                        );
                    })()}
                </div>
            </div>

            <button
                type="submit"
                disabled={isActionLoading}
                className="w-full py-4 sm:py-5 bg-gradient-to-r from-primary to-blue-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-3xl font-black text-xs sm:text-sm uppercase tracking-tight sm:tracking-[0.2em] transition-all shadow-2xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3"
            >
                {isActionLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowUpCircle className="w-5 h-5" />}
                {isActionLoading ? t('wallet.processing') : t('wallet.confirm_withdraw')}
            </button>
            <p className="text-center text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                {t('wallet.processing_time', { hours: 72 })}
            </p>
        </form>
    );
}
