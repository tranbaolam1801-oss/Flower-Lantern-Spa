# Triển khai Azure miễn phí — demo 30 ngày (CHƯA TRIỂN KHAI)

Kiến trúc đã chọn: **Azure Static Web Apps Free** (frontend) + **Azure App Service F1** (backend, container) + **Azure SQL Database free tier** (database). Mục tiêu: demo 30 ngày, 0 đồng, không cần đảm bảo độ tin cậy production.

Trạng thái: chỉ chuẩn bị cấu hình/audit. **Không có tài nguyên Azure nào được tạo, không migration/seed nào được chạy, không thanh toán thật nào được khởi tạo.**

---

## 0. Các việc đã làm (code, đã kiểm thử mock — hai phiên)
- Audit 8 migration (001–008): không dùng tính năng Azure SQL không hỗ trợ (không `USE`, không SQL Server Agent, không CLR, không linked server, không FILESTREAM). **Tương thích.**
- `DB_CONNECT_TIMEOUT_MS` / `DB_REQUEST_TIMEOUT_MS` (mặc định 5000ms, giữ hành vi cũ nếu không đặt) — cần tăng cho Azure SQL serverless.
- `DB_CONNECT_RETRIES` / `DB_CONNECT_RETRY_DELAY_MS` (mặc định 0 lần — giữ hành vi cũ) — thử lại khi database đang tự thức dậy.
- `msnodesqlv8` chuyển sang `optionalDependencies` — driver này chỉ dùng khi `DB_AUTH=windows` (không chạy trên Azure), nên không được để làm hỏng `npm install`/build Docker trên Linux nếu phần native không dựng được.
- `COOKIE_SAMESITE=none` + `cookiePartitioned` (CHIPS, `Partitioned` attribute) — opt-in theo cặp, mặc định vẫn `lax`/không-partitioned. **Bắt buộc phải đặt `COOKIE_SAMESITE=none`** vì Static Web Apps và App Service là hai domain khác nhau; cookie `SameSite=Lax` cũ không gửi kèm `fetch`/`XHR` liên miền. `Partitioned` chỉ cải thiện tương thích Firefox/Chrome, tự động theo `COOKIE_SAMESITE=none`, không cần biến riêng.
- **Phát hiện và sửa:** toàn bộ frontend gọi `/api/...` tương đối — vỡ hoàn toàn khi frontend/backend khác domain (không liên quan CORS/cookie, chỉ là sai URL). Thêm `VITE_API_BASE_URL` + `API_BASE_URL`/`resolveApiUrl()` trong `frontend/src/lib/api-client.ts`, áp dụng cho **mọi** điểm gọi API trực tiếp (login/me/logout, hủy lịch, tìm khách hàng, upload & hiển thị ảnh dịch vụ ở `service-card.tsx`/`service-detail.tsx`/`admin-services.tsx`, health check) — rà lại toàn bộ `src/**/*.tsx` để không bỏ sót điểm nào.
- `backend/Dockerfile`, `.dockerignore` (gốc) — build backend thành container cho App Service for Containers. **Chưa `docker build` được trên máy này (không có Docker)** — đã viết `.github/workflows/backend-docker.yml` để build+smoke-test trên GitHub-hosted runner thay thế (xem mục 4b); **workflow này cũng chưa chạy lần nào** vì chưa được đẩy lên GitHub.
- Test mới: `database.service.spec.ts`, `config.spec.ts`, mở rộng `cookie-flags.spec.ts` — tổng 298 pass + 27 skip (BLOCKED, SQL integration) + 0 fail. Lint/tsc/build backend+frontend đều PASS.
- Tài liệu mới: `docs-deploy/azure.env.example`, `scripts/azure-deploy.sh` (az CLI, chưa chạy), `database/AZURE_MIGRATION_APPROVAL_CHECKLIST.md`, `docs-deploy/SEPAY_WEBHOOK_TEST_PLAN.md`, `docs-deploy/AZURE_BILLING_ELIGIBILITY_CHECK.md`.

