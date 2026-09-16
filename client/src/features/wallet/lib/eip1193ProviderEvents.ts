import { safeGetFunction, safeInvoke } from '../../../shared/utils/safeObjectAccess';

type EthereumEventHandler = (...args: unknown[]) => void;

/**
 * Subscribe to common EIP-1193 events and return a cleanup that never throws
 * if the vendor uses a non-standard provider (fixes removeListener crashes on some wallets).
 *
 * Every property read goes through safeGet* : a proxied `window.ethereum` (extension or
 * in-app browser) can make even `typeof p.on` throw a proxy-invariant TypeError, which used
 * to escape this effect and take the whole /wallet page down via the root error boundary.
 */
export function subscribeInjectedEthereumEvents(
  provider: unknown,
  handlers:
    | {
        onAccountsChanged?: EthereumEventHandler;
        onChainChanged?: EthereumEventHandler;
      }
    | null
    | undefined,
): () => void {
  const noop = () => {};
  if (!provider) return noop;
  const on = safeGetFunction<(event: string, fn: EthereumEventHandler) => void>(provider, 'on');
  if (!on) return noop;

  const { onAccountsChanged, onChainChanged } = handlers || {};
  const attached: Array<[string, EthereumEventHandler]> = [];
  const attach = (event: string, fn: EthereumEventHandler | undefined) => {
    if (typeof fn !== 'function') return;
    try {
      on.call(provider, event, fn);
      attached.push([event, fn]);
    } catch {
      /* non-standard provider — treat as "no events available" */
    }
  };
  attach('accountsChanged', onAccountsChanged);
  attach('chainChanged', onChainChanged);

  if (attached.length === 0) return noop;

  return () => {
    for (const [event, fn] of attached) {
      if (safeInvoke(provider, 'removeListener', event, fn)) continue;
      safeInvoke(provider, 'off', event, fn);
    }
  };
}
