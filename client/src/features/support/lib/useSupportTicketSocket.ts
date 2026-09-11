import { useEffect, useRef } from 'react';
import { useGameStore } from '../../shell/lib/game.store';

/**
 * Subscribe to real-time replies for a support ticket (user session; same Socket.IO as mining).
 */
export function useSupportTicketSocket(
  supportMessageId: number | string | null | undefined,
  onReply: (reply: unknown) => void,
) {
  const initSocket = useGameStore((s) => s.initSocket);
  const socket = useGameStore((s) => s.socket);
  const onReplyRef = useRef(onReply);
  useEffect(() => { onReplyRef.current = onReply; }, [onReply]);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  useEffect(() => {
    if (!supportMessageId) return;

    const sock = useGameStore.getState().socket;
    if (!sock) return;

    const handleReply = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as { supportMessageId?: unknown; reply?: unknown };
      if (
        Number(p.supportMessageId) === Number(supportMessageId) &&
        p.reply !== undefined &&
        p.reply !== null
      ) {
        onReplyRef.current?.(p.reply);
      }
    };

    sock.on('support:reply', handleReply);

    const subscribe = () => {
      sock.emit('support:subscribe', { supportMessageId }, () => {});
    };

    if (sock.connected) subscribe();
    sock.on('connect', subscribe);

    return () => {
      sock.off('support:reply', handleReply);
      sock.off('connect', subscribe);
      // Socket.IO client sockets have no .leave() — rooms are server-managed.
      // Listeners are already removed above; room membership is cleared by the
      // server when the socket disconnects. Emit nothing to avoid a crash.
    };
  }, [supportMessageId, socket]);
}
