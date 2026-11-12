# Flower Lantern Spa — Báo cáo kiểm toán mức hoàn thành

Lập 2026-11-12 từ HANDOVER.md, PROJECT_STATUS.md, TEST_REPORT.md, `frontend/FIGMA_VISUAL_AUDIT.md`, mã nguồn và truy vấn **chỉ đọc** vào hai database. Không chạy thay đổi database, migration, seed hay thanh toán nào để lập báo cáo này.

**Kết luận: dự án CHƯA hoàn thành.** Phần lớn mã đã được viết và có unit test (database giả lập), nhưng **chưa có luồng nghiệp vụ nào được xác minh end-to-end trên SQL Server thật** sau khi bổ sung các module Phase 2. Quy ước dùng trong báo cáo:

- **Đã viết** = mã tồn tại và build qua.
- **Đã kiểm thử (mock)** = unit/HTTP test với DatabaseService giả pass; chứng minh logic, không chứng minh hành vi SQL.
- **Đã xác minh** = chạy thật trên SQL Server / so với Figma trực tiếp / chạy end-to-end. Chỉ ghi khi có bằng chứng.

## 1. Frontend UC_1–UC_10 (nguồn: §5 của FIGMA_VISUAL_AUDIT.md, đếm trực tiếp từng dòng)

Tổng 160 dòng frame được theo dõi: **139 Completed / 13 Pending / 8 Blocked.**

| UC | Completed | Pending | Blocked | Ghi chú |
|---|---|---|---|---|
| UC_1 Đăng nhập | 0 | 4 | 0 | Người dùng xác nhận đã xong từ trước; checklist chưa kiểm lại từng frame bằng Figma trực tiếp. Có sửa 2 trạng thái lỗi (khóa tạm, bỏ trống) bằng đối chiếu export |
| UC_2 Lịch hẹn | 34 | 2 | 5 | Blocked: 2 frame rỗng trong Figma (E3a, E4a); mở rộng payload cập nhật/tìm kiếm cần mở rộng hợp đồng API |
| UC_3 Khách hàng | 22 | 0 | 3 | Blocked: thiếu icon xóa khách (không có API/nghiệp vụ xóa — giữ lịch sử); E5c trùng SĐT nay đã có backend, UI chưa đọc lỗi theo trường |
| UC_4 Đánh giá | 16 | 1 | 0 | |
| UC_5 Đặt lịch / Lịch của tôi | 25 | 5 | 0 | Pending: bước tương tác/ngoại lệ phụ UC_5.3–5.5 |
| UC_6 Xem dịch vụ | 4 | 0 | 0 | Trùng trang danh sách UC_7 |
| UC_7 Tìm dịch vụ | 4 | 0 | 0 | Xong theo xác nhận người dùng; kết quả 8 thẻ chưa kiểm vì không có dữ liệu dịch vụ |
| UC_8 Nhân viên | 17 | 1 | 0 | 3 frame ngoại lệ UC_8.6 chưa đọc |
| UC_9 Dịch vụ (quản trị) | 9 | 0 | 0 | Upload ảnh thật chưa được duyệt |
| UC_10 Báo cáo | 8 | 0 | 0 | Figma dùng biểu đồ đường, mã dùng biểu đồ cột (đã ghi nhận, chưa sửa) |

Hạn chế của con số "Completed":
- "Completed" nghĩa là đã so với frame Figma (`get_screenshot`/`get_design_context`) và build qua. **Không** nghĩa là đã chạy với dữ liệu thật; trước Phase 2 nhiều route chưa có backend.
- Checklist theo dõi 160 dòng; bản kiểm kê frame ghi 233 bản ghi. Chênh 73 bản ghi chưa được đối chiếu từng dòng (chưa rõ trùng hay ngoài phạm vi). **NOT VERIFIED.**
- Frontend không có script lint; so sánh hiển thị chủ yếu bằng ảnh Figma, chỉ vài lần chụp trình duyệt ad-hoc. Playwright E2E không chạy lại trong phiên này.
- Theo số liệu checklist, các UC không còn dòng Pending/Blocked nào là UC_6, UC_7, UC_9, UC_10 (đối chiếu Figma xong, chưa chạy với dữ liệu thật). UC_1, UC_2, UC_3, UC_4, UC_5, UC_8 còn dòng Pending hoặc Blocked nên **không** được coi là xong.

## 2. Backend: module và endpoint

