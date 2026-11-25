# Payment integration

Subscription creation stores a pending subscription and payment. A site becomes active only after a verified successful payment event.

## Omise test-mode adapter

The Omise adapter uses Omise.js in the browser to tokenize card details, then sends only the one-time token to the API. The API creates charges with the amount and currency stored in the database; it does not accept an amount from the browser.

The adapter is deliberately limited to test mode. It registers only when all of these are true:

- `PAYMENT_PROVIDER=omise`
- `PAYMENT_MODE=test`
- `OMISE_SECRET_KEY` starts with `skey_test_`
- `OMISE_PUBLIC_KEY` starts with `pkey_test_`
- `OMISE_WEBHOOK_SECRET` contains the Base64 webhook secret from the Omise Test dashboard

Keep these values in the ignored project-root `.env`. Do not commit or print the secret key or webhook secret. The webhook secret may contain comma-separated current and expiring secrets while rotating.

Use `PAYMENT_RETURN_URL` as the public app base URL for 3-D Secure returns. Production URLs must use HTTPS. Local development may use localhost.

The API uses `ref_id` set to the payment ID, verifies amount/currency/mode against Omise responses, verifies webhook HMAC signatures against the raw body, and can refresh a charge through the authenticated Omise API. Omise.js sends card details from the browser directly to Omise.

Current endpoints:

1. `POST /payments/:paymentId/charge` accepts an Omise test token.
2. `GET /payments/:paymentId/status` refreshes the provider status for the authenticated owner.
3. `POST /payments/webhook/omise` accepts only signed Omise events.

The charge endpoint also accepts `paymentMethod: "promptpay"` or `paymentMethod: "truemoney_wallet"` instead of a card token. PromptPay creates a QR charge and returns its QR image URL. TrueMoney uses Omise App Redirection (`truemoney_jumpapp`) and redirects the customer to Omise authorization. Both remain pending until the authenticated status check or signed webhook confirms the final result.

PromptPay and TrueMoney App Redirection must be enabled for the Omise account before use. In local development, the return page defaults to localhost; set `PAYMENT_RETURN_URL` to the public HTTPS app URL when testing wallet redirects from another device.

Automatic renewal is not enabled in this adapter. A recurring billing schedule and explicit saved-card consent must be implemented separately before enabling it.

## Provider-neutral contract

Other providers can implement `PaymentProvider` in `apps/api/src/payments/provider.ts`. Hosted-checkout providers can use `createCheckout`; browser-tokenized providers can use `createTokenizedCharge`; QR or redirect methods can use `createAlternativeCharge`. Webhook handlers must verify provider signatures before returning normalized events.

No live-mode provider is enabled by this project.
