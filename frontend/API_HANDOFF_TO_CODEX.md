# API Handoff to Codex — Flower Lantern Spa

Cập nhật: 2026-11-11.  
Phạm vi file này: ghi rõ các hợp đồng API giữa **Frontend React** (`frontend/src/`) và **Backend NestJS** (`backend/src/`) để Codex/Antigravity Backend hoàn thiện mà không phải đoán payload hay response shape.

> **Lưu ý quy tắc đã duyệt (2026-11-11):**
> - Giờ hoạt động spa: **08:00 – 22:00** (giờ kết thúc mọi liệu trình không sau 22:00).
> - Giường mặc định khi đặt mới: **15 giường G1–G15** (vẫn bảo toàn G16–G20 và dữ liệu lịch sử trong SQL Server).
> - Trạng thái mặc định tạo lịch trực tiếp: `Chưa đến`; đặt lịch online: `Chờ xác nhận`.
> - Xác thực: HttpOnly cookie (`access_token`) + header CSRF `X-Spa-Request: 1` cho mọi request ghi (POST/PATCH/PUT/DELETE).

---

## 1. API Backend ĐÃ CÓ (Frontend đang gọi thật)

- `GET /api/health/live`, `GET /api/health/ready`
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (UC_1)
- `GET /api/services?q=&category=&page=&limit=`, `GET /api/services/:id` (UC_6, UC_7, Trang chủ)
- `GET /api/bookings?date=YYYY-MM-DD` (UC_2.2 — Q01)
- `POST /api/bookings/:id/cancel` (UC_2.5 — Q01)
- `GET /api/me/bookings` (UC_5.2 — Khách hàng)
- `GET /api/customers?q=&page=` (UC_3.4 — Q02)

---

## 2. API Backend CÒN THIẾU cần triển khai (khớp `frontend/src/lib/*.ts`)

### A. Public Reviews (Trang chủ — optional nhưng khuyến nghị)
- **`GET /api/reviews/public`**
  - Công khai (không cần đăng nhập).
  - Response `200`: `{ items: [{ id, customerName, serviceName, rating, comment, createdAt }] }`
  - Ghi chú: Frontend hiện xử lý an toàn nếu trả về `404` (hiển thị empty state trung thực, không bịa review).

### B. Booking Management Admin/Staff (`Q01`, Roles: `Chủ Spa`, `Quản lý`, `Nhân viên`)
1. **`POST /api/bookings`** (UC_2.1 Tạo lịch hẹn)
   - Body:
     ```json
     {
       "bookerName": "string",
       "bookerPhone": "string",
       "bookerEmail": "string | undefined",
       "source": "Trực tiếp | Facebook | Zalo | Website",
       "date": "YYYY-MM-DD",
       "notes": "string | undefined",
       "status": "Chưa đến | Chờ xác nhận",
       "paymentStatus": "Chưa thanh toán | Thanh toán một phần | Đã thanh toán",
       "prepaidAmount": 0,
       "guests": [
         {
           "customerName": "string",
           "customerPhone": "string | undefined",
           "bedId": "G1..G15",
           "packageId": "string",
           "startsAt": "YYYY-MM-DDTHH:mm:ss"
         }
       ]
     }
     ```
   - Backend requirements: dùng `BookingTransactionService.reserve(...)` (UPDLOCK, HOLDLOCK theo thứ tự giường), kiểm tra khung giờ 08:00–22:00 (kết thúc `<= 22:00`), tính giá từ `dbo.GoiDichVu`, không quá khứ.
   - Response `201`: `{ id: string, message: string }`
   - Errors: `400` (dữ liệu/giờ không hợp lệ), `409` (`Giường đã có lịch tại khung giờ này. Vui lòng chọn giường hoặc thời gian khác!`).

2. **`PATCH /api/bookings/:id`** (UC_2.3 Cập nhật / Duyệt lịch hẹn)
   - Body: `{ status?: string, paymentStatus?: string, notes?: string, date?: string, guests?: BookingGuestInput[] }`
   - Rules: chặn sửa lịch `Hoàn thành` / `Đã hủy` (`409`); khi đổi giờ/giường phải dùng `BookingTransactionService.reserve(..., excludeBookingId)`.
   - Response `200`: `{ id: string, message: string }`

3. **`GET /api/bookings/search?q=&date=&status=`** (UC_2.4 Tìm lịch hẹn)
   - Response `200`: `{ items: CalendarItem[] }` (cùng cấu trúc `CalendarItem` của `GET /api/bookings`).

