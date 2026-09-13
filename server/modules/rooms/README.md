# rooms

Owns the "mining farm" surface behind the client's `/inventory` screen
(`Inventory2Page.tsx`): rooms, rack slots, and the real install/uninstall flow
that moves a machine between a `UserInventory` row (backpack) and a
`UserRack`+`UserMiner` pair (installed, mining). Also owns the purely-visual
furniture layer (`visual-placements`, `fan-placements`) that `inventory2/`'s
rack art positions on top of the same room/rack data.

`inventory/` (see its own README) only lists the backpack and grants new
items — it does not implement install/uninstall itself.

## Endpoints

All responses follow `{ ok: true, ...data }` / `{ ok: false, message, code? }`.
Every route requires a session (`roomsRouter.use(requireAuth)` at the router
level).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/rooms` | Lists the caller's rooms + rack grid + occupancy totals. |
| POST | `/api/rooms/buy` | Unlocks the next room at its BLK price (`rooms.config.ts`; room 1 is free, provisioned atomically at register time — see `provisionFirstRoomTx`). Rate-limited. |
| POST | `/api/rooms/rack/install` | Moves one `UserInventory` item into one empty rack slot. `.strict()` Zod-validated (`{ rackId, inventoryId }`, both positive ints) + rate-limited + idempotency-keyed. |
| POST | `/api/rooms/rack/uninstall` | Moves the machine in one rack slot back to the backpack. Same validation/rate-limit/idempotency shape. |
| POST | `/api/rooms/rack/uninstall-batch` | Same, for many racks at once (`{ rackIds: number[] }`, deduplicated via `normalizeRackIds`); all-or-nothing — if any rack in the batch is empty or not found, none are uninstalled. |
| GET | `/api/rooms/slots` | Aggregate slot counts (used by the shop/upsell surfaces, not the inventory screen itself). |
| GET/POST | `/api/rooms/visual-placements` | Which floor pad each visual 8-slot rack furniture piece sits on (`inventory2/`'s art layer — cosmetic, no mining effect). |
| GET/POST | `/api/rooms/fan-placements` | Same idea for cooling-fan furniture credits. |

## Business rules (`rooms.placement.ts`, pure functions — no I/O)

- A rack slot is occupied if it has a `userMinerId` **or** is
  `blockedByMinerId` (the second half of a 2-slot machine).
- A 2-slot machine may not start on the last column of its row
  (`isRowEdgeViolation`) and consumes the next slot in the same row
  (`ROW_EDGE_NO_SPACE` / `NO_SPACE` / `ADJACENT_RACK_OCCUPIED` cover every way
  that can fail).
- `RACKS_PER_ROOM` / `ROOM_MAX` are env-tunable (`192` / `4` by default);
  `starterRackSlotCount()` caps the free starter grid at one 8-slot visual
  rack's worth of real racks.

## Concurrency

`installMinerForUser` reads occupancy (`resolveInstallMinerContext`) *before*
its own transaction writes — a real TOCTOU window under two concurrent
installs into the same rack. The backstop is `UserMiner`'s
`@@unique([userId, slotIndex])` constraint, which guarantees only one writer
ever wins; the loser's Prisma `P2002` is caught and returned as the same
`{ status: 409, code: "RACE_CONDITION_DETECTED" }` shape every other mutation
in this codebase (`machines/`, `shop/`, `offer-events/`) already uses —
fixed 2026-09-12 (previously surfaced as an unhandled 500). Verified by
`tests/rooms/rooms.installMiner.integration.test.mjs`'s concurrent-install
test against a real Postgres.

## Validation & error reporting

- `rack/install`, `rack/uninstall`, `rack/uninstall-batch` parse their body
  through `rooms.schemas.ts`'s `.strict()` Zod schemas (rejects unknown extra
  fields — mass-assignment hardening, same posture as `auth/`'s controllers)
  instead of the manual `Number.isInteger` checks used before this pass. A
  `ZodError` becomes a clean `400 { code: "VALIDATION_ERROR" }`, not a 500.
- Every unexpected failure across every handler in this module goes through
  `core/errors/error-reporter.ts`'s `reportError` (stable `ROOMS_*` codes,
  category, severity, request correlation, redaction) instead of a bare
  `log.error` — see `tests/rooms/rooms.controller.validation.test.mjs` and
  the error-reporter module itself for what that buys.

## IDOR

Every repository lookup used by install/uninstall (`findRackWithRoomForUser`,
`findInventoryItemForUser`, `findRackWithMinerForUser`,
`findRacksWithMinersByIdsTx`) filters by `{ id, userId }` — a rack or
inventory item scoped to another user reads as a plain 404, not an error that
would leak whether the id exists. Verified by an explicit IDOR test in
`tests/rooms/rooms.installMiner.integration.test.mjs`.

## Tests

- `tests/rooms/rooms.installMiner.integration.test.mjs` — live-DB: install/
  uninstall/batch-uninstall round trips, `RACK_OCCUPIED`, IDOR, the
  concurrent-install race above.
- `tests/rooms/rooms.controller.validation.test.mjs` — unit: the `.strict()`
  Zod validation (missing/invalid/extra fields) on all three mutation
  endpoints.
- `tests/inventory/inventory-rooms.routes-security.test.mjs` — route
  introspection: router-wide auth, rate-limit + idempotency on every
  mutation.
