# admin offer-events (`/admin/offer-events`)

Admin UI for creating/editing timed offer events, their miners, and the
sales ledger. **Contract:** `server/modules/offer-events/README.md`
(admin endpoints). All HTTP goes through `adminOfferEvents.api.ts` — do not
call `api.get('/admin/offer-events…')` from the pages.

## Pagination (easy to get wrong)

The list grid has no pager. `listAdminOfferEvents` therefore sends
`pageSize=ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE` (100), which is
`ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX` on the server. Omitting the query
used to apply the server default of **20** and hide the rest of the catalog
without an error.

Sales tab: `listAdminOfferEventPurchases` sends `pageSize=200`
(`ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX`). 201 is a 400.

## Miner writes

Update/delete take `(eventId, minerId)`. The server 404s if the pair does
not match — the client must not send a miner id from event A under event B's
path.

## Thumbs

`resolveThumb` only feeds `<img src>`. Absolute `http(s)` passes through;
site-absolute paths (`/uploads/…`) get `window.location.origin`. Not a
redirect helper.
