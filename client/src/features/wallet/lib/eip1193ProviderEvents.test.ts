import { describe, expect, it, vi } from 'vitest';
import { subscribeInjectedEthereumEvents } from './eip1193ProviderEvents';
import { collectInjectedWalletProvidersSync } from '../../checkin/wallet/injectedWallet';

/**
 * Reproduces the production crash reported on 15/09/2026 (admin "Erros de cliente",
 * 12 critical events on https://blockminer.space/wallet, Android Chrome):
 *
 *   TypeError: 'get' on proxy: property 'on' is a read-only and non-configurable data
 *   property on the proxy target but the proxy did not return its actual value
 *
 * A wallet extension / in-app browser wraps `window.ethereum` in a Proxy whose `get` trap
 * returns a re-bound function. For a property the target defines as non-writable and
 * non-configurable that breaks an ES invariant, so the *read itself* throws — which used
 * to escape a useEffect and take the whole page down through the root error boundary.
 */
function hostileProxyProvider(): unknown {
  const target = {};
  // Non-writable + non-configurable: the invariant the trap below violates.
  Object.defineProperty(target, 'on', {
    value: function on(_event: string, _fn: unknown) {
      return undefined;
    },
    writable: false,
    configurable: false,
    enumerable: true,
  });
  Object.defineProperty(target, 'request', {
    value: function request() {
      return Promise.resolve([]);
    },
    writable: false,
    configurable: false,
    enumerable: true,
  });
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      // Returning a *different* function object for a non-configurable, non-writable
      // data property is exactly what makes the engine throw.
      if (typeof value === 'function') return value.bind(t);
      return value;
    },
  });
}

describe('hostile proxy provider (production repro)', () => {
  it('a plain read of .on really does throw — the repro is faithful', () => {
    const provider = hostileProxyProvider() as Record<string, unknown>;
    expect(() => provider.on).toThrow(TypeError);
  });

  it('subscribeInjectedEthereumEvents never throws and returns a usable cleanup', () => {
    const provider = hostileProxyProvider();
    let cleanup: () => void = () => {};
    expect(() => {
      cleanup = subscribeInjectedEthereumEvents(provider, {
        onAccountsChanged: vi.fn(),
        onChainChanged: vi.fn(),
      });
    }).not.toThrow();
    expect(() => cleanup()).not.toThrow();
  });

  it('provider discovery never throws on a hostile window.ethereum', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'ethereum');
    Object.defineProperty(window, 'ethereum', {
      value: hostileProxyProvider(),
      configurable: true,
      writable: true,
    });
    try {
      expect(() => collectInjectedWalletProvidersSync()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'ethereum', original);
      else delete (window as { ethereum?: unknown }).ethereum;
    }
  });
});

describe('subscribeInjectedEthereumEvents with a well-behaved provider', () => {
  function fakeProvider() {
    const listeners: Array<[string, (...a: unknown[]) => void]> = [];
    return {
      listeners,
      on: (event: string, fn: (...a: unknown[]) => void) => {
        listeners.push([event, fn]);
      },
      removeListener: (event: string, fn: (...a: unknown[]) => void) => {
        const i = listeners.findIndex(([e, f]) => e === event && f === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
  }

  it('subscribes both events and detaches exactly what it attached', () => {
    const provider = fakeProvider();
    const onAccountsChanged = vi.fn();
    const onChainChanged = vi.fn();

    const cleanup = subscribeInjectedEthereumEvents(provider, { onAccountsChanged, onChainChanged });
    expect(provider.listeners.map(([e]) => e)).toEqual(['accountsChanged', 'chainChanged']);

    cleanup();
    expect(provider.listeners).toHaveLength(0);
  });

  it('only detaches the handlers it actually attached', () => {
    const provider = fakeProvider();
    const cleanup = subscribeInjectedEthereumEvents(provider, { onChainChanged: vi.fn() });
    expect(provider.listeners.map(([e]) => e)).toEqual(['chainChanged']);
    cleanup();
    expect(provider.listeners).toHaveLength(0);
  });

  it('returns a no-op cleanup when the provider has no event support', () => {
    const cleanup = subscribeInjectedEthereumEvents({ request: () => Promise.resolve() }, {
      onAccountsChanged: vi.fn(),
    });
    expect(() => cleanup()).not.toThrow();
  });

  it('falls back to off() when removeListener is missing', () => {
    const off = vi.fn();
    const provider = { on: vi.fn(), off };
    const handler = vi.fn();
    const cleanup = subscribeInjectedEthereumEvents(provider, { onAccountsChanged: handler });
    cleanup();
    expect(off).toHaveBeenCalledWith('accountsChanged', handler);
  });

  it('survives a provider whose removeListener throws', () => {
    const provider = {
      on: vi.fn(),
      removeListener: () => {
        throw new Error('vendor bug');
      },
    };
    const cleanup = subscribeInjectedEthereumEvents(provider, { onChainChanged: vi.fn() });
    expect(() => cleanup()).not.toThrow();
  });
});
