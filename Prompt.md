PROJECT ROOT: C:\Spa

All original documents and design assets are located
inside the docs/ directory and its subdirectories.

Read AGENTS.md before executing this prompt.

Use this Prompt.md as the primary implementation
instruction. The other planning documents are
supplementary references.

If instructions conflict, prioritize:

1. Approved SRS and business rules.
2. Actual Figma design and approved UI standards.
3. This Prompt.md.
4. Supporting planning documents.

Preserve existing working code.
Do not restart completed work.

MASTER PROMPT — FLOWER LANTERN SPA FULLSTACK DEVELOPMENT
You are a senior full-stack architect, React developer, NestJS backend engineer, Microsoft SQL Server engineer, payment integration engineer, and QA automation engineer.
Your mission is to build a COMPLETE, fully integrated, locally executable Flower Lantern Spa booking and management system.
DO NOT select a deployment provider yet.
The system must be fully implemented and tested locally before any cloud deployment decision.

1. READ ALL EXISTING PROJECT MATERIALS FIRST
   Read and analyze ALL files provided in the project, including:
   50K141.04.3007(1).docx — SRS, business rules, UI specifications, database descriptions.
   50K141.04.3007.fig — Figma design backup.
   BO_QUY_CHUAN_TRUOC_FIGMA(1).docx — approved UI design system.
   BPMN_UCD_CLASS(1).drawio — business workflow, Use Cases, class design.
   Luồng giao diện(1).drawio — screen navigation flows.
   Sơ đồ AD(1).drawio — activity diagrams.
   HoaSen_TrangTri_TuMauDuyet(1).png — original lotus illustration.
   nen.png — original decorative background.
   Also inspect all existing source files, SQL scripts, assets and Figma links.
   Use Figma MCP to access the actual design file, frames, layers, typography, sizing, colors, components, variants and prototypes.
   If the .fig file cannot be read directly, request an accessible imported Figma link. Do not guess designs from thumbnails.
   Read all relevant document content, embedded tables, diagrams, images and screen specifications.
   Create a traceability matrix mapping:
   UC → Business Rules → UI Frames → Routes → API Endpoints → Database Tables → Tests.
   Identify contradictions between documents and preserve them in OPEN_QUESTIONS.md.
   Do not silently replace requirements.
2. LOCKED TECH STACK
   Frontend:
   React + TypeScript + Vite
   Tailwind CSS
   shadcn/ui
   React Router
   TanStack Query
   React Hook Form + Zod
   Backend:
   NestJS + TypeScript
   REST API
   TypeORM + Microsoft SQL Server driver
   DTO validation
   Swagger/OpenAPI
   JWT authentication with secure HttpOnly cookies
   Argon2 password hashing
   RBAC and fine-grained permissions
   Database:
   Microsoft SQL Server
   Use the approved 15-table design as baseline.
   Version-controlled SQL migrations.
   SQL Server-compatible T-SQL.
   No automatic production schema synchronization.
   Payment:
   PaymentProvider abstraction.
   MockPaymentProvider for development.
   SePay integration as preferred provider.
   Webhook verification and reconciliation.
   QR payments in Vietnamese dong.
   Testing:
   Jest
   Supertest
   Playwright
   Database integration tests
   Development:
   Local-first.
   Docker Compose where practical.
   Environment variables and .env.example files.
   Deployment-independent architecture.
3. FULL FUNCTIONAL SCOPE
   Implement all requirements of UC_1 through UC_10.
   UC_1: Authentication
   UC_2: Booking management
   UC_3: Customer management
   UC_4: Review management
   UC_5: Personal booking management
   UC_6: View services
   UC_7: Search services
   UC_8: Employee management and permissions
   UC_9: Service management
   UC_10: Reports
   Support customer, staff, manager and spa owner privileges according to the SRS.
   Implement all documented:
   Main flows.
   Alternative flows.
   Exception flows.
   Business rules.
   Validation messages.
   Empty states.
   Loading states.
   Success and error feedback.
   Role-specific navigation.
   Booking and payment status transitions.
   Do not invent new business functionality that conflicts with the approved SRS.
4. FIGMA PIXEL-FIDELITY REQUIREMENTS
   The frontend must faithfully reproduce the supplied Figma designs.
   Preserve:
   Layout and spacing.
   Fonts, typography, sizes and weights.
   Brand colors and visual hierarchy.
   Original SVG, PNG and other assets.
   Sidebar, header and navigation.
   Forms and field alignment.
   Tables, calendars and scheduling grids.
   Drawers, dialogs and modals.
   Icons and button states.
   Vietnamese interface labels.
   Customer-facing decorative imagery.
   Use the approved design tokens as a fallback only where Figma is incomplete.
   Build reusable components without compromising visual fidelity.
   Implement all screens represented by Figma, including exception and alternate states.
   Compare screenshots of the actual running website with the corresponding Figma frames at their original viewport sizes.
   Iterate until material visual differences are resolved.
   Never use whole-screen screenshots as a substitute for functional HTML/CSS components.
