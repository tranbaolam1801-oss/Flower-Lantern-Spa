# Ma trận truy vết

2026-11-10. 35 UC chi tiết. Routes/API là **dự kiến** trừ phần ghi đã viết; không đánh dấu UC hoàn tất. Tất cả frame ở file Figma vASTCkZ0az3MX98u1fvhTJ; xem inventory đầy đủ trong audit/FIGMA_FRAME_INVENTORY.md.

# FLOWER LANTERN SPA — IMPLEMENT COMPLETE RESPONSIVE HOMEPAGE

Continue the existing Flower Lantern Spa fullstack project in `C:\Spa`.

I have provided a homepage design reference image. Build a real, fully functional React homepage with a layout and visual composition closely matching the reference.

IMPORTANT: The reference image is for layout inspiration. The original approved Figma, UI design standards, logos, colors, and assets in `docs/` take priority wherever they differ.

DO NOT restart the project or overwrite completed functionality.

## 1. BRANDING AND COLORS

- Use the existing approved English-language Flower Lantern Spa logo.
- Preserve the approved green primary button color from the original project.
- The "Đặt lịch ngay" button MUST be green, including in the header, hero, and homepage booking call-to-action.
- Do not use the pink/red button styling shown in the reference image.
- Use existing approved green hover, active, and focus states.
- Preserve the original Figma color palette, typography, lotus illustrations, backgrounds, and design tokens.
- Do not generate a new logo or arbitrarily change the brand identity.

## 2. HOMEPAGE STRUCTURE

Implement a polished, complete homepage with these sections, following the supplied reference image:

1. Shared public Header:
   - Approved English logo.
   - Trang chủ, Giới thiệu, Dịch vụ, Đặt lịch, Liên hệ.
   - Green "Đặt lịch ngay" button.
   - Responsive mobile navigation.

2. Hero Section:
   - Approved Hoi An / lotus decorative imagery.
   - Attractive spa introduction.
   - Clear Vietnamese headline and supporting text.
   - Green booking call-to-action.
   - Secondary button to explore services.

3. About Flower Lantern Spa:
   - Spa introduction.
   - Brand values and benefits.
   - Real spa imagery.

4. Featured Services:
   - Cards displaying actual active services from NestJS and SQL Server.
   - Service image, title, description, and detail link.
   - Appropriate loading, empty, and error states.

5. Why Choose Us:
   - Spa environment.
   - Professional service.
   - Personalized experiences.
   - Convenient booking.

6. Spa Gallery:
   - Use existing approved images and assets.
   - Responsive image grid without image distortion.

7. Customer Reviews:
   - Use approved, publicly displayable review data from the backend.
   - Do not invent actual customer reviews or ratings.
   - Use an appropriate empty state if no reviews are available.

8. Booking Call-to-Action:
   - Highlight the green "Đặt lịch ngay" button.
   - Link to the existing correct booking route.

9. Contact Section:
   - Approved spa address, contact information, and operating hours.
   - Operating hours: 08:00–22:00.
   - Use verified project contact information.
   - Do not invent phone numbers, email addresses, or social accounts.

10. Complete Footer:
    - English Flower Lantern Spa logo.
    - Short spa introduction.
    - Verified address, telephone, email, and hours.
    - Quick navigation links.
    - Service links.
    - Social links only if real accounts are documented.
    - Privacy and terms links only if implemented.
    - Copyright and relevant legal information.

## 3. RESPONSIVE DESIGN

Support at minimum:

- 1920×1080
- 1440×900
- 1366×768
- 1280×720
- 1024×768
- 768px
- 390px
- 360px

Use fluid layouts, CSS Grid, Flexbox, responsive typography, and existing Tailwind design tokens.

No global transform: scale().

No unintended horizontal page overflow.

Preserve readable text and accessible buttons across screen sizes.

## 4. FULLSTACK INTEGRATION

- Use existing React + TypeScript + Vite + Tailwind/shadcn.
- Reuse the current Header, Logo, Footer, and shared components where available.
- Fetch real service data from existing NestJS APIs.
- Fetch public reviews only where supported by approved business rules and APIs.
- Connect navigation and booking buttons to real routes.
- Preserve existing authentication sessions and role-based routing.
- Do not create placeholder functionality and call it complete.
- Do not change the database schema without approval.

