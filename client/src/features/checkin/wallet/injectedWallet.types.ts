export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type InjectedWalletProviderInfo = {
  provider: Eip1193Provider;
  info?: {
    uuid?: string;
    name?: string;
    icon?: string;
    rdns?: string;
  };
  source?: string;
};

export type InjectedWalletConnection = {
  address: `0x${string}`;
  chainId: number;
  provider: Eip1193Provider;
};
