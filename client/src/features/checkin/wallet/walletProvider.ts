import type { Eip1193Provider } from './injectedWallet.types';
import { collectInjectedWalletProvidersSync } from './injectedWallet';

/** Sync browser EIP-1193 provider for check-in contract sends. */
export function getBrowserEthereumProvider(): Eip1193Provider | null {
  const list = collectInjectedWalletProvidersSync();
  return list[0]?.provider ?? null;
}
