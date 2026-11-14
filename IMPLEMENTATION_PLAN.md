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

## Tiếp tục sau khôi phục 2026-11-10

M3 đang thực hiện: migration 003/filtered indexes đã tồn tại; entities/Auth Antigravity được giữ và sửa tiếp. Login React đã nối API thật; lockout/SQL/Auth tests đã chạy. Còn dashboard Figma, permission matrix/concurrency tests, entity/schema audit và migration runner. Không thay thế chín milestone trên.

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

# FLOWER LANTERN SPA — RESPONSIVE DESIGN REQUIREMENT

Continue implementing the existing Flower Lantern Spa fullstack project in `C:\Spa`.

This is an additional approved UI requirement for the existing project. Do not restart development or change the approved technology stack.

## PROBLEM

The current frontend closely follows the original 1440×900 Figma designs with fixed dimensions.

On smaller laptops and browser windows, the interface appears oversized, clipped, or requires manual browser zoom.

I want the entire Flower Lantern Spa application to automatically adapt to different screen sizes and resolutions without requiring users to manually zoom in or out.

## 1. IMPLEMENT RESPONSIVE AND FLUID DESIGN

Use React, TypeScript, Tailwind CSS, and the existing approved UI components.

Implement responsive layouts using:

- CSS Grid and Flexbox.
- Relative units such as %, rem, vw, and appropriate fluid sizing.
- Responsive breakpoints.
- CSS clamp() for suitable typography and spacing.
- min-width, max-width, minmax(), and flexible containers.
- Responsive tables, forms, cards, navigation, modals, and dashboards.
- Viewport-aware layout sizing.

Avoid fixed 1440px-wide page containers and unnecessary fixed heights.

Do not use global CSS transform: scale() or browser zoom manipulation as the primary responsive solution.

## 2. TARGET SCREEN SIZES

Support at minimum:

- 1920×1080 desktop.
- 1600×900 desktop.
- 1440×900 original Figma reference.
- 1366×768 laptop.
- 1280×720 laptop.
- 1024×768 small laptop/tablet.
- 768px tablet viewport.
- 390px mobile viewport.
- 360px mobile viewport.

Also support browser resizing and operating-system display scaling where practical.

The application must remain functional at 100% browser zoom without requiring manual zoom adjustments.

## 3. RESPONSIVE BEHAVIOR

### Desktop

Preserve the approved Figma design as closely as possible.

### Smaller laptops

Automatically adjust sidebar width, content width, spacing, forms, cards, and typography without horizontal page overflow.

Allow normal vertical scrolling when content exceeds screen height.

### Tablets

Use collapsible navigation where necessary.

Reflow multi-column layouts into fewer columns.

### Mobile

Use a compact header and navigation drawer.

Stack form fields and cards vertically.

Keep buttons and interactive elements accessible.

Allow horizontal scrolling only within individual complex tables or scheduling grids when necessary, not across the entire page.

## 4. SHARED LAYOUT COMPONENTS

Audit and improve shared layout components:

- Public header.
- Management sidebar.
- Customer navigation.
- Dashboard layout.
- Page containers.
- Forms.
- Tables.
- Booking calendar.
- Modals and dialogs.

Ensure UC_3.4 uses the same approved shared management sidebar as the other management screens.

Ensure UC_1 and UC_5 use the same existing approved English-language Flower Lantern Spa logo as the other applicable screens.

Do not create a new logo.

## 5. PRESERVE FIGMA FIDELITY

The original 1440×900 Figma design remains the desktop visual reference.

Responsive behavior is an extension of the approved design, not permission to redesign the application.

Preserve:

- Brand colors.
- Typography and visual hierarchy.
- Logo and decorative assets.
- Vietnamese interface labels.
- Navigation structure.
- Original components and business functionality.

Do not distort images, logos, or icons when resizing.

Use appropriate object-fit and aspect-ratio rules.

## 6. APPLY TO ALL USE CASES

Apply responsive behavior consistently across all frontend screens for UC_1 through UC_10, including:

