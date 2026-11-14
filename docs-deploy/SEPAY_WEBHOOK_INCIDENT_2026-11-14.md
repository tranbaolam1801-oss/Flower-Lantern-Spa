# SePay webhook investigation — 2026-11-14

## Incident and verified production evidence

User reports booking `LH33987572`, reference `FLSZAD2VKYC9C`, incoming 480,000 VND at **2026-11-14 13:53:00 Asia/Bangkok (06:53 UTC)**. The bank receipt itself has not been independently fetched from SePay.

Read-only Vercel CLI queries covered **06:45–07:00 UTC** across the project's Production environment, with `hasMore=false` and no excluded intervals:

- 579 CDN requests; **zero requests to `/api/payments/sepay/webhook`**.
- `POST /api/payments/sepay/intent`: HTTP 201 at 06:52:48.645 UTC.
- `GET /api/payments/TT12804217/status`: initial HTTP 200 at 06:52:48.798 UTC, then 22 HTTP 304 responses through 06:56:16.451 UTC. This identifies a payment being polled, but HTTP metadata alone does not prove its booking/reference or DB payment state.
- Those payment requests ran on `dpl_7QnpapSGZ1BnNojyiZxsWKwMtaHM`. Current Production is `dpl_73csXKwG6C3S8Z6Rm9oUV8kLmah6`, created 06:56:46.663 UTC, after the transfer. Both advertise Git SHA `3a8db9e91eba4ac70ee7cc3b39cb2a01ce4708f2`; CLI deployment metadata does not prove absence of dirty source uploads.
- Production `GET /api/docs-json` returned 200 and lists **POST `/api/payments/sepay/webhook`**. Earlier runtime startup also mapped this route at 06:52:37 UTC. No webhook processing/auth rejection for this request path was found in the inspected window. Route-mapping startup log lines are not incoming webhook deliveries.
- Vercel lists Production-scoped keys `SEPAY_ACCOUNT_HOLDER`, `SEPAY_BANK`, `SEPAY_ACCOUNT_NUMBER`, `PAYMENT_MOCK_ENABLED`, `SEPAY_PAYMENT_PREFIX`, `SEPAY_WEBHOOK_AUTH`, `SEPAY_API_KEY`, all sensitive/redacted. Presence/target/type only were checked. Redacted values are NOT proof a variable is empty; effective bank/account/auth mode/key length remain unverified.

**Finding:** the investigated request window shows the missing link before the application's webhook handler. Exact SePay-side reason (disabled rule, account/prefix filter, missing recognized code, wrong URL or transport failure) requires its delivery history. Do not claim a matching/DB failure caused this specific transfer without that evidence.

## Access limits and actions not taken

- Local connection configuration could not establish a Neon read-only connection. Whether this transfer/payment/event exists in Neon is **UNVERIFIED**; HTTP 201 suggests an intent was created, not that the bank transfer was reconciled.
- Automatic approval rejected pulling all Production environment variables because that could save unrelated secrets locally. No bypass or bulk secret retrieval was attempted afterward.
- Automatic approval rejected printing unfiltered saved logs. Later log reads used allowlisted HTTP metadata and fixed error classifications only.
- Computer Use ended because it could not confidently determine the current Chrome URL. No SePay dashboard state, filters, test mode, delivery response or bank account was inspected through UI.
- No production POST, replay, payment transition, SQL UPDATE, migration, configuration edit, new transfer, commit, push or deploy was performed.

## Local changes (not a claim that the incident is settled)

1. A regression reproduced a real acknowledgement flaw: every SQLSTATE 23505 was previously treated as a duplicate, even without a stored event. The handler now checks for a durable `(provider, transaction id)` event after rollback; otherwise it returns 503. Invalid-payload audit insertion uses the same fail-closed rule. A real local PostgreSQL unique-index collision proves rollback and no false success.
2. Webhook logs emit fixed authentication/processing/outcome labels only. No headers, raw body, reference, amount, account or secret is logged.
3. Payment status responses use `Cache-Control: private, no-store`; the frontend status fetch uses `cache: 'no-store'`. The observed 304s are legitimate revalidation responses, **not independently established as the incident cause**.
4. QR disappears only after the API reports `Đã thanh toán`; polling stops and the parent refetch callback fires once. The static Test Mode title was removed; only backend `simulated=true` shows “Mô phỏng”, with a non-bank-settlement notice. This does not toggle SePay mode or live configuration.
5. Expiry UI warns users who already transferred not to transfer again. Existing expiry reconciliation policy is unchanged.

## Read-only Neon evidence command

Prefer a dedicated read-only role. Set `SEPAY_DIAGNOSTIC_DATABASE_URL` locally, or explicitly supply a local env file with that variable / `DATABASE_URL`; never send the value in chat.

```powershell
node scripts/diagnose-sepay-payment.mjs --booking LH33987572 --reference FLSZAD2VKYC9C --amount 480000 --env-file <approved-local-config-file>
```

The CLI runs parameterized SELECTs in `BEGIN READ ONLY`, applies short statement/lock timeouts, rolls back and closes. It omits accounts, raw bodies and credentials, and has **no settlement/replay mode**. Inspect the exact booking/reference, expected amount, provider, stored receiver presence, expiry, booking/payment states and matching event outcomes. No exact match or an unknown event requires review, not a guessed category/payment association.

