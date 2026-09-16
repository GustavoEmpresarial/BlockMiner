# offers (`/offers`)

Player-facing store for timed event miners, fan/rack offer windows, and the
next-room unlock. **Contract source of truth:**
`server/modules/offer-events/README.md`.

Do not add a fourth purchase URL here without a matching server route and a
test that locks the path. Fan and rack look identical in the UI; they are
not the same checkout.

## Files

| File | Role |
|---|---|
| `lib/offers.api.ts` | HTTP wrappers, cache, live-badge predicates, purchase error i18n |
| `OffersPage.tsx` | Page. Fan/rack share `GearOffersSection` / `confirmGearBuy`; `GEAR[kind].purchase` picks the URL |
| `OffersPage.smoke.test.tsx` | Buying a fan must call fan and never rack (and the reverse) |

## Cache

`writeActiveOffersCache` is module state so a sidebar remount does not blank
the page. `ok: false` or a thrown GET must **not** wipe a successful cache.
Logout calls `clearActiveOffersCache`.

The sidebar badge (`Sidebar.tsx`) calls `getActiveOfferEvents` (same URL,
**does not** write this cache) and `isActiveOffersPayloadLive` — events
length, or live rooms/fans/racks with at least one item.

## Quantities

- Event miners: `OFFER_PURCHASE_MAX_QUANTITY` (25) — same number as
  `OFFER_EVENT_PURCHASE_MAX_QUANTITY` on the server.
- Fan/rack: `readGearMaxBulkQuantity(fanOffers \| rackOffers)` reads
  `maxBulkQuantity` from `GET /active`. Falling back to 25 is only for a
  stale cache that predates that field.

## Errors

`readOfferPurchaseError` prefers `messageKey` (+ `messageParams`) so fan/rack
toasts stay in the UI locale. English `message` is fallback when i18n misses
the key. Do not route these through `apiErrorMessage` — it only reads
`message`.
