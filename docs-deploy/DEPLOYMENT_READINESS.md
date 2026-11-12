# DEPLOYMENT READINESS — cập nhật 2026-11-12

**TRẠNG THÁI: ĐÃ TRIỂN KHAI DEMO (Vercel Hobby + Neon Free) — https://flower-lantern-spa.vercel.app**
Kiểm chứng live: 47/47 API, 13/13 webhook giả lập, 11/11 trình duyệt Chromium, race đa kết nối thật PASS. Chi tiết: HANDOVER.md mục 0k, TEST_REPORT.md, `docs-deploy/VERCEL_NEON_DEPLOYMENT.md`.
Chưa kiểm chứng: Firefox/Safari, SePay thật, thanh toán thật, hiệu năng định lượng. Hobby = phi thương mại. Nội dung bên dưới là bản đánh giá Azure/SQL Server cũ (lịch sử, giữ để rollback).

---

# Deployment Readiness (chưa triển khai — chờ phê duyệt)

Trạng thái: **IMPLEMENTATION COMPLETE (mocked) — VERIFICATION BLOCKED**. Không có SQL thật, E2E hay thanh toán thật nào đã chạy.

## 1. Kiến trúc đề xuất (chưa chọn nhà cung cấp)
- Frontend: file tĩnh (`npm run build --workspace @spa/frontend` → `frontend/dist`), phục vụ qua CDN/static host hoặc reverse proxy.
- Backend: Node 22, `npm run build --workspace @spa/backend`, chạy `node backend/dist/main.js` sau reverse proxy HTTPS.
- **Frontend và Backend nên cùng một domain** (ví dụ `/api` proxy) để cookie HttpOnly + kiểm tra origin hoạt động; nếu khác domain phải cấu hình CORS/`COOKIE_SECURE`/SameSite có chủ đích.
- Webhook SePay cần URL HTTPS công khai: `POST https://<domain>/api/payments/sepay/webhook`.
- Thư mục upload (`UPLOAD_DIR`) cần volume bền vững, hoặc chuyển sang object storage (chưa code).
- Rate limit là bộ nhớ trong tiến trình → chỉ chính xác với **một instance**.

## 2. Kết nối SQL Server (không giả định máy local truy cập được)
Máy chủ cloud KHÔNG thấy SQL Server trên máy cá nhân. Chọn một:
1. SQL Server/Azure SQL do nhà cung cấp quản lý (khuyến nghị cho Staging) — cần tạo DB + login riêng, chạy migration theo `database/migrations/STAGING_MIGRATION_ORDER.md`.
2. Máy SQL riêng + VPN/private network; không mở cổng 1433 ra Internet.
Luôn dùng SQL login quyền tối thiểu (driver `tedious`), `encrypt=true`; không dùng `DB_TRUST_CERTIFICATE` ở production. Không sao chép tài khoản/hash từ Dev sang Staging.

## 3. Phân loại tồn đọng
| Mục | Code | Chạy thật | Môi trường | Cần duyệt | Bên ngoài |
|---|---|---|---|---|---|
| 27 SQL integration test | xong | cần | SQL login Test (script thủ công) | chạy script + cho phép runner | — |
| Migration 005/007/008 | đề xuất xong | cần | — | **có** | — |
| Seed 010/011 | đề xuất xong | cần | mật khẩu qua env | **có** | — |
| UC_2.3 E5a | banner + lỗi từng trường xong; thiếu Nguồn (cần 008), "+ Thêm khách" | chưa | — | quyết định 008 | — |
| UC_2.3 E5b | xong | chưa | — | — | — |
| SePay Test Mode | xong (mock) | chưa | URL HTTPS công khai | API key/secret khi cấu hình | SePay Dashboard |
| Hosting | — | — | chưa chọn | **có** | nhà cung cấp |
| `npm audit` backend | 3 moderate (glob/minimatch trong typeorm CLI) | — | — | nâng typeorm 1.x là breaking → cần duyệt | — |

## 4. Kiểm tra sức khỏe & sau triển khai
- `GET /api/health` (HealthController) phải 200 và báo DB.
- Đăng nhập, cookie có `Secure; HttpOnly`, tạo lịch (không trùng giường), ví dụ thanh toán test qua mock chỉ ở NODE_ENV test/development.
- `PAYMENT_MOCK_ENABLED` phải **không đặt** ở production.
- Webhook: gửi request không có/ sai API key → 401; gửi lại cùng transaction id → xử lý idempotent.

## 5. Sao lưu & khôi phục
- Trước mỗi migration: `BACKUP DATABASE <db> TO DISK=... WITH CHECKSUM` (hoặc snapshot của nhà cung cấp); ghi lại tên file.
- Khôi phục: `RESTORE DATABASE` từ bản sao lưu gần nhất; kiểm tra bằng bộ đếm bảng.
- Sao lưu định kỳ hằng ngày + giữ thư mục upload.

## 6. Rollback
- Ứng dụng: giữ bản build trước (`dist` có gắn phiên bản/commit); đổi lại bản trước và khởi động lại.
- Migration 005/007/008 đều **cộng thêm** (additive); rollback = giữ nguyên cột (code cũ bỏ qua) hoặc khôi phục từ backup; không xóa dữ liệu thanh toán.
- Nếu 007 chưa áp dụng, `/api/payments/*` trả 503 — an toàn.

## 7. Checklist bảo mật production
- `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY` đúng số hop, `HOST`.
- `JWT_SECRET` ≥ 32 byte ngẫu nhiên (backend từ chối khởi động nếu thiếu).
- Không đặt `DB_AUTH=windows` (bị chặn ở production), không `DB_TRUST_CERTIFICATE`.
- CORS chỉ domain frontend; rate limit bật; không đưa `.env` vào git.
- Đổi/loại bỏ mật khẩu mặc định trong `seeds/002-auth-baseline.sql`; không dùng tài khoản Dev.