## 5. QUALITY AND VISUAL VERIFICATION

- Capture screenshots of the actual homepage at desktop, laptop, tablet, and mobile sizes.
- Compare the running page against the provided reference image.
- Prioritize the original Figma for approved colors, assets, logo, and typography.
- Verify every "Đặt lịch ngay" button is green and navigates correctly.
- Verify no clipped sections, distorted assets, broken links, or overlapping elements.
- Run frontend build, typecheck, lint, and relevant Playwright tests.
- Fix failures before marking the homepage complete.

## 6. PROJECT TRACKING

Add this homepage implementation task under Milestone 6 in IMPLEMENTATION_PLAN.md.

Update PROJECT_STATUS.md, TRACEABILITY_MATRIX.md, TEST_REPORT.md, and relevant architectural decisions after implementation.

Preserve the original nine milestones.

Do not stop after writing a plan. Implement the actual homepage and verify it.

After finishing the homepage, continue the earliest incomplete original fullstack milestone.

**FINAL REQUIREMENT: Visually resemble the supplied homepage reference while preserving the ORIGINAL FLOWER LANTERN SPA green booking buttons, approved English logo, Figma design system, and real booking functionality.**

| UC      | Nghiệp vụ            | BR                         | Figma node tham chiếu             | Route                                          | API                                                           | SQL tables                                                        | Tests/trạng thái                                                                                                                                                       |
| ------- | -------------------- | -------------------------- | --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC_1    | Đăng nhập            | BR-UC1-01/02; NFR-05       | 5:21070; shell quản trị 1:49090   | /dang-nhap; /admin/lich-hen; /lich-hen-cua-toi | POST /api/auth/login; GET /api/auth/me; POST /api/auth/logout | TaiKhoan, Quyen, TaiKhoanQuyen, KhoaDangNhap, NhanVien, KhachHang | Auth thật đã nối; auth.spec.ts, security.spec.ts, roles.guard.spec.ts, auth.sql.integration.spec.ts, tests/auth.spec.ts; chưa nghiệm thu dashboard/đầy đủ UC           |
| UC_2.1  | Tạo lịch hẹn         | BR-UC2.1-01..04            | 1:33652                           | /admin/lich-hen                                | POST /api/bookings                                            | LichHen, KhachSuDungDichVu, Giuong, GoiDichVu, ThanhToan          | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_2.2  | Xem lịch theo giường | BR-UC2.2-01                | 1:49090                           | /admin/lich-hen                                | GET /api/bookings                                             | LichHen, KhachSuDungDichVu, Giuong                                | API + React lịch 20 giường nối SQL; booking-read.sql.integration.spec.ts kiểm tra quyền/ngày/khoảng giờ; tests/auth.spec.ts + responsive.ts; chưa nghiệm thu đầy đủ UC |
| UC_2.3  | Cập nhật lịch        | BR-UC2.3-01..03            | 1:46088                           | /admin/lich-hen                                | PATCH /api/bookings/:id                                       | LichHen, KhachSuDungDichVu, ThanhToan                             | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_2.4  | Tìm lịch             | BR-UC2.4-01/02             | 1:44861                           | /admin/lich-hen                                | GET /api/bookings/search                                      | LichHen, KhachSuDungDichVu, GoiDichVu                             | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_2.5  | Hủy lịch             | BR-UC2.5-01                | 1:41540                           | /admin/lich-hen                                | POST /api/bookings/:id/cancel                                 | LichHen, KhachSuDungDichVu                                        | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_3.1  | Thêm khách hàng      | BR-UC3.1-01..03            | 1:31895                           | /admin/khach-hang                              | POST /api/customers                                           | KhachHang                                                         | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_3.2  | Sửa khách hàng       | UC_3.2 validation          | 1:30165                           | /admin/khach-hang                              | PATCH /api/customers/:id                                      | KhachHang                                                         | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_3.3  | Xem khách hàng       | SRS 3.3.4; Q12             | 1:29477                           | /admin/khach-hang                              | GET /api/customers/:id                                        | KhachHang, LichHen                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_3.4  | Tìm khách hàng       | BR-UC3.4-01                | 1:29071; 1:28872; sidebar 1:49090 | /admin/khach-hang                              | GET /api/customers                                            | KhachHang, LichHen                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_4.1  | Xem đánh giá         | UC_4.1                     | 1:478                             | /admin/danh-gia                                | GET /api/reviews/:id                                          | DanhGia, PhanHoi, KhachHang, DichVu                               | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_4.2  | Phản hồi             | BR-UC4.2-01/02             | 1:697                             | /admin/danh-gia                                | POST /api/reviews/:id/reply                                   | PhanHoi, DanhGia, NhanVien                                        | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_4.3  | Tìm đánh giá         | BR-UC4.3-01/02             | 1:1337                            | /admin/danh-gia                                | GET /api/reviews                                              | DanhGia, PhanHoi                                                  | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_5.1  | Đặt lịch online      | BR-UC5.1-01..04            | 1:4574                            | /dat-lich                                      | POST /api/me/bookings                                         | LichHen, KhachSuDungDichVu, Giuong, GoiDichVu, KhachHang          | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_5.2  | Lịch của tôi         | BR-UC5.2-01..04            | 1:11630; 1:11180; logo 3:3233     | /lich-hen-cua-toi                              | GET /api/me/bookings                                          | LichHen, KhachHang                                                | API + React đọc lịch theo tài khoản, nhóm dịch vụ/trạng thái; booking-read.sql.integration.spec.ts; tests/auth.spec.ts + responsive.ts; đổi/hủy chưa triển khai        |
| UC_5.3  | Đổi lịch             | BR-UC5.3-01/02             | 1:16609                           | /lich-hen-cua-toi                              | PATCH /api/me/bookings/:id/time                               | LichHen, KhachSuDungDichVu, Giuong                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_5.4  | Hủy lịch cá nhân     | BR-UC5.4-01/02             | 1:19735                           | /lich-hen-cua-toi                              | POST /api/me/bookings/:id/cancel                              | LichHen, KhachSuDungDichVu                                        | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_5.5  | Đánh giá dịch vụ     | BR-UC5.5-01..03            | 1:22575                           | /lich-hen-cua-toi                              | POST /api/me/bookings/:id/review                              | DanhGia, LichHen, ThanhToan                                       | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_6    | Xem dịch vụ          | BR-UC6-01..03              | 3:3099                            | /dich-vu/:id                                   | GET /api/services/:id                                         | DichVu, GoiDichVu, DanhMuc                                        | API đọc đã viết; chưa UI/đủ UC; backend/src/app.spec.ts; sql.integration.spec.ts                                                                                       |
| UC_7    | Tìm dịch vụ          | BR-UC7-01                  | 3:4251                            | /dich-vu                                       | GET /api/services?q=                                          | DichVu, GoiDichVu, DanhMuc                                        | API tìm đã viết; chưa UI/đủ UC; backend/src/app.spec.ts; sql.integration.spec.ts                                                                                       |
| UC_8.1  | Xem nhân viên        | UC_8.1 privacy             | 5:7224                            | /admin/nhan-vien                               | GET /api/employees/:id                                        | NhanVien, TaiKhoan                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_8.2  | Thêm nhân viên       | BR-UC8.2-01/02             | 5:7338                            | /admin/nhan-vien                               | POST /api/employees                                           | NhanVien, TaiKhoan                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_8.3  | Sửa nhân viên        | BR-UC8.3-01/02             | 5:8562                            | /admin/nhan-vien                               | PATCH /api/employees/:id                                      | NhanVien, TaiKhoan                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_8.4  | Xóa mềm              | BR-UC8.4-01..04            | 5:9030                            | /admin/nhan-vien                               | DELETE /api/employees/:id                                     | NhanVien, TaiKhoan                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_8.5  | Tìm nhân viên        | BR-UC8.5-01/02             | 5:9761                            | /admin/nhan-vien                               | GET /api/employees                                            | NhanVien, TaiKhoan                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_8.6  | Phân quyền           | BR-UC8.6-01..04            | 6:13635                           | /admin/nhan-vien                               | PUT /api/employees/:id/permissions                            | TaiKhoan, TaiKhoanQuyen, Quyen, LichSuPhanQuyen                   | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_8.7  | Khóa/mở khóa         | BR-UC8.7-01..04            | 5:24495                           | /admin/nhan-vien                               | PATCH /api/employees/:id/account-status                       | TaiKhoan, NhanVien                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_9.1  | Thêm dịch vụ         | BR-UC9.1-01..06            | 3:5771                            | /admin/dich-vu                                 | POST /api/admin/services                                      | DichVu, GoiDichVu, DanhMuc                                        | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_9.2  | Danh sách dịch vụ    | BR-UC9.2-01/02             | 3:8465                            | /admin/dich-vu                                 | GET /api/admin/services                                       | DichVu, GoiDichVu                                                 | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_9.3  | Sửa dịch vụ          | UC_9.3 validation          | 3:9542                            | /admin/dich-vu                                 | PATCH /api/admin/services/:id                                 | DichVu, GoiDichVu                                                 | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_9.4  | Ngừng dịch vụ        | UC_9.4 unfinished bookings | 3:12892                           | /admin/dich-vu                                 | DELETE /api/admin/services/:id                                | DichVu, LichHen, KhachSuDungDichVu                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_9.5  | Tìm dịch vụ quản trị | UC_9.5 BR-01/02            | 3:14701                           | /admin/dich-vu                                 | GET /api/admin/services?q=                                    | DichVu, DanhMuc, GoiDichVu                                        | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_10.1 | Thống kê dịch vụ     | BR-UC10.1-01/02            | 7:50605                           | /admin/bao-cao                                 | GET /api/reports/services                                     | LichHen, KhachSuDungDichVu, DichVu                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_10.2 | Thống kê khách       | BR-UC10.2-01..03           | 7:50657                           | /admin/bao-cao                                 | GET /api/reports/customers                                    | KhachHang, LichHen                                                | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |
| UC_10.3 | Doanh thu            | BR-UC10.3-01..04           | 7:50709                           | /admin/bao-cao                                 | GET /api/reports/revenue                                      | ThanhToan                                                         | Chưa triển khai; Chưa viết; cần main/alternate/exception + RBAC                                                                                                        |