## 1. Vùng Azure
Khuyến nghị **Southeast Asia (Singapore)**. Theo tài liệu Microsoft hiện hành (đã kiểm tra lại qua Microsoft Learn thay vì chỉ dựa vào trí nhớ):
- App Service F1 và Static Web Apps Free: có ở gần như mọi vùng, bao gồm Southeast Asia.
- Azure SQL Database free tier: trang chính thức **không công bố danh sách vùng bị loại trừ** cho gói free tier này (khác với Azure SQL *Managed Instance* free offer, vốn có danh sách vùng riêng và không gồm Việt Nam/Singapore theo kiểu đó). Không có bằng chứng Southeast Asia bị loại, nhưng cũng không có xác nhận rõ ràng.
- **Việc cần bạn làm:** vào Azure Portal, chọn "Create SQL Database" → vùng Southeast Asia → nếu tùy chọn "Free tier" không hiện ra, đổi sang một vùng khác đã được xác nhận rộng rãi còn nhiều dung lượng (ví dụ East US). Việc chọn vùng là bước tạo tài nguyên thật — **tôi sẽ không tự làm, cần bạn thực hiện và cho tôi biết vùng cuối cùng** để tôi khớp các cấu hình CORS/latency.

## 2. Giới hạn free tier thật (đã xác minh qua Microsoft Learn — ngày tài liệu 2026-10-30/2026-11)
| Dịch vụ | Giới hạn |
|---|---|
| App Service F1 | 60 phút CPU/ngày, 1 GB RAM, 1 GB lưu trữ. Vượt → trả 403 cho mọi request đến khi reset vào nửa đêm UTC. |
| App Service F1 — Always On | **Không hỗ trợ** (cần tối thiểu Basic). Không có Always On → app bị "unload" sau 20 phút không có request; request kế tiếp phải khởi động lại (cold start). |
| Azure SQL free tier | 100.000 vCore-giây + 32 GB lưu trữ dữ liệu + 32 GB backup, **mỗi tháng**, không tích lũy. Tự tạm dừng sau **15 phút không hoạt động** (cố định, không đổi được). Thời gian thức dậy sau tạm dừng: Microsoft không công bố số cụ thể — cần đo thực tế. Tối đa 10 database free/subscription. |
| Static Web Apps Free | 100 GB băng thông/tháng, 250 MB lưu trữ/môi trường, 2 domain tùy chỉnh. |

### Hệ quả quan trọng: cold-start CHỒNG cold-start
Vì F1 không có Always On, backend **và** database **đều** có thể đang "ngủ" cùng lúc sau một khoảng không hoạt động. Request đầu tiên sau một lúc im lặng có thể phải: App Service thức dậy (vài trăm ms đến vài chục giây, theo đo đạc không chính thức) **rồi** chờ Azure SQL thức dậy (chưa có số chính thức, nên giả định tệ nhất vài chục giây). Đây **mâu thuẫn trực tiếp với mục tiêu "tương tác liền, không delay"** mà bạn đã nêu ở các câu hỏi trước — cần bạn biết rõ trước khi triển khai: với 100% miễn phí trên Azure, **không thể đảm bảo luôn luôn nhanh**; chỉ nhanh khi đang có người dùng gần đây.

Giảm nhẹ (đã code, cần bạn đặt giá trị khi deploy):
- `DB_CONNECT_TIMEOUT_MS=30000`, `DB_CONNECT_RETRIES=3`, `DB_CONNECT_RETRY_DELAY_MS=5000` trên App Service.
- Không có cách giảm nhẹ cold-start của App Service F1 chính nó khi không có Always On (đặc tính của gói Free).

## 3. Tương thích SQL Server → Azure SQL (đã audit, không chạy)
Không cần đổi bất kỳ câu SQL nào. `DB_TRUST_CERTIFICATE` không cần đặt (Azure SQL dùng chứng chỉ TLS hợp lệ công khai, `trustServerCertificate` giữ `false` mặc định là đúng). Connection string cần:
```
DB_HOST=<ten-server>.database.windows.net
DB_PORT=1433
DB_NAME=<ten-database>
DB_USER=<sql-login>
DB_PASSWORD=<secret>
DB_CONNECT_TIMEOUT_MS=30000
DB_CONNECT_RETRIES=3
DB_CONNECT_RETRY_DELAY_MS=5000
```
`DB_AUTH` để trống (không đặt `windows`) — bắt buộc, vì `config.ts` tự chặn `DB_AUTH=windows` khi `NODE_ENV=production`.

