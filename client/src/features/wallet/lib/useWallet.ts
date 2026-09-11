import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { EIP1193Provider } from 'viem';
import { BrowserProvider } from 'ethers';
import { api } from '../../../shared/auth/auth.store';
import { getBrowserEthereumProvider } from '../../checkin/wallet/walletProvider';
import {
  connectInjectedWallet,
  getInjectedWalletProviders,
  InjectedWalletError,
  INJECTED_WALLET_ERROR_CODES,
  isBenignInjectedWalletRpcError,
  safeEthAccounts,
} from '../../checkin/wallet/injectedWallet';
import { subscribeInjectedEthereumEvents } from './eip1193ProviderEvents';
import {
  clearWalletSessionClearedByUserFlag,
  isWalletSessionClearedByUser,
  markWalletSessionClearedByUser,
} from './walletSessionPreference';
import { t as walletT } from './wallet.i18n';
import {
  connectWalletConnectProvider,
  disconnectWalletConnectProvider,
  isWalletConnectProjectIdConfigured,
} from './walletConnectProvider';

const POLYGON_CHAIN_ID = '0x89';
const POLYGON_NUM = 137;

function getInjectedProvider(): EIP1193Provider | undefined {
  return getBrowserEthereumProvider() ?? undefined;
}

function isUnknownMethodError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const o = err as { code?: unknown; message?: unknown };
  const code = o.code;
  const msg = String(o.message || '').toLowerCase();
  return (
    code === -32601 ||
    code === 4200 ||
    msg.includes('unknown method') ||
    msg.includes('does not exist') ||
    msg.includes('not supported')
  );
}

function readWalletErrorMeta(e: unknown): { code?: string | number; causeCode?: number; message: string } {
  if (typeof e !== 'object' || e === null) return { message: '' };
  const o = e as { code?: unknown; cause?: unknown; message?: unknown };
  let causeCode: number | undefined;
  if (typeof o.cause === 'object' && o.cause !== null && 'code' in o.cause) {
    const c = (o.cause as { code?: unknown }).code;
    if (typeof c === 'number') causeCode = c;
  }
  const code = typeof o.code === 'string' || typeof o.code === 'number' ? o.code : undefined;
  const message = typeof o.message === 'string' ? o.message : '';
  return { code, causeCode, message };
}

interface SwitchNetworkOptions {
  onUnknownMethod?: () => void;
}

async function switchNetworkFor(
  provider: EIP1193Provider | null | undefined,
  options: SwitchNetworkOptions = {},
): Promise<void> {
  if (!provider) return;
  const { onUnknownMethod } = options;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID }],
    });
  } catch (switchError: unknown) {
    if (isUnknownMethodError(switchError)) {
      onUnknownMethod?.();
      return;
    }
    const meta = readWalletErrorMeta(switchError);
    if (meta.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: POLYGON_CHAIN_ID,
              chainName: 'Polygon Mainnet',
              nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
              rpcUrls: ['https://polygon-rpc.com'],
              blockExplorerUrls: ['https://polygonscan.com/'],
            },
          ],
        });
      } catch (addError: unknown) {
        if (isUnknownMethodError(addError) && onUnknownMethod) {
          onUnknownMethod();
          return;
        }
        console.error('Error adding network:', addError);
      }
    } else {
      console.error('Error switching network:', switchError);
    }
  }
}

function normalizeChainNum(chainId: unknown): number | null {
  if (chainId == null) return null;
  if (typeof chainId === 'number' && Number.isFinite(chainId)) return chainId;
  const s = String(chainId);
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const n = parseInt(s, 16);
    return Number.isNaN(n) ? null : n;
  }
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

