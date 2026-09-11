import { useEffect } from 'react';
import {
  ADLINKFLY_CLAIMED_MESSAGE,
  ADLINKFLY_DONE_MESSAGE,
  ADLINKFLY_BROADCAST_CHANNEL,
} from './adlinkflySession';
import { readBroadcastToken } from './pasteadStorage';

type AdlinkflyBroadcastHandlers = {
  onClaimed: (message: string) => void;
  onDone: (token: string | null) => void;
};

export function useAdlinkflyBroadcast(handlers: AdlinkflyBroadcastHandlers): void {
  const { onClaimed, onDone } = handlers;

  useEffect(() => {
    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === ADLINKFLY_CLAIMED_MESSAGE) {
        onClaimed(typeof event.data.message === 'string' ? event.data.message : '');
        return;
      }
      if (event.data?.type === ADLINKFLY_DONE_MESSAGE) {
        onDone(readBroadcastToken(event.data));
      }
    };

    window.addEventListener('message', onWindowMessage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(ADLINKFLY_BROADCAST_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === ADLINKFLY_CLAIMED_MESSAGE) {
          onClaimed(typeof event.data.message === 'string' ? event.data.message : '');
          return;
        }
        if (event.data?.type === ADLINKFLY_DONE_MESSAGE) {
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
