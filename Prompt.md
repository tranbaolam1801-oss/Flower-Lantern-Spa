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