async function signOwnershipMessageWithProvider(
  provider: EIP1193Provider,
  userAccount: string,
): Promise<unknown> {
  const message = `Verify wallet ownership for Block Miner: ${userAccount}`;
  const req = provider.request as (args: { method: string; params: readonly unknown[] }) => Promise<unknown>;
  try {
    return await req({
      method: 'personal_sign',
      params: [message, userAccount],
    });
  } catch (signError: unknown) {
    const sig = await req({
      method: 'personal_sign',
      params: [userAccount, message],
    });
    if (!sig) throw signError;
    return sig;
  }
}

function isWalletConnectEnvPresent(): boolean {
  return isWalletConnectProjectIdConfigured();
}

interface ConnectOptions {
  useBrowserExtension?: boolean;
}

export function useWallet() {
  const t = walletT;

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

const walletConnectConfigured = isWalletConnectEnvPresent();
  const [kitConnected, setKitConnected] = useState(false);
  const [kitAddress, setKitAddress] = useState<string | null>(null);

  const verifiedInjectedRef = useRef<EIP1193Provider | null>(null);
  const wcProviderRef = useRef<EIP1193Provider | null>(null);

  const getActiveEip1193 = useCallback((): EIP1193Provider | undefined => {
    if (wcProviderRef.current) return wcProviderRef.current;
    if (verifiedInjectedRef.current) return verifiedInjectedRef.current;
    return getInjectedProvider();
  }, []);

  const cancelWalletSession = useCallback(async () => {
    markWalletSessionClearedByUser();
    if (wcProviderRef.current) {
      wcProviderRef.current = null;
      setKitConnected(false);
      setKitAddress(null);
      void disconnectWalletConnectProvider();
    }
    verifiedInjectedRef.current = null;
    setIsConnecting(false);
    setAccount(null);
    setIsConnected(false);
  }, []);

  const disconnect = useCallback(async () => {
    await cancelWalletSession();
  }, [cancelWalletSession]);

  const disconnectWalletConnectSession = useCallback(async () => {
    await cancelWalletSession();
  }, [cancelWalletSession]);

  const signMessage = useCallback(
    async (message: string, userAccount?: string): Promise<string> => {
      const provider = getActiveEip1193();
      if (!provider) {
        throw new Error(t('wallet.web3_deposit.no_wallet_for_send'));
      }
      const acct = userAccount || account;
      if (!acct) {
        throw new Error(t('wallet.web3_deposit.no_wallet_for_send'));
      }
      const req = provider.request as (args: { method: string; params: readonly unknown[] }) => Promise<unknown>;
      try {
        const sig = await req({ method: 'personal_sign', params: [message, acct] });
        return typeof sig === 'string' ? sig : '';
      } catch {
        const sig = await req({ method: 'personal_sign', params: [acct, message] });
        return typeof sig === 'string' ? sig : '';
      }
    },
    [account, getActiveEip1193, t],
  );

  /** EIP-1193 / ethers BrowserProvider send — replaces wagmi useSendTransaction. */
  const sendTransaction = useCallback(
    async (tx: { to: string; value?: bigint; data?: string }): Promise<string> => {
      const eip1193 = getActiveEip1193();
      if (!eip1193) {
        throw Object.assign(new Error(t('wallet.web3_deposit.no_wallet_for_send')), { code: 'NO_EIP1193' });
      }
      const browser = new BrowserProvider(eip1193);
      const signer = await browser.getSigner();
      const response = await signer.sendTransaction({
        to: tx.to,
        value: tx.value,
        data: tx.data,
      });
      return response.hash;
    },
    [getActiveEip1193, t],
  );

  const verifyWithServer = useCallback(
    async (userAccount: string, eip1193Provider: EIP1193Provider | undefined) => {
      const provider = eip1193Provider || getActiveEip1193();
      if (!provider) {
        throw new Error(t('wallet.web3_deposit.no_wallet_for_send'));
      }
      const signature = await signOwnershipMessageWithProvider(provider, userAccount);

      const res = await api.post('/wallet/update-address', {
        walletAddress: userAccount,
        signature,
      });

      if (res.data.ok) {
        setAccount(userAccount);
        setIsConnected(true);
        toast.success(t('wallet.web3_deposit.wallet_verified_connected'));
        return true;
      }
      throw new Error(
        typeof res.data.message === 'string' ? res.data.message : t('wallet.web3_deposit.verification_failed'),
      );
    },
    [getActiveEip1193, t],
  );

  const connectInjectedAndVerify = useCallback(async (): Promise<boolean> => {
    clearWalletSessionClearedByUserFlag();
    const discovered = await getInjectedWalletProviders();
    if (discovered.length === 0) {
      toast.error(t('wallet.web3_deposit.no_browser_wallet'), {
        id: 'wallet-injected-provider-error',
        duration: 8000,
      });
      return false;
    }

    setIsConnecting(true);
    try {
      const connection = await connectInjectedWallet();
      const injected = connection.provider as EIP1193Provider;
      verifiedInjectedRef.current = injected;

      const chainHex = `0x${connection.chainId.toString(16)}`;
      setChainId(chainHex);

      if (chainHex !== POLYGON_CHAIN_ID) {
        await switchNetworkFor(injected, {
          onUnknownMethod: () => toast.error(t('wallet.web3_deposit.switch_chain_unsupported')),
        });
      }

      setAccount(connection.address);
      setIsConnected(true);
      verifiedInjectedRef.current = injected;
      return true;
    } catch (error: unknown) {
      if (!isBenignInjectedWalletRpcError(error)) {
        console.error('Connection error:', error);
      }
      if (error instanceof InjectedWalletError) {
        if (error.code === INJECTED_WALLET_ERROR_CODES.USER_REJECTED) {
          toast.error(t('wallet.web3_deposit.connection_cancelled'), { id: 'wallet-connect-user-rejected' });
        } else if (error.code === INJECTED_WALLET_ERROR_CODES.NO_PROVIDER) {
          toast.error(t('wallet.web3_deposit.no_browser_wallet'), { id: 'wallet-injected-provider-error' });
        } else {
          toast.error(t('wallet.web3_deposit.injected_connect_failed'), {
            id: 'wallet-connect-verify-failed',
          });
        }
        return false;
      }
      const meta = readWalletErrorMeta(error);
      if (meta.code === 4001) {
        toast.error(t('wallet.web3_deposit.connection_cancelled'), { id: 'wallet-connect-user-rejected' });
      } else {
        toast.error(meta.message || t('wallet.web3_deposit.injected_connect_failed'), {
          id: 'wallet-connect-verify-failed',
        });
      }
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [t]);

  const connect = useCallback(
    async (options: ConnectOptions = {}): Promise<boolean> => {
      void options;
      if (isConnected && account) {
        return true;
      }
      return connectInjectedAndVerify();
    },
    [isConnected, account, connectInjectedAndVerify],
  );

  /** Opens the real WalletConnect QR modal (mobile pairing) — does not touch injected extensions. */
  const connectWalletConnect = useCallback(async () => {
    if (!walletConnectConfigured) {
      toast.error(t('wallet.web3_deposit.wc_missing_build'));
      return;
    }
    if (isConnected && kitConnected && account) {
      return;
    }
    clearWalletSessionClearedByUserFlag();
    setIsConnecting(true);
    try {
      const { provider, account: wcAccount, chainId: wcChainId } = await connectWalletConnectProvider();
      wcProviderRef.current = provider;
      verifiedInjectedRef.current = null;

      const chainHex = `0x${wcChainId.toString(16)}`;
      setChainId(chainHex);
      if (chainHex !== POLYGON_CHAIN_ID) {
        await switchNetworkFor(provider, {
          onUnknownMethod: () => toast.error(t('wallet.web3_deposit.switch_chain_unsupported')),
        });
      }

      await verifyWithServer(wcAccount, provider);
      setKitConnected(true);
      setKitAddress(wcAccount);
    } catch (error: unknown) {
      const meta = readWalletErrorMeta(error);
      if (meta.message.toLowerCase().includes('reject') || meta.message.toLowerCase().includes('closed')) {
        toast.error(t('wallet.web3_deposit.connection_cancelled'), { id: 'wallet-connect-user-rejected' });
      } else {
        console.error('WalletConnect connection error:', error);
        toast.error(meta.message || t('wallet.web3_deposit.injected_connect_failed'), {
          id: 'wallet-connect-verify-failed',
        });
      }
      wcProviderRef.current = null;
      setKitConnected(false);
      setKitAddress(null);
    } finally {
      setIsConnecting(false);
    }
  }, [walletConnectConfigured, isConnected, kitConnected, account, t, verifyWithServer]);

  const switchNetwork = useCallback(async () => {
    const discovered = await getInjectedWalletProviders();
    const p =
      (verifiedInjectedRef.current as EIP1193Provider | undefined) ||
      (discovered[0]?.provider as EIP1193Provider | undefined);
    await switchNetworkFor(p, {
      onUnknownMethod: () => toast.error(t('wallet.web3_deposit.switch_chain_unsupported')),
    });
    if (p) {
      try {
        const hex = await p.request({ method: 'eth_chainId' });
        setChainId(typeof hex === 'string' ? hex : String(hex));
      } catch {
        /* ignore */
      }
    }
  }, [t]);

  const switchToPolygon = switchNetwork;

  const checkConnection = useCallback(async () => {
    if (isWalletSessionClearedByUser()) {
      return;
    }
    const discovered = await getInjectedWalletProviders();
    const provider = discovered[0]?.provider;
    if (!provider) return;

    try {
      const accounts = await safeEthAccounts(provider);
      if (accounts.length === 0) return;

      const currentChainId = await provider.request({ method: 'eth_chainId' });
      setChainId(typeof currentChainId === 'string' ? currentChainId : String(currentChainId));

      const res = await api.get('/wallet/balance');
      if (
        res.data.ok &&
        res.data.walletAddress &&
        res.data.walletAddress.toLowerCase() === accounts[0].toLowerCase()
      ) {
        verifiedInjectedRef.current = provider as EIP1193Provider;
        setAccount(accounts[0]);
        setIsConnected(true);
      }
    } catch (error: unknown) {
      if (!isBenignInjectedWalletRpcError(error)) {
        console.error('Error checking connection:', error);
      }
    }
  }, []);

  useEffect(() => {
    void checkConnection();

    const provider = getInjectedProvider();
    if (!provider) return undefined;

    const handleAccountsChanged = (accounts: unknown) => {
      if (isWalletSessionClearedByUser()) {
        setAccount(null);
        setIsConnected(false);
        return;
      }
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      if (list.length > 0) {
        setAccount(list[0]);
        setIsConnected(true);
      } else {
        setAccount(null);
        setIsConnected(false);
      }
    };

    const handleChainChanged = (newChainId: unknown) => {
      setChainId(typeof newChainId === 'string' ? newChainId : String(newChainId));
    };

    return subscribeInjectedEthereumEvents(provider, {
      onAccountsChanged: handleAccountsChanged,
      onChainChanged: handleChainChanged,
    });
  }, [checkConnection]);

  const chainNum = normalizeChainNum(chainId);
  const isCorrectNetwork = chainId === POLYGON_CHAIN_ID || chainNum === POLYGON_NUM;

  return {
    account,
    address: account,
    chainId,
    isConnected,
    isConnecting,
    isCorrectNetwork,
    connect,
    disconnect,
    connectWalletConnect,
    switchNetwork,
    switchToPolygon,
    signMessage,
    sendTransaction,
    getActiveEip1193,
    walletConnectConfigured,
    disconnectWalletConnectSession,
    cancelWalletSession,
    kitConnected,
    kitAddress,
  };
}