### C. Customer Booking Self-Service (`Khách hàng`)
1. **`POST /api/me/bookings`** (UC_5.1 Đặt lịch online)
   - Body:
     ```json
     {
       "fullName": "string",
       "phone": "string",
       "email": "string | undefined",
       "date": "YYYY-MM-DD",
       "time": "HH:mm",
       "notes": "string | undefined",
       "guests": [{ "customerName": "string", "customerPhone": "string | undefined", "packageId": "string" }]
     }
     ```
   - Rules: tự cấp giường trống trong G1–G15 qua `BookingTransactionService.reserve(...)`, kiểm tra 08:00–22:00 (kết thúc `<= 22:00`), trạng thái mặc định `Chờ xác nhận`, tạo `KhachHang` hoặc gắn đúng `MaKhachHang` theo `request.user.sub`.
   - Response `201`: `{ id: string, status: "Chờ xác nhận", message: string }`

2. **`PATCH /api/me/bookings/:id/time`** (UC_5.3 Đổi lịch)
   - Body: `{ date: "YYYY-MM-DD", time: "HH:mm" }`
   - Rules: xác minh ownership từ `request.user.sub`, chỉ cho đổi khi `Chờ xác nhận` hoặc `Đã xác nhận`/`Chưa đến`, giữ nguyên dịch vụ/gói, kiểm tra trùng giường và khung giờ 08:00–22:00 trong transaction.
   - Response `200`: `{ id: string, message: string }`

3. **`POST /api/me/bookings/:id/cancel`** (UC_5.4 Hủy lịch cá nhân)
   - Rules: xác minh ownership từ `request.user.sub`, chỉ hủy khi chưa `Hoàn thành` / chưa `Đã hủy`.
   - Response `200`: `{ message: "Hủy lịch hẹn thành công!" }`

4. **`POST /api/me/bookings/:id/review`** (UC_5.5 Đánh giá dịch vụ)
   - Body: `{ rating: 1..5, comment: string }`
   - Rules: xác minh ownership, lịch hẹn phải ở trạng thái `Hoàn thành` (và theo rule SRS thanh toán nếu áp dụng), mỗi lịch hẹn/dịch vụ chỉ đánh giá 1 lần (`409` nếu đã đánh giá).
   - Response `201`: `{ id: string, message: string }`

### D. Customers Management (`Q02`, Roles: `Chủ Spa`, `Quản lý`, `Nhân viên`)
1. **`GET /api/customers/:id`** (UC_3.3) -> `{ id, name, phone, channel, bookingCount, gender, birthDate, address, notes, createdAt }`
2. **`POST /api/customers`** (UC_3.1) -> Body `{ name, phone, channel?, gender?, birthDate?, address?, notes? }` -> `201 { id, message }` (check trùng SĐT -> `409`)
3. **`PATCH /api/customers/:id`** (UC_3.2) -> Body `{ name, phone, channel?, gender?, birthDate?, address?, notes? }` -> `200 { id, message }`

### E. Reviews & Replies (`Q03`, Roles: `Chủ Spa`, `Quản lý`, `Nhân viên`)
1. **`GET /api/reviews?q=&status=&page=`** (UC_4.3) -> `{ items: ReviewItem[], page, hasNext }`
2. **`GET /api/reviews/:id`** (UC_4.1) -> `ReviewItem`
3. **`POST /api/reviews/:id/reply`** (UC_4.2) -> Body `{ content: string }` -> `201 { message }` (lưu `dbo.PhanHoi`, gắn `MaNhanVien` từ tài khoản đăng nhập).

