# Redemption provisioning recovery

Subscription-card redemption commits the used card, subscription extension and
`RedemptionSyncJob` together. Balance cards do not enqueue provisioning. Retrying
provisioning never consumes a card, credits balance or extends a subscription.

The request attempts synchronization immediately. On failure the user is told
that redemption succeeded and synchronization will retry. A dedicated BullMQ
queue, `embypanel-redemption-sync`, invokes the internal recovery endpoint every
minute, independently of payment reconciliation and anomaly scanning.

## Recovery behavior

- Failed attempts remain `PENDING`. Delays are 1, 2, 4, 8, 16, 32, then 60 minutes,
  capped at one hour; retries continue while the subscription remains eligible.
- Account disablement, subscription cancellation/expiry or a missing plan cancels
  the job. A subsequent valid redemption requeues it.
- A playback penalty defers provisioning; it is never cleared by redemption.
- Assigned servers are retained, even if one is temporarily disabled. A fresh
  assignment is persisted before creating remote accounts, so later attempts do
  not select different servers. An unavailable sales plan can still be renewed.
- Each server is attempted; failures on one do not prevent attempts on the others.
- Existing usernames are reused. A failed create is followed by a lookup in case
  Emby created the user but its response was lost. Administrator accounts are never
  modified. Password and template permissions are synchronized before enabling.
- Row locks and a shared per-user fulfillment lock prevent overlapping syncs.
  Crashes roll back the attempt, not the already committed redemption/job. The next
  scheduled run can recover without extending the entitlement again.

## Diagnostics

Structured events include `redemption_sync_retry_scheduled`,
`redemption_sync_completed`, and `redemption_sync_transaction_interrupted`.
Failures include job/user/subscription/server identifiers, attempt count, next
retry time, operation stage and HTTP status where available. The short remote
error summary redacts credentials and URLs. Never log raw request URLs, passwords
or API keys. The most recent sanitized error is retained in the job's `lastError`.

## Deployment

Run `npx prisma migrate deploy`, rebuild/restart the web application, then restart
the worker. The migration adds a table only; it does not modify card/subscription
history or automatically provision historical users. This covers new redemptions
and subsequent renewals after deployment. Existing failures need explicit review
and targeted recovery, rather than blindly reprovisioning all accounts.

Local verification (mocked Emby only):

```sh
RUN_REDEMPTION_DB_TESTS=1 node --test tests/redemption-sync.test.mjs
```
