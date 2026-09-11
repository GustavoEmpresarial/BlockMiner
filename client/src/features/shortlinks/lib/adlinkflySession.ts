export const ADLINKFLY_BROADCAST_CHANNEL = 'blockminer-adlinkfly';
export const ADLINKFLY_CLAIMED_MESSAGE = 'blockminer:adlinkfly-claimed';
export const ADLINKFLY_DONE_MESSAGE = 'blockminer:adlinkfly-done';

function postAdlinkflyBroadcast(payload: { type: string; token?: string | null; message?: string }): void {
  try {
    const opener = window.opener;
    if (opener && !opener.closed) {
      opener.postMessage(payload, window.location.origin);
    }
  } catch {
    /* ignore */
  }
  try {
    const channel = new BroadcastChannel(ADLINKFLY_BROADCAST_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/** Called from `/shortlinks/adlinkfly/done` after server marks session complete. */
export function broadcastAdlinkflyDone(token: string | null | undefined): void {
  postAdlinkflyBroadcast({ type: ADLINKFLY_DONE_MESSAGE, token: token ?? null });
}

export function broadcastAdlinkflyClaimed(message: string): void {
  postAdlinkflyBroadcast({ type: ADLINKFLY_CLAIMED_MESSAGE, message });
}
