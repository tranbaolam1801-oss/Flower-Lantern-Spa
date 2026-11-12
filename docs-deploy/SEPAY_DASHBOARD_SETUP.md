# SePay Dashboard setup (actions only you can perform)

Do this **after** the backend is deployed on a public HTTPS URL and migration 007 is applied (see DEPLOYMENT_GUIDE.md). Nothing here has been done yet; no SePay account, key or webhook exists for this project.
Menu names are taken from SePay's official documentation (links at the end). Where the documentation gives no UI detail this guide says **verify in the dashboard** instead of guessing.

**Secrets rule:** never paste the API key, HMAC secret or bank details into chat, the repository, tickets or logs. Copy them straight into the hosting provider's secret store.

## 1. Account and receiving bank account

1. Create or sign in to your account at `https://my.sepay.vn`; complete whatever identity/company verification the dashboard asks for (verify in the dashboard).
2. Link the bank account that will receive customer transfers (verify in the dashboard for the exact bank-linking flow of your bank).
3. Record, in the secret store (not in git): `SEPAY_ACCOUNT_NUMBER` = that account number exactly as SePay reports it in `accountNumber`, `SEPAY_BANK` = the bank name SePay's QR service accepts, `SEPAY_ACCOUNT_HOLDER`.

## 2. Payment-code prefix

1. Open **Company > General settings > Payment code structure** (`my.sepay.vn/company/configuration`).
2. Set the prefix to the same value as `SEPAY_PAYMENT_PREFIX` (default `FLS`). The backend creates references like `FLS` + 10 characters from `A-Z` (without I, O) and `2-9`. SePay extracts them into the webhook `code` field; if no prefix matches, `code` is `null` and the backend falls back to scanning `content` for the same pattern.
3. The documentation does not describe the exact structure form fields: verify in the dashboard that your prefix and the 10-character suffix are accepted (suffix length/format may be constrained by SePay).
4. Some banks alter the transfer memo (case, separators); the backend upper-cases before matching.

## 3. Create the webhook (Live)

1. Open the **Webhooks** menu (`my.sepay.vn/webhooks`) and click **Thêm webhook** (top right). It is a 4-step form:
   1. **Basic info:** name; event = **Có tiền vào** (incoming money only; the backend also ignores `transferType = out`); URL = `https://<YOUR_BACKEND_DOMAIN>/api/payments/sepay/webhook`; data format = **JSON** (the backend is tested with JSON; the form-encoded formats are accepted for amount/id strings but JSON is the supported choice).
   2. **Account and filters:** choose the linked receiving account. Optionally filter by payment-code prefix (the docs mention a prefix filter; they do not describe a "skip if no code" switch, so verify in the dashboard if you see such an option. Leaving transfers without code enabled is harmless: the backend audits unknown references).
   3. **Security:** choose **API Key** (matches `SEPAY_WEBHOOK_AUTH=apikey`, the default) **or HMAC-SHA256** (matches `SEPAY_WEBHOOK_AUTH=hmac`, which SePay marks as recommended). Use a key/secret of at least 32 characters (shorter values are rejected by the backend). Do not choose "no authentication" or OAuth 2.0 (not supported by this backend).
      - API Key: SePay sends `Authorization: Apikey <your key>`. The full key is shown **once**; afterwards only the last 4 characters. Copy it immediately into the secret `SEPAY_API_KEY` (verify in the dashboard whether you type your own key or SePay generates it).
      - HMAC: SePay sends `X-SePay-Signature: sha256=<hex>` and `X-SePay-Timestamp` (seconds), signing `{timestamp}.{raw body}`. Put the Secret Key in `SEPAY_WEBHOOK_SECRET` and set `SEPAY_WEBHOOK_AUTH=hmac`. The backend rejects timestamps more than 5 minutes off, so the server clock must be accurate (NTP).
   4. **Alerts:** pick a notification channel for failed deliveries.
