# Báo cáo kiểm thử (TEST_REPORT)

## Triển khai live Vercel + Neon (2026-11-12) — kết quả chạy thật trên https://flower-lantern-spa.vercel.app
| Bộ kiểm thử | Kết quả |
|---|---|
| `node scripts/e2e-live.mjs` (API + bảo mật + RBAC + race + ảnh) | **47/47 PASS** |
| `node scripts/e2e-live-webhook.mjs` (SePay giả lập, key hợp lệ/sai, replay, payload lỗi) | **13/13 PASS** (một kỳ vọng sai của script về payload lỗi đã được sửa theo thiết kế: ghi INVALID_PAYLOAD + trả 200) |
| `node scripts/e2e-live-browser.cjs` (Chromium headless: UI login, cookie, reload, deep link, mobile) | **11/11 PASS** |
| Race đa kết nối thật trên Neon (`booking-concurrency.pg.spec.ts`, nhánh tạm) | **PASS** direct + pooled (đã sửa lỗi fixture của chính test, không phải lỗi ứng dụng) |
| Health live/ready | 200 / 200 `database:postgres` |
- **NOT VERIFIED:** Firefox, Safari; đăng ký khách hàng công khai (không có endpoint); HMAC webhook; SePay thật/thanh toán thật; đo hiệu năng và cold start định lượng.
- Dữ liệu kiểm thử đã xóa khỏi Neon; chỉ còn dữ liệu demo (5/8/13 danh mục/dịch vụ/gói, 4 tài khoản demo).

## Chuyển PostgreSQL + Vercel (2026-11-12) — kết quả chạy thật
| Lệnh | Kết quả |
|---|---|
| `npm run lint` | PASS 0 lỗi |
| `npx tsc --noEmit` (backend) | PASS |
| `npm run build` (backend + frontend) | PASS |
| `npm test -w backend` (jest, `--experimental-vm-modules`) | 33 suite passed + 1 skipped; **444 passed, 1 skipped, 0 failed** |
| `npm run e2e:local` | **24/24 PASS** — chạy đúng `api/index.js` trên PostgreSQL thật (PGlite): đăng nhập/đăng xuất + cookie HttpOnly, thu hồi phiên, đặt lịch, trùng giường 409, giường G16, ngoài giờ, quá khứ, 4 request đồng thời → 1 thành công, hủy lịch, CSRF, webhook sai khóa |
| Seed PG (chạy trên PGlite, 2 lần) | catalog 5/8/13 không trùng khi chạy lại; 4 tài khoản demo tạo 1 lần, lần 2 bỏ qua; hash Argon2id xác minh đúng/sai |
- **SKIPPED (không tính PASS):** `booking-concurrency.pg.spec.ts` (8 request đồng thời thật) — cần `PG_CONCURRENCY_URL` tới PostgreSQL nhiều kết nối.
- **NOT VERIFIED:** Vercel/Neon/Blob thật, trình duyệt (Playwright/Firefox/Safari), HMAC webhook qua Vercel, hiệu năng/cold start.
- Các test SQL Server cũ (`*.sql.integration.spec.ts`, 27 test bị chặn) đã được thay bằng spec PostgreSQL chạy thật; không còn bị chặn bởi Smart App Control (PGlite là WASM).

## Đợt sẵn sàng triển khai (2026-11-12)
(tiếp, cùng ngày) lint PASS; tsc PASS; jest 298 pass/27 skip (BLOCKED)/0 fail; backend+frontend build PASS. Sửa thêm lỗi URL ảnh dịch vụ tương đối (3 nơi render). Chưa chạy `.github/workflows/backend-docker.yml` (chưa push GitHub), chưa `docker build` cục bộ, chưa deploy Azure.

lint PASS; tsc PASS; jest 295 pass/27 skip (BLOCKED)/0 fail; backend+frontend build PASS. Thêm 16 test (timeout/retry kết nối DB Azure SQL, cookie SameSite liên miền). Chưa `docker build`, chưa deploy Azure (không có Docker cục bộ).

lint PASS; backend tsc PASS; jest 282 pass/27 skip (BLOCKED)/0 fail; frontend build PASS (entry 630,275→481,282 byte nhờ lazy route); `npm audit --omit=dev`: frontend 0, backend 3 moderate. SQL integration, Playwright E2E, kiểm tra hình so Figma: NOT VERIFIED.

