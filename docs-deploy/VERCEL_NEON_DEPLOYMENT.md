# Triển khai Vercel (một project) + Neon PostgreSQL — demo học thuật 30 ngày

Trạng thái: **ĐÃ TRIỂN KHAI demo (2026-11-12): https://flower-lantern-spa.vercel.app — Neon `flower-lantern-spa` (Singapore) + Vercel Hobby một project + Blob private. Kết quả live: HANDOVER.md mục 0k.** Các bước ở mục 5 đã thực hiện theo duyệt của người dùng.
Bản SQL Server + Azure cũ được giữ nguyên để quay lại: git tag `sqlserver-baseline` (commit `d64bd92`), tài liệu Azure ở `docs-deploy/azure-archive/`, migration T-SQL ở `database/migrations/`.

## 1. Kiến trúc (một project, một domain)
```
https://<ten>.vercel.app
 ├─ /…            -> frontend/dist (React/Vite, SPA fallback về index.html)
 └─ /api/*        -> Vercel Function api/index.js  -> backend/dist/serverless.js (NestJS, một function)
                      ├─ Neon PostgreSQL (pooled URL, region aws-ap-southeast-1)
                      └─ Vercel Blob private store (ảnh dịch vụ)
```
- File cấu hình: `vercel.json` (gốc repo), `api/index.js`, `backend/src/serverless.ts`, `backend/src/bootstrap.ts`.
- Cùng một domain ⇒ frontend gọi `/api/...` tương đối, cookie HttpOnly `SameSite=Lax` hoạt động, **không còn vấn đề cookie bên thứ ba/Safari** của phương án Azure.
- Region function: `sin1` (Singapore), cùng vùng với Neon `aws-ap-southeast-1`.
- Đường dẫn API không đổi (`/api/...`).

## 2. Sự thật đã xác minh từ tài liệu chính thức (2026-11-12) — và những điểm CẦN BIẾT
| Chủ đề | Kết quả |
|---|---|
| NestJS trên Vercel | Hỗ trợ zero-config; project này dùng cách ổn định hơn: function Node `api/index.js` nạp bản build sẵn (`tsc`) để giữ metadata decorator. "Services" (một project nhiều dịch vụ) còn **Beta** nên không dùng. |
| Hobby: thời gian/bộ nhớ/kích thước | Tối đa 300 s, 2 GB RAM, bundle 250 MB, **body request/response 4.5 MB** (ảnh upload tối đa 2 MB — đủ), hạn mức 1 triệu lần gọi/tháng, 4 giờ CPU hoạt động. Vượt hạn mức phải chờ 30 ngày (không tự tính tiền). |
| **Hobby chỉ cho dùng phi thương mại** | Điều khoản: "Hobby teams are restricted to non-commercial personal use only"; ví dụ vi phạm có "any method of requesting or processing payment from visitors". **Demo học thuật không bán hàng thật: phù hợp. Chạy thật có thu tiền SePay: phải lên Pro.** |
| Neon Free | 1 GB/project, 100 CU-giờ/tháng, tự ngủ sau 5 phút (thức dậy vài trăm ms), không cần thẻ, có Singapore, có `btree_gist`. Trang Neon có ghi: project Free không hoạt động ≥ 90 ngày có thể bị xóa từ 05/10/2026 — demo 30 ngày không bị ảnh hưởng. |
| Neon pooler (PgBouncer, transaction mode) | Không hỗ trợ session-level advisory lock, `SET`, `PREPARE` SQL, bảng tạm. **Code chỉ dùng `FOR UPDATE`, `pg_advisory_xact_lock` (theo transaction) và `SET`-free** ⇒ an toàn qua pooler. Migration dùng URL trực tiếp (không `-pooler`). |
| Ảnh dịch vụ | **Vercel Blob (private store)**, Hobby: 1 GB, không cần thẻ; vượt hạn mức chỉ bị chặn, không tính tiền. Ảnh không có URL công khai; chỉ xem được qua `/api/uploads/services/<tên>` (kiểm tra tên + magic bytes khi tải lên). Trên Vercel nếu chưa nối Blob store thì tải ảnh trả 503 (không ghi vào đĩa tạm). |
| Webhook SePay & raw body | Nest `rawBody: true` đã bật. Tài liệu Vercel **không** xác nhận rõ raw body giữ nguyên từng byte ⇒ **phải test HMAC thật trên bản preview** (xem mục 6). Mặc định dùng xác thực `apikey` (không phụ thuộc raw body). |

