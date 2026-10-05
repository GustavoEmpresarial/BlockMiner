import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
    Wrench,
    ShieldCheck,
    RefreshCw,
    ArrowLeft,
    Lock,
    Zap,
    ArrowDownCircle,
    ArrowUpCircle,
    ArrowLeftRight,
} from 'lucide-react';
import { SwapPanel } from './components/SwapPanel';
import { WalletBalanceOverview, WalletLedgerPanel } from './components/WalletOverviewPanels';
import { WalletHeader } from './components/WalletHeader';
import { WalletWithdrawTab } from './components/WalletWithdrawTab';
import { WalletDepositTab } from './components/WalletDepositTab';
import { useWalletPage } from './lib/useWalletPage';
import Card from '../../shared/components/Card';
import TabPills from '../../shared/components/TabPills';

export const WALLET_MAINTENANCE = false;

function WalletMaintenanceView() {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 sm:space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto">
            <div className="relative overflow-hidden rounded-[2.5rem] border border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-950/80 to-slate-900/90 p-8 sm:p-12 shadow-2xl backdrop-blur-2xl">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs font-black uppercase tracking-widest animate-pulse">
                        <Wrench className="w-3.5 h-3.5" />
                        <span>{t('wallet.maintenance_badge')}</span>
                    </div>

                    <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/10">
                        <Wrench className="w-12 h-12 sm:w-16 sm:h-16 animate-bounce" />
                    </div>

                    <div className="space-y-3 max-w-2xl">
                        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                            {t('wallet.maintenance_title')}
                        </h1>
                        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                            {t('wallet.maintenance_subtitle')}
                        </p>
                    </div>

                    {/* Cards de Segurança e Informações */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full pt-4 text-left">
                        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-2">
                            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-white text-sm">{t('wallet.maintenance_safe_title')}</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                {t('wallet.maintenance_safe_desc')}
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-2">
                            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 w-fit">
                                <Lock className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-white text-sm">{t('wallet.maintenance_paused_title')}</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                {t('wallet.maintenance_paused_desc')}
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-2">
                            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit">
                                <Zap className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-white text-sm">{t('wallet.maintenance_soon_title')}</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                {t('wallet.maintenance_soon_desc')}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                        <Link
                            to="/dashboard"
                            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-amber-500/20"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span>{t('wallet.maintenance_btn_back')}</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider transition-all duration-300 cursor-pointer"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span>{t('wallet.maintenance_btn_reload')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Wallet() {
    if (WALLET_MAINTENANCE) {
        return <WalletMaintenanceView />;
    }

    return <WalletActiveContent />;
}

function WalletActiveContent() {
    const {
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
        balance,
        polPrice,
        setActiveTab,
        activeTab,
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
        handleWithdraw,
        handleWithdrawalCodeSubmit,
        depositChannel,
        setDepositChannel,
        systemContractAddress,
        systemDepositAddress,
        walletConnectConfigured,
        kitConnected,
        isConnecting,
        polygonHdFeatureVisible,
        polygonHdDepositEnabled,
        polygonHdMissingEnvKeys,
        polygonHdMinPol,
        polygonHdLoadError,
        polygonHdAddress,
        injectedDiscovery,
        detectedWalletName,
        depositForm,
        setDepositForm,
        pendingDeposits,
        minDepositPol,
        blockConfirmations,
        depositVerifyMaxAttempts,
        showWalletSessionCancel,
        connectWalletConnect,
        connect,
        cancelWalletSession,
        handleAutoDeposit,
        transactions,
    } = useWalletPage();

    return (
        <div className=" space-y-5 sm:space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <WalletHeader
                t={t}
                isLoading={isLoading}
                isLoadingLinkedWallet={isLoadingLinkedWallet}
                linkedWalletAddress={linkedWalletAddress}
                connectedWallet={connectedWallet}
                isLinkConnecting={isLinkConnecting}
                isLinking={isLinking}
                copyToClipboard={copyToClipboard}
                clearConnectedSession={clearConnectedSession}
                connectLinkedWallet={connectLinkedWallet}
                unlinkWallet={unlinkWallet}
                linkWallet={linkWallet}
                loadSavedWallet={loadSavedWallet}
                fetchWalletData={fetchWalletData}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-8">
                    <WalletBalanceOverview balance={balance} polPrice={polPrice} t={t} isLoading={isLoading} />

                    <Card className="space-y-6">
                        <TabPills
                            ariaLabel={t('wallet.tabs_aria', { defaultValue: 'Operações de Carteira' })}
                            activeTab={activeTab}
                            onChange={(key) => setActiveTab(key as 'deposit' | 'withdraw' | 'swap')}
                            tabs={[
                                { key: 'deposit', label: t('wallet.tab_deposit'), icon: ArrowDownCircle },
                                { key: 'withdraw', label: t('wallet.tab_withdraw'), icon: ArrowUpCircle },
                                { key: 'swap', label: t('wallet.tab_swap'), icon: ArrowLeftRight },
                            ]}
                        />

                        <div
                            id={`panel-${activeTab}`}
                            role="tabpanel"
                            aria-labelledby={`tab-${activeTab}`}
                            className="pt-2 outline-none"
                        >
                            {activeTab === 'withdraw' && (
                                <WalletWithdrawTab
                                    t={t}
                                    isActionLoading={isActionLoading}
                                    withdrawalChallenge={withdrawalChallenge}
                                    setWithdrawalChallenge={setWithdrawalChallenge}
                                    withdrawalCode={withdrawalCode}
                                    setWithdrawalCode={setWithdrawalCode}
                                    withdrawForm={withdrawForm}
                                    setWithdrawForm={setWithdrawForm}
                                    withdrawFeeInfo={withdrawFeeInfo}
                                    isConnected={isConnected}
                                    evmAccount={evmAccount}
                                    balanceAmount={balance.amount}
                                    polPrice={polPrice}
                                    handleWithdraw={handleWithdraw}
                                    handleWithdrawalCodeSubmit={handleWithdrawalCodeSubmit}
                                />
                            )}

                            {activeTab === 'deposit' && (
                                <WalletDepositTab
                                    t={t}
                                    depositChannel={depositChannel}
                                    setDepositChannel={setDepositChannel}
                                    systemContractAddress={systemContractAddress}
                                    systemDepositAddress={systemDepositAddress}
                                    walletConnectConfigured={walletConnectConfigured}
                                    kitConnected={kitConnected}
                                    isConnected={isConnected}
                                    isConnecting={isConnecting}
                                    polygonHdFeatureVisible={polygonHdFeatureVisible}
                                    polygonHdDepositEnabled={polygonHdDepositEnabled}
                                    polygonHdMissingEnvKeys={polygonHdMissingEnvKeys}
                                    polygonHdMinPol={polygonHdMinPol}
                                    polygonHdLoadError={polygonHdLoadError}
                                    polygonHdAddress={polygonHdAddress}
                                    injectedDiscovery={injectedDiscovery}
                                    detectedWalletName={detectedWalletName}
                                    evmAccount={evmAccount}
                                    depositForm={depositForm}
                                    setDepositForm={setDepositForm}
                                    pendingDeposits={pendingDeposits}
                                    minDepositPol={minDepositPol}
                                    blockConfirmations={blockConfirmations}
                                    depositVerifyMaxAttempts={depositVerifyMaxAttempts}
                                    showWalletSessionCancel={showWalletSessionCancel}
                                    isActionLoading={isActionLoading}
                                    copyToClipboard={copyToClipboard}
                                    connectWalletConnect={connectWalletConnect}
                                    connect={connect}
                                    cancelWalletSession={cancelWalletSession}
                                    handleAutoDeposit={handleAutoDeposit}
                                />
                            )}

                            {activeTab === 'swap' && (
                                <SwapPanel
                                  shibBalance={balance.shibBalance}
                                  polBalance={balance.amount}
                                  blkBalance={balance.blkBalance}
                                  onRefresh={fetchWalletData}
                                />
                            )}
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    <WalletLedgerPanel transactions={transactions} polPrice={polPrice} t={t} />
                </div>
            </div>
        </div>
    );
}
