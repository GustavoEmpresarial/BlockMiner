import { Server } from "socket.io";
import { logger } from "../logger/index.js";
import { buildSocketIoCorsOptions } from "./socket.cors.js";
import { attachSocketIoExplicitAuthMiddleware } from "./socket.auth.js";
import { registerMiningSocketHandlers } from "../../modules/mining/mining.socket.js";
import { registerSupportSocketHandlers } from "../../modules/support/support.socket.js";
import { registerTournamentSocketHandlers } from "../../modules/tournaments/tournaments.socket.js";
import { registerGamesSocketHandlers } from "../../modules/games/games.socket.js";
const log = logger.child("Socket");
let ioSingleton = null;
/**
 * Creates the Socket.IO server bound to `httpServer` and registers every ported realtime
 * domain (miner, support, tournament, games). Games handlers cover all 5 minigames
 * (crypto-memory, crypto-match-3, block-stack, sky-runner, cart-rush) — see
 * server/modules/games/games.socket.ts header and docs/PROGRESSO.txt items 12i/12j for
 * when the last 3 were ported (12d's original scope cut no longer applies).
 */
export function attachSocketIO(httpServer) {
    const io = new Server(httpServer, {
        cors: buildSocketIoCorsOptions(),
    });
    attachSocketIoExplicitAuthMiddleware(io);
    registerMiningSocketHandlers(io);
    registerSupportSocketHandlers(io);
    registerTournamentSocketHandlers(io);
    registerGamesSocketHandlers(io);
    ioSingleton = io;
    log.info("Socket.IO attached (miner + support + tournament + games handlers registered)");
    return io;
}
/** Process-wide Socket.IO server ref, set once `attachSocketIO` runs. Null before that / in tests that don't attach sockets. */
export function getIo() {
    return ioSingleton;
}
