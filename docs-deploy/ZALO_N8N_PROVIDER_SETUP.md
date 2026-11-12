# Zalo / SMS / n8n provider setup — verified research and required owner actions (2026-11-13)

Nothing here has been provisioned, purchased or sent. Facts were fetched live; items marked **UNVERIFIED** could not be confirmed from an official source (Zalo's developer pages render client-side and the ZNS API reference could not be read).

## 1. Zalo ZNS / "ZBS Template Message" (real notifications and Zalo OTP)
**Requirements (owner action — cannot be automated or bypassed):**
1. A **ZBS (Zalo Cloud) account + an Official Account (OA) + an AppID** linked together (official: zalo.solutions/zns/guidelines/en/intro).
2. A **verified OA** — third-party providers state this is mandatory and requires a business registration certificate + representative ID (3–7 working days; **UNVERIFIED officially**). No source confirms that an individual or student can do this → treat a legal entity or household business as required until Zalo support says otherwise.
3. **Prepaid balance** (charged per delivered message).
4. **Template approval** (about 2–3 working days per template): OTP/verification template (≤ 400 characters, must name the site/app), a "custom" template for booking confirmation, and a template for reminders.
5. The recipient must have a Zalo account linked to the phone number and have agreed to Zalo's terms.

**Prices** (zalo.solutions/terms, VND excl. VAT): verification/OTP **400**; other custom notices (booking confirmation, reminder) **300**; add-ons: image +300, 2nd button +100, external-link CTA 500. An OTP is billed only if delivered within 15 s.

**Business-rule risk for reminders:** Zalo ties a ZNS to a *transaction event within 7 days* ("chỉ được hình thành khi có sự kiện giao dịch phát sinh"). A confirmation after a booking fits; a **reminder is not clearly covered** and may be rejected at template review. Ask Zalo/your reseller before relying on it. The OA "CS message" alternative needs the user to have interacted with the OA within 48 h (some sources say 7 days) and uses a Zalo user id, so it is unreliable for reminders.

**Technical status of the adapter (`backend/src/messaging/zalo-zns.provider.ts`):** written from third-party documentation; tested only against a local mock server; **never sent a real message**. Assumed shape: `POST https://business.openapi.zalo.me/message/template` with header `access_token`, body `{phone: "84…", template_id, template_data (all strings), tracking_id, mode?: "development"}`. **Verify every item against the official reference before use.** Access/refresh-token lifetimes are UNVERIFIED; refresh tokens rotate, so automatic refresh would need encrypted persistence — **not implemented** (the token is supplied via `ZALO_ACCESS_TOKEN` and must be renewed by the owner).

**Environment (Vercel, server-side only):** `MESSAGING_PROVIDER=zalo_zns`, `ZALO_ACCESS_TOKEN`, `ZALO_TEMPLATE_OTP`, `ZALO_TEMPLATE_BOOKING_CONFIRMED`, `ZALO_TEMPLATE_BOOKING_REMINDER`, optional `ZALO_TEMPLATE_BOOKING_RESCHEDULED`, `ZALO_TEMPLATE_BOOKING_CANCELLED`, optional `ZALO_ZNS_MODE=development`. Template variables must be named exactly: OTP `otp`; bookings `customerName`, `bookingId`, `date`, `time`, `serviceName`, `packageName` (+ `bedId` if wanted).

## 2. OTP delivery options that need no registered company (for a student demo)
| Option | Cost / limits | Notes |
|---|---|---|
| **Mock provider** | free | Only when `NODE_ENV` is test/development **and** `MESSAGING_MOCK=true`; refused on the public site (no fixed OTP ever reaches production) |
| Firebase Phone Auth test numbers | free for up to 10 test numbers; real SMS needs the Blaze (billing) plan | Would require swapping OTP verification to Firebase — different design |
| Twilio Verify | ~US$0.05 per verification + ~US$0.29 per Vietnamese SMS segment (≈ US$0.33 per OTP); free trial exists (restrictions UNVERIFIED) | No company paperwork; an `SmsOtpSender` adapter is **not written yet** (needs your account) |
| Vietnamese SMS (eSMS, SpeedSMS…) | SpeedSMS lists 490 VND/SMS (2-way, incl. VAT); brandname registration normally needs business documents | Ask the provider about a non-brandname route; **UNVERIFIED** |
**Honest conclusion:** real phone OTP to Vietnamese numbers needs either a verified Zalo OA (ZNS) or a paid SMS account. Until you choose and approve one, OTP runs **only with the mock** and the public site answers OTP requests with a generic 503 (it never sends a fixed code).

## 3. n8n
- **n8n Cloud:** no permanent free plan. Starter €20/month (billed annually, 2,500 executions); the free trial is 1,000 executions (length not stated on the pricing page).
- **Free self-hosting is unreliable for a scheduler:** Render free sleeps after 15 minutes idle (breaks Schedule Triggers); Fly.io has no free tier; Koyeb's free instance could not be confirmed; Railway Hobby is **US$5/month**; Oracle Always Free and GCP e2-micro are free but need card verification, a VM you administer, and may be reclaimed/limited. n8n can use PostgreSQL (Neon is not on the supported list — likely works, UNVERIFIED). Community License: fine for your own internal/demo use.
- **Therefore the scheduler is deliberately decoupled:** NestJS exposes one idempotent endpoint (`POST /api/internal/notifications/dispatch`, Bearer `INTERNAL_API_KEY`). Any of these can call it:
  1. **GitHub Actions** (`.github/workflows/dispatch-notifications.yml`, every 5 minutes, free) — **recommended for the demo**; needs repo secret `INTERNAL_API_KEY` + variable `APP_URL`, and must be on the default branch (`main`). GitHub may delay runs and disables scheduled workflows after 60 days of repo inactivity.
  2. **n8n** (`n8n/flower-lantern-notification-dispatch.json`, every minute) — import it, create the Header Auth credential `Flower Lantern Internal API`, enable. Only worthwhile if you already host n8n (≈ US$5/month on Railway).
  3. cron-job.org (free, up to once/minute).
  Vercel Hobby cron is **not** suitable (once per day, ±59 min; the newer 15-minute "Schedules" beta is unconfirmed).
- n8n workflow JSON is tested structurally and by replaying its HTTP request against a fake endpoint; it was **not executed inside a real n8n instance**.

## 4. What only you can do (nothing was bypassed)
1. Decide the delivery route: verified Zalo OA + ZBS (business documents, prepaid balance, template approval) **or** a paid SMS provider **or** stay on mock-only for the demo.
2. Provide the reminder interval(s) (`REMINDER_LEAD_MINUTES`, e.g. `1440,120`) — undocumented in the SRS, so it is **not invented**; reminders stay off until you set it.
3. Confirm the open decisions in `OTP_NOTIFICATIONS_DESIGN.md` §2 (confirmed statuses, consent model, who can reset passwords, password policy, change notifications).
4. Approve applying migration `database/postgres/004-otp-notifications.sql` to Neon (additive; exact plan below in the final report).
5. Set the new secrets in Vercel yourself or approve me to set them: `OTP_PEPPER`, `INTERNAL_API_KEY` (I generate both randomly), plus the Zalo/SMS variables when you have them.
