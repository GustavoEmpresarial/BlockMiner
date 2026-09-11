import { useEffect } from 'react';
import {
  PASTEAD_CLAIMED_MESSAGE,
  PASTEAD_DONE_MESSAGE,
  PASTEAD_BROADCAST_CHANNEL,
} from './pasteadSession';
import { readBroadcastToken } from './pasteadStorage';

type PasteadBroadcastHandlers = {
  onClaimed: (message: string) => void;
  onDone: (token: string | null) => void;
};

/** Listens for popup → main-tab pastead events (postMessage + BroadcastChannel). */
export function usePasteadBroadcast(handlers: PasteadBroadcastHandlers): void {
  const { onClaimed, onDone } = handlers;

  useEffect(() => {
    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === PASTEAD_CLAIMED_MESSAGE) {
        onClaimed(typeof event.data.message === 'string' ? event.data.message : '');
        return;
      }
      if (event.data?.type === PASTEAD_DONE_MESSAGE) {
        onDone(readBroadcastToken(event.data));
      }
    };

    window.addEventListener('message', onWindowMessage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(PASTEAD_BROADCAST_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === PASTEAD_CLAIMED_MESSAGE) {
          onClaimed(typeof event.data.message === 'string' ? event.data.message : '');
          return;
        }
        if (event.data?.type === PASTEAD_DONE_MESSAGE) {
          onDone(readBroadcastToken(event.data));
        }
      };
    } catch {
      /* BroadcastChannel unavailable */
    }

    return () => {
      window.removeEventListener('message', onWindowMessage);
      channel?.close();
    };
  }, [onClaimed, onDone]);
}