## Phiên khắc phục BLOCKED — kết quả thực tế (2026-11-12)

Không chạy SQL ghi/migration/seed; `RUN_SQL_INTEGRATION` không đặt; tất cả test dùng DatabaseService/HTTP giả lập. Chạy độc lập sau khi ba agent báo cáo (không dựa vào số liệu tự báo của agent):

| Lệnh | Kết quả |
|---|---|
| `npm run lint` (gốc) | PASS: 0 lỗi |
| `npx tsc --noEmit` (backend) | PASS |
| `npm run build` (backend) | PASS |
| `jest --runInBand` (backend, SQL integration tắt) | 15 suite passed + 6 skipped; **281 passed**, 27 skipped (BLOCKED), 0 failed. Tăng từ 250: +31 (uploads/HTTP double, rate limit, cookie flags, booking search/booker/notes, customer phone sync, employees) |
| `npm run build --workspace @spa/frontend` | PASS (chỉ cảnh báo kích thước bundle) |
| Kiểm tra chỉ-đọc database | Test: 17 bảng, DichVu 0, TaiKhoan 0, chưa có `LichHen.NguonDatLich`, chưa có login `spa_test_runner`. Dev: 16 bảng, 5 tài khoản. Không đổi so với trước phiên |
| Quét bí mật trong file mới/sửa | Không phát hiện giá trị bí mật; `backend/uploads/` đã được `.gitignore` |

- **BLOCKED (chưa đổi):** 27 SQL integration test (Smart App Control chặn `msnodesqlv8.node`; chờ người dùng chạy script SQL login rồi cho phép `scripts/run-sql-integration.ps1`).
- **NOT VERIFIED:** mọi hành vi mới trên SQL Server thật (câu SQL COALESCE/CASE của PATCH booking, tìm kiếm 8 bộ lọc, đồng bộ `TaiKhoan.SoDienThoai`), upload thật ra đĩa/proxy, cookie `Secure` sau proxy HTTPS, giao diện so Figma bằng hình cho các màn mới sửa, E2E.
- Script/đề xuất chưa thực thi và chưa parse-check bằng server: `database/seeds/PROPOSED-010-sample-catalog.sql`, `PROPOSED-011-test-accounts.mjs` (chỉ `node --check` + dry-run mặc định, không kết nối DB), `database/migrations/staging/*`, `scripts/run-sql-integration.ps1`.

## Phase 2 Backend — kết quả thực tế (2026-11-12)

Không chạy SQL ghi/migration/seed; `RUN_SQL_INTEGRATION` không được đặt. Mọi test dưới đây dùng `DatabaseService` mock.

| Lệnh (thư mục) | Kết quả |
|---|---|
| `npx tsc --noEmit` (backend) | PASS (không lỗi) |
| `npm.cmd run build` (backend, `tsc -p tsconfig.build.json`) | PASS |
| `npx jest --runInBand` (backend, SQL integration không bật) | PASS: 11 suite passed, 6 suite skipped (SQL integration); 153 test passed, 27 skipped, 0 failed |
| `npx jest --runInBand` (toàn bộ, sau tích hợp SePay + `PaymentsModule` + miễn CSRF webhook; SQL integration không bật) | PASS: 12 suite passed, 6 skipped; 229 test passed, 27 skipped (BLOCKED, xem dưới), 0 failed. Gồm `payments` 69 test và 3 test HTTP mới trong `app.spec.ts` (403 giữ nguyên cho mọi POST không có header; chỉ đúng `POST /api/payments/sepay/webhook` được miễn CSRF và vẫn bị từ chối khi thiếu xác thực; đường gần giống/phương thức khác vẫn 403) |
| **Lần chạy độc lập cuối (sau rà soát bảo mật + sửa)**: `npm run lint`, `npx tsc --noEmit`, `jest --runInBand`, `npm run build` (backend), `npm run build --workspace @spa/frontend` | lint PASS (0 lỗi); tsc PASS; jest 12 suite passed + 6 skipped, **250 passed**, 27 skipped (BLOCKED), 0 failed; cả hai build PASS. Test DB sau đó: vẫn 17 bảng, chưa có `SePayWebhookEvent`/`ThanhToanHoanTien` (007 chưa áp dụng) |
| `npx jest --runInBand src/reviews` sau khi nối `PhanHoi.NgayPhanHoi` (cột có/vắng/NULL) | PASS: 14 test; `tsc --noEmit` PASS |
| `npm.cmd run build --workspace @spa/frontend` | PASS (chỉ còn cảnh báo kích thước bundle có sẵn) |

