# Trạng thái dự án

## Khôi phục mới nhất 2026-11-10 — thay thế trạng thái cũ bên dưới

M3 đang thực hiện, **chưa hoàn tất**. Git `master`, commit `9fbc82e`; giữ toàn bộ thay đổi Auth/entities/frontend chưa commit. Chi tiết: [audit/RECOVERY_2026-11-10.md](audit/RECOVERY_2026-11-10.md).

Đã xác minh read-only: 16 bảng (15 business + KhoaDangNhap), 20 giường, 5 tài khoản/6 quyền/3 nhân viên/1 khách/13 account-permission links. Không chạy lại seed/migration. Phát hiện seed mojibake và đã sửa exact corrupted values trong transaction, không đổi hashes/schema.

Đã nối AuthProvider/routes và login/me/logout thật; Argon2id, JWT HttpOnly, refresh phiên; CSRF header/origin; bỏ JWT fallback; đọc lại quyền/trạng thái SQL; lockout transaction/range locks. Backend 36 tests PASS gồm 6 SQL thật, fixture rollback đã kiểm chứng. Xem TEST_REPORT cho E2E.

Còn thiếu: dashboard nhân viên/quản lý/chủ spa/khách đúng Figma (hiện placeholder), permission matrix tests, concurrency lockout, migration runner/checksum và entity/schema audit. UC_2–10, SePay, toàn bộ media audit chưa nghiệm thu.

Kiểm tra cuối lát cắt: typecheck/lint/build PASS; 39 unit/API tests PASS (đã bổ sung 9 RolesGuard tests), 6 SQL integration đã PASS ở lần opt-in trước; 7/7 Playwright PASS. Permission guard unit matrix đã có, còn gắn permission vào các endpoint nghiệp vụ khi triển khai. Chưa commit vì M3 còn đang thực hiện; các file được giữ trong working tree.

Bước tiếp theo: hoàn thiện dashboard shell từ live Figma và kiểm thử quyền/concurrent lockout để nghiệm thu M3, rồi M4 booking. Giữ nguyên kế hoạch chín milestone. SQL UTF-8 dùng `sqlcmd -b -I -f 65001`; không chạy initialize trên database có dữ liệu. E2E dùng cổng riêng 3100/5183, giữ server cũ 3000/5173.

## Báo cáo lịch sử trước khôi phục (không phải trạng thái hiện tại)

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
