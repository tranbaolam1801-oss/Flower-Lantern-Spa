# Kế hoạch kiểm thử webhook SePay an toàn (Azure demo)

Không bước nào dưới đây cần API key SePay thật cho tới mục 3. Không bước nào khởi tạo thanh toán thật.

## 1. Trước khi deploy: xác nhận hành vi bằng mock (cục bộ, không cần Azure)
`PAYMENT_MOCK_ENABLED=true` chỉ hợp lệ khi `NODE_ENV` là `test` hoặc `development` (đã enforce trong code) — không đặt biến này trên App Service. Chạy cục bộ:
```bash
NODE_ENV=development PAYMENT_MOCK_ENABLED=true npm run dev -w backend
```
Tạo một lịch hẹn, tạo payment intent, xác nhận `MockPaymentProvider` trả về trạng thái thành công giả lập — đã kiểm bằng test mock trong `backend/src/payments/*.spec.ts` (không chạy lại ở đây).

## 2. Sau khi App Service đã chạy (chưa cần API key SePay thật): giả lập webhook bằng `curl`
Thay `<app>`, `<SEPAY_API_KEY>` bằng giá trị bạn đã đặt trong Application settings.

**2a. Sai khóa — phải bị từ chối (401), không được là 200 hay 500:**
```bash
curl -i -X POST https://<app>.azurewebsites.net/api/payments/sepay/webhook \
  -H "Authorization: Apikey sai-key" -H "Content-Type: application/json" -d '{}'
```

**2b. Đúng khóa, payload hợp lệ, mã tham chiếu không tồn tại — phải trả `{"success":true}` 200 (SePay yêu cầu luôn 200 để không bị họ gửi lại vô hạn) nhưng KHÔNG cập nhật lịch hẹn nào:**
```bash
curl -i -X POST https://<app>.azurewebsites.net/api/payments/sepay/webhook \
  -H "Authorization: Apikey $SEPAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"id":"test-unknown-1","transferAmount":100000,"content":"MA-KHONG-TON-TAI","accountNumber":"<SEPAY_ACCOUNT_NUMBER>"}'
```
Kiểm `GET /api/payments/unreconciled` (cần đăng nhập Quản lý) để thấy bản ghi này xuất hiện trong danh sách chưa khớp lệnh.

**2c. Tạo payment intent thật qua UI (chưa cần SePay thật) để lấy mã tham chiếu hợp lệ, rồi gửi webhook khớp mã đó:**
```bash
curl -i -X POST https://<app>.azurewebsites.net/api/payments/sepay/webhook \
  -H "Authorization: Apikey $SEPAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"id":"test-2","transferAmount":<so-tien-dung-tu-intent>,"content":"<ma-tham-chieu-tu-intent>","accountNumber":"<SEPAY_ACCOUNT_NUMBER>"}'
```
Kiểm lịch hẹn chuyển sang trạng thái thanh toán "Thành công".

**2d. Gửi lại chính xác cùng `"id"` lần hai (idempotency/replay) — phải vẫn 200 nhưng KHÔNG cộng tiền/đổi trạng thái lần hai:**
```bash
curl -i -X POST https://<app>.azurewebsites.net/api/payments/sepay/webhook \
  -H "Authorization: Apikey $SEPAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"id":"test-2","transferAmount":<cung-so-tien>,"content":"<cung-ma-tham-chieu>","accountNumber":"<SEPAY_ACCOUNT_NUMBER>"}'
```
Kiểm `dbo.SePayWebhookEvent` (sau khi migration 007 đã áp dụng) có đúng 1 dòng cho `"id"` này, không có dòng trùng — ràng buộc `UQ_SePayWebhookEvent_GiaoDich` đã enforce ở DB.

**2e. Số tiền sai lệch (thiếu/dư so với số tiền phải thu) — kiểm hành vi dưới/thừa thanh toán theo code hiện có, không tự suy đoán.** Gửi một payload với `transferAmount` thấp hơn hoặc cao hơn giá trị thực của booking, cùng mã tham chiếu hợp lệ mới, rồi đọc log/trạng thái trả về để xác nhận hệ thống không tự đánh dấu "Thành công" khi số tiền không khớp.

**2f. Rate limit webhook:** gửi hơn `RATE_LIMIT_WEBHOOK_PER_WINDOW` (mặc định 300) request trong 60 giây — request vượt ngưỡng phải trả 429 kèm `Retry-After`.

## 3. Chỉ sau khi 1–2 đều đạt: cấu hình SePay Dashboard thật, vẫn ở Test Mode
Theo `docs-deploy/SEPAY_DASHBOARD_SETUP.md`:
1. Đăng nhập SePay Dashboard, tạo/chọn tài khoản Test Mode.
2. Cấu hình Webhook URL = `https://<app>.azurewebsites.net/api/payments/sepay/webhook`.
3. Chọn phương thức xác thực khớp với `SEPAY_WEBHOOK_AUTH` đã đặt trên App Service (`apikey` hoặc `hmac`) — phải khớp chính xác, SePay không tự dò.
4. Gửi một giao dịch test từ Dashboard của SePay (không phải chuyển khoản thật) — theo dõi log App Service (`az webapp log tail`) để xác nhận request đến, được xác thực, và được xử lý.
5. Không chuyển sang giao dịch thật khi chưa được bạn xác nhận riêng — mục này ngoài phạm vi "demo 30 ngày, 0 đồng".

## Theo dõi lỗi trong lúc test
```bash
az webapp log tail --resource-group <rg> --name <app>
```
Không log nào trong code hiện tại được in ra giá trị `SEPAY_API_KEY`/`SEPAY_WEBHOOK_SECRET`/mật khẩu DB — đã kiểm (`DatabaseService.query` chặn lỗi driver lộ ra ngoài, payments module không log secret). Nếu khi chạy thật bạn thấy secret xuất hiện trong log, dừng lại và báo tôi ngay.