Tổng quan: **đã viết + đã kiểm thử (mock); chưa xác minh trên SQL Server.** Kiểm thử thật trước đây (62/62 trên Test) chỉ phủ Auth/lockout/đọc lịch/khóa giường cũ và không còn chạy được (mục 3).

| Module | Endpoint | Đã viết | Test mock | Xác minh SQL thật |
|---|---|---|---|---|
| Health | `GET health/live,ready` | Có | Có | Từng chạy (cũ) |
| Catalog | `GET services`, `GET services/:id` | Có | Có | Từng chạy (cũ) |
| Auth | `POST auth/login,logout`, `GET auth/me` | Có | Có | Từng chạy (cũ); logout chưa thu hồi token khi `AUTH_SESSION_STORE=legacy` |
| Bookings đọc | `GET bookings`, `GET me/bookings` | Có | Có | Từng chạy (cũ) |
| Bookings hủy | `POST bookings/:id/cancel` | Có | Có | Từng chạy (cũ, chưa kiểm hồi quy) |
| Bookings ghi | `POST/PATCH bookings`, `GET bookings/search`, `POST me/bookings`, `PATCH me/bookings/:id/time`, `POST me/bookings/:id/cancel` | Có | Có (20) | **Chưa** |
| Customers | `GET customers`, `GET/POST/PATCH customers/:id` (không có DELETE) | Có | Có | Đọc từng chạy (cũ); ghi **chưa** |
| Reviews | `GET reviews`, `GET reviews/:id`, `POST reviews/:id/reply`, `POST me/bookings/:id/review` | Có | Có (14) | **Chưa** |
| Employees | 7 endpoint (list, get, create, patch, delete mềm, permissions, account-status) | Có | Có (18) | **Chưa** |
| Admin services | `GET/POST/PATCH/DELETE admin/services` | Có | Có | **Chưa** |
| Reports | `GET reports/services,customers,revenue` | Có | Có | **Chưa** |
| Payments (SePay) | `POST payments/sepay/intent`, `GET payments/:id/status`, `POST payments/sepay/webhook`, `POST payments/mock/webhook`, `POST payments/:id/refund` (Quản lý + Q01, bắt buộc lý do, ghi nhật ký), `GET payments/unreconciled` (Q01) | Có | Có (100+) | **Chưa; cần migration 007 chưa áp dụng** |

Quy tắc ép phía server (đã kiểm thử mock): không chồng giường (khóa UPDLOCK/HOLDLOCK có sẵn), chỉ G1–G15 (regex trong mã vì bảng `Giuong` không có cột trạng thái), 08:00–22:00, không đặt quá khứ, lịch `Hoàn thành`/`Đã hủy` khóa sửa, thời lượng/giá lấy từ SQL, SĐT chuẩn `0xxxxxxxxx` (`+84` được chuẩn hóa nhất quán), PATCH dịch vụ không xóa gói bị bỏ sót.

Khoảng trống đã biết: `prepaidAmount`/`source` của đặt lịch không lưu được; `paymentStatus` nhân viên nhập không tạo dòng `ThanhToan`; PATCH lịch không xóa được ghi chú; `Chưa đến → Hoàn thành` bị backend từ chối trong khi form sửa cho chọn.

## 3. Kiểm thử SQL Server integration

- 6 suite / **27 test BLOCKED** (không phải lỗi assertion): Smart App Control (người dùng xác nhận BẬT, không tắt) chặn `msnodesqlv8.node` ở mọi tiến trình.
- Hệ quả rộng hơn: cấu hình hiện tại `DB_AUTH=windows` dùng đúng driver đó, nên **backend không khởi động được với database trong môi trường này**, kể cả dev server. Do đó không có E2E nào chạy được.
- Cách mở chặn đã soạn, **chưa chạy**: `database/setup/001-test-sql-login.MANUAL.sql` (SQL login quyền tối thiểu chỉ cho Test, dùng `tedious`, không đổi code/dependency). Chờ người dùng tự chạy rồi cho phép chạy lại.
- Trước khi chạy lại đã sửa một lỗi chắc chắn: entity `PhanHoi` thiếu cột `NgayPhanHoi` sẽ làm test audit schema FAIL sau migration 006 (đã thêm cột nullable vào entity; chưa chạy lại test).

## 4. Migration

