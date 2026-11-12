# Deployment guide (provider-agnostic)

**Status: no hosting provider has been selected and nothing has been deployed, provisioned or paid for.** Per AGENTS.md, choosing a provider needs explicit user approval. Every step below is generic; replace placeholders such as `<YOUR_BACKEND_DOMAIN>` with your own values.

## 1. Components

| Component | What it is | Notes |
|---|---|---|
| Frontend | Static files from `npm run build --workspace @spa/frontend` (`frontend/dist`) | Calls the API at the relative path `/api/...` |
| Backend | NestJS app in `backend`; build, then `node dist/main.js` | Node.js LTS; reads environment variables (see PRODUCTION_ENVIRONMENT.md) |
| Database | Microsoft SQL Server | Reachable from the backend over TCP (default 1433), encrypted connection |

## 2. Network and HTTPS requirements

- The frontend calls `/api/...` on its own origin and the auth cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production. Serve the frontend and the API **under the same public HTTPS origin**: static files at `/`, reverse proxy `/api` to the backend. Then `FRONTEND_ORIGIN=https://<YOUR_BACKEND_DOMAIN>` (the same origin).
- The backend binds `127.0.0.1` by default; set `HOST` to change it. A reverse proxy in the same host/network namespace works with the default. A proxy in another container or host needs `HOST=0.0.0.0`, which exposes the plain-HTTP backend on every interface of that container: restrict it with a private network/firewall so only the proxy can reach `PORT`, and keep TLS at the proxy. Also set `TRUST_PROXY` (see STAGING_CONFIGURATION.md) so rate limiting sees client IPs.
- TLS terminates at the proxy with a valid certificate. SePay Live requires a valid HTTPS certificate on the webhook URL (Test Mode skips certificate verification).
- **Final webhook endpoint:** `https://<YOUR_BACKEND_DOMAIN>/api/payments/sepay/webhook` (POST). It must be reachable from the public internet: not behind login, and not blocked by an IP allow-list or WAF rule that drops SePay's requests.
- Forward the `Authorization`, `X-SePay-Signature` and `X-SePay-Timestamp` headers unchanged.
- **HMAC mode needs the raw body unmodified.** The backend enables `rawBody`; the proxy must not re-encode or rewrite the request body, and no body-transforming middleware may sit in front of the app.
- **CORS/CSRF:** the app allows only `FRONTEND_ORIGIN` with credentials; state-changing browser calls need the `X-Spa-Request: 1` header and a matching `Origin`. Exactly one route, `POST /api/payments/sepay/webhook`, is exempt from that check because SePay is a server, not a browser. It authenticates itself (API key or HMAC, secret of at least 32 characters) and fails closed: every unauthenticated call gets the same 401, including when the secret is missing or too short (that misconfiguration is only written to the server log). There is no rate limiting on this public endpoint in the application; add a proxy/WAF limit if you need one.
- SePay waits up to 30 s and expects HTTP 200 or 201 with `{"success": true}`. The backend returns exactly that, including for duplicates and for transfers it cannot match (those are audited, not retried).
- Swagger is served at `/api/docs`; restrict or disable it at the proxy if you do not want it public.

## 3. Pre-deploy checklist

- [ ] User has chosen a hosting provider and approved deployment (not done yet).
- [ ] Target database exists and the **user approved** applying `database/migrations/007-sepay-payments.PROPOSED.sql`. The file currently refuses to run outside `FlowerLanternSpa_Test`; for any other database the guard must be revised under a separate approval. Apply it **before** starting a backend that serves payments (until then every `/api/payments/*` call answers 503 by design). Migration 004 must already be applied if `AUTH_SESSION_STORE=sql`.
- [ ] Back up the target database before applying any migration. Rollback notes are in the header of 007.
- [ ] After 007 is applied: add the 5 new columns to the `ThanhToan` entity, add `SePayWebhookEvent` and `ThanhToanHoanTien` entities registered in `backend/src/entities/index.ts`, and update `schema.sql.integration.spec.ts` (17 to 19 tables). Re-run that audit against the target DB.
- [ ] All environment variables set in the provider's secret store (PRODUCTION_ENVIRONMENT.md); `PAYMENT_MOCK_ENABLED` unset and `NODE_ENV=production` (the mock only runs for `NODE_ENV` `test` or `development`).
- [ ] Tests green on the exact commit being deployed: `cd backend && npx jest --runInBand`, `npx tsc --noEmit`, `npm run build --workspace @spa/frontend`. SQL integration tests run only against the Test database.
- [ ] HTTPS certificate valid; `https://<YOUR_BACKEND_DOMAIN>/api/health` reachable.
- [ ] `POST https://<YOUR_BACKEND_DOMAIN>/api/payments/sepay/webhook` without credentials returns 401 (also when secrets are unset), never 200.

## 4. Deploy sequence (generic)

1. Provide SQL Server connectivity (private network or firewall-restricted endpoint) and a least-privilege SQL login.
2. Apply the approved migrations in numeric order with the approver present.
3. Build the backend and run it with production environment variables behind the reverse proxy.
4. Build the frontend and publish `frontend/dist` as static files on the same origin, with SPA fallback to `index.html`.
5. Smoke test: log in, open a booking, create a SePay payment (the QR appears), then follow SEPAY_DASHBOARD_SETUP.md in Test Mode.
