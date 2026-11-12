# OTP + Zalo notifications + n8n — design contract (2026-11-13)

Status: **design + mock-provider implementation. Nothing is applied to Neon, deployed, or sent to a real phone.**
Schema: `database/postgres/004-otp-notifications.sql` (PROPOSED, validated on a real PostgreSQL engine, idempotent, additive).

## 1. What the approved sources say (verified by reading them)
| Topic | SRS (UC_1–UC_10) | Interview minutes | Conclusion |
|---|---|---|---|
| Customer registration | **No use case** (UC_1 login only, accounts pre-provisioned; OPEN_QUESTIONS Q10) | "Khách hàng đăng ký tài khoản … xem lịch hẹn" | Wanted by the owner, **no flow/OTP/design specified** |
| Forgotten password | **None** | "quên mật khẩu … khôi phục thông qua số điện thoại" | Wanted, **channel/OTP not specified**; Figma login frame has the link, **no reset/OTP frames exist** |
| OTP | **Not mentioned** | Not mentioned | Implementation choice (this document), not an approved requirement |
| Zalo notifications (confirmation / reminder / change) | **None** | Zalo only as a staff/contact channel | **Not in the approved requirements** |
| Reminder interval | **Not documented anywhere** | Only "đặt lịch trước … vài tiếng hoặc một đến hai ngày" (booking lead time, undecided) | **OPEN DECISION — not invented.** Reminders are disabled until `REMINDER_LEAD_MINUTES` is set |

## 2. Open decisions (need the owner; defaults chosen so nothing is invented)
1. Reminder lead time(s): **no default** → `REMINDER_LEAD_MINUTES` unset = no reminder jobs are created.
2. Which booking statuses count as "confirmed" for the confirmation message: implemented as `Đã xác nhận` and `Chưa đến` (staff-created bookings are accepted immediately); **never** `Chờ xác nhận`. Change in one constant (`NOTIFY_CONFIRMED_STATUSES`).
3. Consent: a message is sent only while an active `DongYNhanTin` row exists. Consent is recorded at registration (checkbox). Staff-created bookings for people without consent are **not** messaged.
4. Who may reset a password by OTP: **customers only**. Staff/manager/owner resets stay a manager/owner action (a phone OTP must not become a privilege-escalation path).
5. Password policy for new passwords (none exists today): ≥ 8 characters, at least one letter and one digit.
6. Reschedule/cancel messages: implemented (`BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`) but **not required by the SRS**; kept behind `NOTIFY_CHANGES=true`.
7. UI design: no Figma frames exist for registration/OTP/reset → screens reuse the approved UC_1 login layout and styles (flagged in OPEN_QUESTIONS).

## 3. Architecture (Vercel cannot run background workers)
```
Browser ──/api/auth/otp/*──► NestJS (Vercel)  ──► OtpSender (Zalo ZNS / SMS / Mock)
                               │  enqueue in the SAME transaction as the booking change
                               ▼
                        Neon: ThongBaoCongViec (jobs, unique dedupe key)
                               ▲ claim (FOR UPDATE SKIP LOCKED, lease) + send + record
n8n (Schedule trigger) ──POST /api/internal/notifications/dispatch  (Bearer INTERNAL_API_KEY, constant-time compare)
```
- NestJS owns the provider adapters and **all provider credentials** (Vercel env). n8n holds only the internal API key, so a leaked n8n instance cannot read Zalo tokens.
- n8n is a scheduler/orchestrator: every N minutes it calls `dispatch`; the endpoint is idempotent, so double runs are safe.
- Jobs are rows, not timers: reminders survive restarts. Cancel/reschedule **cancels pending jobs** and (for reschedule) re-creates them with the new time.

## 4. OTP rules (all enforced server-side and in tests)
6 digits from `crypto.randomInt`; stored only as HMAC-SHA256(pepper, id|purpose|phone|code); TTL 5 min; resend cooldown 60 s; ≤ 5 sends/phone/hour and ≤ 10 per IP/hour (DB-based — works on serverless, unlike the in-memory limiter); ≤ 5 wrong attempts then the challenge is invalidated; consumption is one atomic `UPDATE … WHERE DaXacMinhLuc IS NULL AND VoHieuLuc IS NULL AND HetHanLuc > now() … RETURNING` (replay-proof); responses are **identical** whether or not the phone is registered (no enumeration; nothing is sent for ineligible phones); after verification a one-time completion token (random 32 bytes, stored as SHA-256, 10 min) is required to register or reset; password reset revokes every session of the account (`PhienDangNhap.ThuHoiLuc`) and clears the lockout row; **no fixed/test OTP exists in production code**; with no provider configured, OTP requests return a generic 503.

## 5. Provider status
See `docs-deploy/ZALO_N8N_PROVIDER_SETUP.md` (research of current Zalo ZNS / OA / SMS / n8n requirements) — real delivery needs business/legal steps only the owner can complete.
