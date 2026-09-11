/**
 * Socket.IO server wiring. Ported from legacy/server/server.ts's `new Server(server, {...})`
 * setup (~line 107+) + `attachSocketIoExplicitAuthMiddleware`.
 *
 * `core/socket/` only builds the transport (CORS, handshake auth) and registers whatever each
 * domain module exports as its own socket handlers — it does not know mining/support/tournament
 * business logic itself (module-boundary doctrine, ARQUITETURA.md §2/§3).
 *
 * Redis adapter: NOT ported in this pass. Socket.IO's cross-process fan-out
 * (`@socket.io/redis-adapter`) is only needed when more than one Node process holds live
 * socket connections (e.g. horizontally-scaled app containers behind a shared load balancer).
 * This deploy target (and legacy's docker-compose: a single `block-miner-app` container) runs
 * Socket.IO single-process, so it is not required for correctness here. If/when the deploy
 * topology goes multi-process, add `@socket.io/redis-adapter` here using the already-ported
 * `core/redis/` client (`getRedis()`) — TODO, not critical for the current single-process target.
 */
import type { Server as HttpServer } from "node:http";
import { Server, type Server as SocketIOServer } from "socket.io";
import { logger } from "../logger/index.js";
import { buildSocketIoCorsOptions } from "./socket.cors.js";
import { attachSocketIoExplicitAuthMiddleware } from "./socket.auth.js";
import { registerMiningSocketHandlers } from "../../modules/mining/mining.socket.js";
import { registerSupportSocketHandlers } from "../../modules/support/support.socket.js";
import { registerTournamentSocketHandlers } from "../../modules/tournaments/tournaments.socket.js";
import { registerGamesSocketHandlers } from "../../modules/games/games.socket.js";

const log = logger.child("Socket");

let ioSingleton: SocketIOServer | null = null;

/**
 * Creates the Socket.IO server bound to `httpServer` and registers every ported realtime
 * domain (miner, support, tournament, games). Games handlers cover all 5 minigames
 * (crypto-memory, crypto-match-3, block-stack, sky-runner, cart-rush) — see
 * server/modules/games/games.socket.ts header and docs/PROGRESSO.txt items 12i/12j for
 * when the last 3 were ported (12d's original scope cut no longer applies).
 */
export function attachSocketIO(httpServer: HttpServer): SocketIOServer {
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
export function getIo(): SocketIOServer | null {
  return ioSingleton;
}
