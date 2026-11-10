# Báo cáo kiểm thử (TEST_REPORT)

Cập nhật: 2026-11-10 (Asia/Bangkok)

## Môi trường kiểm thử
- Hệ điều hành: Windows 10 Pro (x64)
- Node.js: >=22.12.0
- Cơ sở dữ liệu: Microsoft SQL Server 2022 Enterprise Evaluation (Localhost, Database: `FlowerLanternSpa_Dev`)
- Framework kiểm thử: Jest 30.2, Supertest 7.1, Playwright 1.56.1

---

## Kết quả kiểm thử thực tế

### 1. Typecheck (TypeScript)
- **Lệnh thực hiện**: `npm.cmd run typecheck`
- **Kết quả**: `PASS` (Mã thoát: 0)
- **Phạm vi**: Cả hai workspaces `backend` và `frontend` không có lỗi cú pháp hoặc typing.

### 2. Linting (ESLint)
- **Lệnh thực hiện**: `npm.cmd run lint`
- **Kết quả**: `PASS` (Mã thoát: 0)
- **Phạm vi**: `backend/src`, `frontend/src`, `tests`.

### 3. Build Workspaces
- **Lệnh thực hiện**: `npm.cmd run build`
- **Kết quả**: `PASS` (Mã thoát: 0)
- **Chi tiết**:
  - `@spa/backend`: biên dịch `tsc -p tsconfig.build.json` ra `dist/` thành công.
  - `@spa/frontend`: Vite build sinh bundle `dist/` với tài nguyên font Inter, CSS, hình ảnh đầy đủ.

### 4. Unit / API Contract Tests (Backend)
- **Lệnh thực hiện**: `npm.cmd test -w backend`
- **Kết quả**: `PASS` (15 passed, 4 skipped, 0 failed)
- **Các ca kiểm thử**:
  - Liveness không giả định database sẵn sàng: `PASS`
  - Readiness fail-closed khi SQL ngắt kết nối (HTTP 503): `PASS`
  - Readiness thăm dò SQL thật: `PASS`
  - Chặn các query không hợp lệ (limit=51, page=-1, page=1.5, param injection): `PASS`
  - Parameter binding và lọc trạng thái 'Hoạt động': `PASS`
  - Thông báo không tìm thấy dịch vụ theo chuẩn SRS: `PASS`
  - Trả về thông tin dịch vụ và gói không lộ dữ liệu tài khoản: `PASS`
  - Bất biến cấu hình: không âm thầm dùng fake data, chặn đồng bộ schema tự động, chặn port sai, escape metacharacters LIKE: `PASS`

### 5. Real SQL Server Integration Tests
- **Lệnh thực hiện**: `$env:RUN_SQL_INTEGRATION='1'; $env:DB_AUTH='windows'; $env:DB_HOST='localhost'; $env:DB_NAME='FlowerLanternSpa_Dev'; npm.cmd test -w backend`
- **Kết quả**: `PASS` (19/19 passed, 2/2 test suites)
- **Các ca kiểm thử với SQL Server thật (`FlowerLanternSpa_Dev`)**:
  - Lọc dịch vụ hoạt động và tìm kiếm không phân biệt hoa thường theo bảng mã `Vietnamese_100_CI_AS`: `PASS`
  - Đọc giá gói và thời lượng chuẩn từ SQL Server: `PASS`
  - Không lộ chi tiết dịch vụ ngừng hoạt động (HTTP 404): `PASS`
  - Chống SQL injection và xử lý ký tự đại diện (`%`, `_`, `[`) an toàn: `PASS`
  - Giao dịch cô lập (Transaction rollback): Toàn bộ dữ liệu kiểm thử được rollback sạch sẽ, không ảnh hưởng dữ liệu baseline.

---

### 6. Filtered Unique Indexes & Persistent Lockout Constraints Tests
- **Lệnh thực hiện**: `sqlcmd -S localhost -E -d FlowerLanternSpa_Dev -i database/test-003-constraints.sql`
- **Kết quả**: `PASS` (5/5 ca kiểm thử đạt 100%)
- **Chi tiết các ca kiểm thử**:
  - `1. Multiple NULL MaTaiKhoan in KhachHang`: Cho phép nhiều khách offline vãng lai có `MaTaiKhoan = NULL` không bị vi phạm index: `PASS`
  - `2. Duplicate non-null MaTaiKhoan in KhachHang`: Chặn chính xác khi gán tài khoản trùng cho hai khách hàng khác nhau (bắt lỗi 2601/2627): `PASS`
  - `3. Multiple NULL MaTaiKhoan in NhanVien`: Cho phép nhiều nhân viên chưa cấp tài khoản có `MaTaiKhoan = NULL`: `PASS`
  - `4. Duplicate non-null MaTaiKhoan in NhanVien`: Chặn chính xác khi gán tài khoản trùng cho hai nhân viên khác nhau: `PASS`
  - `5. KhoaDangNhap PK Constraint`: Bảng `KhoaDangNhap` ghi nhận chính xác khóa chính `SoDienThoai` và chặn trùng khóa: `PASS`
- **An toàn giao dịch**: Toàn bộ script bọc trong outer `TRY/CATCH` với `ROLLBACK TRANSACTION`, bảo đảm số lượng bản ghi dư thừa sau test là 0.

---

## Trạng thái kiểm tra cơ sở dữ liệu
- Bảng vật lý trong `FlowerLanternSpa_Dev`: Đủ 15 bảng theo chuẩn SRS 7.2 + 1 bảng kỹ thuật `KhoaDangNhap` (tổng 16 bảng).
- Giường cố định: Đủ 20 giường `G1` đến `G20` theo seed `001-beds.sql`.
- Backup cơ sở dữ liệu: `C:\Spa\database\FlowerLanternSpa_Dev_pre_003.bak` đã tạo và xác minh an toàn.
- Tính lũy biến (idempotence): Script migration 003 và seed giường có thể chạy lại an toàn mà không sinh lỗi.