## 3. Đã kiểm thử cục bộ (thực chạy, không phải suy đoán)
- ESLint 0 lỗi; TypeScript sạch; build backend + frontend PASS.
- Backend jest: **444 passed, 1 skipped, 0 failed**, trong đó các spec `*.pg.spec.ts` chạy trên PostgreSQL thật (PGlite, WASM): đặt lịch, trùng giường, khóa tài khoản, phiên đăng nhập, khách hàng, nhân viên, dịch vụ, đánh giá, báo cáo, thanh toán SePay (idempotency/replay/hoàn tiền), schema.
- `npm run e2e:local` (24 kiểm tra) chạy **đúng `api/index.js`** trên PostgreSQL thật: health, đăng nhập/đăng xuất, cookie HttpOnly, thu hồi phiên, danh mục dịch vụ, đặt lịch, trùng giường 409, ghép sát giờ, giường G16 bị từ chối, ngoài 08:00–22:00, quá khứ, 4 request đồng thời → đúng 1 thành công, hủy lịch, CSRF 403, webhook sai khóa.
- **Chưa kiểm chứng:** (a) khóa đồng thời THẬT nhiều kết nối (PGlite chạy tuần tự; test `booking-concurrency.pg.spec.ts` bị skip vì cần `PG_CONCURRENCY_URL`, chạy được trên một nhánh Neon tạm); (b) hành vi trên Vercel/Neon thật; (c) trình duyệt (Playwright/Safari); (d) HMAC webhook qua Vercel; (e) Blob thật.

## 4. Biến môi trường trên Vercel (Project → Settings → Environment Variables, Production)
| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (host có `-pooler`) |
| `JWT_SECRET` | chuỗi ngẫu nhiên ≥ 32 byte (tạo mới, không dùng lại) |
| `AUTH_SESSION_STORE` | `sql` |
| `FRONTEND_ORIGIN` | URL production chính xác, ví dụ `https://<ten>.vercel.app` (không `/` cuối) — backend so khớp header `Origin` |
| `TRUST_PROXY` | `1` |
| `BLOB_*` | tự thêm khi bạn tạo Blob store gắn với project (Storage → Blob → Create, **Private**) |
| `SEPAY_WEBHOOK_AUTH`, `SEPAY_API_KEY`, `SEPAY_ACCOUNT_NUMBER`, `SEPAY_BANK`, `SEPAY_ACCOUNT_HOLDER`, `SEPAY_PAYMENT_PREFIX`, `PAYMENT_EXPIRY_MINUTES` | chỉ khi cấu hình SePay (Test Mode); **không** đặt `PAYMENT_MOCK_ENABLED` |
`NODE_ENV=production` do Vercel tự đặt (cookie `Secure` bắt buộc, mock thanh toán tắt). Không đặt `DB_SSL`.

## 5. Các bước (mỗi bước ghi tài nguyên đều cần bạn phê duyệt)
1. Đăng nhập Neon: chạy `neon auth` (hoặc `neonctl auth`) rồi duyệt trên trình duyệt — Vercel và GitHub đã đăng nhập sẵn, dùng lại.
2. **[Phê duyệt]** Tạo project Neon Free: `neon projects create --name flower-lantern-spa --region-id aws-ap-southeast-1`.
3. **[Phê duyệt]** Áp schema bằng URL trực tiếp: `MIGRATION_DATABASE_URL=<direct> ALLOW_DB_WRITE=yes node scripts/pg-apply.mjs database/postgres/001-schema.sql --apply` (idempotent; tạo 19 bảng, 15 giường G1–G15, quyền Q01–Q06; không có tài khoản/mật khẩu mặc định).
4. **[Phê duyệt]** Dữ liệu mẫu: `…/002-demo-catalog.sql` (5 danh mục, 8 dịch vụ, 13 gói — **giá là giả định, bạn cần xác nhận**) và tài khoản demo `database/postgres/003-demo-accounts.mjs --apply` với 4 biến `SEED_PASSWORD_*` bạn tự đặt (mỗi mật khẩu ≥ 12 ký tự, khác nhau; không bao giờ qua chat).
5. **[Phê duyệt]** Tạo project Vercel từ repo GitHub (`vercel link`/Import), Framework Preset = Other, Root Directory = gốc repo; đặt biến môi trường (mục 4); tạo Blob store **Private**; region function lấy từ `vercel.json`.
6. Deploy preview → chạy kiểm thử (mục 6) → **[Phê duyệt]** promote lên production.

## 6. Kiểm thử sau khi deploy (trên URL thật)
`GET /api/health/live` → 200; `/api/health/ready` → 200 và `database:"postgres"`; đăng nhập → cookie; tạo lịch; trùng giường → 409; tải ảnh lên → xem lại được; webhook SePay giả (`curl` với `Authorization: Apikey …`): sai khóa 401, đúng khóa + lặp lại cùng `id` chỉ xử lý một lần (xem `docs-deploy/SEPAY_WEBHOOK_TEST_PLAN.md`). Nếu dùng HMAC: gửi một payload ký đúng và xác nhận được chấp nhận (nếu không, đặt `NODEJS_HELPERS=0`). Chạy `PG_CONCURRENCY_URL=<nhánh Neon tạm> npm test -- booking-concurrency` một lần để xác nhận khóa đồng thời thật.

## 7. Dọn dẹp sau 30 ngày
`vercel remove <project> --yes`; xóa Blob store; `neon projects delete <id>`; thu hồi token Neon/Vercel nếu đã tạo; xóa biến/secret trên GitHub.
