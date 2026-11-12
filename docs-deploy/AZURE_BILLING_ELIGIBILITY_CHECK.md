# Kiểm tra điều kiện free tier và các khoản có thể phát sinh phí

Danh sách dưới đây đối chiếu từng tài nguyên dự kiến dùng với điều kiện miễn phí thật của nó. Các số liệu đã xác minh qua Microsoft Learn (không chỉ trí nhớ) ở phiên trước; đánh dấu rõ chỗ nào bạn cần tự xác nhận trên Portal vì tài liệu chính thức không công bố.

## Bảng tài nguyên — có phí hay không
| Tài nguyên | Miễn phí nếu | Rủi ro phát sinh phí | Mức độ chắc chắn |
|---|---|---|---|
| Azure SQL Database free tier | Chọn đúng "Free tier" lúc tạo + chọn **"AutoPause"** (không phải "BillOverUsage") khi hết 100.000 vCore-giây/tháng | Nếu lúc tạo bạn chọn "BillOverUsage" thay vì "AutoPause", vượt hạn mức sẽ tính phí serverless bình thường | Cao — đã xác minh qua `free-tier-faq` |
| Azure App Service F1 | Luôn miễn phí (gói Free không có cấu hình "vượt ngưỡng rồi tính phí" — vượt 60 phút CPU/ngày chỉ bị trả 403, không tính tiền) | Nếu bạn tự đổi tier sang B1+ (ví dụ để có Always On) thì mới phát sinh phí (~13 USD/tháng) | Cao |
| Azure Static Web Apps Free | Luôn miễn phí trong hạn mức (100 GB băng thông/tháng, 250 MB lưu trữ) | Vượt 100 GB băng thông/tháng — trang ngừng phục vụ, **không** tự động tính phí âm thầm (theo tài liệu quotas) | Cao |
| **Azure Container Registry (Basic)** | **KHÔNG free** — khoảng 0,167 USD/ngày (số tôi nhớ, cần bạn xác nhận lại giá hiện tại) kể từ lúc tạo, bất kể dùng hay không | Đây là khoản phí gần như chắc chắn nếu bạn dùng ACR. **Khuyến nghị: dùng Docker Hub free tier thay thế** (giữ 0 đồng) | Trung bình (giá có thể đổi) |
| Azure Resource Group, Virtual Network mặc định | Miễn phí (không tính phí riêng cho resource group) | Không | Cao |
| Outbound bandwidth từ App Service | F1 có hạn mức riêng tính vào gói Free, không công bố số GB cụ thể (đã nêu ở `AZURE_FREE_TIER_DEPLOYMENT.md` mục 2) | Vượt ngưỡng không công bố — cần theo dõi qua Metrics, không có số chắc để tự tính trước | Thấp — cần bạn tự theo dõi |

## Việc bạn cần tự làm trên Portal trước khi tạo bất kỳ tài nguyên nào
1. **Kiểm tra loại subscription.** Vào Portal → Subscriptions → xem tên gói. Nếu là **"Azure for Students Starter"**, free tier Azure SQL **không áp dụng** (đã xác minh: trang free-tier-faq loại trừ rõ gói này). Nếu là Pay-As-You-Go hoặc Azure for Students (không phải "Starter"), free tier áp dụng được.
2. **Đặt Budget alert trước khi tạo resource group** (không phải sau): Cost Management + Billing → Budgets → Add → phạm vi = subscription (vì resource group demo chưa tồn tại) → số tiền nhỏ (ví dụ 50.000 VNĐ/2 USD) → cảnh báo ở 1%, 50%, 100% → email bạn.
3. **Khi tạo Azure SQL Database**, ở bước "Compute + storage", tìm dòng "Configure database" → tick **"Apply free tier offer"** → ở phần xử lý khi hết hạn mức, chọn rõ **"Auto-pause database"**, không chọn "Continue at standard serverless rates".
4. **Không dùng Azure Container Registry nếu muốn giữ đúng 0 đồng** — dùng Docker Hub free (`docker push <ten-ban>/spa-backend:latest` sau `docker login`), rồi trỏ App Service vào `docker.io/<ten-ban>/spa-backend:latest` ở bước tạo Web App for Containers.
5. **Sau 30 ngày demo**, xóa toàn bộ resource group (`az group delete --name rg-spa-demo --yes`) để chắc chắn không còn tài nguyên nào tính phí tiếp — kể cả tài nguyên free tier, vì nếu bạn lỡ đổi cấu hình giữa chừng mà không nhớ, xóa sạch là cách chắc chắn nhất.

## Những gì tôi không thể tự xác minh
- Subscription thật của bạn thuộc loại nào (cần bạn tự xem Portal, tôi không có quyền truy cập tài khoản Azure của bạn).
- Giá ACR hiện tại chính xác (đổi theo thời gian; nêu ở đây để cảnh báo, không phải số để bạn tính toán chính xác).
- Hạn mức băng thông cụ thể (GB) của riêng App Service F1 — Microsoft không công bố số, chỉ có tên nhóm "Bandwidth" trong trang quota.