Thứ tự migration trên database Azure SQL mới (rỗng), sau khi bạn phê duyệt riêng từng bước:
1. `001-srs-baseline.sql` (bắt buộc, 15 bảng gốc).
2. `002-business-indexes.sql`.
3. `003-auth-lockout.sql`.
4. `004-auth-sessions.sql` — sửa guard `DB_NAME() <> 'FlowerLanternSpa_Test'` thành tên database Azure thật trước khi chạy (script hiện chỉ cho phép Test).
5. `005`, `006`, `007` PROPOSED — cùng cần sửa guard theo tên database Azure thật.
6. `008` (soạn từ `PROPOSED-008-booking-source-prepaid.md`) nếu bạn muốn trường "Nguồn đặt lịch".
Mẫu guard nhiều-database đã có sẵn ở `database/migrations/staging/*.PROPOSED.sql` (biến `@AllowedDb`) — dùng lại mẫu đó, chỉ đổi giá trị cho phép.

## 4. Docker vs native — đã chọn Docker, vì sao
Đã xác minh (Microsoft Learn, hướng dẫn container chính thức, trích nguyên văn bước chọn F1 ngay trong flow tạo Web App for Containers): **App Service F1 CÓ hỗ trợ container tùy chỉnh** — không cần Basic trở lên như tôi từng nói nhầm ở một bản ghi nhớ cũ. Chọn Docker vì:
- Dự án là npm workspace (`backend`+`frontend` chung root `package.json`); cơ chế build sẵn (Oryx) của App Service không hiểu workspace, dễ build sai.
- Docker cho toàn quyền kiểm soát image, tránh rủi ro build native module (`argon2`, `msnodesqlv8`) thất bại trên môi trường build của Azure mà không kiểm soát được.

**`backend/Dockerfile`** đã viết (multi-stage, build từ context gốc repo).

### 4a. Build/kiểm cục bộ nếu bạn có Docker Desktop
```bash
# Từ thư mục gốc C:\Spa
docker build -f backend/Dockerfile -t spa-backend .
docker run --rm -p 3000:3000 -e NODE_ENV=production -e JWT_SECRET=... -e FRONTEND_ORIGIN=http://localhost:5173 spa-backend
curl http://localhost:3000/api/health/live
```

### 4b. Không có Docker Desktop — đã chuẩn bị GitHub Actions thay thế
`.github/workflows/backend-docker.yml` build image y hệt lệnh ở 4a trên máy ảo GitHub (có Docker sẵn), rồi smoke-test: chạy container **không có database nào cấu hình** và xác nhận `/api/health/live` trả 200, `/api/health/ready` trả 503 (không crash), `/api/docs` trả 200 (Nest khởi động đầy đủ), container không bị crash-loop. **Workflow này chỉ build + tự kiểm trên máy ảo của GitHub — không đẩy lên registry nào, không đụng tới Azure.** Để chạy nó: đẩy (push) nhánh lên GitHub, hoặc chạy tay qua tab Actions → "Run workflow" (`workflow_dispatch`). **Chưa được đẩy lên GitHub nên chưa có lần chạy nào** — tôi sẽ không tự `git push`; cho tôi biết khi bạn muốn tôi commit/push để kích hoạt lần chạy đầu.

### 4c. Xác minh "App Service F1 hỗ trợ container" đúng trong subscription/vùng của bạn
Tôi không có quyền truy cập Azure CLI hay Portal của bạn nên không thể tự kiểm việc này cho tài khoản thật. Hướng dẫn chính thức xác nhận tính năng này tồn tại trên F1 nói chung, nhưng để chắc chắn với đúng subscription/vùng bạn dùng, tự làm theo một trong hai cách:
- **Portal (khuyến nghị, không tạo gì thật cho tới bước cuối):** Create a resource → Web App → Publish = **Container**, OS = **Linux**, Region = vùng bạn chọn ở mục 1 → ở bước "App Service Plan", chọn Create new → **Change size → Dev/Test → F1 → Apply**. Nếu Portal cho bạn chọn được F1 ở bước này (chưa cần bấm "Review + create"), tức là F1 hỗ trợ container trong subscription/vùng đó. Bạn có thể dừng lại ở đây, không cần tạo thật.
- **CLI (nếu bạn cài `az` và đã `az login`):**
  ```bash
  az appservice plan create --name plan-check --resource-group <rg-tam> --location <vung> --is-linux --sku F1 --dry-run 2>&1 || true
  ```
  (một số phiên bản `az` không có `--dry-run` cho lệnh này; nếu vậy, cách Portal ở trên là đáng tin hơn).

