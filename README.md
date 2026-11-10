# Flower Lantern Spa

Hệ thống đang phát triển theo milestone, **chưa hoàn tất UC_1–UC_10**. Đọc PROJECT_STATUS.md, TEST_REPORT.md và OPEN_QUESTIONS.md trước khi tiếp tục.

## Chạy local trên Windows

Yêu cầu Node.js >=22.12, npm, SQL Server local. Dùng `npm.cmd` nếu PowerShell chặn npm.ps1.

```powershell
npm.cmd ci
Copy-Item backend/.env.example backend/.env
npm.cmd run dev
```

Chỉ copy `.env` nếu chưa tồn tại. Mẫu dùng Windows Authentication tới `localhost`, database `FlowerLanternSpa_Dev`, ODBC Driver 17. Backend dùng quyền Windows của tiến trình; chỉ dùng chế độ này để phát triển local. Khi dùng SQL authentication, đặt DB_AUTH=sql và điền tài khoản quyền tối thiểu trong `.env` trên máy, không gửi vào chat/repository.

- UI đăng nhập: http://127.0.0.1:5173/dang-nhap (chỉ UI, chưa auth).
- Kiểm tra React → NestJS → SQL: http://127.0.0.1:5173/system.
- OpenAPI: http://127.0.0.1:3000/api/docs.

Database Dev đã được khởi tạo trong phiên 2026-11-10. Máy mới có thể chạy từ root C:\Spa:

```powershell
sqlcmd -S localhost -E -C -l 5 -b -f 65001 -i database/initialize-local.sql
sqlcmd -S localhost -E -C -l 5 -b -f 65001 -i database/verify-local.sql
```

Initialize từ chối database không trống. Không thay đổi hoặc xóa `FlowerLanternSpa_3NF`. Chưa có migration runner và backup/restore hoàn chỉnh.

## Kiểm thử

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
$env:PLAYWRIGHT_BROWSERS_PATH='C:/Spa/.playwright'
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

SQL integration opt-in (fixture tổng hợp được rollback):

```powershell
$env:RUN_SQL_INTEGRATION='1'
$env:DB_AUTH='windows'
$env:DB_HOST='localhost'
$env:DB_NAME='FlowerLanternSpa_Dev'
npm.cmd test
```

Không bật test này với database khách hàng. Test không mô phỏng giao dịch ngân hàng. SePay chưa được triển khai; chưa có callback public/tunnel hoặc giao dịch thật.

## Tài liệu

`docs/` giữ nguyên nguồn. `scripts/audit-sources.ps1` trích xuất paragraph/table và diagram vào `audit/extracted/` (ignored vì chứa tài liệu và thông tin gốc). `audit/FIGMA_FRAME_INVENTORY.md` ghi frame lấy từ live MCP. Đọc file trạng thái để tiếp tục công việc chưa hoàn tất.
