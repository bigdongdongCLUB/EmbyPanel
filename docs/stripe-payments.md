# Stripe payments

## Payment model

Fixed-term service orders use Stripe-hosted Checkout in `payment` mode. This is a
single payment, not a recurring Stripe subscription. Account-balance checkout
remains available. All amounts are integer CNY cents, with any configured payment
fee displayed separately before checkout. Dynamic payment methods are managed in
Stripe Dashboard; Alipay is only displayed for eligible accounts and payments.

## Administrator setup

1. Deploy the database migration and application, then restart the web service
   and existing BullMQ worker. The worker now schedules payment reconciliation and
   service-provisioning retries every minute.
2. Add a Stripe method in Payment Management. Choose **test mode first**. Enter a
   restricted API key (`rk_test_...`, preferred) with the Checkout Sessions
   permissions required to create/read/expire sessions, or a secret API key
   (`sk_test_...`). Inline price creation may additionally require permissions for
   the underlying resources in Stripe; verify the integration with your actual
   restricted key. Never put keys in source control.
3. Enter the canonical public site origin, for example
   `https://panel.example.com`. Use no URL path, query or credentials. HTTP is only
   allowed for localhost test environments.
4. For initial setup, leave the method disabled and save without the webhook
   secret. Reopen it to copy its dedicated webhook URL.
5. In Stripe Workbench create an event destination for this URL. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
6. Copy that event destination's `whsec_...` signing secret into the panel and save.
   Then enable the method. Test mode and live mode need their matching API and
   signing secrets. Stripe CLI forwarding has its own signing secret.
7. Use the panel's connection test to verify the API key can read Checkout
   Sessions. This does **not** prove that public webhook delivery or Alipay is
   configured correctly. Complete an end-to-end sandbox/test-mode payment and
   verify a successful webhook delivery and exactly one entitlement activation.
8. Only after testing, configure a separate live-mode method with matching live
   credentials. Enable your desired payment methods in Stripe Dashboard and
   ensure the account supports CNY and the applicable payment methods.

Hosted redirect does not require a publishable (`pk_`) key. No automatic tax,
automatic refund or automatic recurring billing is enabled by this integration.
Refunds, disputes and `REVIEW` payments require administrator handling in Stripe
Dashboard and appropriate manual entitlement adjustments in the panel.

## Security and failure handling

- Keys and per-order credential snapshots are encrypted using the existing
  `EMBYPANEL_ENCRYPTION_KEY`. Preserve this key and back up it securely. Never log
  decrypted keys or return them to browsers. Blank secret edits retain values.
- Removed legacy Epay methods are not offered in the UI or checkout. Their stored
  settings are retained for compatibility rather than silently destroyed.
- The server determines price and duration. A payment attempt stores immutable
  Checkout parameters, fee, mode, currency and encrypted signing credentials.
  Stripe creation uses the payment-attempt ID as an idempotency key.
- The order is locked against balance payment while a Stripe payment is active.
  Cancellation must first confirm/expire the remote session. A timeout or unknown
  Stripe result does not unlock another payment path.
- Webhooks read the raw body, verify the Stripe signature, then compare the
  attempt/session IDs, owner, order, currency, mode and exact amount. Unpaid
  `completed` events never grant access; asynchronous success does.
- Settlement uses the same database locks as balance checkout. A repeated event
  cannot extend service or award referral commission twice. Browser return URLs
  do not activate service.
- Local order auto-expiry skips active Stripe attempts. Signed late payments are
  honored for the original order when eligible. A disabled user, incompatible
  subscription, duplicate source payment or a mismatched amount is retained as
  `REVIEW` for manual handling, not silently discarded or activated.
- The worker reconciles incomplete creation, missed webhook results and paid
  orders with incomplete provisioning. Unknown creation past its recovery window
  is marked `REVIEW`; it never creates a fresh charge attempt automatically.
- Each attempt retains its encrypted credentials, so disabling/deleting a method
  or changing its keys does not strand in-flight callbacks. Do not revoke old API
  credentials in Stripe until the relevant payments have been reconciled.
- Subscription-server selection is persisted before remote account sync. A
  per-user provisioning lock prevents overlapping workers, and active anomaly
  penalties are not cleared by payment.

Restrict incoming webhook traffic to Stripe's published IP ranges at your reverse
proxy if appropriate, while preserving your local forwarding/test workflow. Keep
TLS valid and preserve the `Stripe-Signature` header and raw body.

## Verification performed locally

```sh
RUN_PAYMENT_API_TESTS=1 node --test tests/payment-safety.test.mjs
RUN_STRIPE_DB_TESTS=1 node --test tests/stripe-payments.test.mjs
npx tsc --noEmit
npm run build
```

Tests use synthetic keys, mocked Stripe sessions, generated webhook signatures,
and temporary local database records. They do not create live or sandbox Stripe
transactions and are not a substitute for the required deployment-time end-to-end
payment test. Never run database tests against production.

## Order reconciliation

The admin order list shows the Stripe PaymentIntent (`pi_`) as the primary
reconciliation identifier, with copy and Dashboard links in the general payment
column. Balance payments are labeled separately. Checkout Session (`cs_`) IDs
remain stored internally but are not displayed. Live and test Dashboard links
are generated separately.

Only creation and payment-confirmation times are displayed in Asia/Shanghai.
Stripe uses the payment-success event time; balance payments use settlement time.
Missing Stripe confirmation times are marked pending recovery, never replaced by
panel booking time. Successful orders
show the gross amount collected including any configured surcharge; unpaid or
canceled orders are not presented as collected payments.

New Checkout Sessions send the panel order ID and username to the underlying
PaymentIntent's metadata and description. Existing Stripe records are not edited.
The payment reconciliation worker reads up to three historical paid sessions
per run to backfill missing PaymentIntent IDs. Where the last successful Stripe
event is still available and readable, its timestamp is recovered too. This
backfill writes reference fields only, never entitlement, payment status or
booking time. The new database migration and worker restart are required.

## Balance offset with Stripe

The customer may opt into using available panel balance before paying the remainder
through Stripe. For a CNY 475 order and CNY 25 balance, the panel reserves CNY 25
and creates a CNY 450 Checkout Session. If surcharges are enabled, they apply only
to the external portion, not to the balance share. A balance that covers the
entire order uses the existing balance-only payment path without Stripe fees.

The server calculates the offset under the settlement/user lock; it never accepts
a client-supplied offset amount. Reservation and attempt creation commit in one
transaction. The available balance is reduced while its share is `HELD`, becomes
`CONSUMED` on confirmed payment, or is returned exactly once as `RELEASED` after
confirmed cancellation/expiry/failure. The order remains pending until Stripe
confirms the external portion. Closing the browser or returning from Checkout
does not prove cancellation and does not release the reservation.

Unknown creation/network results retain the hold until reconciled. A later
configuration error after an unknown result goes to manual review, not an unsafe
refund. An external remainder below Stripe's applicable minimum can be rejected;
on a definitive creation failure the balance is returned. No live transactions
are created by the automated tests.

If a delayed success arrives after a refund, the released share must be acquired
again before fulfillment; insufficient funds put the payment into `REVIEW` without
granting service. Mismatched sessions and other ambiguous results likewise retain
manual-review safeguards. Duplicate or out-of-order events cannot refund consumed
balance or extend a subscription twice.

Mixed orders use payment source `BALANCE_STRIPE`. Admin orders show the full paid
amount and its balance/Stripe breakdown so the external portion can be matched to
the Stripe payment ID. Existing orders migrate with a zero balance offset.
