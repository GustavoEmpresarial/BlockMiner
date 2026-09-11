import { SwapPanel } from './components/SwapPanel';
import { WalletBalanceOverview, WalletLedgerPanel } from './components/WalletOverviewPanels';
import { WalletHeader } from './components/WalletHeader';
import { WalletWithdrawTab } from './components/WalletWithdrawTab';
import { WalletDepositTab } from './components/WalletDepositTab';
import { useWalletPage } from './lib/useWalletPage';

export default function Wallet() {
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

                    <div className="bg-slate-950/80 border border-slate-800/50 rounded-[2.5rem] p-1 shadow-2xl backdrop-blur-2xl">
                        <div className="flex bg-slate-900/50 p-2 rounded-[2.2rem] gap-2">
                            <button
                                onClick={() => setActiveTab('deposit')}
                                className={`flex-1 py-2.5 sm:py-4 text-[8px] sm:text-xs font-black uppercase tracking-tight sm:tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'deposit' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_deposit')}
                            </button>
                            <button
                                onClick={() => setActiveTab('withdraw')}
                                className={`flex-1 py-2.5 sm:py-4 text-[8px] sm:text-xs font-black uppercase tracking-tight sm:tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'withdraw' ? 'bg-primary text-white shadow-lg shadow-primary/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_withdraw')}
                            </button>
                            <button
                                onClick={() => setActiveTab('swap')}
                                className={`flex-1 py-2.5 sm:py-4 text-[8px] sm:text-xs font-black uppercase tracking-tight sm:tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'swap' ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_swap')}
                            </button>
                        </div>

                        <div className="p-3 sm:p-8">
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
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-8">
                    <WalletLedgerPanel transactions={transactions} polPrice={polPrice} t={t} />
                </div>
            </div>
        </div>
    );
}