2. Optionally enable **Tự động gửi lại khi server trả lỗi** (auto retry on server error). Per the docs: SePay always retries when it cannot reach the endpoint or times out (30 s); with this option it also retries any non-2xx answer, up to 7 retries (about 1, 1, 2, 3, 5, 8, 13 minutes). A 200/201 response without `{"success": true}` is logged as failed and is not retried. The backend answers 503 on transient database errors precisely so that retry can recover them.
3. Click **Thêm**. After changing the environment variables on the host, restart the backend so it reads them.
4. Replays and retries reuse the same SePay transaction `id`; the backend stores it in `SePayWebhookEvent` with a unique constraint, so they cannot confirm a payment twice.

## 4. Test Mode (do this first, before Live)

Test Mode is a fully separate sandbox: simulated transactions never touch real bank accounts or Live data. Delivery, payload format, retry schedule, auth types, timeouts and filters are identical to Live; Test Mode has a delivery log only (no webhook health dashboard, no automatic failure alerts). Limits from the docs: up to 50 webhooks per company; **Phát lại** (Replay) at most 10 attempts per minute per company; other quotas are on SePay's "Test mode quotas" page. SSL verification is **disabled** in Test Mode (HTTP and self-signed certificates are accepted), so a successful Test Mode call does not prove your certificate is valid.

1. In `my.sepay.vn`, click **Test mode** (flask icon in the sidebar, or press `Ctrl K` and type "Test mode"). Confirm the yellow banner "Test mode: data does not affect Live accounts".
2. **Test mode > Bank Accounts > Add New**, or **Replicate from Live** (the replica is read-only). Use an account number equal to `SEPAY_ACCOUNT_NUMBER` in the backend environment you test with; otherwise the backend audits the event as `ACCOUNT_MISMATCH` and does not confirm.
3. **Test mode > Webhooks > Add Webhook**: URL = `https://<YOUR_BACKEND_DOMAIN>/api/payments/sepay/webhook`, event = incoming (or All), account = the test account, authentication = the same type and key/secret you configured on the backend (use a **test-only** key, different from the Live key).
4. In the application, create a payment intent for a booking (payment dialog). Note the reference (`FLS...`) and the exact amount shown.
5. **Test mode > Transactions > Simulate**: Account = the test account, Type = **In**, Amount = exactly the amount shown, Content = text containing the reference (for example `<REFERENCE> test`). Click **Simulate**. (The "Simulate transaction" page of the docs describes the full form; verify the fields in the dashboard.)
6. What to look for:
   - **SePay:** **Test mode > Webhooks > Delivery Logs**: the delivery should show HTTP 200 and response `{"success":true}`.
   - **Application:** the payment dialog changes to "Đã thanh toán" within about 3 seconds and the booking's payment status becomes "Đã thanh toán".
   - **Database:** a row in `dbo.SePayWebhookEvent` with `NhaCungCap='SEPAY'`, `MaGiaoDichNhaCungCap` = the simulated transaction id and `KetQuaXuLy='CONFIRMED'`; the matching `dbo.ThanhToan` row has `TrangThaiGiaoDich = N'Thành công'`, `MaGiaoDichNhaCungCap` set.
7. Also test the negative cases: amount lower and higher than shown (`UNDERPAID` / `OVERPAID`, the payment stays pending), unknown reference (`UNKNOWN_REFERENCE`), Replay of the same delivery (second result must be success without a second confirmation), wrong credentials (401 in the delivery log).

## 5. From Test Mode to Live

The documentation gives no "switch" button: Test Mode and Live are separate. Do the following in the Live area:

