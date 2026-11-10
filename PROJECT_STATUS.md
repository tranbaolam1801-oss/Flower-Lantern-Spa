# Trạng thái dự án

Cập nhật: 2026-11-10 (Asia/Bangkok).

## Điểm bắt đầu

Không có Git repository, mã nguồn, PROJECT_STATUS hoặc IMPLEMENTATION_PLAN trước phiên này. Tài liệu gốc trong docs được giữ nguyên. Database có sẵn FlowerLanternSpa_3NF chỉ được đọc metadata, chưa sửa.

## Đã triển khai

- npm workspaces `frontend/`, `backend/`, lockfile, lint/typecheck/build/test.
- NestJS `/api/health/live`, `/api/health/ready`, `/api/services`, `/api/services/:id`, OpenAPI `/api/docs`. DTO whitelist, parameterized SQL, chỉ public dịch vụ Hoạt động, không trả lỗi driver ra HTTP.
- TypeORM + mssql; SQL authentication cấu hình qua env; thêm Windows integrated driver cho local. synchronize/migrationsRun đều false.
- React `/dang-nhap` theo Figma 5:21070, asset tải local, font Inter, validation và hiện/ẩn mật khẩu. **Chưa đăng nhập thật**, không gửi/lưu mật khẩu khi endpoint chưa triển khai.
- React `/system` gọi health API thật bằng TanStack Query; trang kỹ thuật, không phải UI nghiệp vụ.
- Database riêng FlowerLanternSpa_Dev: baseline SRS mục 7.2 gồm 15 bảng, business indexes, seed G1–G20. Bản sao lưu C:\Spa\database\FlowerLanternSpa_Dev_pre_003.bak đã tạo.
- Migration 003 (003-auth-lockout.sql) đã áp dụng thành công: tạo bảng persistent lockout KhoaDangNhap và chuyển đổi ràng buộc MaTaiKhoan trên KhachHang, NhanVien sang Filtered Unique Index (WHERE MaTaiKhoan IS NOT NULL) xử lý dứt điểm Q06.
- Bộ kiểm thử an toàn giao dịch test-003-constraints.sql đã chạy đạt 5/5 ca kiểm thử (multiple NULL, chặn trùng khác NULL, ràng buộc khóa chính KhoaDangNhap). Toàn bộ fixture kiểm thử đã rollback sạch sẽ (0 bản ghi rác).
- Typecheck, lint, build pass 100%. API contract test (15 passed) và real SQL integration test (19 passed) đạt 100%.
- Figma MCP session truy cập thật page 0:1, inventory frame lưu trong audit; lấy context và screenshot login. Không sửa file Figma.

## Chưa hoàn tất

Audit trực quan toàn bộ 168 ảnh SRS/1 ảnh UI kit; tất cả UC chưa đạt đầy đủ điều kiện nghiệm thu. Chưa có auth/RBAC/booking/CRUD quản trị/reports/SePay. Chưa thử concurrency, webhook, backup/restore. Các mâu thuẫn nằm ở OPEN_QUESTIONS.

## Tiếp tục

Đọc TEST_REPORT để biết kiểm thử cuối cùng. Hoàn tất kiểm chứng nền tảng và SQL API integration, rồi milestone 3: versioned migration runner + entities + auth/permissions. Không chạy lại initialize-local.sql trên database có bảng; script sẽ từ chối. Không dùng database hiện hữu làm database test.

Lệnh: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test`; Playwright dùng `PLAYWRIGHT_BROWSERS_PATH=C:/Spa/.playwright`. Hướng dẫn env/start ở README.
