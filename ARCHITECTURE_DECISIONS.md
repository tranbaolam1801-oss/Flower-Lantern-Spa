# Quyết định kiến trúc

- ADR-001: Prompt.md là hướng dẫn triển khai chính; SRS 7.2 là baseline vật lý. SQL đề xuất và database cũ được audit, không ghi đè.
- ADR-002: Frontend/backend npm workspaces, API REST `/api`, Vite proxy cùng origin để chuẩn bị cookie HttpOnly. Mỗi lớp có build/typecheck riêng.
- ADR-003: Không tự đồng bộ schema; migration SQL có kiểm soát. Database Dev riêng. Không đổi hosting hoặc cấp tài nguyên cloud.
- ADR-004: Liveness độc lập readiness. SQL không sẵn sàng trả 503; không thay bằng dữ liệu giả hoặc mảng rỗng để che lỗi.
- ADR-005: Catalog public lọc theo BR-UC6-01 Hoạt động; tìm kiếm parameterized, escape LIKE, Vietnamese_100_CI_AS. Endpoint còn là foundation, chưa đủ UC_6/7.
- ADR-006: Chưa dựng auth tạm thời bằng tài khoản/mật khẩu mẫu. Form chỉ kiểm tra UI cho đến khi hoàn tất bảo mật/lockout SQL và kiểm thử.
- ADR-007: Windows integrated authentication chỉ cho localhost development; SQL authentication độc lập nền tảng vẫn có sẵn qua env. Không đưa mật khẩu Windows vào ứng dụng.
- ADR-008: Mọi payment provider sản xuất là SePay; mock chỉ trong test. Schema payment bổ sung phải được duyệt trước áp dụng.
- ADR-009 (thay ADR-006): Login dùng API thật Argon2id/JWT cookie. Secret cấu hình riêng ít nhất 32 bytes; HS256 issuer/audience cố định. Guard đọc quyền/trạng thái SQL hiện tại. SQL outage trả 503.
- ADR-010: Browser mutations cần `X-Spa-Request: 1` và origin hợp lệ. Webhook SePay tương lai phải xác thực riêng theo tài liệu chính thức; hiện chưa có endpoint webhook.
- ADR-011: E2E dùng cổng riêng 5183/3100, không dừng server đang mở. SQL integration fixture rollback; E2E tài khoản seed local opt-in, không tự seed.
- ADR-012: Repair mojibake seed theo exact corrupted value/ID trong transaction, không đổi hashes/schema. SQL UTF-8 luôn chạy `sqlcmd -f 65001`.

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

## ADR — phần độc lập sau khi hoãn migration 004 (2026-11-10)

- Không áp dụng migration 004 theo quyết định người dùng. Không thay schema để thực hiện các sửa UI.
- `BrandLogo` dùng nguyên PNG xuất từ group Figma `3:3233` (UC6); UC1 và UC5 dùng cùng đường dẫn local, `object-fit: contain`, giữ tỷ lệ ảnh. `CustomerHeader` và `ManagementSidebar` là component dùng chung. Không sửa SRS hay asset gốc.
- Các giá trị màu hiện có từ Figma UC1/UC2/UC5 tập trung trong `@theme` của `frontend/src/styles.css`; giữ riêng những biến thể màu thật của từng frame, không thay bằng một màu gần giống.
- Grid/Flex và breakpoint 1366/1024/700 hỗ trợ bố cục; bảng lịch cuộn nội bộ; native dialog cho menu mobile có Escape/focus return. Không scale toàn trang. Các UC chưa xây dựng phải áp dụng cùng quy ước khi triển khai.
- `DatabaseModule` dùng một DatabaseService chung. `/auth/me` trả profile đã được AuthGuard đọc mới từ SQL, tránh đọc trùng; không tin role/permissions cũ trong JWT.
- Playwright tạo khóa JWT ngẫu nhiên chỉ cho backend riêng trên cổng 3100; không sửa `.env`, không đưa secret vào Git. Test chờ phản hồi HTTP trước assertion điều hướng để phân biệt lỗi API với thời gian xử lý SQL/Argon2.