Test theo module (do từng agent chạy, báo cáo trước khi tích hợp; tổng hợp ở lần chạy đầy đủ ở trên): bookings-write 20, customers+reviews 20, employees 18, admin-services+reports 41, `common/phone` helper mới.

- **PASS:** validation, quy tắc giờ/quá khứ/giường/khóa `Hoàn thành`, bảng chuyển trạng thái, quyền, SĐT chuẩn hóa `+84`→`0`, PATCH dịch vụ upsert-only, báo cáo — ở mức logic với DB mock.
- **Migration 006 (người dùng duyệt, chỉ Test):** đã áp dụng trên `FlowerLanternSpa_Test` bằng `sqlcmd` (exit 0). Preflight: 17 bảng, 20 giường, `PhanHoi` 0 dòng, chưa có cột. Sau áp dụng: `NgayPhanHoi datetime2 NULL DEFAULT sysutcdatetime()`, vẫn 17 bảng/20 giường/0 dòng; `FlowerLanternSpa_Dev` kiểm tra read-only: chưa có cột (không bị đụng). 005 vẫn PROPOSED, chưa áp dụng.
- **Phân loại đúng:** 153 unit test (mock) PASS; **27 SQL integration test BLOCKED** (6 suite) vì driver native không load được — KHÔNG phải lỗi assertion của backend. Jest báo chúng là "failed" chỉ vì lỗi load trước khi assertion nào chạy.
- **BLOCKED — SQL integration (người dùng duyệt chạy trên Test):** `RUN_SQL_INTEGRATION=1 DB_AUTH=windows DB_HOST=localhost DB_NAME=FlowerLanternSpa_Test npx jest --runInBand`. Nguyên nhân duy nhất quan sát được: "An Application Control policy has blocked this file. `C:\Spa\node_modules\msnodesqlv8\prebuilds\win32-x64\msnodesqlv8.node`" (ném ở `src/config.ts:13`). Xác minh thêm: `node -e "require('msnodesqlv8')"` cũng bị chặn → chặn theo file ở mọi tiến trình (kể cả dev server khi `DB_AUTH=windows`), không riêng jest. Không đổi/bỏ qua chính sách bảo mật máy. Các lần chạy trước đây (62/62) xảy ra khi driver còn được phép.
- **Điều tra kết nối (chỉ đọc):** xác thực hiện tại = Windows Integrated (`DB_AUTH=windows`, ODBC Driver 17 `Trusted_Connection=Yes` qua addon native `msnodesqlv8`). SQL Server 2022 (16.0.1000.6) ở Mixed Mode (`IsIntegratedSecurityOnly=0`), TCP 1433 đang nghe. `backend/src/config.ts` đã có nhánh SQL-login dùng driver JS thuần `tedious` (mssql 12.7.14 + tedious 20.3.8 đã cài, không cần đổi dependency); tất cả 5 spec integration và `DatabaseService` đều đi qua `databaseOptions(process.env)` nên không cần sửa code. `tedious` không làm được Windows SSPI theo tài khoản hiện tại (chỉ SQL login hoặc NTLM kèm mật khẩu), nên cần một SQL login → đổi cách xác thực, chờ người dùng duyệt (xem HANDOVER.md).
- **Chuẩn bị mở chặn (chưa thực thi):** Smart App Control BẬT (người dùng xác nhận, không tắt). Script `database/setup/001-test-sql-login.MANUAL.sql` tạo SQL login quyền tối thiểu cho `FlowerLanternSpa_Test` để dùng `tedious`; chờ người dùng tự chạy trong SSMS rồi cho phép chạy lại 27 test. Phát hiện trước khi chạy lại: audit schema sẽ lệch ở `PhanHoi` sau migration 006 → đã bổ sung cột nullable `NgayPhanHoi` vào entity (chưa chạy lại test; `tsc` sẽ kiểm tra ở lần chạy kế tiếp).
- **NOT VERIFIED:** hành vi thật trên SQL Server (khóa UPDLOCK qua HTTP, ràng buộc unique, truy vấn báo cáo, transaction), E2E React↔NestJS↔SQL, Playwright, kiểm thử tải/concurrency qua API.
- **BLOCKED:** SQL integration chờ duyệt ghi vào `FlowerLanternSpa_Test`; migration 005/006 chờ duyệt; SePay chưa bắt đầu (cần đề xuất migration thanh toán).
- Đối chiếu route frontend↔backend: tất cả khớp, trừ `payments/sepay/intent` và `payments/:id/status` (chưa có).

