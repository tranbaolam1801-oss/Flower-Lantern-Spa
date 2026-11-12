# Trạng thái hiện tại — 2026-11-12 (đọc trước; phần bên dưới là lịch sử, nhiều chỗ đã lỗi thời)

**Dự án CHƯA hoàn thành.** Báo cáo kiểm toán đầy đủ, phân biệt "đã viết / đã kiểm thử mock / đã xác minh": [COMPLETION_REPORT.md](COMPLETION_REPORT.md). Điểm chính:

- Frontend UC_2–UC_10: 139 Completed / 13 Pending / 8 Blocked trong checklist Figma (`frontend/FIGMA_VISUAL_AUDIT.md` §5); đối chiếu Figma, chưa chạy với dữ liệu thật.
- Backend Phase 2 đã viết cho đặt lịch (ghi), khách hàng (ghi), đánh giá, nhân viên/RBAC, dịch vụ quản trị, báo cáo, SePay Test Mode; build + 229 unit test mock PASS. **Chưa xác minh trên SQL Server.**
- 27 SQL integration test BLOCKED: Smart App Control chặn `msnodesqlv8.node` (không đổi chính sách). Script SQL login `database/setup/001-test-sql-login.MANUAL.sql` chờ người dùng chạy.
- Migration: 006 đã áp dụng CHỈ trên Test; 005 và 007 PROPOSED chưa áp dụng.
- End-to-end: NOT VERIFIED (backend không kết nối được DB trong môi trường này, không có dữ liệu dịch vụ/gói, 007 chưa áp dụng, SePay chưa cấu hình).
- Tiếp theo và việc cần người dùng: mục "NEXT ACTION — RESUME HERE" trong HANDOVER.md.

---

# Trạng thái mới nhất — 2026-11-10, tiếp tục phần độc lập

**Migration 004 chưa áp dụng theo quyết định người dùng. M3 chưa hoàn tất.** Không tạo PhienDangNhap; logout hiện xóa cookie nhưng chưa thu hồi token đã sao chép ở server.

Tiếp tục từ commit `d857c77`, giữ các bổ sung tài liệu của người dùng. Đã triển khai và kiểm chứng trong working tree:

- Logo tiếng Anh nguyên group Figma `3:3233` dùng chung tại UC1/UC5 qua `BrandLogo`; header khách và sidebar quản lý thành component dùng chung.
- Responsive cho login, lịch quản lý và lịch cá nhân tại 9 viewport; menu native dialog, Escape/focus return, lịch cuộn nội bộ; tokens giữ nguyên màu nguồn.
- API đọc lịch theo ngày/20 giường và lịch theo tài khoản khách nối React + SQL thật; ownership và Q01 được backend kiểm tra. Tạo/đổi/hủy lịch vẫn chưa có.
- DatabaseService dùng chung một pool; GET /auth/me dùng profile được AuthGuard đọc mới từ SQL.
- Dedicated `FlowerLanternSpa_Test` có 16 bảng/20 giường, integration fixture tách Dev. Lockout concurrency, entity/schema columns/FK và booking read tests đã chạy.

Kết quả cuối: typecheck/lint/build PASS; **56/56 Jest/SQL integration**, **7/7 Playwright** gồm 27 tổ hợp 3 màn × 9 viewport. Chi tiết và các lần thất bại trước sửa được giữ trong TEST_REPORT.md. Không suy rộng thành nghiệm thu đầy đủ UC.

Còn thiếu: UC3.4 và các màn UC chưa triển khai; migration runner/checksum; chính sách/thu hồi phiên; giao dịch create/update/cancel và concurrency booking; SePay; audit toàn bộ hình nguồn; QA và local handoff. Các yêu cầu responsive UC1–10 tiếp tục áp dụng trong M6, không chỉ ba màn hiện có.

Bước tiếp theo: UC3.4 dùng shared sidebar và API tìm khách; hoàn thiện M3 độc lập, chốt Q01/Q03 trước state machine ghi booking. Giữ nguyên chín milestone; không áp dụng 004 nếu chưa được duyệt lại, không chọn hosting/deploy.

---

Phần bên dưới là lịch sử và yêu cầu đã được duyệt; các mô tả placeholder/chưa có Auth hoặc số test cũ không phải trạng thái hiện tại.

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

ADDITIONAL APPROVED UI CONSISTENCY REQUIREMENTS — FLOWER LANTERN SPA

Continue the existing fullstack implementation in C:\Spa. Do not restart the project.

I have three specific UI consistency requirements:

1. UC_1 — Authentication screens:
   Replace the Vietnamese "Hoa Đăng Spa" logo with the existing approved English-language Flower Lantern Spa logo already used on other screens.
2. UC_5 — Customer appointment/booking screens:
   Replace the Vietnamese "Hoa Đăng Spa" logo with the same existing English-language Flower Lantern Spa logo.
3. UC_3.4 — Customer search screen:
   The current sidebar is visually inconsistent with the other management screens. Standardize it to match the approved shared management sidebar, including width, spacing, colors, icons, menu structure, active state, and navigation behavior.

IMPORTANT:

- Reuse the existing approved English logo asset; do not invent a new logo or modify the branding independently.
- Reuse a shared Header/Logo component for applicable public and customer-facing screens.
- Reuse a shared Sidebar component for management screens.
- Preserve all approved Figma layouts and business functionality.
- Inspect the actual Figma frames and approved design assets to identify the correct references.
- Do not change unrelated screens or the database.

DOCUMENTATION:

- Record these requirements in OPEN_QUESTIONS.md as approved UI corrections, not unresolved questions.
- Add concrete tasks and acceptance criteria to IMPLEMENTATION_PLAN.md.
- Add them to PROJECT_STATUS.md as pending until verified.
- Update TRACEABILITY_MATRIX.md to cover UC_1, UC_5, and UC_3.4 UI consistency.
- Do not modify the original SRS; document these as user-approved visual consistency corrections.

ACCEPTANCE CRITERIA:

- UC_1 and UC_5 display the exact same approved English logo asset as the other applicable screens.
- UC_3.4 uses the same shared sidebar as other management screens.
- Screenshots of the running application confirm visual consistency.
- Navigation and responsive behavior remain functional.
- Frontend build, lint, and relevant UI/E2E tests pass.

Implement these corrections during the original Figma frontend milestone, or earlier when modifying the relevant screens.

Continue building all remaining fullstack milestones after incorporating these requirements.

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
