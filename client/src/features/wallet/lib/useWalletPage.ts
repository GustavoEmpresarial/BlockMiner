import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AxiosError } from 'axios';
import type { Address, EIP1193Provider, Hex } from 'viem';
import { walletApi } from './wallet.api';
import type { PendingDepositRow, WalletTransactionRow, WithdrawFeeInfo } from './wallet.types';
import { parseEther, isAddress, getAddress } from 'ethers';
import { useWallet } from './useWallet';
import { useWalletLink } from './useWalletLink';
import { useGameStore } from '../../shell/lib/game.store';
import { canUseInjectedDepositChannel } from '../../../shared/utils/depositChannel';
import { getInjectedWalletProviders } from '../../checkin/wallet/injectedWallet';
import {
    classifyWalletHttpError,
    nextWalletBalanceBackoffMs,
    WALLET_BALANCE_POLL_MS,
} from './walletBalancePolling';
import {
  depositContractIface,
  isRecord,
  isUserRejectedTx,
  sendPolDepositEip1193,
} from '../components/walletPage.utils';
import { createWithdrawHandlers, type WithdrawalChallenge } from './walletPage.withdraw';

export function useWalletPage() {
    const { t } = useTranslation();
    const {
        account,
        isConnected,
        isConnecting,
        isCorrectNetwork,
        connect,
        switchNetwork,
        getActiveEip1193,
        walletConnectConfigured,
        cancelWalletSession,
        kitConnected,
        connectWalletConnect,
        sendTransaction,
    } = useWallet();

    const {
        savedWallet,
        connectedWallet,
        isLoadingSaved: isLoadingLinkedWallet,
        isConnecting: isLinkConnecting,
        isLinking,
        connectWallet: connectLinkedWallet,
        linkWallet,
        unlinkWallet,
        clearConnectedSession,
        loadSavedWallet,
    } = useWalletLink();

    const showWalletSessionCancel =
        Boolean(kitConnected || isConnecting);

    const [balance, setBalance] = useState({
        amount: 0,
        blkBalance: 0,
        blkLocked: 0,
        shibBalance: 0,
        lifetimeMined: 0,
        totalWithdrawn: 0
    });
    const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('deposit');
    const [systemDepositAddress, setSystemDepositAddress] = useState<string | null>(null);
    const [systemContractAddress, setSystemContractAddress] = useState<string | null>(null);
    const [profileWalletAddress, setProfileWalletAddress] = useState<string | null>(null);
    const walletConnectedRef = useRef(false);

    const [withdrawForm, setWithdrawForm] = useState({
        address: '',
        amount: ''
    });
    const [withdrawalChallenge, setWithdrawalChallenge] = useState<WithdrawalChallenge | null>(null);
    const [withdrawalCode, setWithdrawalCode] = useState('');
    const [depositForm, setDepositForm] = useState({ amount: '' });
    const [depositChannel, setDepositChannel] = useState('smart_contract');
    const [injectedDiscovery, setInjectedDiscovery] = useState<'scanning' | 'none' | 'found'>('scanning');
    const [detectedWalletName, setDetectedWalletName] = useState<string | null>(null);
    const [polygonHdDepositEnabled, setPolygonHdDepositEnabled] = useState(false);
    const [polygonHdFeatureVisible, setPolygonHdFeatureVisible] = useState(false);
    const [polygonHdMissingEnvKeys, setPolygonHdMissingEnvKeys] = useState<string[]>([]);
    const [polygonHdMinPol, setPolygonHdMinPol] = useState(1);
    const [polygonHdAddress, setPolygonHdAddress] = useState('');
    const [polygonHdLoadError, setPolygonHdLoadError] = useState('');
    const [polPrice, setPolPrice] = useState(0);
    const [minDepositPol, setMinDepositPol] = useState(0.01);
    const [blockConfirmations, setBlockConfirmations] = useState(3);
    const [depositVerifyMaxAttempts, setDepositVerifyMaxAttempts] = useState(96);
    const [withdrawFeeInfo, setWithdrawFeeInfo] = useState<WithdrawFeeInfo | null>(null);

    // Depósitos assíncronos pendentes
    const [pendingDeposits, setPendingDeposits] = useState<PendingDepositRow[]>([]);
    const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const balancePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const balanceBackoffMsRef = useRef(WALLET_BALANCE_POLL_MS);
    const balancePollPausedRef = useRef(false);
    const balanceUnavailableToastRef = useRef(false);

    const socket = useGameStore(s => s.socket);
    const initSocket = useGameStore(s => s.initSocket);

    const evmAccount = account as string | null | undefined;
    const linkedWalletAddress = savedWallet.walletAddress;

    useEffect(() => {
        initSocket();
    }, [initSocket]);

    useEffect(() => {
        if (linkedWalletAddress) {
            setProfileWalletAddress(linkedWalletAddress);
            setWithdrawForm((prev) => {
                if (prev.address) return prev;
                return { ...prev, address: linkedWalletAddress };
            });
        }
    }, [linkedWalletAddress]);

    useEffect(() => {
        walletConnectedRef.current = isConnected;
    }, [isConnected]);

    const waitForWalletConnected = async (timeoutMs: number = 45000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (walletConnectedRef.current) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return false;
    };

    const fetchPrice = async () => {
        try {
            const res = await walletApi.getPolUsd();
            if (res.data?.ok && typeof res.data.priceUsd === 'number') {
                setPolPrice(res.data.priceUsd);
            }
        } catch (err: unknown) {
            console.error("Error fetching price", err);
        }
    };

    const fetchFeeInfo = useCallback(async () => {
        try {
            const res = await walletApi.getWithdrawFeeInfo();
            if (res.data?.ok) setWithdrawFeeInfo(res.data);
        } catch {}
    }, []);

    const clearBalancePollTimer = useCallback(() => {
        if (balancePollTimerRef.current) {
            clearTimeout(balancePollTimerRef.current);
            balancePollTimerRef.current = null;
        }
    }, []);

    const fetchWalletData = useCallback(async (): Promise<boolean> => {
        try {
            const [balanceRes, historyRes] = await Promise.all([
                walletApi.getBalance(),
                walletApi.getTransactions()
            ]);

            balanceBackoffMsRef.current = WALLET_BALANCE_POLL_MS;
            balanceUnavailableToastRef.current = false;

            if (balanceRes.data.ok) {
                setBalance({
                    amount: Number(balanceRes.data.balance || 0),
                    blkBalance: Number(balanceRes.data.blkBalance ?? 0),
                    blkLocked: Number(balanceRes.data.blkLocked ?? 0),
                    shibBalance: Number(balanceRes.data.shibBalance ?? 0),
                    lifetimeMined: Number(balanceRes.data.lifetimeMined || 0),
                    totalWithdrawn: Number(balanceRes.data.totalWithdrawn || 0)
                });
                setSystemDepositAddress(balanceRes.data.depositAddress || null);
                setSystemContractAddress(balanceRes.data.depositContractAddress || null);
                setProfileWalletAddress(balanceRes.data.walletAddress || null);
                if (typeof balanceRes.data.minDepositPol === 'number' && Number.isFinite(balanceRes.data.minDepositPol)) {
                    setMinDepositPol(balanceRes.data.minDepositPol);
                }
                if (typeof balanceRes.data.blockConfirmations === 'number' && balanceRes.data.blockConfirmations >= 1) {
                    setBlockConfirmations(balanceRes.data.blockConfirmations);
                }
                if (typeof balanceRes.data.depositVerifyMaxAttempts === 'number' && balanceRes.data.depositVerifyMaxAttempts >= 1) {
                    setDepositVerifyMaxAttempts(balanceRes.data.depositVerifyMaxAttempts);
                }
                setPolygonHdDepositEnabled(Boolean(balanceRes.data.polygonHdDepositEnabled));
                setPolygonHdFeatureVisible(Boolean(balanceRes.data.polygonHdDepositFeatureVisible));
                setPolygonHdMissingEnvKeys(
                    Array.isArray(balanceRes.data.polygonHdDepositMissingEnvKeys)
                        ? balanceRes.data.polygonHdDepositMissingEnvKeys
                        : []
                );
                if (
                    typeof balanceRes.data.polygonHdMinDepositPol === 'number' &&
                    Number.isFinite(balanceRes.data.polygonHdMinDepositPol) &&
                    balanceRes.data.polygonHdMinDepositPol > 0
                ) {
                    setPolygonHdMinPol(balanceRes.data.polygonHdMinDepositPol);
                }

                // If user has a saved address but not connected, pre-fill it for convenience
                const savedWalletAddr = balanceRes.data.walletAddress;
                setWithdrawForm((prev) => {
                    if (prev.address) return prev;
                    if (typeof savedWalletAddr === 'string' && savedWalletAddr.length > 0) {
                        return { ...prev, address: savedWalletAddr };
                    }
                    return prev;
                });
            }

            if (historyRes.data.ok) {
                setTransactions(historyRes.data.transactions || []);
            }
            return true;
        } catch (err: unknown) {
            const kind = classifyWalletHttpError(err);
            if (kind === 'auth') {
                balancePollPausedRef.current = true;
                clearBalancePollTimer();
                return false;
            }
            if (kind === 'unavailable') {
                balanceBackoffMsRef.current = nextWalletBalanceBackoffMs(balanceBackoffMsRef.current);
                if (!balanceUnavailableToastRef.current) {
                    balanceUnavailableToastRef.current = true;
                    toast.error(t('wallet.balance_unavailable'), { id: 'wallet-balance-unavailable' });
                }
                return false;
            }
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [clearBalancePollTimer, t]);

    const scheduleBalancePoll = useCallback(() => {
        if (balancePollPausedRef.current) return;
        clearBalancePollTimer();
        balancePollTimerRef.current = setTimeout(() => {
            void fetchWalletData().finally(() => {
                scheduleBalancePoll();
            });
        }, balanceBackoffMsRef.current);
    }, [clearBalancePollTimer, fetchWalletData]);

    const fetchPendingDeposits = useCallback(async () => {
        try {
            const res = await walletApi.getDepositPending();
            if (res.data.ok) {
                setPendingDeposits(res.data.deposits || []);
            }
        } catch {}
    }, []);

    const startPendingPoll = useCallback(() => {
        if (pendingPollRef.current) return;
        fetchPendingDeposits();
        pendingPollRef.current = setInterval(fetchPendingDeposits, 10_000);
    }, [fetchPendingDeposits]);

    const stopPendingPoll = useCallback(() => {
        if (pendingPollRef.current) {
            clearInterval(pendingPollRef.current);
            pendingPollRef.current = null;
        }
    }, []);

    useEffect(() => {
        balancePollPausedRef.current = false;
        balanceBackoffMsRef.current = WALLET_BALANCE_POLL_MS;
        void fetchWalletData();
        fetchPrice();
        void fetchFeeInfo();
        fetchPendingDeposits();
        scheduleBalancePoll();
        const priceInterval = setInterval(fetchPrice, 60000);
        return () => {
            clearBalancePollTimer();
            clearInterval(priceInterval);
            stopPendingPoll();
        };
    }, [
        fetchWalletData,
        fetchPendingDeposits,
        fetchFeeInfo,
        stopPendingPoll,
        scheduleBalancePoll,
        clearBalancePollTimer,
    ]);

    useEffect(() => {
        const canInjected = canUseInjectedDepositChannel(systemContractAddress, systemDepositAddress);
        if (!canInjected && walletConnectConfigured) {
            setDepositChannel('walletconnect');
        } else if (!canInjected && !walletConnectConfigured && polygonHdFeatureVisible) {
            setDepositChannel('polygon_hd');
        }
    }, [systemContractAddress, systemDepositAddress, walletConnectConfigured, polygonHdFeatureVisible]);

    useEffect(() => {
        if (depositChannel !== 'polygon_hd') {
            setPolygonHdLoadError('');
            return undefined;
        }
        if (!polygonHdFeatureVisible) {
            setPolygonHdAddress('');
            setPolygonHdLoadError('');
            return undefined;
        }
        if (!polygonHdDepositEnabled) {
            setPolygonHdAddress('');
            if (polygonHdMissingEnvKeys.length > 0) {
                setPolygonHdLoadError(
                    t('wallet.polygon_hd.disabled_hint_keys', {
                        keys: polygonHdMissingEnvKeys.join(', ')
                    })
                );
            } else {
                setPolygonHdLoadError(t('wallet.polygon_hd.setup_incomplete'));
            }
            return undefined;
        }
        let cancelled = false;
        setPolygonHdLoadError('');
        (async () => {
            try {
                const res = await walletApi.getHdAddress();
                if (cancelled) return;
                if (res.data?.ok && res.data.address) {
                    setPolygonHdAddress(res.data.address);
                } else {
                    setPolygonHdLoadError(res.data?.message || t('wallet.polygon_hd.load_error'));
                }
            } catch (err: unknown) {
                if (cancelled) return;
                const ax = err as AxiosError<{ message?: string; details?: { retryAfterSec?: number } }>;
                const status = ax.response?.status;
                const data = ax.response?.data;
                const details =
                    isRecord(data) && isRecord(data.details) ? (data.details as { retryAfterSec?: number }) : undefined;
                const retryRaw = details?.retryAfterSec ?? ax.response?.headers?.['retry-after'];
                const retryAfter = parseInt(String(retryRaw ?? ''), 10);
                if (status === 429) {
                    const sec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15;
                    setPolygonHdLoadError(t('wallet.polygon_hd.rate_limit_error', { seconds: sec }));
                } else {
                    const apiMsg = isRecord(data) && typeof data.message === 'string' ? data.message : '';
                    setPolygonHdLoadError(apiMsg || t('wallet.polygon_hd.load_error'));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [depositChannel, polygonHdDepositEnabled, polygonHdMissingEnvKeys, polygonHdFeatureVisible, t]);

    useEffect(() => {
        if (depositChannel !== 'smart_contract' || isConnected) {
            return undefined;
        }
        let cancelled = false;
        setInjectedDiscovery('scanning');
        void getInjectedWalletProviders().then((list) => {
            if (cancelled) return;
            if (list.length === 0) {
                setInjectedDiscovery('none');
                setDetectedWalletName(null);
                return;
            }
            setInjectedDiscovery('found');
            setDetectedWalletName(list[0]?.name ?? null);
        });
        return () => {
            cancelled = true;
        };
    }, [depositChannel, isConnected]);

    // Para de fazer poll quando não há mais pendentes
    useEffect(() => {
        const hasPending = pendingDeposits.some(
            d => d.status === 'pending_verification'
        );
        if (hasPending) {
            startPendingPoll();
        } else {
            stopPendingPoll();
        }
    }, [pendingDeposits, startPendingPoll, stopPendingPoll]);

    // Socket: ouve confirmação de depósito em tempo real
    useEffect(() => {
        if (!socket) return undefined;
        const handler = (payload: { amount?: string | number }) => {
            toast.success(t('wallet.web3_deposit.toast_credited', { amount: Number(payload.amount).toFixed(4) }));
            fetchWalletData();
            fetchPendingDeposits();
        };
        socket.on('wallet:deposit_confirmed', handler);
        return () => {
            socket.off('wallet:deposit_confirmed', handler);
        };
    }, [socket, fetchWalletData, fetchPendingDeposits, t]);

    // Auto-fill withdrawal address when wallet connects
    useEffect(() => {
        if (isConnected && evmAccount && !withdrawForm.address) {
            setWithdrawForm(prev => ({ ...prev, address: evmAccount }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time convenience autofill on connect; must not re-trigger while the user is editing/clearing the address field.
    }, [isConnected, evmAccount]);

    const handleAutoDeposit = async () => {
        setIsActionLoading(true);
        try {
            if (depositChannel === 'smart_contract') {
                const hasContract = systemContractAddress && isAddress(String(systemContractAddress).trim());
                const hasTreasury = systemDepositAddress && isAddress(String(systemDepositAddress).trim());
                if (!hasContract && !hasTreasury) {
                    toast.error(t('wallet.web3_deposit.no_deposit_config'));
                    return;
                }
            } else if (!walletConnectConfigured) {
                toast.error(t('wallet.web3_deposit.wc_missing_build'));
                return;
            }

            if (!isConnected) {
                try {
                    let connected = false;
                    if (depositChannel === 'walletconnect') {
                        await connectWalletConnect();
                        connected = await waitForWalletConnected(45000);
                    } else {
                        connected = await connect({ useBrowserExtension: true });
                        if (!connected) {
                            return;
                        }
                        connected = await waitForWalletConnected(15000);
                    }
                    if (!connected) {
                        toast.error(t('wallet.web3_deposit.connect_wallet_failed'), {
                            id: 'wallet-connect-wallet-failed',
                        });
                        return;
                    }
                } catch (e: unknown) {
                    if (isRecord(e) && e.code === 'CANCELLED') {
                        toast.info(t('wallet.web3_deposit.connection_cancelled'));
                        return;
                    }
                    throw e;
                }
            }

            if (!isCorrectNetwork) {
                await switchNetwork();
                return;
            }

            const amount = parseFloat(depositForm.amount);
            if (isNaN(amount) || amount < minDepositPol) {
                toast.error(t('wallet.min_deposit_error', { min: minDepositPol }));
                return;
            }

            const useContract =
                systemContractAddress && isAddress(String(systemContractAddress).trim());
            const useTreasury =
                !useContract && systemDepositAddress && isAddress(String(systemDepositAddress).trim());

            if (!useContract && !useTreasury) {
                toast.error(t('wallet.web3_deposit.no_deposit_config'));
                return;
            }

            let to: Address;
            let dataHex: Hex | undefined;
            if (useContract) {
                to = getAddress(systemContractAddress) as Address;
                if (!evmAccount || !isAddress(evmAccount)) {
                    toast.error(t('wallet.web3_deposit.no_wallet_for_send'));
                    return;
                }
                const linkedOk =
                    profileWalletAddress &&
                    isAddress(profileWalletAddress) &&
                    getAddress(evmAccount) === getAddress(profileWalletAddress);
                if (!linkedOk) {
                    toast.error(t('wallet.web3_deposit.link_wallet_required_contract'));
                    return;
                }
                dataHex = depositContractIface.encodeFunctionData('deposit', [getAddress(evmAccount)]) as Hex;
            } else {
                if (!systemDepositAddress) {
                    toast.error(t('wallet.web3_deposit.no_deposit_config'));
                    return;
                }
                to = getAddress(systemDepositAddress) as Address;
            }

            const valueWei = parseEther(amount.toString());

            toast.info(t('wallet.web3_deposit.tx_requesting'));

            let txHash: string;
            const sendPayload = useContract
                ? { to, value: valueWei, data: dataHex as Hex }
                : { to, value: valueWei };

            if (kitConnected) {
                txHash = (await sendPolDepositEip1193({
                    getActiveEip1193,
                    to,
                    valueWei,
                    dataHex,
                    t,
                })) as string;
            } else {
                try {
                    txHash = await sendTransaction({
                        to: sendPayload.to,
                        value: sendPayload.value,
                        data: sendPayload.data,
                    });
                } catch (sendErr: unknown) {
                    if (isUserRejectedTx(sendErr)) throw sendErr;
                    console.warn('Deposit: wallet send failed, trying EIP-1193', sendErr);
                    try {
                        txHash = (await sendPolDepositEip1193({
                            getActiveEip1193,
                            to,
                            valueWei,
                            dataHex,
                            t,
                        })) as string;
                    } catch (e2: unknown) {
                        if (isRecord(e2) && e2.code === 'NO_EIP1193') {
                            toast.error(t('wallet.web3_deposit.no_wallet_for_send'));
                        }
                        throw e2;
                    }
                }
            }

            toast.info(t('wallet.web3_deposit.tx_submitted'));

            const res = await walletApi.postDepositSubmit({
                txHash: txHash,
                claimedAmount: amount
            });

            if (res.data.ok) {
                toast.success(t('wallet.web3_deposit.deposit_success_registered'));
                setDepositForm({ amount: '' });
                fetchPendingDeposits();
                startPendingPoll();
            } else {
                toast.error(res.data.message || t('common.error'));
            }
        } catch (error: unknown) {
            console.error("Deposit error", error);
            const er = isRecord(error) ? error : {};
            const code = er.code;
            const message = typeof er.message === 'string' ? er.message : '';
            const reason = typeof er.reason === 'string' ? er.reason : '';
            if (code === 4001) {
                toast.error(t('wallet.web3_deposit.tx_rejected'));
            } else if (code === 'INSUFFICIENT_FUNDS' || message.includes('insufficient funds')) {
                toast.error(t('wallet.web3_deposit.insufficient_funds'));
            } else {
                toast.error(reason || message || t('wallet.web3_deposit.tx_failed'));
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const { handleWithdraw, handleWithdrawalCodeSubmit } = createWithdrawHandlers({
        t,
        isActionLoading,
        setIsActionLoading,
        balanceAmount: balance.amount,
        withdrawForm,
        setWithdrawForm,
        withdrawalChallenge,
        setWithdrawalChallenge,
        withdrawalCode,
        setWithdrawalCode,
        fetchWalletData,
    });

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('common.copied'));
    };


    return {
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
    };
}