| Migration | Trạng thái | Tác động |
|---|---|---|
| 005 `GoiDichVu.TrangThai` | PROPOSED, **chưa áp dụng** | Mã hiện tại không phụ thuộc. Chỉ Test. |
| 006 `PhanHoi.NgayPhanHoi` | **Đã áp dụng trên `FlowerLanternSpa_Test`** theo duyệt của người dùng (xác minh: cột nullable, default `sysutcdatetime()`, 17 bảng/20 giường không đổi). **Chưa** áp dụng cho Dev. | API nhận biết cột có/vắng/NULL. |
| 007 SePay (5 cột `ThanhToan` + bảng `SePayWebhookEvent` + bảng `ThanhToanHoanTien`) | PROPOSED, **chưa áp dụng** (đã rà soát với schema Test thật; xác minh Test vẫn 17 bảng, chưa có 2 bảng mới) | Mọi `/api/payments/*` trả 503 "cần áp dụng migration 007" cho tới khi áp dụng. Khi áp dụng phải cập nhật entity `ThanhToan`, thêm entity cho 2 bảng mới và đổi kỳ vọng audit schema từ 17 lên 19 bảng. |

Trạng thái database thật (đếm chỉ-đọc):
- **Test:** 17 bảng, 20 giường, 0 dòng ở DanhMuc/DichVu/GoiDichVu/TaiKhoan/NhanVien/KhachHang/LichHen/DanhGia/ThanhToan. Đã có `PhienDangNhap` (migration 004) và cột `NgayPhanHoi`.
- **Dev:** 16 bảng, 20 giường, 5 tài khoản, 3 nhân viên, 1 khách; **0** danh mục/dịch vụ/gói/lịch hẹn. Chưa có 004/005/006/007.
- Hệ quả: **không có dữ liệu dịch vụ/gói ở đâu**, nên không thể thử tạo lịch, thanh toán hay báo cáo trên dữ liệu thật; cần seed dữ liệu mẫu (cần người dùng duyệt, Test trước).

## 5. SePay Test Mode

- **Đã viết + mock test:** provider, webhook (API Key hoặc HMAC theo tài liệu SePay), tham chiếu duy nhất theo số tiền, kiểm tra số tiền/tài khoản/hạn/idempotency, bảng đối soát, hoàn tiền ghi nhận, mock provider chỉ khi `PAYMENT_MOCK_ENABLED=true` và không production.
- **Tích hợp:** module đã đăng ký; `setup.ts` miễn CSRF đúng một route webhook (có test kiểm cả đường gần giống); `main.ts` bật `rawBody`.
- **Rà soát bảo mật độc lập (agent riêng, chỉ đọc):** không có lỗ hổng bỏ qua xác thực webhook, SQL injection hay IDOR; xác thực chạy trước mọi truy cập DB, so khóa bằng timing-safe, miễn CSRF chỉ đúng một route. Các phát hiện MEDIUM/LOW đã sửa trong mã và mock-test: mock chỉ bật khi `NODE_ENV` là `test`/`development` + gắn nhãn `provider`/`simulated` + loại khỏi doanh thu; chặn ghi đè trạng thái thanh toán do nhân viên sửa tay (409); hoàn tiền cần Quản lý + Q01 + lý do + nhật ký trong cùng transaction; kiểm tra tài khoản nhận theo tài khoản của QR đã phát hành; payload lỗi sau xác thực vẫn được ghi `INVALID_PAYLOAD`; khóa/secret phải ≥ 32 ký tự; chưa xác thực luôn 401 như nhau; thêm `GET payments/unreconciled`. **Chưa sửa có chủ đích:** chính sách chuyển khoản trễ/QR cũ (câu hỏi 3 ở OPEN_QUESTIONS.md), rate limit (cần thêm dependency, chờ duyệt), chính sách lưu trữ payload thô. Các bản sửa chưa được rà soát lại bởi reviewer độc lập (chỉ có test mock + lint + typecheck).
- **Chưa xác minh:** mọi thứ trên SQL Server (cần 007), webhook thật từ SePay, QR thật (tài liệu QR của SePay hiện nêu cả `qr.sepay.vn` và `vietqr.app` — kiểm tra lại trước go-live, `SEPAY_QR_BASE` cấu hình được), đối chiếu hành vi retry, E2E dialog thanh toán (đã có đồng hồ đếm hạn, tạo mã mới, trạng thái cuối). **Chưa có giao dịch thật hoặc mô phỏng nào qua SePay.**
- **Tài liệu triển khai (không bí mật, không chọn nhà cung cấp):** `docs-deploy/PRODUCTION_ENVIRONMENT.md`, `DEPLOYMENT_GUIDE.md`, `SEPAY_DASHBOARD_SETUP.md`; endpoint webhook cuối: `https://<YOUR_BACKEND_DOMAIN>/api/payments/sepay/webhook`. Lưu ý: `main.ts` gắn cứng bind `127.0.0.1` nên reverse proxy phải ở cùng máy; đổi thành cấu hình được cần duyệt.
- Chờ người dùng: cấu hình tài khoản SePay + biến môi trường bí mật sau khi triển khai; 10 câu hỏi chính sách ở OPEN_QUESTIONS.md (thiếu/thừa tiền, trễ hạn, giá trị trạng thái mới...).