Nền tảng: GET /api/health/live và /ready; frontend /system; app.spec.ts và foundation.spec.ts. Baseline SQL: migrations/001 + 002, seeds/001; verify-local.sql. Trạng thái pass/fail thực tế ở TEST_REPORT.md.

SePay cross-cutting UC_2/5/10: chưa triển khai API/payment tables; phải duyệt additive migration, kiểm thử authentication/amount/account/reference/expiry/idempotency/replay và concurrency trước nghiệm thu.

## Yêu cầu UI được duyệt — cập nhật 2026-11-10

| Phạm vi                       | Nguồn / triển khai                                                         | Kiểm chứng / giới hạn                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| UC1, UC5: cùng logo tiếng Anh | Figma UC6 group 3:3233, flower-lantern-logo.png, BrandLogo, CustomerHeader | tests/responsive.ts kiểm tra cùng src và tỷ lệ; screenshot login/customer 1440/390/360; không sửa branding gốc            |
| UC3.4: sidebar chung          | ManagementSidebar từ 1:49090; active theo permission, drawer responsive    | Đã dùng ở lịch quản lý; UC3.4 chưa triển khai, chưa nghiệm thu                                                            |
| NFR responsive UC1–10         | 9 viewport; tokens @theme; Grid/Flex; native dialog; lịch cuộn nội bộ      | Playwright kiểm tra ba màn hiện có, resize/no page overflow/logo/dialog/Escape/focus; không đại diện các UC chưa xây dựng |
| UC1 lockout/schema            | KhoaDangNhap; 16 entities; không migration 004                             | lockout.sql.integration.spec.ts, schema.sql.integration.spec.ts; số PASS thực tế trong<br /> TEST_REPORT                  |