## Cập nhật Frontend UI & Evidence Guard (2026-11-11)

- **Frontend `typecheck` / `lint` / `build`:** Thực thi sau lần chỉnh sửa cả Customer UI và Admin/Management UI (`npm.cmd run typecheck -w frontend`, `npm.cmd run lint`, `npm.cmd run build -w frontend`) — ghi nhận kết quả thực tế ở lần chạy cuối (`task-797` và kiểm tra sau chỉnh Admin UI).
- **Visual Verification:** **PENDING** — Chưa xác nhận hoàn tất trực quan vì chưa chụp được ảnh trình duyệt mới để đối chiếu với Figma gốc.
- **Playwright UI / E2E (`BLOCKED` trong sandbox hiện tại):**
  - Đã thiết lập cơ chế lưu bằng chứng chống ghi đè tại `scripts/run-playwright-evidence.mjs` và `playwright.ui.config.ts` (lưu theo run folder riêng trong `audit/test-evidence/figma-customer-ui/` với streaming output, hard timeout `taskkill /T /F` và `SUMMARY.md`).
  - Lần chạy `task-720` (`playwright.config.ts`) và `task-765` (`playwright.ui.config.ts`, smoke test `Customer login`) đều lên được Vite (`127.0.0.1:5184` ready sau 1.27s) nhưng bị treo ở bước thực thi Chromium trong sandbox và đã bị dừng lại để tránh kẹt vòng lặp (đã kiểm tra 0 tiến trình `node`/`chrome` còn chạy).
  - Bằng chứng screenshot cũ trong `test-results/` đã bị xóa ở lần chạy đầu của Playwright trước khi bị hủy (đã ghi chi tiết trong `HANDOVER.md`). Mọi bằng chứng chụp mới sau này sẽ lưu tách biệt tại `audit/test-evidence/`, không coi là ảnh cũ khôi phục.
- **SQL Integration Tests:** Không chạy theo chỉ thị hiện tại (giữ nguyên Backend/DB).

## Phiên khôi phục 2026-11-10 (kết quả mới; phần bên dưới là lịch sử)

### Trước sửa

- `npm.cmd run typecheck`: PASS, exit 0.
- `npm.cmd run lint`: PASS, exit 0.
- `npm.cmd test`: 22 PASS, 4 SQL skipped, exit 0. Tests không bắt được lỗi thiếu AuthProvider trên trình duyệt.
- `sqlcmd -b -I -S localhost -E -d FlowerLanternSpa_Dev -Q ...`: truy vấn chỉ đọc. Sandbox ban đầu lỗi Windows credentials; chạy ngoài sandbox thành công. Xác nhận 16 bảng, 20 giường, số bản ghi 5/6/3/1/13 và filtered indexes. Không chạy lại seed/migration.

### Sau nối Auth và sửa bảo mật

