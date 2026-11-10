# Ma trận truy vết

2026-11-10. 35 UC chi tiết. Routes/API là **dự kiến** trừ phần ghi đã viết; không đánh dấu UC hoàn tất. Tất cả frame ở file Figma vASTCkZ0az3MX98u1fvhTJ; xem inventory đầy đủ trong audit/FIGMA_FRAME_INVENTORY.md.

| UC | Nghiệp vụ | BR | Figma node tham chiếu | Route | API | SQL tables | Tests/trạng thái |
|---|---|---|---|---|---|---|---|
| UC_1 | Đăng nhập | BR-UC1-01/02; NFR-05 | 5:21070; shell quản trị 1:49090 | /dang-nhap; /admin/lich-hen; /lich-hen-cua-toi | POST /api/auth/login; GET /api/auth/me; POST /api/auth/logout | TaiKhoan, Quyen, TaiKhoanQuyen, KhoaDangNhap, NhanVien, KhachHang | Auth thật đã nối; auth.spec.ts, security.spec.ts, roles.guard.spec.ts, auth.sql.integration.spec.ts, tests/auth.spec.ts; chưa nghiệm thu dashboard/đầy đủ UC |
| UC_2.1 | Tạo lịch hẹn | BR-UC2.1-01..04 | 1:33652 | /admin/lich-hen | POST /api/bookings | LichHen, KhachSuDungDichVu, Giuong, GoiDichVu, ThanhToan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_2.2 | Xem lịch theo giường | BR-UC2.2-01 | 1:49090 | /admin/lich-hen | GET /api/bookings | LichHen, KhachSuDungDichVu, Giuong | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_2.3 | Cập nhật lịch | BR-UC2.3-01..03 | 1:46088 | /admin/lich-hen | PATCH /api/bookings/:id | LichHen, KhachSuDungDichVu, ThanhToan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_2.4 | Tìm lịch | BR-UC2.4-01/02 | 1:44861 | /admin/lich-hen | GET /api/bookings/search | LichHen, KhachSuDungDichVu, GoiDichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_2.5 | Hủy lịch | BR-UC2.5-01 | 1:41540 | /admin/lich-hen | POST /api/bookings/:id/cancel | LichHen, KhachSuDungDichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_3.1 | Thêm khách hàng | BR-UC3.1-01..03 | 1:31895 | /admin/khach-hang | POST /api/customers | KhachHang | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_3.2 | Sửa khách hàng | UC_3.2 validation | 1:30165 | /admin/khach-hang | PATCH /api/customers/:id | KhachHang | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_3.3 | Xem khách hàng | SRS 3.3.4; Q12 | 1:29477 | /admin/khach-hang | GET /api/customers/:id | KhachHang, LichHen | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_3.4 | Tìm khách hàng | BR-UC3.4-01 | 1:28872 | /admin/khach-hang | GET /api/customers | KhachHang, LichHen | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_4.1 | Xem đánh giá | UC_4.1 | 1:478 | /admin/danh-gia | GET /api/reviews/:id | DanhGia, PhanHoi, KhachHang, DichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_4.2 | Phản hồi | BR-UC4.2-01/02 | 1:697 | /admin/danh-gia | POST /api/reviews/:id/reply | PhanHoi, DanhGia, NhanVien | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_4.3 | Tìm đánh giá | BR-UC4.3-01/02 | 1:1337 | /admin/danh-gia | GET /api/reviews | DanhGia, PhanHoi | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_5.1 | Đặt lịch online | BR-UC5.1-01..04 | 1:4574 | /dat-lich | POST /api/me/bookings | LichHen, KhachSuDungDichVu, Giuong, GoiDichVu, KhachHang | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_5.2 | Lịch của tôi | BR-UC5.2-01..04 | 1:11180 | /lich-hen-cua-toi | GET /api/me/bookings | LichHen, KhachHang | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_5.3 | Đổi lịch | BR-UC5.3-01/02 | 1:16609 | /lich-hen-cua-toi | PATCH /api/me/bookings/:id/time | LichHen, KhachSuDungDichVu, Giuong | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_5.4 | Hủy lịch cá nhân | BR-UC5.4-01/02 | 1:19735 | /lich-hen-cua-toi | POST /api/me/bookings/:id/cancel | LichHen, KhachSuDungDichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_5.5 | Đánh giá dịch vụ | BR-UC5.5-01..03 | 1:22575 | /lich-hen-cua-toi | POST /api/me/bookings/:id/review | DanhGia, LichHen, ThanhToan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_6 | Xem dịch vụ | BR-UC6-01..03 | 3:3099 | /dich-vu/:id | GET /api/services/:id | DichVu, GoiDichVu, DanhMuc | API đọc đã viết; chưa UI/đủ UC; backend/src/app.spec.ts; sql.integration.spec.ts |
| UC_7 | Tìm dịch vụ | BR-UC7-01 | 3:4251 | /dich-vu | GET /api/services?q= | DichVu, GoiDichVu, DanhMuc | API tìm đã viết; chưa UI/đủ UC; backend/src/app.spec.ts; sql.integration.spec.ts |
| UC_8.1 | Xem nhân viên | UC_8.1 privacy | 5:7224 | /admin/nhan-vien | GET /api/employees/:id | NhanVien, TaiKhoan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_8.2 | Thêm nhân viên | BR-UC8.2-01/02 | 5:7338 | /admin/nhan-vien | POST /api/employees | NhanVien, TaiKhoan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_8.3 | Sửa nhân viên | BR-UC8.3-01/02 | 5:8562 | /admin/nhan-vien | PATCH /api/employees/:id | NhanVien, TaiKhoan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_8.4 | Xóa mềm | BR-UC8.4-01..04 | 5:9030 | /admin/nhan-vien | DELETE /api/employees/:id | NhanVien, TaiKhoan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_8.5 | Tìm nhân viên | BR-UC8.5-01/02 | 5:9761 | /admin/nhan-vien | GET /api/employees | NhanVien, TaiKhoan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_8.6 | Phân quyền | BR-UC8.6-01..04 | 6:13635 | /admin/nhan-vien | PUT /api/employees/:id/permissions | TaiKhoan, TaiKhoanQuyen, Quyen, LichSuPhanQuyen | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_8.7 | Khóa/mở khóa | BR-UC8.7-01..04 | 5:24495 | /admin/nhan-vien | PATCH /api/employees/:id/account-status | TaiKhoan, NhanVien | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_9.1 | Thêm dịch vụ | BR-UC9.1-01..06 | 3:5771 | /admin/dich-vu | POST /api/admin/services | DichVu, GoiDichVu, DanhMuc | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_9.2 | Danh sách dịch vụ | BR-UC9.2-01/02 | 3:8465 | /admin/dich-vu | GET /api/admin/services | DichVu, GoiDichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_9.3 | Sửa dịch vụ | UC_9.3 validation | 3:9542 | /admin/dich-vu | PATCH /api/admin/services/:id | DichVu, GoiDichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_9.4 | Ngừng dịch vụ | UC_9.4 unfinished bookings | 3:12892 | /admin/dich-vu | DELETE /api/admin/services/:id | DichVu, LichHen, KhachSuDungDichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_9.5 | Tìm dịch vụ quản trị | UC_9.5 BR-01/02 | 3:14701 | /admin/dich-vu | GET /api/admin/services?q= | DichVu, DanhMuc, GoiDichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_10.1 | Thống kê dịch vụ | BR-UC10.1-01/02 | 7:50605 | /admin/bao-cao | GET /api/reports/services | LichHen, KhachSuDungDichVu, DichVu | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_10.2 | Thống kê khách | BR-UC10.2-01..03 | 7:50657 | /admin/bao-cao | GET /api/reports/customers | KhachHang, LichHen | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |
| UC_10.3 | Doanh thu | BR-UC10.3-01..04 | 7:50709 | /admin/bao-cao | GET /api/reports/revenue | ThanhToan | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC |

Nền tảng: GET /api/health/live và /ready; frontend /system; app.spec.ts và foundation.spec.ts. Baseline SQL: migrations/001 + 002, seeds/001; verify-local.sql. Trạng thái pass/fail thực tế ở TEST_REPORT.md.

SePay cross-cutting UC_2/5/10: chưa triển khai API/payment tables; phải duyệt additive migration, kiểm thử authentication/amount/account/reference/expiry/idempotency/replay và concurrency trước nghiệm thu.