## 6. Hoạt động end-to-end

**NOT VERIFIED.** Chưa luồng nào (đăng nhập → xem dịch vụ → đặt lịch → xác nhận → thanh toán → hoàn thành → đánh giá → báo cáo) chạy xuyên React↔NestJS↔SQL Server. Lý do: (1) backend không kết nối được DB trong môi trường hiện tại, (2) không có dữ liệu dịch vụ, (3) 007 chưa áp dụng, (4) không có SePay thật. Concurrency booking qua HTTP chưa được kiểm thử.

## 7. Lỗi và blocker còn lại

Cần người dùng:
1. Chạy script SQL login (hoặc cho phép driver khác) để mở khóa integration test và khởi động backend.
2. Duyệt seed dữ liệu mẫu dịch vụ/gói/tài khoản cho Test (không có thì không E2E được).
3. Duyệt áp dụng 007 trên Test; duyệt/loại 005; mọi migration trên Dev cần duyệt riêng.
4. Trả lời 10 câu hỏi chính sách thanh toán; cấu hình SePay (khóa API, tài khoản nhận, tiền tố mã) qua biến môi trường sau triển khai; chọn hosting khi muốn triển khai.

Lỗi/chênh lệch mã còn mở (đã biết, chưa sửa):
- `workStatus`: UI coi `Đang hoạt động` là xanh, backend/seed dùng `Đang làm việc`/`Ngừng làm việc`.
- Trang nhân viên chỉ kiểm `Q05` ở frontend; backend cần thêm vai trò Quản lý → nhân viên có Q05 sẽ thấy trang nhưng bị 403.
- Dropdown sửa lịch cho chọn `Chưa đến → Hoàn thành` (backend 409); PATCH không xóa được ghi chú.
- UI chưa đọc lỗi theo trường (`fields`) của backend (409 trùng SĐT/username...).
- Đổi SĐT khách không cập nhật `TaiKhoan.SoDienThoai`; quy ước ID `LH`/`CT` cần xác nhận.
- `reply.repliedAt` rỗng trên Dev (chưa có cột); khóa tài khoản chỉ thu hồi phiên khi `AUTH_SESSION_STORE=sql`; logout chưa thu hồi token ở chế độ `legacy`.
- Upload ảnh dịch vụ thật, đổi toàn bộ trường lịch ở UC_2.3, 9 trường tìm kiếm UC_2.4 cần mở rộng hợp đồng API (Blocked có chủ đích).
- Quản trị tài liệu: `PROJECT_STATUS.md` phần dưới là lịch sử lỗi thời (đã thêm tóm tắt hiện tại ở đầu file); `TRACEABILITY_MATRIX.md`/`IMPLEMENTATION_PLAN.md` chưa được cập nhật theo Phase 2.
- Git: hơn 90 đường dẫn thay đổi chưa commit (20 file tracked sửa, còn lại mới); commit gần nhất `f0603db`, không có gì của Phase 1/2 được commit. Rủi ro mất việc; commit khi người dùng yêu cầu.

Lệnh đã chạy và kết quả (2026-11-12, chạy lại độc lập sau tất cả thay đổi): `npm run lint` PASS (0 lỗi, 0 cảnh báo; trước đó có 4 lỗi trong mã mới, đã sửa); `tsc --noEmit` backend PASS; `npm run build` backend PASS; `jest --runInBand` (SQL integration tắt) 12 suite pass + 6 skip, **250 test pass + 27 skip (BLOCKED)**, 0 fail; `npm run build --workspace @spa/frontend` PASS. Frontend không có script lint riêng ngoài ESLint chung ở thư mục gốc.
