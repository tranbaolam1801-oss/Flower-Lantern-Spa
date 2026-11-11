# Flower Lantern Spa — HANDOVER

Cập nhật 2026-11-11. Root C:\Spa. Hướng dẫn AGENTS.md → HANDOVER.md → Prompt.md và nguồn liên quan.

## Identity / milestones

React/TypeScript/Vite/Router/Tailwind/shadcn/Query/RHF/Zod; NestJS/REST/OpenAPI/Argon2/JWT HttpOnly; TypeORM/mssql/SQL Server. SePay duy nhất. Chín milestone: audit, foundation, schema/Auth, booking, UC còn lại, Figma UI, SePay, QA, local handoff. Không hosting/deploy.

## Current checkpoint — IN PROGRESS

M3 / UC1: khôi phục migration 004 Test-only. Read-only SQL mới xác minh Test 16 bảng, 20 giường, PhienDangNhap chưa có, không có bảng migration history. Chưa áp dụng 004 tại checkpoint này.

## Verified and unfinished work

- Lịch sử đã chạy trước ngắt: 62/62 Jest/SQL (10 suites), 7/7 Playwright có UC3.4 search/sidebar/9 viewport. Không phải lần chạy mới. Các sửa cancel và icon sau đó chưa được kiểm thử đầy đủ.
- UC3.4: customer-read.controller.ts, customer-search.tsx, ManagementSidebar/ManagementLayout, query Q02, case-insensitive tên/phone, pagination, error/empty. CRUD khác chưa có.
- UC2: booking-transaction.service.ts khóa giường UPDLOCK/HOLDLOCK theo thứ tự, tests SQL 2 request xung đột/giáp ranh/rollback. Chưa nối create/update API. booking-cancel.controller.ts và booking-cancel.tsx đang dở, cần regression.
- Schema/Auth hiện hành có 16 entities; Auth chưa lưu jti/phiên, logout chỉ xóa cookie. Migration 004 SQL + AUTH_SESSION_PROPOSAL đã review, DDL transaction nhưng chưa có schema entity/session code.
- M4–9 chưa hoàn tất; SePay NOT STARTED. Homepage M6 NOT STARTED, không ưu tiên trước critical milestones.

## Database / approvals

Dev: FlowerLanternSpa_Dev, chưa được duyệt 004. Test: FlowerLanternSpa_Test, được duyệt áp dụng 004 và kiểm thử; xác minh chưa tồn tại trước chạy. Baseline 001–003/20 giường đã có theo metadata; không chạy seed lại. Bảo toàn 15 bảng nghiệp vụ và tất cả dữ liệu cũ. Không DROP/DELETE giường. Dev, paid operations, live transfer, deployment REQUIRES APPROVAL.

## Approved decisions

08:00–22:00, kết thúc không sau 22:00; 15 giường mặc định G1–G15; trực tiếp Chưa đến, online Chờ xác nhận. Cần đề xuất an toàn bảo toàn G16–G20/lịch sử. Logo Anh UC1/UC5; CTA Đặt lịch ngay xanh gốc; sidebar chung UC3.4; 9 viewport. Homepage M6 đủ hero/about/services/gallery/reviews/CTA/contact/footer, dữ liệu thật và thông tin xác minh; ảnh tham chiếu mới trong docs, không dùng làm webpage nguyên ảnh.

## Git / preservation

Branch main; commit d857c77. Nhiều thay đổi tracked/untracked giữ nguyên: Auth shared pool, UI branding/responsive, customer search, booking transaction/cancel, tests, tracking docs, proposal004. docs/Hoa Đăng Spa – Thư Giãn Hội An.png mới của người dùng. Không revert/reset/overwrite; .env không đọc ra log/commit. Chạy git status --short để lấy danh sách thực tế.

## NEXT ACTION — RESUME HERE

1. Review 004; checkpoint trước DDL đã ghi. Apply chỉ Test nếu metadata vẫn chưa có; verify cột/FK/CHECK/index và baseline không đổi; không rerun seed.
2. Nối jti/server sessions trong backend/src/auth, chỉ bật cho Test trong giai đoạn Dev chưa duyệt, không tự làm hỏng Auth Dev hiện tại.
3. Chạy npm.cmd run typecheck/lint/build; RUN_SQL_INTEGRATION=1 DB_AUTH=windows DB_HOST=localhost DB_NAME=FlowerLanternSpa_Test npm.cmd test; E2E isolated server. Ghi PASS/FAIL thật, test missing/expired/revoked/jti/device/locked/restart.
4. Báo Test và xin duyệt Dev riêng. Tiếp tục booking policy 15 giường/giờ/trạng thái, giữ lịch sử; cập nhật sáu tracking docs và handover.

## Checkpoint 004 — 2026-11-11

APPLIED Test only: verify-004-test.sql exit 0, 17 tables, 20 beds, existing columns/row counts unchanged. First preflight failed parsing reserved alias RowCount before DDL; fixed to ExistingRows then applied once. Dev untouched. Auth session code IN PROGRESS (AUTH_SESSION_STORE=sql on Test only); no new test PASS claimed yet. Entity PhienDangNhap added; schema audit now expects 17 on Test.