## 5. CORS, cookie, domain, và việc frontend gọi đúng backend — điểm bắt buộc phải đúng

### 5a. Lỗi URL tương đối — đã sửa, đã rà soát toàn bộ
Phát hiện khi audit: toàn bộ code frontend gọi API bằng đường dẫn tương đối `/api/...` — khi frontend chạy trên domain Static Web Apps, request tự gửi đến chính domain đó (không có backend), luôn 404 dù CORS/cookie đúng hay không. Đã sửa và **rà lại toàn bộ `frontend/src` để không bỏ sót** — có 2 nhóm lỗi, không chỉ 1:
- **Gọi API** (login/logout/me, hủy lịch, tìm khách hàng, upload ảnh, health check): `frontend/src/lib/api-client.ts` thêm `API_BASE_URL` từ biến build-time `VITE_API_BASE_URL` (rỗng mặc định — không đổi hành vi cục bộ/same-origin). Mọi `fetch('/api/...')` trực tiếp đã đổi sang dùng biến này.
- **Hiển thị ảnh** (`<img src=...>`): backend trả đường dẫn ảnh dịch vụ dạng tương đối (`/api/uploads/services/<file>`, lưu thẳng trong `DichVu.HinhAnh`). `service-card.tsx`, `service-detail.tsx`, `admin-services.tsx` (bảng danh sách + xem trước khi tải lên) render trực tiếp giá trị này làm `src` — sẽ vỡ ảnh nếu không sửa. Đã thêm `resolveApiUrl()` trong `api-client.ts`, áp dụng ở cả 3 nơi; giá trị lưu trong DB/state giữ nguyên dạng tương đối (chỉ đổi lúc render).

Khi build frontend để deploy Static Web Apps, đặt `VITE_API_BASE_URL=https://<app>.azurewebsites.net` (không `/` cuối) trước khi chạy `npm run build --workspace @spa/frontend`.

### 5b. Static Web Apps không thể "same-origin proxy" tới App Service ở gói Free — đã xác minh
Đã tra `apis-overview`/`plans` của Microsoft Learn: **"Bring your own APIs" (link App Service/Container Apps/API Management làm backend, để chạy cùng domain qua `/api/*`) chỉ có ở gói Standard, KHÔNG có ở Free.** Gói Free chỉ cho API quản lý sẵn qua Azure Functions. Vì vậy kiến trúc demo buộc phải gọi liên miền thật (frontend domain khác backend domain) — không có cách nào gộp cùng domain mà vẫn giữ Static Web Apps Free.

### 5c. Rủi ro cookie bên thứ ba trên Safari — CHƯA có cách khắc phục miễn phí triệt để
Đã tra MDN + báo cáo WebKit (không chỉ trí nhớ):
- **Chrome:** không chặn cookie bên thứ ba theo mặc định (Google đã dừng kế hoạch loại bỏ hoàn toàn) — **không ảnh hưởng**.
- **Firefox (Total Cookie Protection, bật mặc định):** cô lập cookie bên thứ ba theo từng site cấp cao nhất, nhưng vì chỉ có một frontend luôn gọi một backend (quan hệ 1:1), cookie vẫn được lưu và gửi lại bình thường cho chính cặp domain đó — **khả năng cao không ảnh hưởng**, chưa có xác nhận 100% riêng cho `fetch()`+`Set-Cookie` qua HTTP header.
- **Safari (ITP):** **rủi ro thật, chưa xác minh được rõ** — không có tài liệu WebKit hiện hành xác nhận cookie đặt qua `Set-Cookie` từ `fetch({credentials:'include'})` liên miền (không qua iframe) có hoạt động ổn định hay không; có báo cáo cũ cho thấy cookie `SameSite=None; Secure` từ một domain API thuần (không bao giờ được truy cập trực tiếp) có thể bị ITP từ chối lưu.
- **Giảm nhẹ đã code:** thuộc tính `Partitioned` (CHIPS) tự động kèm khi `COOKIE_SAMESITE=none` — chỉ cải thiện Firefox/Chrome, **không chắc giúp được Safari**.
- **Không còn cách nào miễn phí khác để loại bỏ hẳn rủi ro này** trong kiến trúc 2-domain này (mục 5b đã đóng đường "cùng domain miễn phí"). Việc cần làm: **sau khi deploy, tự kiểm đăng nhập trên Safari thật (macOS hoặc iOS) trước khi coi demo là dùng được** — nếu cookie không được lưu trên Safari, phương án duy nhất không tốn thêm tiền là demo chỉ công bố "dùng Chrome/Firefox", hoặc nâng Static Web Apps lên Standard (có phí) để link App Service cùng domain.

