# Staging configuration

Template: `staging.env.example` (placeholders only). Real values live only in the host's secret store. No hosting provider is selected; nothing here deploys anything.

## Decisions and consequences

| Setting | Notes |
| --- | --- |
| `NODE_ENV=production` (recommended) | Cookie `Secure` is forced; Windows auth and `DB_TRUST_CERTIFICATE` are rejected/ignored; payment mock is off. |
| `NODE_ENV=staging` | Mock stays off (allow-list is only `test`/`development`). Cookie is **not** Secure unless `COOKIE_SECURE=true` (now supported); `DB_TRUST_CERTIFICATE=true` becomes honoured, so do not set it. |
| `COOKIE_SECURE` | `true` forces the `Secure` flag outside production. Cookie is always `HttpOnly`, `SameSite=Lax`, `Path=/`; no Domain attribute. |
| Same-site requirement | SameSite=Lax means the frontend and API must share a registrable domain (best: one origin, with the proxy routing `/api` to the backend). A different registrable domain will not receive the cookie. `FRONTEND_ORIGIN` accepts exactly one origin (CORS and CSRF origin check). |
| `HOST` | Default `127.0.0.1`. A proxy in another container/host needs `HOST=0.0.0.0`: the plain-HTTP backend then listens on all interfaces, so allow only the proxy to reach `PORT` (private network/firewall) and terminate TLS at the proxy. |
| `TRUST_PROXY` | Default off. Set to the number of proxy hops (e.g. `1`) so `req.ip` is the real client IP; never `true` unless the backend is unreachable except via the proxy (clients could spoof `X-Forwarded-For`). Without it, behind a proxy every client shares the proxy IP and rate limits collapse onto one key. |
| `UPLOAD_DIR` | Default `backend/uploads` (git-ignored, created on demand). Files are served at `/api/uploads/services/<random>.<ext>`. Ephemeral disks lose them on redeploy: mount a persistent volume (and back it up) or implement object storage behind `ImageStorage` (`backend/src/uploads/image-storage.ts`; not implemented). Proxy `client_max_body_size` must be at least 2 MB. |
| Rate limiting | In-memory fixed window, **per process**. Webhook 300/min/IP, SePay intent 20/min/session, login 20/min/IP (in addition to account lockout), image upload 30/min/session. Multiple instances multiply the effective limits; a shared store (e.g. Redis) is needed for horizontal scale. Responds 429 + `Retry-After`. |
| `AUTH_SESSION_STORE=sql` | Requires migration 004 applied on the staging database. |
| SePay | `PAYMENT_MOCK_ENABLED=false`; API key or HMAC secret at least 32 chars; the callback URL must be public HTTPS. See `SEPAY_DASHBOARD_SETUP.md`. |

## Before first start

- [ ] Staging database created (dedicated, not Dev/Test) and migrations applied in the order given in the database proposals (baseline, 003, 004, then approved 005-007); approval recorded.
- [ ] Sample/seed data approved by the user; no real customer data.
- [ ] Environment set from `staging.env.example` in the secret store; `JWT_SECRET` random, >= 32 bytes.
- [ ] Reverse proxy with valid HTTPS, routing `/api` and the SPA, with body limit >= 2 MB and `X-Forwarded-For`.
- [ ] `UPLOAD_DIR` on a persistent, writable volume.
- [ ] `PAYMENT_MOCK_ENABLED` absent/`false`; SePay Test Mode account configured.

## Smoke test

1. `GET /api/health/live` 200, `GET /api/health/ready` 200 (SQL reachable).
2. Log in as a seeded manager; confirm the `access_token` cookie is `HttpOnly; Secure; SameSite=Lax`; `/api/auth/me` returns the user; logout clears it.
3. Public service list loads; manager opens UC_9, uploads a png/jpeg/webp image, saves, and the image renders after reload.
4. Create a booking (UC_5/6) and confirm it persists.
5. SePay Test Mode: create an intent, then simulate an incoming transfer following `SEPAY_DASHBOARD_SETUP.md`; confirm the payment is confirmed once and a replay is ignored.
6. Hammer `POST /api/auth/login` with bad credentials: expect 429 with `Retry-After`.
