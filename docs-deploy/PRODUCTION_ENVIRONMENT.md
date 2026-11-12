# Backend environment variables (production reference)

Derived from `process.env` / `env.*` usage in `backend/src` (2026-11-12). No hosting provider has been selected and nothing has been deployed.
All values below are placeholders. Secrets must live only in the hosting provider's secret store, never in the repository, chat, logs or the frontend.
The backend loads a local `.env` through `dotenv` only as a development convenience; in production set real environment variables instead.

| Variable | Purpose | Required | Example placeholder | Secret |
|---|---|---|---|---|
| `NODE_ENV` | Must be `production`: enables the `Secure` cookie flag, disables Windows auth, disables `DB_TRUST_CERTIFICATE`. The payment mock is enabled only for `test` or `development`; an unset or any other value keeps it off | Yes | `production` | No |
| `PORT` | Backend listen port (default `3000`). The process binds `HOST` (default `127.0.0.1`; see DEPLOYMENT_GUIDE.md and STAGING_CONFIGURATION.md) | Optional | `3000` | No |
| `FRONTEND_ORIGIN` | Exact browser origin allowed by CORS and the CSRF origin check (default `http://127.0.0.1:5173`, which is wrong for production) | Yes | `https://<YOUR_FRONTEND_DOMAIN>` | No |
| `DB_HOST` | SQL Server host. Without `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` the database layer is not configured | Yes | `<YOUR_SQL_SERVER_HOST>` | No |
| `DB_PORT` | SQL Server TCP port (default `1433`) | Optional | `1433` | No |
| `DB_NAME` | Target database name (letters, digits, underscore) | Yes | `<YOUR_DATABASE_NAME>` | No |
| `DB_USER` | SQL login used by the backend (least privilege, no DDL) | Yes | `<YOUR_DB_LOGIN>` | Sensitive |
| `DB_PASSWORD` | Password of `DB_USER` | Yes | `<SET_IN_SECRET_STORE>` | Yes |
| `DB_TRUST_CERTIFICATE` | `true` trusts a self-signed SQL Server certificate. Ignored when `NODE_ENV=production` (connection stays encrypted and verified) | No (leave unset) | unset | No |
| `DB_AUTH` | `windows` = integrated authentication for local development only. Startup throws when combined with `NODE_ENV=production`. Leave unset in production | No (leave unset) | unset | No |
| `JWT_SECRET` | HMAC key for session JWTs; at least 32 bytes, otherwise login fails | Yes | `<RANDOM_64_CHAR_VALUE>` | Yes |
| `AUTH_SESSION_STORE` | `sql` = server-side session validation/revocation (needs migration 004 on the target DB). Any other value = legacy stateless tokens (logout does not revoke) | Optional (recommended `sql` once 004 is applied) | `sql` | No |
| `SEPAY_WEBHOOK_AUTH` | Webhook authentication mode: `apikey` (default) or `hmac`. Must equal the type chosen in the SePay Dashboard | Yes (payments) | `apikey` | No |
| `SEPAY_API_KEY` | Key SePay sends as `Authorization: Apikey <key>` (mode `apikey`). At least 32 characters after trimming; shorter or empty = treated as not configured and every webhook gets 401 (fails closed, logged server-side) | Yes if mode `apikey` | `<SET_IN_SECRET_STORE>` | Yes |
| `SEPAY_WEBHOOK_SECRET` | HMAC secret key (mode `hmac`). At least 32 characters after trimming; shorter or empty = every webhook gets 401 | Yes if mode `hmac` | `<SET_IN_SECRET_STORE>` | Yes |
| `SEPAY_ACCOUNT_NUMBER` | Receiving bank account the QR is issued for; webhooks for any other account are audited as `ACCOUNT_MISMATCH` and never confirm | Yes (payments) | `<RECEIVING_ACCOUNT_NUMBER>` | Sensitive (do not commit) |
| `SEPAY_BANK` | Bank name/alias used in the QR (as in SePay's bank list) | Yes (payments) | `<BANK_SHORT_NAME>` | No |
| `SEPAY_ACCOUNT_HOLDER` | Account holder name shown in the payment dialog | Optional | `<ACCOUNT_HOLDER_NAME>` | No |
| `SEPAY_PAYMENT_PREFIX` | Payment-code prefix (2-8 chars A-Z/0-9, default `FLS`). Must equal the prefix configured in SePay's payment-code structure | Optional | `FLS` | No |
| `SEPAY_QR_BASE` | QR image endpoint (code default `https://qr.sepay.vn/img`; SePay's developer page now documents `https://vietqr.app/img` with the same `acc`/`bank`/`amount`/`des` parameters. Verify which one is current before go-live) | Optional | `https://qr.sepay.vn/img` | No |
| `PAYMENT_EXPIRY_MINUTES` | Lifetime of a payment code, integer 5-1440 (default `15`) | Optional | `15` | No |
| `PAYMENT_MOCK_ENABLED` | Test-only mock settlement endpoint; active only when `true` AND `NODE_ENV` is exactly `test` or `development` (unset `NODE_ENV` keeps it off). Mock rows are labelled `provider=MOCK`/`simulated` and excluded from revenue reports | No (must be absent or `false`) | unset | No |

## Production rules

1. `NODE_ENV=production`.
2. `PAYMENT_MOCK_ENABLED` absent or `false`. The code only allows the mock when `NODE_ENV` is `test` or `development`, but do not rely on that alone.
3. `DB_AUTH` not `windows`; `DB_TRUST_CERTIFICATE` unset; SQL login with only the permissions the app needs.
4. `JWT_SECRET`, `DB_PASSWORD`, `SEPAY_API_KEY` / `SEPAY_WEBHOOK_SECRET` only in the provider's secret store. Rotate any of them that ever appears in chat, logs or git.
5. `FRONTEND_ORIGIN` equals the exact public origin of the frontend (scheme + host, no trailing slash).
6. Payment endpoints answer HTTP 503 until migration 007 is applied and `SEPAY_ACCOUNT_NUMBER` / `SEPAY_BANK` are set. This is intentional.
7. Never log request headers or webhook credentials.
