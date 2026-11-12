# Test Evidence Summary — 2026-11-11_205312_uc7-catalog-followup

- **Thời gian chạy:** 2026-11-11T13:53:12.589Z (29.27s)
- **Phạm vi (`--scope`):** uc7-catalog-followup
- **Lệnh thực hiện:** `node node_modules/@playwright/test/cli.js test --config playwright.ui.config.ts --grep Public catalog --output C:\Spa\audit\test-evidence\figma-visual\2026-11-11_205312_uc7-catalog-followup\artifacts --reporter=list,html`
- **Timeout limit:** 90000ms (completed within limit)
- **Exit code:** 0
- **Kết quả:** 1 passed, 0 failed, 0 skipped
- **Lưu ý:** Đây là bằng chứng mới được sinh ở lần chạy này, không phải bản khôi phục của các lần chạy trước đã bị xóa.

## Thư mục lưu trữ
- HTML Report: `html-report/index.html`
- Playwright Artifacts / Traces / Videos: `artifacts/`
- Screenshots (5): `screenshots/booking-1440.png`, `screenshots/customer-login-1440.png`, `screenshots/my-bookings-1440.png`, `screenshots/service-detail-1440.png`, `screenshots/services-1440.png`

## Output log
```
[WebServer] 
[WebServer]   VITE v7.3.8  ready in 4702 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5184/

Running 1 test using 1 worker

[WebServer] 8:53:36 PM [vite] http proxy error: /api/auth/me
[WebServer] Error: connect ECONNREFUSED 127.0.0.1:3000
[WebServer]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:2083:16)
  ok 1 tests\ui-coverage.spec.ts:94:3 › Frontend UI, Homepage & Public Routes (no DB mutation) › Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours (15.5s)

  1 passed (26.5s)
```
