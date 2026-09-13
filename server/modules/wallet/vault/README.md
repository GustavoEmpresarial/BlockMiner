# wallet/vault

Time-locked machine storage ("Cofre de Mineradores") — pulls a machine out
of active mining (rack or inventory) into `UserVault`, and back.

Full feature documentation (client + server, API contract, security,
error codes, tests): **`docs/vault-cofre-de-mineradores.md`** at the repo
root — this file only covers what's specific to this module's code.

## Endpoints

All responses follow `{ ok: true, ...data }` / `{ ok: false, code, message }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/vault` | `requireAuth` | Lists the caller's `UserVault` rows. |
| POST | `/api/vault/move-to-vault` | `requireAuth` + rate limit + idempotency | `{ source: "inventory" \| "rack", itemId?, itemIds?[] }`. |
| POST | `/api/vault/retrieve-from-vault` | `requireAuth` + rate limit + idempotency | `{ destination: "inventory" \| "rack", vaultId?, vaultIds?[], slotIndex? }`. |

## Error contract

`vault.controller.ts`'s `respondVaultError` forwards the service's specific
400 reason as a client-facing code (`VAULT_INVALID_RACK_REF`,
`VAULT_INVALID_SELECTION`, `VAULT_INVALID_VAULT_ITEM`,
`VAULT_INVALID_SLOT`), instead of collapsing every validation failure into
one generic code — see docs/vault-cofre-de-mineradores.md#api-contract for
the incident this fixed (client i18n had translations for codes the server
never sent). Locked in by
`tests/wallet/vault.controller.errorContract.test.mjs`.

## Known deferred gap

No real Postgres advisory lock around vault mutations yet — relies on
`prisma.$transaction` + unique constraints as the interim safety net, same
as `machines/` and `inventory/`. Re-wrap with the real advisory lock once it
lands in `core/database` (see the comment at the top of `vault.service.ts`).