- Login and authentication.
- Customer booking.
- Personal booking management.
- Customer management.
- Employee and permission management.
- Service management.
- Reviews and feedback.
- Reports and statistics.
- Payment screens.
- All relevant dashboards.

Do not limit the changes to the login page.

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

## 7. AUTOMATED RESPONSIVE TESTING

Use Playwright to test representative screens at all required viewport sizes.

Verify:

1. No unintended page-level horizontal overflow.
2. No overlapping or clipped content.
3. No unreadable or excessively small text.
4. No distorted images.
5. Forms and buttons remain usable.
6. Sidebar and navigation work correctly.
7. Dialogs fit inside the viewport.
8. Booking interfaces remain functional.
9. Browser resize does not break layouts.
10. Existing desktop Figma visual fidelity is preserved.

Capture screenshots at representative viewport sizes and fix detected layout problems.

## 8. PROJECT DOCUMENTATION

Add this as an approved cross-cutting non-functional UI requirement.

Update:

- Prompt.md
- IMPLEMENTATION_PLAN.md
- PROJECT_STATUS.md
- TRACEABILITY_MATRIX.md
- TEST_REPORT.md
- ARCHITECTURE_DECISIONS.md

Do not rewrite or replace the original project instructions.

Schedule responsive improvements as part of Milestone 6, while fixing shared layout issues earlier when working on affected screens.

## FINAL INSTRUCTIONS

Inspect the current frontend first.

Reuse existing components and preserve all verified Codex and Antigravity work.

Implement responsive behavior incrementally and test it.

Continue the original nine fullstack milestones after incorporating this requirement.

Do not stop at planning.

The final application must automatically adapt to desktop, laptop, tablet, and mobile screen sizes while preserving the approved Flower Lantern Spa design and functionality.

## Tiến độ phần độc lập 2026-11-10

- M3: concurrency lockout, audit entity/SQL columns + FK và API quyền đọc đã có test trên `FlowerLanternSpa_Test`. Migration 004 hoãn theo người dùng; vẫn chưa hoàn tất M3. Migration runner/checksum còn tiếp tục.
- M4: đã có API đọc lịch giường và lịch của tôi; tạo/đổi/hủy, locking khoảng dịch vụ và concurrency booking vẫn chưa triển khai.
- M6 sớm: `BrandLogo`, `CustomerHeader`, `ManagementSidebar`, tokens và responsive cho login/lịch quản lý/lịch khách. Nghiệm thu riêng bằng Playwright 9 viewport và screenshot desktop/mobile; không suy rộng thành UC1–10 hoàn tất.
- Tiếp theo: áp dụng shared sidebar cho UC3.4 khi xây dựng màn hình và API tìm khách; tiếp tục giao dịch booking sau khi chốt Q01/Q03. Không đổi chín milestone gốc, không áp dụng 004 khi chưa duyệt lại.


## SePay incident follow-up — 2026-11-14
- [x] Read-only Vercel trace + deployed OpenAPI verification; local acknowledgement/observability/cache/QR safeguards and read-only diagnostic CLI tested.
- [ ] Obtain exact SePay delivery HTTP status/response and URL/filter/auth evidence for13:53UTC+7.
- [ ] Read-only Neon evidence for LH33987572/reference FLSZAD2VKYC9C; no status writes.
- [ ] After evidence + separate approval only: isolate approved deployment/settings/replay or approved reconciliation decision. Expired/held events retain current policy. No new bank transfer.


## Customer Header correction — latest user override2026-11-14
- [x] CUSTOMER avatar toggles profile/appointments/logout dropdown; original routes/profile/auth flows retained; ADMIN branch unchanged.
- [x] UI-only Playwright9/9, frontend build/typecheck/lint/diff and Production source/bundle comparison.
- [ ] Only after separate approval: isolate Header patch from mixed local work and deploy to existing verified Production source; recheck authenticated live menu. No global fluid-scaling redesign in this scoped task.
