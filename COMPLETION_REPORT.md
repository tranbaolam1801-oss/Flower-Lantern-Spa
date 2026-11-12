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


## 8. Sổ đăng ký BLOCKED (cập nhật sau phiên khắc phục 2026-11-12)

Quy ước trạng thái: **BLOCKED** = vấn đề gốc chưa được giải quyết. **Code đã giải quyết — chạy thật CHƯA xác minh** = mã đã viết + test mock/lint/build qua nhưng chưa chạy với SQL Server/trình duyệt thật; **không** được coi là Completed. Các dòng trong checklist Figma §5 **không bị đổi trạng thái** (xem §6 của `frontend/FIGMA_VISUAL_AUDIT.md`).

Lần chạy độc lập cuối (sau mọi thay đổi của đợt này): `npm run lint` PASS (0 lỗi); `tsc --noEmit` PASS; backend build PASS; `jest --runInBand` 15 suite pass + 6 skip, **281 test pass + 27 skip (BLOCKED), 0 fail**; frontend build PASS. Database xác minh lại chỉ-đọc: Test 17 bảng, DichVu 0, TaiKhoan 0, chưa có cột `NguonDatLich`, chưa có login `spa_test_runner`; Dev 16 bảng, 5 tài khoản — **không có thay đổi database nào**.

### 8.1 Còn BLOCKED (vấn đề gốc chưa hết)

| # | Mục | Loại nguyên nhân | Cần gì để mở |
|---|---|---|---|
| 1 | 27 SQL integration test; backend không kết nối được DB khi `DB_AUTH=windows` | Môi trường: Smart App Control chặn `msnodesqlv8.node` (không tắt SAC) | Bạn chạy `database/setup/001-test-sql-login.MANUAL.sql` trong SSMS, tạo `backend/.env.test.local`, cho phép chạy `scripts/run-sql-integration.ps1` (đã soạn, chưa chạy) |
| 2 | Không có dữ liệu mẫu (Test: 0 dịch vụ/tài khoản; Dev: 0 dịch vụ) nên không thể E2E | Database — cần duyệt | Duyệt `database/seeds/PROPOSED-010-sample-catalog.sql` và `PROPOSED-011-test-accounts.mjs` (chỉ Test; mật khẩu bạn cấp qua biến môi trường) |
| 3 | Migration 007 (SePay) chưa áp dụng → mọi `/api/payments/*` trả 503 | Database — cần duyệt | Duyệt 007 trên Test; staging dùng `database/migrations/staging/` |
| 4 | Lưu/lọc "Nguồn đặt lịch", lưu tiền trả trước | Database — cần duyệt | Duyệt `database/migrations/PROPOSED-008-booking-source-prepaid.md` (là đề xuất chuẩn; gợi ý khác trong báo cáo agent chỉ để tham khảo) |
| 5 | UC_2.1 E3a (`1:36758`), UC_2.3 E4a (`1:47039`) | Figma: frame rỗng, không có nội dung để dựng | Nhà thiết kế bổ sung frame |
| 6 | UC_5.2 mục "Thông tin tài khoản" | Thiết kế/sản phẩm: không có route và không có frame Figma | Quyết định có làm không + thiết kế |
| 7 | UC_3 icon "Xóa khách hàng" (Figma có, code không) | Quyết định sản phẩm: AGENTS.md yêu cầu giữ lịch sử; xóa cần chính sách (ví dụ ngừng hoạt động) và có thể cần cột trạng thái | Bạn quyết định chính sách rồi mới đề xuất schema |
| 8 | SePay thật: tài khoản, liên kết ngân hàng, webhook, khóa | Dịch vụ ngoài | Bạn thực hiện sau triển khai theo `docs-deploy/SEPAY_DASHBOARD_SETUP.md` |
| 9 | Triển khai Staging | Chưa chọn hosting + chưa duyệt | Bạn chọn nhà cung cấp, duyệt triển khai |
| 10 | 006 trên Dev/Staging (`repliedAt` ở Dev vẫn rỗng) | Database — cần duyệt riêng | Duyệt theo `database/migrations/STAGING_MIGRATION_ORDER.md` |

### 8.2 Code đã giải quyết — chạy thật CHƯA xác minh (trước đây Blocked/lỗi mở)

