import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const RECONNECT_DELAY_MS = 2000;

export type TournamentRealtimeUpdate = {
  tournamentId: number;
  top?: unknown[];
  participantCount?: number;
};

export function useTournamentHubSocket(options: {
  tournamentId: number | null;
  onUpdate: (payload: TournamentRealtimeUpdate) => void;
  onPoll?: () => void;
  pollIntervalMs?: number;
}) {
  const { tournamentId, onUpdate, onPoll, pollIntervalMs = 60_000 } = options;
  const [connected, setConnected] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const subscribedRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const onPollRef = useRef(onPoll);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onPollRef.current = onPoll;
  }, [onUpdate, onPoll]);

  useEffect(() => {
    if (tournamentId == null) return undefined;
    const socket = io('/', { withCredentials: true, transports: ['polling', 'websocket'], reconnection: true });
    socketRef.current = socket;

    const subscribe = (id: number) => {
      socket.emit('tournament:subscribe', id);
      subscribedRef.current = id;
    };

    socket.on('connect', () => {
      setConnected(true);
      subscribe(tournamentId);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('tournament:update', (payload: TournamentRealtimeUpdate) => {
      if (payload?.tournamentId === tournamentId) {
        setLastUpdateAt(Date.now());
        onUpdateRef.current(payload);
      }
    });

    return () => {
      if (subscribedRef.current != null) {
        socket.emit('tournament:unsubscribe', subscribedRef.current);
        subscribedRef.current = null;
      }
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [tournamentId]);

  const resubscribe = useCallback((id: number) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (subscribedRef.current !== id) {
      if (subscribedRef.current != null) socket.emit('tournament:unsubscribe', subscribedRef.current);
      socket.emit('tournament:subscribe', id);
      subscribedRef.current = id;
    }
  }, []);

  useEffect(() => {
    if (tournamentId != null) resubscribe(tournamentId);
  }, [tournamentId, resubscribe]);

  useEffect(() => {
    if (tournamentId == null || !onPollRef.current) return undefined;
    const id = window.setInterval(() => {
      if (!socketRef.current?.connected) onPollRef.current?.();
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [tournamentId, pollIntervalMs]);

  return { connected, lastUpdateAt, reconnectDelayMs: RECONNECT_DELAY_MS };
}
