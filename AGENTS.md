AGENTS.md — FLOWER LANTERN SPA
Project mission
Build a locally runnable, production-oriented Flower Lantern Spa booking and management system from the approved SRS, Figma designs, diagrams, and SQL Server schema. Complete and test the fullstack system locally before selecting a hosting provider.
Read before making changes

1. Read PROJECT_STATUS.md and IMPLEMENTATION_PLAN.md if present, then inspect Git status and existing code. Continue existing verified work rather than rebuilding it.
2. Read the master prompt (MASTER_PROMPT.md if present) and relevant original source documents under references/ before implementing any related feature.
3. Create and maintain PROJECT_STATUS.md, IMPLEMENTATION_PLAN.md, TRACEABILITY_MATRIX.md, OPEN_QUESTIONS.md, and TEST_REPORT.md as necessary. An absent file is not evidence the work is done.
4. Map every feature to UC / business rules / Figma frames / API endpoints / SQL tables / tests. Keep the original Vietnamese UI texts and business rules where specified.
   Locked technology

- Frontend: React, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui customized to match Figma, TanStack Query, React Hook Form, Zod.
- Backend: NestJS, TypeScript, REST, OpenAPI/Swagger, DTO validation, role- and permission-based authorization.
- Database: Microsoft SQL Server, TypeORM with mssql, T-SQL migrations, approved 15-table baseline, seed 20 fixed beds.
- Authentication: secure HttpOnly cookie-based session/token approach, JWT as specified by master prompt, Argon2 password hashing; never expose secrets in frontend.
- Payment: SePay only and a test-only MockPaymentProvider; PaymentProvider abstraction may allow future providers, but do not implement payOS now.
- Test: Jest, Supertest, Playwright, SQL Server integration tests, booking concurrency tests, payment webhook verification tests.
- Deployment: NOT SELECTED. Never provision cloud resources, deploy, or commit to a hosting provider without explicit user approval.
  Source-of-truth rules
- SRS governs UC_1–UC_10, detailed flows and exceptions, validation messages, permissions, and approved database fields/relationships.
- Read all pages and relevant embedded diagrams/tables; do not rely on a title or first-page excerpt.
- Imported live Figma frames accessed through Figma MCP govern visual reproduction. The .fig backup or a thumbnail alone does not prove accurate layer access. If inaccessible, record this in OPEN_QUESTIONS.md and continue independently verifiable work without fabricating designs.
- UI kit and supplied images supplement actual Figma design; preserve approved assets and do not stretch them.
- Draw.io BPMN, UCD, Class and Activity Diagrams and screen flow are used for cross-checking.
- Resolve contradictions by documenting source references and impact, not by silently inventing decisions.
- Do not silently change approved 15-table design. Propose additive payment/integration migrations and obtain approval before applying them.
  Feature acceptance criteria
  A feature is complete only when: (1) real React UI works and matches accessible Figma, (2) NestJS APIs work, (3) data persists in real SQL Server, (4) authorization/validation is enforced, (5) main/alternate/exception flows work, and (6) relevant tests actually passed. Keep mock data/providers confined to explicitly marked tests; never claim simulation is real bank settlement.
  Booking correctness
- Exactly 20 fixed service beds as described in SRS.
- No overlapping reservation for the same bed over actual complete service intervals. Use database transactions with concurrency-safe constraints/locking or isolation strategy; frontend-only availability checks are insufficient.
- Booking status and payment status must remain separate. Handle cancellations and completed appointments according to SRS; preserve historical records where required.
  SePay requirements
- Backend computes payable amount from authoritative SQL records; produce unique payment reference and amount-specific QR.
- Only authenticated, verified SePay incoming-payment notifications can confirm a payment. Verify SePay's documented current authentication mechanism; do NOT invent signatures or undocumented API fields.
- Validate reference, amount, receiving account, provider transaction ID, status, expiry, and idempotency. Make state changes atomic in SQL Server, with safe duplicate/retry handling.
- Handle underpayment, overpayment, unknown reference, replay, expired payment, and refund via documented reconciliation rules.
- SePay Test Mode and mock provider first; real transfer tests require user approval. A public HTTPS callback/tunnel is required for remote webhook testing against local Backend.
- Never write credentials, OTP, bank passwords, token values, secret logs, or real customer personal data into the repository. Supply .env.example without secrets.
  Implementation discipline
- Work in small, independently testable milestones; do not attempt entire fullstack project in one change.
- Preserve existing source code and Git history. Do not overwrite approved docs, Figma file, assets, or existing working features unnecessarily.
- After every milestone: run appropriate lint/typecheck/build/tests; record actual commands and results in TEST_REPORT.md; update PROJECT_STATUS.md and traceability; note blockers and the exact next step; make a Git commit only after verified changes and when appropriate.
- At start of each new session: read status and plan before editing; continue from the latest verified milestone.
- Never claim a test passed without executing it; never claim pixel-perfect UI from an inaccessible Figma design.
- Before destructive SQL, production credential changes, paid operations, or financial transactions, obtain explicit user approval.
- Communicate progress and explanations in Vietnamese; preserve exact technical identifiers and source-defined UI wording.
