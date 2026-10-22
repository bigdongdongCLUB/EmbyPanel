# Payment Safety

## Scope

Account-balance payments and Stripe-hosted Checkout are connected. See
[stripe-payments.md](stripe-payments.md) for required configuration and rollout.
Legacy Epay configuration is not offered to users.
No payment-platform credentials are included in source code or tests.

## Order settlement

- Order creation accepts a plan and billing cycle. Prices in cents, duration and
  trial hours come exclusively from the server-side plan configuration.
- At payment time, the plan must remain available and the order must match its
  current configured price and duration. Otherwise the user must cancel and
  recreate it. This also rejects previously forged pending orders.
- A buyer may purchase any available paid plan to renew an existing subscription.
  The purchased product determines the price and duration, while the original
  subscription plan and assigned servers are preserved. Renewal extends from
  the current expiry date, or from now if already expired. Trials remain restricted.
- Balance settlement serializes the legacy JSON referral bookkeeping, locks the
  buyer and order, and performs a conditional debit with sufficient funds.
  Paid-order retries succeed without another debit, extension or referral payout.
- Trial eligibility is checked again under the payment lock. Multiple unpaid
  trial orders cannot be paid to obtain multiple trials.
- Renewal does not edit anomaly-penalty records. Servers with pending penalties
  or failed unbans are left to the unban workflow, even when the timer has elapsed.
- Remote account-sync failures do not roll back a successful payment. The user is
  warned to contact an administrator rather than pay again. Remote return values
  are checked, and subscription-server assignment is saved before account sync.
  The existing worker retries incomplete service fulfillment automatically.

## Payment secrets

Secret keys use the existing AES-256-GCM `EMBYPANEL_ENCRYPTION_KEY`. Preserve and
back up this key before deployment; changing or losing it prevents decryption.
Existing plaintext payment secrets are encrypted the next time an administrator
reads or saves payment settings. Lists contain blank secret fields plus configured
flags, never the original secrets or ciphertext. Blank edits retain stored values.
Concurrent payment-setting writes use a database advisory lock.

Apply the Stripe payments migration before restarting the web service and worker.
Do not downgrade the old payment
settings implementation after encrypted values have been saved, since the old
implementation cannot interpret them. Existing paid orders are not repriced.

## Verification

```sh
node --test tests/payment-safety.test.mjs
RUN_PAYMENT_API_TESTS=1 node --test tests/payment-safety.test.mjs
npx tsc --noEmit
npm run build
```

The API test requires the local development server and an isolated local database.
It creates and removes temporary users, plans and payment settings. It does not
call Stripe, Alipay or real Emby servers. Do not run it against production.