5. DATABASE IMPLEMENTATION
   Create and validate the existing 15 SQL Server tables:
   TaiKhoan
   Quyen
   TaiKhoanQuyen
   LichSuPhanQuyen
   KhachHang
   NhanVien
   DanhMuc
   DichVu
   GoiDichVu
   LichHen
   Giuong
   KhachSuDungDichVu
   ThanhToan
   DanhGia
   PhanHoi
   Preserve approved column names, relationships and constraints.
   Implement:
   Primary keys.
   Foreign keys.
   Unique constraints.
   Check constraints.
   Defaults.
   Appropriate indexes.
   Database migrations.
   Seed data.
   Backup and restore instructions.
   Prepare exactly 20 fixed spa beds according to the SRS.
   Enforce the booking rule that one bed cannot serve overlapping customers during the same service interval.
   Do not rely on frontend availability checks alone.
   Use database transactions and concurrency-safe locking/validation for bookings.
   Create tests that demonstrate that simultaneous conflicting requests cannot reserve the same bed.
   Keep payment status separate from booking status.
   Review any conflicts in the SRS before enforcing disputed status values.

## 6. CONTINUOUS FULLSTACK DEVELOPMENT AND CONTEXT RECOVERY

You must build the complete Flower Lantern Spa system incrementally, preserving all verified work across coding sessions.

Do not attempt to implement every Use Case in a single coding session.

### Project tracking

Create and maintain these files:

- IMPLEMENTATION_PLAN.md
- PROJECT_STATUS.md
- TRACEABILITY_MATRIX.md
- OPEN_QUESTIONS.md
- TEST_REPORT.md
- ARCHITECTURE_DECISIONS.md

At the beginning of every coding session:

1. Read PROJECT_STATUS.md.
2. Read IMPLEMENTATION_PLAN.md.
3. Inspect the existing repository and recent Git history.
4. Identify the next incomplete milestone.
5. Continue from the latest verified state without restarting completed work.

### Implementation milestones

Milestone 1: Audit the SRS, Figma, UML diagrams and existing codebase.

Milestone 2: Initialize the React frontend, NestJS backend and SQL Server development environment.

Milestone 3: Implement and test the approved 15-table SQL Server schema, migrations, authentication and role-based permissions.

Milestone 4: Implement booking management, including transaction-safe prevention of overlapping bed reservations.

Milestone 5: Implement all remaining business modules for UC_1 through UC_10.

Milestone 6: Integrate all Figma screens with real backend APIs and SQL Server data.

Milestone 7: Implement the SePay payment integration.

Milestone 8: Perform complete functional, integration, end-to-end, concurrency, security and visual testing.

Milestone 9: Finalize local setup documentation, backup instructions and deployment-readiness assessment.

### Payment integration — SePay only

Use SePay as the selected payment provider.

Implement:

- PaymentProvider abstraction.
- MockPaymentProvider for automated tests.
- SePayProvider for SePay integration.
- Dynamic VietQR with correct VND amount.
- Unique payment references.
- Verified SePay webhook processing.
- Transaction idempotency.
- Atomic SQL Server updates.
- Automatic frontend payment-status refresh.
- Handling of duplicate, invalid, delayed, missing, partial and excess payments.

Use the official, current SePay API documentation.

Do not guess API endpoints, authentication mechanisms, webhook signatures or response fields.

Use SePay Test Mode before any live integration.

Never mark a payment successful based only on a frontend action, QR display or browser redirect.

Do not perform real financial transactions without explicit approval.

### Database requirements

Preserve the original 15 SQL Server tables as the approved baseline.

If additional payment-related fields or tables are needed:

1. Document the missing information.
2. Propose additive schema migrations.
3. Explain their relationships to the original schema.
4. Obtain approval before altering the approved database structure.

Do not delete or rename existing database columns without authorization.

### Functional completion rules

A feature is complete only when:

1. Its UI matches the accessible Figma reference.
2. Its frontend connects to the real NestJS API.
3. Its backend reads or writes the actual SQL Server database.
4. Validation and permissions work correctly.
5. Main, alternative and exception flows are implemented.
6. Relevant tests have been executed successfully.
7. The traceability matrix and project status have been updated.

Mocks are allowed only in explicitly identified testing environments.

### Progress preservation

After every verified milestone:

1. Run the relevant tests.
2. Fix detected defects.
3. Update PROJECT_STATUS.md.
4. Update TRACEABILITY_MATRIX.md.
5. Record unresolved issues.
6. Save exact commands needed to continue.
7. Commit verified changes to Git when appropriate.
8. Continue with the next milestone while the current session has sufficient context.

If execution is interrupted, preserve the latest completed state whenever possible.

Never claim that work continued automatically after the session stopped.

### Figma requirements

Use Figma MCP to inspect the actual design.

If Figma MCP is unavailable:

- Document the access problem.
- Continue implementing independent backend and database tasks.
- Do not invent inaccessible Figma layouts.
- Do not claim pixel-perfect visual completion.

### Deployment restrictions

DO NOT choose a production deployment provider yet.

DO NOT create paid cloud resources.

DO NOT deploy the application before all required local tests are completed.

Keep the architecture portable across supported hosting environments.

### Final acceptance criteria

The project may be reported as complete only when:

- All documented UC_1–UC_10 functions are implemented.
- Frontend, Backend and SQL Server work together.
- The approved database schema and migrations are validated.
- Booking concurrency is handled safely.
- SePay Test Mode payment integration is verified.
- All accessible Figma screens have been implemented and visually checked.
- Authentication, authorization and validation tests pass.
- End-to-end tests cover critical business flows.
- Local startup and database restoration procedures are documented.

Do not stop at a project plan.

Implement the actual system incrementally and continue from the latest verified milestone.

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