### 5d. Cấu hình bắt buộc trên App Service
- `FRONTEND_ORIGIN` = URL Static Web Apps thật (ví dụ `https://<ten-ngau-nhien>.azurestaticapps.net`), chính xác từng ký tự, không có `/` ở cuối.
- `COOKIE_SAMESITE=none` và `COOKIE_SECURE=true` (bắt buộc đi cùng nhau) — **nếu thiếu một trong hai, đăng nhập sẽ "thành công" nhưng cookie không được trình duyệt lưu, mọi request sau đó bị coi là chưa đăng nhập.**
- `NODE_ENV=production` (bắt buộc Secure cookie, chặn `DB_AUTH=windows`, tắt mock thanh toán).
- Static Web Apps tự có HTTPS; App Service for Containers cũng tự có HTTPS trên domain `*.azurewebsites.net` — không cần tự cấu hình TLS.

## 6. Kế hoạch kiểm thử webhook SePay an toàn
Đã viết chi tiết (xác thực sai/đúng, idempotency/replay, sai số tiền, rate limit, rồi mới tới SePay Dashboard thật ở Test Mode) tại **`docs-deploy/SEPAY_WEBHOOK_TEST_PLAN.md`**. Không bước nào cần API key SePay thật trước mục cuối của file đó.

## 7. Checklist phê duyệt migration
Đã tách riêng từng migration kèm guard cần sửa và quy trình xác minh tại **`database/AZURE_MIGRATION_APPROVAL_CHECKLIST.md`** — cần phê duyệt từng dòng, tôi không tự chạy.

## 8. Giám sát sử dụng, điều kiện free tier thật, và các khoản có thể phát sinh phí
Đã tách riêng tại **`docs-deploy/AZURE_BILLING_ELIGIBILITY_CHECK.md`** — gồm bảng tài nguyên có phí/không có phí (lưu ý **Azure Container Registry Basic KHÔNG miễn phí** — dùng Docker Hub free thay thế), việc cần tự kiểm loại subscription, và cách đặt Budget alert trước khi tạo bất kỳ tài nguyên nào.

## 9. Cấu hình môi trường & script triển khai (đã chuẩn bị, chưa chạy)
- **`docs-deploy/azure.env.example`** — toàn bộ Application settings cần đặt trên App Service.
- **`scripts/azure-deploy.sh`** — lệnh `az` CLI tham khảo theo từng bước (resource group → SQL server → ACR/Docker Hub → App Service plan F1 → Web App for Containers → application settings → Static Web Apps → budget). **Không tự chạy file này** — chạy từng lệnh một, tự kiểm kết quả, đặc biệt bước tạo SQL Database free tier phải làm qua Portal (CLI không có cờ bật free tier đáng tin cậy).
- **`.github/workflows/backend-docker.yml`** — build + smoke-test Docker image trên GitHub Actions (mục 4b), chưa được đẩy lên GitHub nên chưa chạy lần nào.

## 10. Numbered checklist — các bước thực hiện trên Azure Portal để khởi chạy demo 30 ngày
Thực hiện đúng thứ tự; dừng lại và xác nhận với tôi ở các bước có ghi "phê duyệt". Tôi không tự tạo tài nguyên, không tự chạy migration, không tự publish, không tự khởi tạo thanh toán.

