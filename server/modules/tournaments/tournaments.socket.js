import { logger as rootLogger } from "../../core/logger/index.js";
import { setTournamentIo } from "./tournaments.realtime.js";
const logger = rootLogger.child("TournamentSocket");
const roomName = (tournamentId) => `tournament:${tournamentId}`;
export function registerTournamentSocketHandlers(io) {
    setTournamentIo(io);
    io.on("connection", (socket) => {
        socket.on("tournament:subscribe", (rawId) => {
            const tournamentId = Number(rawId);
            if (!Number.isFinite(tournamentId) || tournamentId <= 0)
                return;
            socket.join(roomName(tournamentId));
            logger.debug("tournament.realtime.subscribe", { tournamentId, socketId: socket.id });
        });
        socket.on("tournament:unsubscribe", (rawId) => {
            const tournamentId = Number(rawId);
            if (!Number.isFinite(tournamentId) || tournamentId <= 0)
                return;
            socket.leave(roomName(tournamentId));
        });
    });
}
