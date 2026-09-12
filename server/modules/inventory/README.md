# inventory

Read-only backpack listing for a user's un-installed machines
(`UserInventory` rows), plus the one cross-module write entry point every
purchase/reward path uses to grant machines: `grantPurchasedInventoryItems`.

This module does **not** own installing/uninstalling a machine into a rack
slot — that's `rooms/` (`installMinerForUser` / `uninstallMinerForUser` /
`uninstallMinerBatchForUser`, mounted at `/api/rooms/rack/*`). The client's
`/inventory` screen (`Inventory2Page.tsx`) calls `GET /api/inventory` to list
the backpack and `POST /api/rooms/rack/install|uninstall|uninstall-batch` to
move machines in and out of it.

## History note (2026-09-12 cleanup)

This module used to also expose `POST /install`, `POST /remove`, and
`POST /update` (`installInventoryItemForUser`, `removeInventoryItemForUser`,
a no-op sync ack). They were removed because:

- **Dead**: nothing in the client called them — the UI has always used
  `rooms/`'s rack-based endpoints instead.
- **Divergent and unsafe if ever invoked**: the removed `installInventoryItemForUser`
  wrote a bare `UserMiner` row addressed by a raw `slotIndex`, with no
  `UserRack.userMinerId` link at all. A machine "installed" through it would
  never appear in any rack UI, yet would still count toward the user's
  hashrate as far as the mining engine is concerned — i.e. free, unlimited
  rack capacity, not merely unreachable code.

If a real need for a non-rack-based install path ever comes back, re-add it
inside `rooms/` (or have it call through `rooms/`'s repository) so there is
exactly one implementation of "install a machine into a slot," not two that
can silently drift apart.

## Endpoints

All responses follow `{ ok: true, ...data }` / `{ ok: false, message, code? }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/inventory` | `requireAuth` | Lists the caller's `UserInventory` rows, each resolved to a display name/image via `resolveOwnedMachineDisplay` + `resolveOwnedMachineImageUrl` (catalog image > owned-machine snapshot > none; the stock brand-icon placeholder is always normalized to `null`). |

## Cross-module surface

`grantPurchasedInventoryItems(tx, userId, template, quantity, now)` — the
**only** function other modules may call on this module. Runs inside the
caller's own transaction (shop purchase, reward grant, register's welcome
bonus, etc.), so a partial grant can never be left dangling if the caller's
transaction rolls back. Callers: `shop/`, `offer-events/`, `read-earn/`,
`mini-pass/`, `notifications/reward-inbox`, `auth/register`, `auth/google`,
`auth/satspay`, `users/users.admin.controller`.

## Security / validation

- `GET /` is scoped to `req.user.id` at the repository level
  (`prisma.userInventory.findMany({ where: { userId } })`) — no IDOR surface,
  since there's no id-based lookup parameter to manipulate.
- Errors are reported via `core/errors/error-reporter.ts`'s `reportError`
  (`INVENTORY_LIST_FAILED`, category `DATABASE`) — not a bare `log.error` —
  so failures here are classified/fingerprinted/correlated the same way as
  every other reported surface in this codebase.

## Tests

- `tests/inventory/inventory.service.integration.test.mjs` — live-DB:
  `listInventoryForUser` scoping (including cross-user IDOR), image
  normalization, `grantPurchasedInventoryItems` row count/shape.
- `tests/inventory/inventory-rooms.routes-security.test.mjs` — route
  introspection: `GET /` requires auth, and only `GET /` is exposed (the
  removed dead routes stay removed, not silently reachable again).
