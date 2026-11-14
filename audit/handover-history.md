# Handover history (append-only)

- 2026-11-11: Khôi phục từ d857c77/main, giữ toàn bộ unfinished changes. Test read-only: 16 tables, 20 beds, chưa PhienDangNhap; Test-only approval có hiệu lực, Dev chưa duyệt. Tạo HANDOVER.md trước DDL. Historical tests 62/62 SQL, 7/7 E2E, không coi là lần chạy mới.
- 2026-11-11: Migration 004 applied once on Test after preflight alias fix; verification PASS baseline columns/counts preserved, 17 tables, 20 beds. Dev unchanged. Auth integration in progress.
- 2026-11-13 Auth: frontend-only abort/deadline/cache/revalidation/submit/cross-tab patch; local real-stack4roles PASS, Auth51/51 PASS, isolated before/after hydration hang verified. No Neon writes/Production deployment. See TEST_REPORT Auth reliability section.


2026-11-13: Local-only UC_7 category ID mismatch fixed and browser-verified against real public GET API (8 total; category counts4/1/0/2/1). Logo gray backdrop removed through native SVG render masks of unchanged originals + transparent scoped wrappers; responsive/logo/build/typecheck/lint/diff checks PASS. No backend/data/deploy/commit changes. See TEST_REPORT.md latest checkpoint.

2026-11-13: ServiceCard category fallback Spa replaced with existing ID/name mapping + API-name preference; labels and responsive checks PASS at8 widths using real public API; missing-ID fallback test PASS. Only ServiceCard/CSS presentation changed. Fresh guest homepage load issue observed separately and left untouched; see TEST_REPORT. No backend/data/commit/deploy.

2026-11-13: Brand text normalized to Flower Lantern Spa in28 locations/11 TSX files only; approved logo images and technical identifiers preserved. Static38-file scan,72 browser route/viewport checks, TypeScript/build, targeted ESLint and diff check PASS. Public catalog8+8 detail payloads contained no old brand aliases. No CSS/backend/data/commit/deploy changes.

2026-11-14 SePay checkpoint: read-only logs show579requests but0webhook deliveries06:45–07:00UTC around reported transfer; DB and SePay delivery state unverified. Local safe-ack guard/logging/no-store/QR-mode fixes,108payment tests and2browser scenarios PASS; both builds/lint PASS. Read-only diagnostic CLI + runbook added. No Production writes/replay/deploy/config changes. Resume with SePay history + read-only DB evidence; never mark paid from amount alone.

2026-11-14: CUSTOMER avatar now opens exactly3-item dropdown; source/CSS scoped, admin JSX/logout flow unchanged. Figma3:3222 inspected. UI-only Playwright9/9 PASS, frontend build/typecheck/lint/diff PASS; screenshots customer-menu-1366/375.png. Production dpl_73csXKwG6C3S8Z6Rm9oUV8kLmah6 still serves old branch despite same Git SHA metadata. No commit/push/deploy or backend/API/data changes. Isolate approved Header patch before any future deployment.
