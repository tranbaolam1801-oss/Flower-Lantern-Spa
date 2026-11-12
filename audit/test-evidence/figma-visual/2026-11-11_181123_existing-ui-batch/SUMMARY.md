# Test Evidence Summary — 2026-11-11_181123_existing-ui-batch

- **Thời gian chạy:** 2026-11-11T11:11:23.982Z (91.36s)
- **Phạm vi (`--scope`):** existing-ui-batch
- **Lệnh thực hiện:** `node node_modules/@playwright/test/cli.js test --config playwright.ui.config.ts --output C:\Spa\audit\test-evidence\figma-visual\2026-11-11_181123_existing-ui-batch\artifacts --reporter=list,html`
- **Timeout limit:** 90000ms (TIMED OUT)
- **Exit code:** 124
- **Kết quả:** 0 passed, 0 failed, 0 skipped
- **Lưu ý:** Đây là bằng chứng mới được sinh ở lần chạy này, không phải bản khôi phục của các lần chạy trước đã bị xóa.

## Thư mục lưu trữ
- HTML Report: `html-report/index.html`
- Playwright Artifacts / Traces / Videos: `artifacts/`
- Screenshots (5): `screenshots/booking-1440.png`, `screenshots/customer-login-1440.png`, `screenshots/my-bookings-1440.png`, `screenshots/service-detail-1440.png`, `screenshots/services-1440.png`

## Output log
```
[WebServer] 
[WebServer]   VITE v7.3.8  ready in 14733 ms
[WebServer] 
[WebServer]   ➜  Local:   http://127.0.0.1:5184/

Running 4 tests using 1 worker

[WebServer] 6:12:43 PM [vite] http proxy error: /api/auth/me
[WebServer] Error: connect ECONNREFUSED 127.0.0.1:3000
[WebServer]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:2083:16)
  x  1 tests\ui-coverage.spec.ts:46:3 › Frontend UI, Homepage & Public Routes (no DB mutation) › Homepage renders all required sections, green booking CTAs, English logo & responsive across 9 viewports (2.7s)
[WebServer] 6:12:48 PM [vite] http proxy error: /api/auth/me
[WebServer] Error: connect ECONNREFUSED 127.0.0.1:3000
[WebServer]     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:2083:16)
  ok 2 tests\ui-coverage.spec.ts:94:3 › Frontend UI, Homepage & Public Routes (no DB mutation) › Public catalog (/dich-vu), detail (/dich-vu/:id) and booking (/dat-lich) routes work with 08:00-22:00 hours (4.6s)

[evidence] ERROR: Timed out after 90000ms. Terminating process tree...
  ok 3 tests\ui-coverage.spec.ts:129:3 › Frontend UI, Homepage & Public Routes (no DB mutation) › Customer login (/dang-nhap) and personal bookings (/lich-hen-cua-toi) visual capture (3.0s)
```
