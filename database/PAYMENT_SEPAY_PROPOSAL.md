# PROPOSAL — SePay Test Mode payments (NOT APPLIED)

Status: code in `backend/src/payments/**` and `database/migrations/007-sepay-payments.PROPOSED.sql` are written and unit-tested with a mocked database only. Nothing was run against SQL Server. Requires user approval before applying 007 to `FlowerLanternSpa_Test`.

## Official documentation used
- https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook (payload, response, dedup, `code` extraction)
- https://developer.sepay.vn/en/sepay-webhooks/xac-thuc (API Key / HMAC-SHA256 / OAuth 2.0)
- https://developer.sepay.vn/en/tien-ich-khac/tao-qr-code (QR image URL)
- https://developer.sepay.vn/en/sepay-webhooks/test-mode/so-sanh-voi-live (Test mode)
- https://docs.sepay.vn/tich-hop-webhooks.html (retry schedule: up to 7 retries after 1,1,2,3,5,8,13 minutes)

## Webhook contract (as documented)
- Auth: `Authorization: Apikey <key>`; or HMAC-SHA256: `X-SePay-Signature: sha256=<hex>` over `{X-SePay-Timestamp}.{raw body}`. 5-minute tolerance is only a code comment in the docs' PHP sample.
- Success response: HTTP 200/201 and body exactly `{"success": true}` within 30 s. Non-2xx is retried; 200 without the body is not retried.
- `id` (integer) is the dedup key. `code` is extracted by SePay using the prefix configured in the SePay dashboard and may be `null`.
- QR: `https://qr.sepay.vn/img?acc=&bank=&amount=&des=`; memo `des` carries the payment reference.

## Reconciliation rules (implemented in `payment-rules.ts`)
| Case | Action | Audit `KetQuaXuLy` |
|---|---|---|
| Exact amount, pending, unexpired, right account | Payment `Thành công`; booking payment status recomputed | CONFIRMED |
| Same provider tx id again | 200 success, nothing applied | (no new row) |
| `transferType` not `in` | Ignored | IGNORED_OUT |
| Wrong receiving account | Not applied | ACCOUNT_MISMATCH |
| Unknown / missing reference | Not applied | UNKNOWN_REFERENCE |
| Amount lower | Not applied, stays pending | UNDERPAID |
| Amount higher | Not applied, stays pending | OVERPAID |
| Expired or not pending | Not applied | EXPIRED |
| Already paid/refunded reference, new tx id | Not applied | DUPLICATE_PAYMENT |
| Booking `Đã hủy` | Not applied | BOOKING_CANCELLED |
| Refund | Staff (Quản lý) records `KhoanHoanTien`; full refund sets `Đã hoàn tiền`; no money moves | — |

Every non-CONFIRMED outcome is acknowledged with `{"success":true}` (retrying cannot fix it) and kept in `SePayWebhookEvent` for manual reconciliation. Auth failure -> 401, malformed payload -> 400, missing config/schema or SQL failure -> 503 (SePay retries).

## Open questions (need user decision)
1. Underpayment: accept as partial payment (`Thanh toán một phần`) or keep rejecting until manual reconciliation?
2. Overpayment: confirm and flag refund of the surplus, or hold (current)?
3. Late transfer after expiry: auto-confirm if the booking is still open, or manual (current)?
4. Pending status wording `Chờ thanh toán` / `Hết hạn` in `ThanhToan.TrangThaiGiaoDich` (SRS lists only Thành công / Thất bại / Đã hoàn tiền) — approve?
5. Paying a `Hoàn thành` booking is allowed (needed for review eligibility), but staff `PATCH /bookings/:id` blocks editing completed bookings — confirm intended.
6. Staff-entered `Đã thanh toán`/`prepaidAmount` has no ThanhToan row; a SePay full refund recomputes status from rows only and could reset a manually set status.
7. Virtual accounts / sub-accounts: current check compares `accountNumber` with `SEPAY_ACCOUNT_NUMBER`.
8. Payment-code prefix (`SEPAY_PAYMENT_PREFIX`, default FLS) must equal the prefix configured in the SePay dashboard; VietinBank personal accounts require `SEVQR` in the memo.
9. Refund permission: currently Quản lý / Chủ Spa only.


