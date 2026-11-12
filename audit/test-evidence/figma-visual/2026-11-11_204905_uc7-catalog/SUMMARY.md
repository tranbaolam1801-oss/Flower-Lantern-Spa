# Test Evidence Summary — 2026-11-11_204905_uc7-catalog

- **Thời gian chạy:** 2026-11-11T13:49:05.440Z (67.40s)
- **Phạm vi (`--scope`):** uc7-catalog
- **Lệnh thực hiện:** `node node_modules/@playwright/test/cli.js test --config playwright.ui.config.ts --grep Public catalog --output C:\Spa\audit\test-evidence\figma-visual\2026-11-11_204905_uc7-catalog\artifacts --reporter=list,html`
- **Timeout limit:** 90000ms (completed within limit)
- **Exit code:** 1
- **Kết quả:** 0 passed, 1 failed, 0 skipped
- **Lưu ý:** Đây là bằng chứng mới được sinh ở lần chạy này, không phải bản khôi phục của các lần chạy trước đã bị xóa.

## Thư mục lưu trữ
- HTML Report: `html-report/index.html`
- Playwright Artifacts / Traces / Videos: `artifacts/`
- Screenshots (5): `screenshots/booking-1440.png`, `screenshots/customer-login-1440.png`, `screenshots/my-bookings-1440.png`, `screenshots/service-detail-1440.png`, `screenshots/services-1440.png`

## Output log
```
[WebServer] 
[WebServer]   VITE v7.3.8  ready in 4920 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5184/

Running 1 test using 1 worker

[WebServer] 8:49:59 PM [vite] http proxy error: /api/auth/me
[WebServer] Error: connect ECONNREFUSED 127.0.0.1:3000
[WebServer]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:2083:16)
  x  1 tests\ui-coverage.spec.ts:94:3 › Frontend UI, Homepage & Public Routes (no DB mutation) › Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours (35.9s)


  1) tests\ui-coverage.spec.ts:94:3 › Frontend UI, Homepage & Public Routes (no DB mutation) › Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours 

    Test timeout of 30000ms exceeded.

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByRole('link', { name: 'Xem chi tiết →' }).first()


      109 |     await page.screenshot({ path: 'test-results/services-1440.png', fullPage: true });
      110 |
    > 111 |     await page.getByRole('link', { name: 'Xem chi tiết →' }).first().click();
          |                                                                      ^
      112 |     await expect(page).toHaveURL(/\/dich-vu\/DV01$/);
      113 |     await expect(page.getByRole('heading', { name: 'Massage thư giãn toàn thân' })).toBeVisible();
      114 |     await expect(page.getByText('Gói 90 phút')).toBeVisible();
        at C:\Spa\tests\ui-coverage.spec.ts:111:70

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    audit\test-evidence\figma-visual\2026-11-11_204905_uc7-catalog\artifacts\ui-coverage-Frontend-UI-Ho-60bb8-work-with-08-00-22-00-hours\test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: audit\test-evidence\figma-visual\2026-11-11_204905_uc7-catalog\artifacts\ui-coverage-Frontend-UI-Ho-60bb8-work-with-08-00-22-00-hours\error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    audit\test-evidence\figma-visual\2026-11-11_204905_uc7-catalog\artifacts\ui-coverage-Frontend-UI-Ho-60bb8-work-with-08-00-22-00-hours\trace.zip
    Usage:

        npx playwright show-trace audit\test-evidence\figma-visual\2026-11-11_204905_uc7-catalog\artifacts\ui-coverage-Frontend-UI-Ho-60bb8-work-with-08-00-22-00-hours\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    tests\ui-coverage.spec.ts:94:3 › Frontend UI, Homepage & Public Routes (no DB mutation) › Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours
```
