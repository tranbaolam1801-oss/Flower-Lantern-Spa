# CODEX MASTER PROMPT — FLOWER LANTERN SPA FULLSTACK + SEPAY

You are the senior architect, full-stack engineer, SQL Server engineer, payment integration engineer, and QA lead for the Flower Lantern Spa project. Build the **complete locally running system**, but **do not choose or deploy to any hosting provider yet**.

## Authoritative documents
Read `FlowerLanternSpa_FULLSTACK_SEPAY_PLAN.md` completely, then ALL files inside `references/`:
- `50K141.04.3007(1).docx`
- `50K141.04.3007.fig`
- `BO_QUY_CHUAN_TRUOC_FIGMA(1).docx`
- `BPMN_UCD_CLASS(1).drawio`
- `Luồng giao diện(1).drawio`
- `Sơ đồ AD(1).drawio`
- `HoaSen_TrangTri_TuMauDuyet(1).png`
- `nen.png`
Read the full SRS incl. 10 UC groups / 35 detailed use cases, all exception flows, physical database specification for 15 tables, screen specification, relevant tables/images. Parse all diagrams/pages. Audit source conflicts and write `docs/OPEN_QUESTIONS.md`; do not fabricate missing requirements.

## Figma MCP is required
The `.fig` is a native Figma project: if not already imported, ask the user to import it to their Figma account and supply a working Figma URL. Do not misrepresent a `.fig` thumbnail as the actual design context. Verify accessible Figma MCP tool and inspect a real frame before implementing its UI. Do not overwrite original Figma. Record inaccessible frames as blockers while working on independent modules.

FIGMA_URL: [PASTE_FIGMA_FILE_LINK_HERE]

## Locked stack
Frontend: React + TypeScript + Vite + Tailwind CSS (customized to Figma) + shadcn/ui + React Router + TanStack Query + React Hook Form + Zod.
Backend: NestJS + TypeScript + REST API + Swagger + DTO validation + security headers/rate limits + JWT/HttpOnly secure-cookie auth + RBAC/permissions + Argon2.
Database: Microsoft SQL Server local + TypeORM `mssql` + versioned migrations/SQL scripts, `synchronize=false` in production. Seed exactly 20 beds and realistic clearly marked demo data.
Payment provider: **SePay** ONLY, via a modular payment adapter + a local mock SePay implementation for automated testing. No payOS integration.
Tests: Jest/Supertest, SQL integration and Playwright E2E; Figma visual comparison at source frame sizes.
Deploy: UNDECIDED. Do not provision, deploy, upgrade, bill, or commit to any hosting vendor.

## Plan and execute in stages
0. Audit and inventory all source documents, Figma frames/routes, class/AD/BPMN/UCD diagrams, business rules, DB columns, and all UI variants. Produce `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/FRAME_INVENTORY.md`, `docs/DB_SCHEMA_AUDIT.md`, `docs/OPEN_QUESTIONS.md`.
1. Create mono-repo `frontend/`, `backend/`, `database/`, `references/`, `docs/`, local configuration, lint/typecheck/test commands.
2. Implement SQL Server DDL/migrations faithfully for the 15 approved tables and all PK/FK/constraints/indexes/seeds. Before changing the approved schema, create a reviewed migration proposal if payment/webhooks require extra tables or fields. Do not ignore source contradictions.
3. Implement full real Backend NestJS modules and REST endpoints for UC_1–UC_10, correct RBAC, account lockout, customer/employee/service CRUD, bookings, reviews, reports and payment. Preserve Vietnamese messages exactly as in SRS.
4. Implement all Figma customer/admin frames as real responsive React UI; routes, form states, drawer/modal/dialog, calendar with 20 beds; integrate with real API and SQL Server. Match assets, fonts, colors, spacing, alignment; do not substitute entire screenshot for UI.
5. Implement SePay QR flow and verified webhook handling as below.
6. Run all tests and real local app; compare screenshots against Figma, fix differences, produce `docs/TEST_REPORT.md` and `docs/UC_COVERAGE.md`. Do not claim tests passed without running them. Record blockers and exact reproduction steps.

## Payment flow and safety (critical)
- Server, never browser, computes the payable amount from the selected service package/booking and database records.
- Generate unique opaque payment reference per payment attempt, amount and expiry; create dynamic QR for the configured receiving bank account; show QR, exact amount and transfer reference in UI.
- `Create QR` or a user click NEVER marks a booking paid. A browser return URL, screenshot or manual click NEVER proves money was received.
- Register a SePay webhook endpoint with verified authentication (prefer HMAC-SHA256 if available/configured; otherwise verified API key as per official documentation). Use constant-time comparison where appropriate.
- Validate incoming money direction, receiving account, reference, currency/amount, provider transaction ID, payment attempt status and booking mapping. Use database transactions, unique constraints and idempotent processing keyed by the provider transaction ID.
- Webhook retries/duplicates must not double-credit. Underpayment, overpayment, unmatched reference, expired payments or refunded transactions require defined reconciliation/review rather than false automatic success. Keep payment status independent of booking status.
- Backend returns payment status to frontend; frontend polls/revalidates (or uses Socket.IO) to update to `Đã thanh toán` only when database reflects verified payment.
- Keep a test-only mock webhook/provider and automated cases for verified payment, invalid auth, replay, duplicate, wrong reference/amount, and concurrent notifications. Never report mock payment as a real bank transfer.
- Production SePay webhooks need a public HTTPS callback URL; for testing on localhost, optionally use an approved temporary tunnel such as ngrok, and only with the user's approval. This is not choosing production hosting.
- Do not ask the user to paste passwords, API keys, bank credentials or OTP into chat or source. Document which fields must go into `.env` locally, provide `.env.example`, never expose secrets client-side.
- Verify API payload, auth signature, response status and retry behavior from current official SePay docs; do not invent endpoints or protocols.

## Conflict handling / business invariants
- Preserve 15 baseline SRS tables; propose additive payment tracking changes in a migration plan rather than silently modifying source schema.
- SRS inconsistencies (e.g., `TrangThaiThanhToan` partial payment, booking initial states) must be documented and resolved explicitly before affected code is finalized.
- Exactly 20 fixed beds; prevent overlapping time intervals for one bed through server-side SQL Server transaction/concurrency isolation, not just frontend checks or CHECK constraints. Test simultaneous requests.
- Preserve role-specific navigation, no out-of-scope features; cancel must not silently save; correct validation and empty/error/loading UI.

## Finish criteria
Deliver complete project runnable locally with actual Frontend→Backend→SQL Server connection, seed/migration scripts, API docs, verified mock SePay E2E coverage and, if the user connects their SePay account and permits public dev callback, optional real webhook smoke test. Supply precise Windows setup/start commands, reports of pass/fail and blockers. A real payment confirmation is only claimed after a confirmed provider webhook + verified bank payment, never after simulation.

IMPORTANT: Act proactively on tasks with enough information, pause only for genuinely necessary credentials/account ownership, Figma access, conflict approval, or actions that could incur charges. Do not deploy anything. Start by verifying Figma MCP and auditing the SRS before writing code.