## Security review follow-up (2026-11-12)

Implemented in `backend/src/payments`, `reports`, `booking-write.service.ts`:

| Id | Change |
|---|---|
| M1 | Mock gate is an allow-list: `PAYMENT_MOCK_ENABLED=true` AND `NODE_ENV` exactly `test` or `development` (unset/other = off). Payment DTO exposes `provider` (`SEPAY`/`MOCK`) and `simulated`. Revenue report excludes `NhaCungCap='MOCK'` only when that column exists (so reports work before 007). |
| M3 | Staff `PATCH /bookings/:id`: UPDATE is guarded by the payment status that was read (409 on stale); a manual `paymentStatus` change is rejected with 409 when the booking has `ThanhToan` rows. |
| M4 | Refund requires `Quản lý` + `Q01`, a non-empty `reason` (max 255) and writes `dbo.ThanhToanHoanTien` (reason + actor account) in the same transaction. Table added to 007 (additive, idempotent); `ensureSchema` requires it. |
| M5 | Webhook account check uses the account stored on the payment (`SoTaiKhoanNhan`), falling back to the configured account only if null; QR and intent reuse also use the stored account. |
| M2 (partial) | `GET /api/payments/unreconciled` (`Nhân viên`/`Quản lý` + `Q01`, paged, newest first) lists events with `KetQuaXuLy<>'CONFIRMED'`, no raw payload. Expiry / mass-expire policy unchanged (open question). |
| L1 | Authenticated but invalid payloads are stored as `INVALID_PAYLOAD` (raw truncated) and answered `{success:true}`; `transferAmount` strings must match `^\d{1,12}(\.0+)?$`. |
| L2/L6 | API key / HMAC secret shorter than 32 characters is "not configured"; configured secrets and header values are trimmed. |
| L3 | Unauthenticated callers always receive the same 401, configured or not; the misconfiguration is logged server-side (never the secret). |

### Known limitations (not done)

- L4 rate limiting on the public webhook: needs a dependency (e.g. a throttler) or a proxy/WAF rule; needs user approval.
- L5 retention policy for `SePayWebhookEvent.DuLieuTho` (raw payloads, up to 20 000 chars each): not defined.
- Expiry policy for held/expired payments and overpayment handling: open questions above.

### Entity and spec changes required when 007 is applied (NOT done now)

- `backend/src/entities/thanh-toan.entity.ts`: add `MaThamChieu` varchar(32) null, `NhaCungCap` varchar(20) null, `MaGiaoDichNhaCungCap` varchar(64) null, `HanThanhToan` datetime null, `SoTaiKhoanNhan` varchar(30) null.
- New `se-pay-webhook-event.entity.ts` (table `SePayWebhookEvent`): `MaSuKien` bigint identity PK; `NhaCungCap` varchar(20); `MaGiaoDichNhaCungCap` varchar(64); `MaThanhToan` char(10) null with ManyToOne FK to `ThanhToan` (NO ACTION); `SoTienNhan` money null; `LoaiGiaoDich` varchar(10) null; `SoTaiKhoanNhan` varchar(30) null; `ThamChieu` varchar(64) null; `KetQuaXuLy` varchar(40); `DuLieuTho` nvarchar(max); `NgayNhan` datetime.
- New `thanh-toan-hoan-tien.entity.ts` (table `ThanhToanHoanTien`): `MaHoanTien` bigint identity PK; `MaThanhToan` char(10) FK to `ThanhToan`; `SoTien` money; `LyDo` nvarchar(255); `MaTaiKhoanThucHien` char(10) FK to `TaiKhoan`; `NgayThucHien` datetime.
- Register both new entities in `backend/src/entities/index.ts`.
- `backend/src/schema.sql.integration.spec.ts`: expected table count 17 becomes **19** (title "17" to "19"); column and FK counts are derived from entity metadata.