1. **Kiểm subscription:** Portal → Subscriptions → xác nhận không phải "Azure for Students Starter" (xem mục 8).
2. **Đặt Budget alert** ở cấp subscription trước khi tạo gì khác (xem mục 8) — ngưỡng nhỏ, cảnh báo 1%/50%/100%.
3. **Xác nhận vùng:** thử tạo Azure SQL Database ở Southeast Asia (mục 1) — nếu ô "Apply free tier offer" không hiện, đổi vùng (ví dụ East US) và báo tôi vùng cuối cùng để tôi khớp lại mọi cấu hình.
4. **Tạo Resource Group** (ví dụ `rg-spa-demo`) tại vùng đã xác nhận.
5. **Tạo Azure SQL Database free tier:** logical server (SQL auth, không Azure AD-only nếu bạn muốn chạy `sqlcmd` đơn giản) → Create database → tick "Apply free tier offer" → khi hỏi xử lý lúc hết hạn mức, chọn **"Auto-pause"** (không chọn "Bill over usage").
6. **Phê duyệt từng migration** theo `database/AZURE_MIGRATION_APPROVAL_CHECKLIST.md` (tối thiểu 001–004; 007 nếu muốn demo thanh toán) — tôi sửa guard rồi đưa lệnh `sqlcmd`, bạn tự chạy.
7. **Tạo SQL login riêng cho app** (không dùng login admin) theo mục 4 của `AZURE_MIGRATION_APPROVAL_CHECKLIST.md`.
8. **Kích hoạt build Docker:** đẩy nhánh lên GitHub (hoặc `workflow_dispatch`) để `.github/workflows/backend-docker.yml` chạy lần đầu, xác nhận build + smoke test PASS trước khi dùng image đó.
9. **Đẩy image:** Docker Hub free (`docker login` → `docker push <ten-ban>/spa-backend:latest`) — tránh Azure Container Registry trừ khi bạn chấp nhận phí nhỏ của nó (mục 8).
10. **Tạo App Service plan F1 (Linux)** rồi **Web App for Containers** trỏ vào image ở bước 9. Xác nhận F1 khả dụng cho container theo cách ở mục 4c trước khi tạo thật.
11. **Đặt Application settings** trên App Service = toàn bộ nội dung `docs-deploy/azure.env.example` đã điền giá trị thật (bao gồm `DB_CONNECT_TIMEOUT_MS=30000`, `DB_CONNECT_RETRIES=3`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, `NODE_ENV=production`).
12. **Tạo Azure Static Web Apps Free**, liên kết repo GitHub; đặt biến build `VITE_API_BASE_URL=https://<app-buoc-10>.azurewebsites.net` trong workflow do SWA tự sinh.
13. **Cập nhật `FRONTEND_ORIGIN`** trên App Service = domain Static Web Apps thật (bước 12); App Service tự khởi động lại.
14. **Kiểm `GET /api/health/live`** (phải 200) rồi **`/api/health/ready`** (phải 200 sau khi SQL login đúng, hoặc 503 nếu sai cấu hình — không được crash).
15. **Đăng nhập thử trên Chrome, rồi trên Safari thật** (mục 5c) — nếu Safari không giữ được cookie đăng nhập, ghi nhận giới hạn này cho demo, không tự ý đổi kiến trúc.
16. **Tạo lịch hẹn thử, không trùng giường**, xác nhận dữ liệu lưu đúng trên Azure SQL (đọc lại qua `sqlcmd`, không chỉ qua UI).
17. **Chạy `docs-deploy/SEPAY_WEBHOOK_TEST_PLAN.md` mục 1–2** (mock cục bộ, rồi `curl` giả webhook) — chưa cần SePay thật.
18. **Chỉ sau khi 17 đạt:** cấu hình SePay Dashboard thật ở Test Mode (`SEPAY_WEBHOOK_TEST_PLAN.md` mục 3).
19. **Ghi ngày hết hạn demo (30 ngày)** và lên kế hoạch `az group delete --name rg-spa-demo --yes` khi kết thúc, để chắc chắn không tài nguyên nào tiếp tục tính phí.