- `npm.cmd test`: 30 PASS, 6 SQL skipped, exit 0 (trước khi thêm 9 test RBAC).
- `$env:RUN_SQL_INTEGRATION='1'; $env:DB_AUTH='windows'; $env:DB_HOST='localhost'; $env:DB_NAME='FlowerLanternSpa_Dev'; npm.cmd test`: **36/36 PASS**, 5 suites, exit 0. Gồm 4 catalog SQL tests và 2 Auth SQL tests; Argon2id/JWT thật, SQL thật.
- Auth SQL: login/me, khóa tài khoản vô hiệu request có cookie cũ; 5 lần sai dẫn tới khóa 15 phút, từ chối mật khẩu đúng khi còn khóa, cho phép sau expiry, reset count. Fixtures `AUTHSQL001`, `TESTCAT` rollback; read-only kiểm tra số còn lại bằng 0. TaiKhoan vẫn 5, KhoaDangNhap 0.
- HTTP security: CSRF header/origin, whitelist DTO, HttpOnly/SameSite, JWT issuer/audience/algorithm, thiếu secret, invalid/expired token, quyền mới từ SQL, SQL outage 503, logout clear cookie. Đây là contract tests với SQL double, không được tính là SQL integration.
- Build tạm thời trong lúc nối provider thất bại do thiếu trường context; đã sửa. `npm.cmd run build` sau sửa PASS, exit 0. Có warning annotation từ Zod, không phải build error.

### Playwright và lỗi seed phát hiện được

- Lần đầu bị chiếm cổng 5173; chuyển E2E sang cổng riêng 5183/3100, không dừng server cũ.
- Lần kế tiếp 3 PASS / 4 FAIL: cả bốn role login trả 403. Truy vấn chỉ đọc xác nhận mojibake trong VaiTro/TrangThai do seed cũ thiếu UTF-8 codepage.
- Đã đọc/rà `database/repairs/001-auth-seed-utf8.sql`, chạy `sqlcmd -b -I -f 65001 -S localhost -E -d FlowerLanternSpa_Dev -i database/repairs/001-auth-seed-utf8.sql`: PASS exit 0. Chỉ sửa exact corrupted values của seed trong transaction; không đổi hashes/schema/IDs và không rerun seed.
- Lệnh E2E: đặt `PLAYWRIGHT_BROWSERS_PATH=C:/Spa/.playwright`, `RUN_AUTH_E2E=1`, `E2E_DEV_PASSWORD` lấy từ fixture development đã có, rồi `npm.cmd run test:e2e`. Không ghi giá trị mật khẩu vào báo cáo.
- Sau repair: **7/7 PASS**, exit 0, 19.2s. Bốn vai trò đăng nhập thật qua UI/API/SQL, reload giữ phiên, route ngăn nhầm vai trò, logout xóa HttpOnly cookie, route sau logout quay về login. Ba ca nền tảng validation/password visibility/assets/React liveness PASS.
- Screenshot login 1440 và 390 nằm trong test-results (ignored); đã xem ảnh desktop. Đây không phải nghiệm thu pixel-perfect tất cả Figma screens.

### Chưa chứng minh

Concurrency lockout nhiều connection; thu hồi token bị sao chép sau logout; dashboard Figma; mọi UC chưa triển khai; concurrency booking; SePay; backup/restore. Không dùng các PASS trên để đánh dấu M3 hoặc toàn dự án hoàn tất.

### Kiểm tra cuối lát cắt phục hồi

- `npm.cmd run typecheck`: PASS exit 0.
- `npm.cmd run lint`: PASS exit 0.
- `npm.cmd run build`: PASS exit 0 (warning annotation Zod như trên).
- `npm.cmd test`: **39 PASS, 6 SQL skipped**, 4 suites PASS, exit 0. Thêm 9 kiểm thử RolesGuard: staff/manager có quyền, thiếu quyền, khách có quyền gán nhầm, unauthenticated, Chủ Spa và Quản trị không được coi đồng nghĩa.
- Sáu SQL tests đã chạy thành công ở lần opt-in 36/36 phía trên; không cộng 6 skipped của lần cuối thành PASS mới.
- Hai dashboard bổ sung thông báo lỗi logout sau lần E2E 7/7; typecheck/lint/build pass sau thay đổi này. Chưa có test browser nhánh mất mạng khi logout.

Cập nhật: 2026-11-10 (Asia/Bangkok)

## Môi trường kiểm thử

- Hệ điều hành: Windows 10 Pro (x64)
- Node.js: >=22.12.0
- Cơ sở dữ liệu: Microsoft SQL Server 2022 Enterprise Evaluation (Localhost, Database: `FlowerLanternSpa_Dev`)
- Framework kiểm thử: Jest 30.2, Supertest 7.1, Playwright 1.56.1

---

