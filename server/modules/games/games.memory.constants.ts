/**
 * Ported from legacy/server/modules/games/memoryGameConstants.ts.
 *
 * DEVIATION (confirmed, not assumed): legacy/CLAUDE.md claims "5 jogos
 * server-authoritative", but the actual games/ module only has a real server
 * controller+routes for ONE game (2048, see game2048/). The "memory" game
 * (crypto-memory) has only this one tuning constant server-side — no
 * controller, no routes, no session persistence beyond what's in
 * games.cooldown.ts/games.anti-cheat.ts (which aren't wired to it either).
 * grep across legacy/server and legacy/client found no other server-side game
 * engine for crypto-match-3/cart-rush/block-stack/sky-runner (all mentioned in
 * games.anti-cheat.ts's GAME_MIN_DURATION_MS map, but with no matching
 * controller anywhere) — those are either purely client-side, or the "5 games"
 * claim in the legacy docs is stale. Only this constant is ported; no backend
 * was fabricated for the other four.
 */
export function getMemoryMismatchRevealMs(): number {
  const raw = Number(process.env.MEMORY_MISMATCH_REVEAL_MS);
  // item 90: era `fallback = 400` / clamp [300, 1500] — divergia do legacy
  // (`memoryGameConstants.ts`: 800 / [500, 1500]) sem nenhuma justificativa documentada,
  // ou seja, erro de porte, não decisão. Efeito real no jogo: as cartas erradas ficavam
  // visíveis por METADE do tempo, encurtando a janela pro jogador memorizar. O teste
  // (`tests/games/games.memory.constants.test.mjs`) já codificava o valor correto do
  // legacy e falhava — mas a suíte nunca rodava verde por falta de Postgres/Redis local,
  // então a falha ficava mascarada no meio de ~120 erros de infra.
  const fallback = 800;
  const n = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.min(1500, Math.max(500, n));
}
