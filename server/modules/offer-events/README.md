# offer-events

Public `/offers` checkout plus the admin "Ofertas" tab. This module owns
**event miners** (timed catalog rows in `offerEvent` / `eventMiner` /
`eventPurchase`). Fan, rack, and room cards on the same page are assembled
here but purchased in their own modules — see [Surfaces](#surfaces).

Client owners:

- `client/src/features/offers/` — `/offers`
- `client/src/features/admin/offer-events/` — `/admin/offer-events`
- `client/src/features/shell/components/Sidebar.tsx` — live badge via
  `getActiveOfferEvents` + `isActiveOffersPayloadLive`

## Surfaces

| Surface | Built by | Bought via | Catalog |
|---|---|---|---|
| Event miners | `listActiveOfferEventsForUser` → `serializeEventPublic` | `POST /offer-events/purchase` | Prisma `offerEvent` |
| Fans | `buildActiveFanOffersPayload` | `POST /offer-events/purchase-fan` → `purchaseFansForUser(..., "offer")` | `fans/` SKU `cooling_fan_system` |
| Racks | `buildActiveRackOffersPayload` | `POST /offer-events/purchase-rack` → `purchaseRacksForUser(..., "offer")` | `racks/` SKU `mining_rack_shelf` |
| Next room | `buildActiveRoomOffersPayload` | `POST /rooms/buy` (not this router) | `rooms/` |

A fan SKU posted to `/purchase-rack` (or the reverse) fails catalog
normalization. The client maps `GearKind` → the matching wrapper
(`postOfferFanPurchase` / `postOfferRackPurchase`); the server does not
trust the UI.

## User endpoints (`offerEventsRouter`, mounted at `/api/offer-events`)

All require `requireAuth`. Purchases also take the shared purchase limiter
and `requireCriticalIdempotency`.

| Method | Path | Body schema | Success | Failure |
|---|---|---|---|---|
| GET | `/active` | — | `{ ok, events, roomOffers, fanOffers, rackOffers, serverTime }` | `{ ok: false, message }` |
| POST | `/purchase` | `purchaseSchema` (`eventMinerId`, `quantity` 1…`OFFER_EVENT_PURCHASE_MAX_QUANTITY`) | `{ ok, message, balances }` | `{ ok: false, message, code? }` |
| POST | `/purchase-fan` | `purchaseFanSchema` (`sku`, `quantity` ≥ 1) | `{ ok, messageKey, messageParams, message, newBalance, fanCredits }` | `{ ok: false, code, messageKey?, messageParams?, message }` |
| POST | `/purchase-rack` | `purchaseRackSchema` (`sku`, `quantity` ≥ 1) | `{ ok, messageKey, messageParams, message, newBalance, rackCredits }` | same shape as fan |

`GET /:id` was removed (no first-party consumer). Unknown ids fall through
to the global `ROUTE_NOT_FOUND`. Admin detail is `GET /api/admin/offer-events/:id`.

### `GET /active` payload

- `events[]` — `serializeEventPublic`: `id, title, description, imageUrl, startsAt, endsAt, isActive, isLive, miners[]`.
  Each miner: `id, name, description, imageUrl, price` (number), `hashRate, currency, slotSize, inStock, remaining, isFree, claimLimitPerUser, userClaimCount`.
- `roomOffers` / `fanOffers` / `rackOffers` — `null` when the window is closed or the catalog is empty.
- `fanOffers.maxBulkQuantity` / `rackOffers.maxBulkQuantity` — echo of
  `readFanMaxBulkQuantity()` / `readRackMaxBulkQuantity()` (`FAN_MAX_BULK_QUANTITY` /
  `RACK_MAX_BULK_QUANTITY`, default 25). The OffersPage stepper must use these,
  not a second hardcoded cap.
- `serverTime` — ISO UTC used by clients that do not trust the browser clock
  for `isLive` (the SPA currently uses `new Date()` locally).

### Quantity

| Path | Cap | Source |
|---|---|---|
| `/purchase` | `OFFER_EVENT_PURCHASE_MAX_QUANTITY` (25) | `offer-events.config.ts` — also `OFFER_PURCHASE_MAX_QUANTITY` on the client |
| `/purchase-fan` | env `FAN_MAX_BULK_QUANTITY` | Zod checks shape only; controller enforces the env cap |
| `/purchase-rack` | env `RACK_MAX_BULK_QUANTITY` | same |

Free event miners additionally clamp to `claimLimitPerUser - userClaimCount`.

### Fan/rack error codes

`FAN_NOT_AVAILABLE_YET` / `FAN_INVALID_SKU` / `FAN_INVALID_QUANTITY` /
`FAN_INSUFFICIENT_BALANCE` (and `RACK_*`). Each carries `messageKey` +
`messageParams` so `/offers` can toast in the active locale via
`readOfferPurchaseError`. English `message` is the fallback.

## Admin endpoints (`offerEventsAdminRouter`, under `/api/admin`)

Entire router is `requireAdminAuth`. Miner update/delete load
`{ id: minerId, eventId }` — a miner id from another event is 404, not a
cross-event write.

| Method | Path | Notes |
|---|---|---|
| GET | `/offer-events` | Paginated. Query: `page`, `pageSize` (5…`ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX` = 100, default 20), `includeDeleted`. Returns `{ ok, page, pageSize, total, events }`. |
| POST | `/offer-events` | `eventCreateSchema` |
| GET | `/offer-events/:id` | Single event |
| PUT | `/offer-events/:id` | `eventUpdateSchema` (partial — list toggle sends `{ isActive }`) |
| DELETE | `/offer-events/:id` | Soft delete |
| GET/POST | `/offer-events/:eventId/miners` | |
| PUT/DELETE | `/offer-events/:eventId/miners/:minerId` | Scoped to both ids |
| GET | `/offer-events/:id/purchases` | `pageSize` 5…200 (default 100). Client sales tab sends 200. |

The admin grid has **no pager**. The client therefore always requests
`pageSize=100` (`ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE`). Sending nothing used
to silently show only the first 20 rows.

## Client mapping

| Server | Client |
|---|---|
| `GET /offer-events/active` | `getActiveOfferEvents` |
| `POST /offer-events/purchase` | `postOfferEventPurchase` |
| `POST /offer-events/purchase-fan` | `postOfferFanPurchase` |
| `POST /offer-events/purchase-rack` | `postOfferRackPurchase` |
| `GET /admin/offer-events?pageSize=100` | `listAdminOfferEvents` |
| remaining admin verbs | `adminOfferEvents.api.ts` |

`GET /offer-events/:id` has no client wrapper on purpose.

## Security

- User purchases debit `req.user.id` only. Event-miner checkout runs in a
  transaction with `pg_advisory_xact_lock(userId, eventMinerId)` so
  `claimLimitPerUser` cannot be raced.
- Inventory grants go through `grantPurchasedInventoryItems` (see
  `inventory/README.md`).
- `imageUrl` on admin create/update is a string ≤ 2000 chars (no scheme
  allowlist). It is admin-authored and rendered as `<img src>` /
  `resolveThumb`, not as a navigation target.

## Tests

- `tests/offer-events/offer-events.contract.test.mjs` — Zod caps and
  fan/rack body shape vs the named constants.
- `tests/offer-events/offer-events.currency.test.mjs` — `DEFAULT_OFFER_CURRENCY`.
- `tests/offer-events/offer-events.admin.purchases.test.mjs` — purchase
  aggregation.
- `client/src/features/offers/lib/offers.api.test.ts` — HTTP paths, cache,
  live badge, `readOfferPurchaseError`, bulk cap echo.
- `client/src/features/offers/OffersPage.smoke.test.tsx` — fan≠rack
  purchase routing.
- `client/src/features/admin/offer-events/adminOfferEvents.api.test.ts` —
  admin paths + list `pageSize=100`.