### F. Employees & Permissions (`Q05` cho CRUD nhân viên; RIÊNG `Chủ Spa` cho phân quyền `PUT /permissions`)
1. **`GET /api/employees?q=&status=&page=`** (UC_8.5) -> `{ items: EmployeeItem[], page, hasNext }`
2. **`GET /api/employees/:id`** (UC_8.1) -> `EmployeeItem`
3. **`POST /api/employees`** (UC_8.2) -> Body `{ username, fullName, password, confirmPassword, phone, email, gender?, birthDate?, address?, notes? }` (hash Argon2id, tạo `TaiKhoan` + `NhanVien` trong transaction)
4. **`PATCH /api/employees/:id`** (UC_8.3) -> Body `{ fullName, phone, email, gender?, birthDate?, address?, notes? }`
5. **`DELETE /api/employees/:id`** (UC_8.4) -> Xóa mềm (`TrangThai = N'Vô hiệu hóa'` hoặc `Đã khóa` + `TrangThaiHoSo`, thu hồi phiên ở `PhienDangNhap`).
6. **`PUT /api/employees/:id/permissions`** (UC_8.6 — **chỉ `Chủ Spa`**) -> Body `{ role: "Quản lý" | "Nhân viên", permissions: string[] }` (ghi `TaiKhoanQuyen` + `LichSuPhanQuyen`).
7. **`PATCH /api/employees/:id/account-status`** (UC_8.7) -> Body `{ status: "Hoạt động" | "Đã khóa" }` (nếu `Đã khóa`, thu hồi ngay toàn bộ `PhienDangNhap` chưa hết hạn trong cùng transaction).

### G. Admin Services Management (`Q04`, Roles: `Chủ Spa`, `Quản lý`, `Nhân viên`)
1. **`GET /api/admin/services?q=&category=&status=&page=`** (UC_9.2, UC_9.5) -> `{ items: AdminServiceItem[], categories: [{ id, name }], page, hasNext }`
2. **`POST /api/admin/services`** (UC_9.1) -> Body `{ id?, name, categoryId, status, description?, details?, image?, packages: [{ name, durationMinutes, price }] }` (duration > 0, price nguyên dương > 0).
3. **`PATCH /api/admin/services/:id`** (UC_9.3) -> Cập nhật dịch vụ & gói trong transaction.
4. **`DELETE /api/admin/services/:id`** (UC_9.4) -> Chuyển `TrangThai = N'Ngừng hoạt động'` (chặn nếu còn lịch hẹn chưa hoàn thành/chưa hủy -> `409`).

### H. Reports (`Q06`, Roles: `Chủ Spa`, `Quản lý`, `Nhân viên`)
1. **`GET /api/reports/services?from=YYYY-MM-DD&to=YYYY-MM-DD`** (UC_10.1) -> `{ totalUsage, items: [{ serviceId, serviceName, usageCount }] }`
2. **`GET /api/reports/customers?from=YYYY-MM-DD&to=YYYY-MM-DD`** (UC_10.2) -> `{ newCustomers, returningCustomers, topCustomers: [{ customerId, fullName, phone, bookingCount }] }`
3. **`GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|week|month|year`** (UC_10.3) -> `{ totalRevenue, series: [{ label, amount }] }` (tính từ `dbo.ThanhToan` đã xác nhận).

### I. SePay Test Mode Payment (Milestone 7)
1. **`POST /api/payments/sepay/intent`** -> Body `{ bookingId }` -> Backend tự tính số tiền còn phải thu từ SQL Server, sinh payment reference duy nhất & URL QR SePay Test Mode -> `201 SepayPaymentIntent`.
2. **`GET /api/payments/:id/status`** -> Trả về `SepayPaymentIntent` hiện tại (polling từ Frontend).
3. **`POST /api/webhooks/sepay`** -> Webhook xác thực từ SePay (kiểm tra auth header/API key theo docs chính thức, account nhận, số tiền, reference, idempotency theo provider transaction ID, cập nhật atomic `ThanhToan` + `LichHen.TrangThaiThanhToan`).

---

## 3. Lưu ý Database & Migration
- **Cần seed dữ liệu dịch vụ mẫu cho Dev DB:** Kết quả kiểm tra read-only trên `FlowerLanternSpa_Dev` ngày 2026-11-11 cho thấy `dbo.DanhMuc = 0`, `dbo.DichVu = 0`, `dbo.GoiDichVu = 0`. Vì vậy `GET /api/services` đang trả về rỗng khiến giao diện `/dich-vu` và Trang chủ không có thẻ dịch vụ thật để hiển thị.
- Hiện tại `FlowerLanternSpa_Dev` đang ở **16 bảng** (chưa áp dụng `004-auth-sessions.sql`, cần duyệt riêng trước khi chạy trên Dev).
- `FlowerLanternSpa_Test` đã có **17 bảng** (`004-auth-sessions.sql` đã áp dụng Test-only).
- Trước khi triển khai đầy đủ UC_2.1 (lưu `NguonDatLich`, giá chốt lúc đặt) và SePay (payment reference, provider transaction ID, expiry), cần đề xuất additive migration mới (`005-...`) và xin phép người dùng phê duyệt trước khi chạy trên DB.
