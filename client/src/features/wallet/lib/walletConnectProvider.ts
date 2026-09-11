/**
 * Lazy WalletConnect / Reown AppKit singleton.
 * Preload + connect share one AppKit — Core warns if Init() runs twice.
 */
import type { Eip1193Provider } from '../../checkin/wallet/injectedWallet.types';

/** Polygon PoS mainnet (eip155). */
const POLYGON_MAINNET_CHAIN_ID = 137;

type AppKitAccountState = { isConnected?: boolean };
type AppKitUiState = { open?: boolean };

type AppKitInstance = {
  open: (opts?: { view?: string; namespace?: string }) => void;
  close: () => Promise<void>;
  getProvider: (namespace: string) => Eip1193Provider | undefined;
  getAddress: (namespace: string) => string | undefined;
  getIsConnectedState: () => boolean;
  disconnect: (namespace: string) => Promise<void>;
  subscribeState: (cb: (state: AppKitUiState) => void) => () => void;
  subscribeAccount: (cb: (state: AppKitAccountState) => void, namespace: string) => () => void;
};

let appKitPromise: Promise<AppKitInstance> | null = null;

export function isWalletConnectProjectIdConfigured(): boolean {
  return String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '').trim().length > 0;
}

function readProjectId(): string {
  const id = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '').trim();
  if (!id) throw new Error('WalletConnect projectId not configured');
  return id;
}

async function createAppKitSingleton(): Promise<AppKitInstance> {
  const projectId = readProjectId();
  const [{ createAppKit }, { polygon }, { EthersAdapter }] = await Promise.all([
    import('@reown/appkit'),
    import('@reown/appkit/networks'),
    import('@reown/appkit-adapter-ethers'),
  ]);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://blockminer.space';
  return createAppKit({
    adapters: [new EthersAdapter()],
    networks: [polygon],
    defaultNetwork: polygon,
    projectId,
    showWallets: true,
    themeMode: 'dark',
    featuredWalletIds: [
      '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
      'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
      '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369',
      '8a0ee50d1f22f6651afcae7eb4253e52a3310b90af5daef78a8c4929a9bb99d4',
    ],
    termsConditionsUrl: `${origin}/terms-of-use`,
    privacyPolicyUrl: `${origin}/privacy-policy`,
    features: { email: false, socials: false, onramp: false, swaps: false },
    metadata: {
      name: 'Block Miner',
      description: 'Block Miner — mineração de criptomoedas',
      url: origin,
      icons: [`${origin}/favicon.ico`],
    },
  }) as unknown as AppKitInstance;
}

function getAppKit(): Promise<AppKitInstance> {
  if (!appKitPromise) {
    appKitPromise = createAppKitSingleton().catch((err) => {
      appKitPromise = null;
      throw err;
    });
  }
  return appKitPromise;
}

/** Warm the AppKit chunk without opening the modal (pointerenter / focus). */
export function preloadWalletConnectProvider(): void {
  if (!isWalletConnectProjectIdConfigured()) return;
  void getAppKit().catch(() => {});
}

export async function connectWalletConnectProvider(): Promise<{
  provider: Eip1193Provider;
  account: string;
  chainId: number;
}> {
  const kit = await getAppKit();
  if (kit.getIsConnectedState()) {
    const provider = kit.getProvider('eip155');
    const account = kit.getAddress('eip155');
    if (provider && account) {
      return { provider, account, chainId: POLYGON_MAINNET_CHAIN_ID };
    }
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const unsubUi = kit.subscribeState((state) => {
      if (!state.open && !settled) {
        settled = true;
        unsubUi();
        unsubAccount();
        if (kit.getIsConnectedState()) resolve();
        else reject(new Error('Connection cancelled'));
      }
    });
    const unsubAccount = kit.subscribeAccount((state) => {
      if (state.isConnected && !settled) {
        settled = true;
        unsubUi();
        unsubAccount();
        void kit.close().then(() => resolve());
      }
    }, 'eip155');
    kit.open({ view: 'Connect', namespace: 'eip155' });
  });

  const provider = kit.getProvider('eip155');
  const account = kit.getAddress('eip155');
  if (!provider || !account) throw new Error('No account returned by WalletConnect session');
  return { provider, account, chainId: POLYGON_MAINNET_CHAIN_ID };
}

export async function disconnectWalletConnectProvider(): Promise<void> {
  if (!appKitPromise) return;
  try {
    const kit = await appKitPromise;
    if (kit.getIsConnectedState()) await kit.disconnect('eip155');
  } catch {
    /* best-effort */
  }
}