## Kết quả kiểm thử thực tế

### 1. Typecheck (TypeScript)

- **Lệnh thực hiện**: `npm.cmd run typecheck`
- **Kết quả**: `PASS` (Mã thoát: 0)
- **Phạm vi**: Cả hai workspaces `backend` và `frontend` không có lỗi cú pháp hoặc typing.

### 2. Linting (ESLint)

- **Lệnh thực hiện**: `npm.cmd run lint`
- **Kết quả**: `PASS` (Mã thoát: 0)
- **Phạm vi**: `backend/src`, `frontend/src`, `tests`.

### 3. Build Workspaces

- **Lệnh thực hiện**: `npm.cmd run build`
- **Kết quả**: `PASS` (Mã thoát: 0)
- **Chi tiết**:
  - `@spa/backend`: biên dịch `tsc -p tsconfig.build.json` ra `dist/` thành công.
  - `@spa/frontend`: Vite build sinh bundle `dist/` với tài nguyên font Inter, CSS, hình ảnh đầy đủ.

### 4. Unit / API Contract Tests (Backend)

- **Lệnh thực hiện**: `npm.cmd test -w backend`
- **Kết quả**: `PASS` (15 passed, 4 skipped, 0 failed)
- **Các ca kiểm thử**:
  - Liveness không giả định database sẵn sàng: `PASS`
  - Readiness fail-closed khi SQL ngắt kết nối (HTTP 503): `PASS`
  - Readiness thăm dò SQL thật: `PASS`
  - Chặn các query không hợp lệ (limit=51, page=-1, page=1.5, param injection): `PASS`
  - Parameter binding và lọc trạng thái 'Hoạt động': `PASS`
  - Thông báo không tìm thấy dịch vụ theo chuẩn SRS: `PASS`
  - Trả về thông tin dịch vụ và gói không lộ dữ liệu tài khoản: `PASS`
  - Bất biến cấu hình: không âm thầm dùng fake data, chặn đồng bộ schema tự động, chặn port sai, escape metacharacters LIKE: `PASS`

### 5. Real SQL Server Integration Tests

- **Lệnh thực hiện**: `$env:RUN_SQL_INTEGRATION='1'; $env:DB_AUTH='windows'; $env:DB_HOST='localhost'; $env:DB_NAME='FlowerLanternSpa_Dev'; npm.cmd test -w backend`
- **Kết quả**: `PASS` (19/19 passed, 2/2 test suites)
- **Các ca kiểm thử với SQL Server thật (`FlowerLanternSpa_Dev`)**:
  - Lọc dịch vụ hoạt động và tìm kiếm không phân biệt hoa thường theo bảng mã `Vietnamese_100_CI_AS`: `PASS`
  - Đọc giá gói và thời lượng chuẩn từ SQL Server: `PASS`
  - Không lộ chi tiết dịch vụ ngừng hoạt động (HTTP 404): `PASS`
  - Chống SQL injection và xử lý ký tự đại diện (`%`, `_`, `[`) an toàn: `PASS`
  - Giao dịch cô lập (Transaction rollback): Toàn bộ dữ liệu kiểm thử được rollback sạch sẽ, không ảnh hưởng dữ liệu baseline.

---

### 6. Filtered Unique Indexes & Persistent Lockout Constraints Tests

- **Lệnh thực hiện**: `sqlcmd -S localhost -E -d FlowerLanternSpa_Dev -i database/test-003-constraints.sql`
- **Kết quả**: `PASS` (5/5 ca kiểm thử đạt 100%)
- **Chi tiết các ca kiểm thử**:
  - `1. Multiple NULL MaTaiKhoan in KhachHang`: Cho phép nhiều khách offline vãng lai có `MaTaiKhoan = NULL` không bị vi phạm index: `PASS`
  - `2. Duplicate non-null MaTaiKhoan in KhachHang`: Chặn chính xác khi gán tài khoản trùng cho hai khách hàng khác nhau (bắt lỗi 2601/2627): `PASS`
  - `3. Multiple NULL MaTaiKhoan in NhanVien`: Cho phép nhiều nhân viên chưa cấp tài khoản có `MaTaiKhoan = NULL`: `PASS`
  - `4. Duplicate non-null MaTaiKhoan in NhanVien`: Chặn chính xác khi gán tài khoản trùng cho hai nhân viên khác nhau: `PASS`
  - `5. KhoaDangNhap PK Constraint`: Bảng `KhoaDangNhap` ghi nhận chính xác khóa chính `SoDienThoai` và chặn trùng khóa: `PASS`