| Mục | Bằng chứng | Còn thiếu |
|---|---|---|
| UC_9.1 tải ảnh dịch vụ | `POST /api/admin/services/image` (magic bytes, 2 MB, tên ngẫu nhiên, lưu `UPLOAD_DIR`), `GET /api/uploads/services/:file`, file picker + preview; 31 test mới (HTTP double) | Chạy với đĩa/proxy/trình duyệt thật; host có đĩa tạm cần ổ đĩa bền hoặc object storage (chưa làm) |
| UC_3.1 E5c, UC_8.2 trùng thông tin | UI đọc `fields`/`{field}` của backend và hiện dưới đúng ô | So hiển thị với frame `1:31992`, `5:7679`; chạy với SQL |
| UC_2.4 tìm kiếm 9 trường (`1:44861`) | Backend 8 bộ lọc tham số hóa + UI đủ 9 trường, Đặt lại, kiểm tra điều kiện | **Lọc "Nguồn" chưa áp dụng được (cần 008)**; UI hiện cảnh báo thay vì giả vờ lọc; chưa chạy SQL |
| UC_2.3 sửa tên/SĐT/email người đặt + ghi chú | `PATCH /bookings/:id` nhận `bookerName/Phone/Email`, `notes` rỗng xóa ghi chú; khóa Hoàn thành/Đã hủy giữ nguyên | Chạy SQL; xem 8.3 cho giường/giờ/dịch vụ |
| Đồng bộ SĐT khách → `TaiKhoan.SoDienThoai` (cùng transaction, kiểm trùng) | Test mock; nhân viên vốn đã đồng bộ | Chạy SQL |
| Lệch frontend/backend: `workStatus` (Đang làm việc), gating trang nhân viên (vai trò + Q05), dropdown trạng thái theo bảng chuyển, hiển thị lỗi theo trường | Build + lint; logic dùng chung bảng chuyển với `booking-rules.ts` | Chạy trình duyệt |
| `source`/`prepaidAmount` | Không lưu nhưng nay trả `warnings[]` và UI hiện, không còn ngầm hiểu là đã lưu | Cần 008 để lưu thật |
| Staging: `HOST` (mặc định 127.0.0.1), cờ `Secure` cookie (`NODE_ENV=production` hoặc `COOKIE_SECURE=true`; sửa lỗi staging gửi cookie không Secure), `TRUST_PROXY`, rate limit không dependency (webhook 300/phút/IP, intent 20/phút/phiên, login 20/phút/IP, upload 30/phút/phiên; chỉ một tiến trình) | Test mới cho từng phần; docs `docs-deploy/STAGING_CONFIGURATION.md`, `staging.env.example` | Chạy sau proxy HTTPS thật; nhiều instance cần kho chia sẻ |
| Chuẩn bị mở chặn SQL | `scripts/run-sql-integration.ps1`, script SQL login | Chưa chạy (cần bạn) |

### 8.3 Đang xử lý

- UC_2.3 E5a (`1:47239`) / E5b (`1:47512`): hiện sửa được tên/SĐT/email/ghi chú/trạng thái; giường/giờ/dịch vụ/gói còn chỉ-đọc trong modal. **Cập nhật cuối:** giường/giờ/ngày/dịch vụ/gói đã sửa được trong modal (gửi `guests[]` đầy đủ; lỗi trùng giường hiện cạnh trường giường/giờ). **E5b: Code-resolved — runtime NOT VERIFIED. E5a: Partial** (thiếu banner tổng 'Thông tin không hợp lệ. Vui lòng kiểm tra lại!', trường Nguồn đặt lịch cần migration 008, '+ Thêm khách'). Backend: `GET /api/bookings` trả thêm `packageId`, `customerPhone`. Rủi ro cần quyết định: sửa 1 khách của lịch nhiều khách mà khách khác đã qua giờ sẽ bị từ chối 'không ở quá khứ'. Chạy lại: lint 0 lỗi, tsc sạch, jest 282 pass/27 skip/0 fail, frontend build PASS. Không mục nào là Completed.

### 8.4 Quyết định/duyệt cần từ bạn (tóm tắt)

1. Mở chặn SQL: chạy script SQL login (mục 1 ở 8.1).
2. Duyệt seed Test (010, 011) — giá trong 010 là **giá giả định**, cần chủ spa xác nhận; ảnh 2 dịch vụ massage chưa có ảnh khớp.
3. Duyệt 007 (Test), và nếu muốn: 008, 005 (tùy chọn), 006/004 trên Staging.
4. Staging: `NODE_ENV=production` (khuyến nghị) hay `staging` + `COOKIE_SECURE=true`; frontend và API cùng origin/cùng domain đăng ký (cookie `SameSite=Lax`); ổ đĩa bền cho `UPLOAD_DIR` hoặc duyệt làm object storage sau; chạy 1 instance hay nhiều (rate limit trong bộ nhớ).
5. Chính sách: xóa khách hàng, mục "Thông tin tài khoản", 13 câu hỏi thanh toán ở `OPEN_QUESTIONS.md`.
6. Bảo mật: `database/seeds/002-auth-baseline.sql` chứa hash mật khẩu mặc định đã commit và Dev đang có 5 tài khoản từ seed đó — **không dùng cho Staging**, nên đổi/xóa trước khi lên môi trường thật.