1. Make sure the backend has a valid HTTPS certificate on `<YOUR_BACKEND_DOMAIN>` (Live verifies SSL; Test Mode did not).
2. Create a **new Live webhook** (section 3) with a new Live API key/HMAC secret. Update the secret in the host's secret store and restart the backend. Delete or disable the Test Mode webhook so test keys are not reused.
3. Confirm `SEPAY_ACCOUNT_NUMBER`, `SEPAY_BANK` and `SEPAY_PAYMENT_PREFIX` match the Live linked account and Payment code structure; `PAYMENT_MOCK_ENABLED` must be absent.
4. Real-money test: **requires your explicit approval** (AGENTS.md). Use a small amount, check Delivery Logs, `SePayWebhookEvent`, the payment status, and reconcile refunds manually (this system records a refund but does not move money).
5. After an outage longer than the retry window, use SePay's **Incidents > Replay** or **Reconciliation** to resend missed transactions (names per the "Error handling" doc; verify in the dashboard).

## 6. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| SePay delivery log shows 401 | API key/HMAC secret mismatch; wrong auth type on one side; header stripped by proxy; clock skew over 5 min (HMAC); body altered by the proxy (HMAC); **secret empty or shorter than 32 characters on the backend (also answers 401; check the server log)** | Make `SEPAY_WEBHOOK_AUTH` match the dashboard type; re-copy the key into the secret store; forward `Authorization` / `X-SePay-*` headers and the raw body untouched |
| 503 from webhook | Migration 007 not applied (including the refund audit table) or database unreachable | Apply approved 007; check DB; SePay retries (if enabled) |
| No callback at all | URL wrong or not public, webhook disabled, event type/account filter excludes the transfer, backend down, firewall blocks SePay | Open the URL externally; check webhook enabled, event = money in, correct account; check Delivery Logs |
| Delivery marked failed although backend answered 200 | Body was not exactly `{"success": true}` (error page from the proxy, redirect) | Call the endpoint directly; check proxy redirects HTTP to HTTPS (a redirect on POST fails) |
| Event stored as `INVALID_PAYLOAD` | Authenticated payload missing `id`, `transferAmount`, `transferType` or `accountNumber`, or wrong types (answered success so SePay does not retry) | Inspect `DuLieuTho`; check the data format is JSON |
| Held transfers to review | Any `SePayWebhookEvent` with `KetQuaXuLy` other than `CONFIRMED` | Staff with Q01 can list them at `GET /api/payments/unreconciled` |
| Event stored as `ACCOUNT_MISMATCH` | `SEPAY_ACCOUNT_NUMBER` differs from SePay's `accountNumber` | Correct the env var to the exact account number reported by SePay |
| `UNDERPAID` / `OVERPAID` | Customer transferred a different amount than the QR | Payment stays pending; reconcile manually (top up / refund); never edit rows without approval |
| `UNKNOWN_REFERENCE` | Memo edited by the bank or prefix mismatch, or the payment belongs to another environment | Compare the `content`/`code` in `DuLieuTho` with the stored `MaThamChieu`; check `SEPAY_PAYMENT_PREFIX` equals the dashboard prefix |
| `EXPIRED` | Transfer arrived after `HanThanhToan` | Treat as a late payment for manual reconciliation or refund; create a new payment code |
| Duplicate delivery | SePay retry, manual Replay, or two webhooks to one URL | Expected: the backend returns success and does not apply twice (unique `NhaCungCap + MaGiaoDichNhaCungCap`); remove the duplicate webhook |
| QR image does not load or has wrong bank | `SEPAY_BANK` not in SePay's bank list, or `SEPAY_QR_BASE` outdated | Use a bank `short_name`/alias from SePay's banks list; verify the current QR host |
| Payment stuck on "Chờ thanh toán" | Webhook not delivered or rejected | Check Delivery Logs first, then `SePayWebhookEvent` and backend logs; use Replay |

## Official documentation used

- https://developer.sepay.vn/en/sepay-webhooks/xac-thuc
- https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
- https://developer.sepay.vn/en/sepay-webhooks/xu-ly-loi
- https://developer.sepay.vn/en/sepay-webhooks/test-mode/so-sanh-voi-live
- https://developer.sepay.vn/en/sepay-webhooks/test-mode/bat-dau-nhanh
- https://developer.sepay.vn/en/tien-ich-khac/tao-qr-code
- https://docs.sepay.vn/tich-hop-webhooks.html