- **An toàn giao dịch**: Toàn bộ script bọc trong outer `TRY/CATCH` với `ROLLBACK TRANSACTION`, bảo đảm số lượng bản ghi dư thừa sau test là 0.

---

## Trạng thái kiểm tra cơ sở dữ liệu

- Bảng vật lý trong `FlowerLanternSpa_Dev`: Đủ 15 bảng theo chuẩn SRS 7.2 + 1 bảng kỹ thuật `KhoaDangNhap` (tổng 16 bảng).
- Giường cố định: Đủ 20 giường `G1` đến `G20` theo seed `001-beds.sql`.
- Backup cơ sở dữ liệu: `C:\Spa\database\FlowerLanternSpa_Dev_pre_003.bak` đã tạo và xác minh an toàn.
- Tính lũy biến (idempotence): Script migration 003 và seed giường có thể chạy lại an toàn mà không sinh lỗi.
-

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

## Kết quả mới nhất — phần độc lập sau khi hoãn 004 (2026-11-10)

- `npm.cmd run typecheck`: PASS exit 0.
- `npm.cmd run lint`: PASS exit 0 sau sửa UI/shared DatabaseModule/tests.
- `npm.cmd run build`: PASS exit 0 sau tập trung tokens; 202 modules. Warning annotation từ Zod vẫn còn, không làm build lỗi.
- `$env:RUN_SQL_INTEGRATION='1'; $env:DB_AUTH='windows'; $env:DB_HOST='localhost'; $env:DB_NAME='FlowerLanternSpa_Test'; npm.cmd test`: **56/56 PASS, 9 suites**, exit 0, 63.122s. Database Test riêng, không dùng Dev cho integration fixture. Gồm lockout song song 12 requests, tồn tại qua instance mới, expiry/reset; audit 16 entity columns/PK/FK; đọc lịch có quyền/không quyền, ownership khách, ngày không hợp lệ, 20 giường ngày trống và khoảng giờ dịch vụ. Không phải test concurrency tạo lịch.
- `PLAYWRIGHT_BROWSERS_PATH=C:/Spa/.playwright`, `RUN_AUTH_E2E=1`, `E2E_DEV_PASSWORD` lấy từ seed phát triển đã có; `npm.cmd run test:e2e`: **7/7 PASS**, 40.7s, exit 0. Login/reload/role boundary/logout cho 4 vai trò. Không seed lại dữ liệu.
- `tests/responsive.ts` chạy resize liên tiếp 1920×1080, 1600×900, 1440×900, 1366×768, 1280×720, 1024×768, 768×1024, 390×844, 360×800 trên login, management và customer: không tràn ngang toàn trang; cùng asset logo/tỷ lệ; menu dialog nằm trong viewport, Escape đóng và trả focus. Tổng 27 tổ hợp màn/viewport trong 7 tests, không phải 27 tests độc lập.
- Screenshot: `test-results/{login,customer,management}-{1440,390,360}.png`; đã xem trực quan customer-390, management-1440, login-360. Chưa pixel-diff tự động toàn bộ Figma hoặc dữ liệu lịch dày đặc. Các nút nghiệp vụ chưa triển khai vẫn disabled.
- Lần E2E trước sửa: 3 PASS/4 FAIL do JWT_SECRET backend kiểm thử không đạt 32 bytes; lần sau 3 PASS/4 FAIL do assertion URL 5s chạy khi request SQL/Argon2 còn pending. Sửa harness dùng khóa ngẫu nhiên riêng cho E2E và chờ response HTTP thực tế trước assertion; không hạ yêu cầu bảo mật hoặc sửa `.env`. Lần cuối 7/7 PASS ghi trên.
- Migration 004 không áp dụng theo người dùng. Các PASS này không chứng minh thu hồi token sau logout, UC3.4, booking create/update/cancel, SePay hoặc toàn bộ M3–M9.
-

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