## SePay checks required before any replay

Read the delivery history for this exact transaction and timestamp. Record destination URL, attempt time, HTTP status and response, without copying auth headers or raw private payloads into the repository/chat.

Expected destination: `https://flower-lantern-spa.vercel.app/api/payments/sepay/webhook`, method POST, JSON body. Verify the webhook is enabled, event is incoming, bank account filter matches the QR receiver, and the recognized payment code/prefix rule accepts **FLS plus ten letters/digits**, not only a numeric suffix. `code` can be null when SePay's code extraction rule does not match; an “only send when code exists” rule can prevent delivery even if `content` contains the reference.

The app accepts authenticated API Key or HMAC. Check actual chosen mode matches `SEPAY_WEBHOOK_AUTH`; the application's existing minimum secret length is 32, not a SePay universal rule. For HMAC the raw body/timestamp signature must match the official algorithm; no auth weakening or secret change was made. Bank/account/prefix filters and actual gateway must be verified from SePay and the original QR, not inferred from amount alone. This schema stores the receiving account per intent but not a bank snapshot; gateway/bank consistency for this historical transaction cannot be independently established from current configuration alone.

## Safe recovery after verification and separate approval

1. Fetch the real transaction from SePay history or its authenticated transaction API. Verify immutable transaction ID, incoming direction, actual bank/gateway and receiver, exact reference (`code` and full memo), amount, transaction time, original intent/expiry and booking. Cross-check the read-only Neon report. API access credentials are distinct from webhook authentication; do not reuse a webhook key as an API token without documentation.
2. If SePay never attempted delivery, correct the documented URL/filter/auth configuration only after owner approval. Do not send a new bank transfer.
3. Prefer SePay's official resend for that original transaction **after explicit approval**; do not construct a hand-signed fake webhook. The handler still performs authentication and reconciliation, and deduplicates by provider transaction ID.
4. A 200 `{success:true}` means the event was received/audited, not necessarily PAID. Inspect outcome and both payment/booking states after replay.
5. Current policy holds expired, wrong reference/account, under/overpaid and cancelled-booking transfers for review. A replay after the QR expired can produce `EXPIRED` even if the bank transfer was earlier. Such a case needs an approved reconciliation decision; this patch does not bypass expiry or auto-mark it PAID. A previously held event also stays idempotent on replay and is not silently reprocessed.
6. DB/network failures must return non-2xx; enable SePay retry on server error as appropriate, with owner approval. Retain the same transaction ID on retries.

Approval is still needed for any Production deployment, SePay/Vercel setting or credential change, official replay that could settle a payment, or manual reconciliation transition after bank evidence is verified. **No manual SQL UPDATE is proposed.**

Official references checked 2026-11-14:
- [Webhook payload and response contract](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook)
- [Webhook authentication](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc)
- [Reconciliation and missing deliveries](https://developer.sepay.vn/vi/sepay-webhooks/doi-soat-giao-dich)
- [SePay webhook troubleshooting](https://developer.sepay.vn/en/sepay-webhooks/xu-ly-loi)
- [Delivery history and response panel](https://developer.sepay.vn/vi/sepay-webhooks/giam-sat)

## Cách lấy HTTP status và kết quả để tiếp tục điều tra

1. Trên SePay, mở **Webhooks → Lịch sử gửi**, không chỉ xem lịch sử tiền vào ngân hàng. Chọn khoảng **14/11/2026 13:45–14:15 (UTC+7)** và hiển thị cả thành công/thất bại. Nếu có nhiều webhook, chọn webhook dành cho website này.
2. Tìm dòng giao dịch liên quan mã `FLSZAD2VKYC9C` qua liên kết giao dịch, rồi bấm dòng đó để mở panel chi tiết. Phần **Tóm tắt** có HTTP status, thời gian phản hồi và nhãn lỗi.
3. Trong tab **Request**, lấy **URL đích và HTTP method**. Không copy headers, API Key, chữ ký hoặc lệnh cURL.
4. Trong tab **Response**, lấy HTTP status và nội dung JSON/thông báo trả về, che thông tin riêng nếu có. Gửi lại mẫu: `thời điểm gửi | URL | method | HTTP status | response body/nhãn lỗi`.
5. Nếu không có dòng nào, ghi rõ “Không có lịch sử gửi trong khoảng này”, rồi kiểm tra chỉ đọc: webhook có On không, nhận tiền vào không, tài khoản có trong bộ lọc không, URL có đúng endpoint trên không, điều kiện mã thanh toán có bỏ qua code=null không. Chưa bấm Test send, Phát lại hoặc Lưu cấu hình.

HTTP 401 chỉ hướng tới bước xác thực; 404 tới URL; 405 tới method; 5xx tới server. Cần response thực tế để kết luận. HTTP 200 `success:true` chưa chứng minh tiền đã được ghi PAID: còn phải xem outcome và trạng thái Neon.

Executed tests and final results are recorded in TEST_REPORT.md. Independent local tests do not prove real bank settlement or current Production correctness.
