/**
 * Tournament realtime room subscribe/unsubscribe. Ported from the Socket.IO wiring half of
 * legacy/server/services/tournamentRealtime.ts (`setTournamentIo`'s `io.on('connection', ...)`
 * block) — the leaderboard-emit half lives in tournaments.realtime.ts, called by the scoring
 * engine (tournaments.engine.ts / .score-computation.ts / .projection.ts).
 */
import type { Server, Socket } from "socket.io";
import { logger as rootLogger } from "../../core/logger/index.js";
import { setTournamentIo } from "./tournaments.realtime.js";

const logger = rootLogger.child("TournamentSocket");
const roomName = (tournamentId: number) => `tournament:${tournamentId}`;

export function registerTournamentSocketHandlers(io: Server): void {
  setTournamentIo(io);

  io.on("connection", (socket: Socket) => {
    socket.on("tournament:subscribe", (rawId: unknown) => {
      const tournamentId = Number(rawId);
      if (!Number.isFinite(tournamentId) || tournamentId <= 0) return;
      socket.join(roomName(tournamentId));
      logger.debug("tournament.realtime.subscribe", { tournamentId, socketId: socket.id });
    });
    socket.on("tournament:unsubscribe", (rawId: unknown) => {
      const tournamentId = Number(rawId);
      if (!Number.isFinite(tournamentId) || tournamentId <= 0) return;
      socket.leave(roomName(tournamentId));
    });
  });
}
