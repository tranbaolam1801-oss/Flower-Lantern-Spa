# Kế hoạch triển khai

Nguồn chính: Prompt.md; SRS và Figma theo thứ tự ưu tiên đã quy định. Local-first, chưa chọn hosting.

1. **Audit — đang thực hiện:** đọc AGENTS/Prompt đầy đủ; kiểm kê đệ quy 11 file docs; trích xuất toàn bộ paragraph/table DOCX và các trang Draw.io; kiểm tra live Figma. Còn xem hết ảnh nhúng, nối prototype, rà từng frame và giải quyết Q01–Q15.
2. **Nền tảng — đang kiểm chứng:** npm workspaces frontend/backend; React/Vite/Router/Query/RHF/Zod/Tailwind và Button theo shadcn; NestJS/OpenAPI/validation/health/TypeORM. UI đăng nhập theo frame 5:21070, chưa xác thực. Build/typecheck/lint/Jest/Playwright và kết nối SQL local.
3. **Schema và bảo mật — bắt đầu:** baseline SRS 15 bảng + indexes + 20 giường đã chạy ở FlowerLanternSpa_Dev. Tiếp theo versioned migration runner/checksum, TypeORM entities, xử lý Q06, persistent lockout, Argon2 + JWT HttpOnly + CSRF + RBAC + vô hiệu phiên khi khóa.
4. **Booking:** chốt giờ/state machine, transaction SQL Server khóa giường theo thứ tự ổn định; kiểm tra khoảng nửa mở trên toàn bộ thời lượng; concurrency test create/update/cancel; ownership; giữ lịch sử.
5. **UC còn lại:** khách hàng, nhân viên, dịch vụ, phản hồi, báo cáo. API catalog đọc dịch vụ/gói là lát cắt đầu, chưa hoàn tất UC_6/7.
6. **UI tích hợp:** lấy design context/screenshot từng frame, component và trạng thái; nối API thật; screenshot tại viewport gốc và mobile. Không thay màn hình bằng ảnh.
7. **SePay:** đọc docs chính thức hiện hành; duyệt additive payment schema; QR từ tiền SQL; webhook xác thực, tài khoản nhận, reference, transaction ID, expiry, atomic idempotency; đối soát; test-only mock. Không giao dịch thật/tunnel khi chưa được phép.
8. **Nghiệm thu:** test chức năng/SQL/E2E/concurrency/security/visual cho toàn bộ UC và nhánh lỗi. Không dùng test double làm minh chứng SQL thật.
9. **Local handoff:** README, backup/restore đã thử, kiểm tra readiness; chỉ bàn hosting sau nghiệm thu và yêu cầu riêng.

Mỗi milestone cập nhật PROJECT_STATUS, TRACEABILITY_MATRIX, TEST_REPORT và OPEN_QUESTIONS. Không đánh dấu UC hoàn thành chỉ vì build pass.
