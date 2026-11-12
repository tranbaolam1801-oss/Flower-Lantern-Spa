# Checklist phê duyệt migration trên Azure SQL Database (demo 30 ngày)

Không migration nào trong danh sách dưới đã được chạy. Mỗi dòng cần một câu phê duyệt riêng của bạn trước khi tôi chuẩn bị file guard cuối cùng và đưa lệnh `sqlcmd` cho bạn tự chạy (tôi không tự kết nối tới Azure SQL của bạn).

## Trước khi chạy bất kỳ migration nào
1. Database Azure SQL đã được tạo (free tier) và còn trong hạn mức tháng (chưa auto-pause do hết quota).
2. Bạn có chuỗi kết nối `sqlcmd` dùng login admin (chỉ dùng login admin để chạy migration ban đầu; sau đó tạo login riêng cho app — xem mục 4 ở `scripts/azure-deploy.sh`).
3. Đã chạy `az sql db show` hoặc xem Portal xác nhận database đang ở trạng thái "Online" (không "Paused").
4. Không có dữ liệu thật nào cần giữ trên database này (database mới tạo cho demo — nếu không đúng, dừng lại và báo tôi).

## Thứ tự và nội dung từng migration
| # | File | Thay đổi | Guard cần sửa trước khi chạy | Phê duyệt |
|---|---|---|---|---|
| 001 | `database/migrations/001-srs-baseline.sql` | Tạo 15 bảng gốc SRS | Không có guard (chỉ chạy trên DB rỗng) — **xác nhận database đang trống trước khi chạy** | ☐ |
| 002 | `database/migrations/002-business-indexes.sql` | Index/unique constraint nghiệp vụ | Không có guard | ☐ |
| 003 | `database/migrations/003-auth-lockout.sql` | Bảng `KhoaDangNhap` + sửa UNIQUE→filtered index | Không có guard | ☐ |
| 004 | `database/migrations/004-auth-sessions.sql` | Bảng `PhienDangNhap` (session store) | **Có guard `DB_NAME() <> 'FlowerLanternSpa_Test'` — phải đổi thành tên database Azure thật trước khi chạy** | ☐ |
| 005 | `database/migrations/005-goi-dich-vu-status.PROPOSED.sql` | `GoiDichVu.TrangThai` (vô hiệu hóa gói dịch vụ) | Guard tương tự 004 — cần sửa | ☐ (tùy chọn, không bắt buộc cho demo) |
| 006 | `database/migrations/006-phan-hoi-ngay-phan-hoi.PROPOSED.sql` | `PhanHoi.NgayPhanHoi` (thời gian phản hồi đánh giá) | Guard tương tự 004 — cần sửa | ☐ |
| 007 | `database/migrations/007-sepay-payments.PROPOSED.sql` | Cột/ bảng cho thanh toán SePay (bắt buộc nếu muốn demo thanh toán — thiếu thì mọi `/api/payments/*` trả 503) | Guard tương tự 004 — cần sửa | ☐ |
| 008 | `database/migrations/PROPOSED-008-booking-source-prepaid.md` (chưa có file .sql, soạn từ nội dung trong .md) | `LichHen.NguonDatLich` | Guard tương tự 004 — cần sửa | ☐ (tùy chọn) |

## Quy trình cho mỗi migration (tôi làm khi bạn phê duyệt từng dòng)
1. Tôi sao chép file, đổi guard `DB_NAME() <> 'FlowerLanternSpa_Test'` thành tên database Azure thật của bạn (ví dụ `FlowerLanternSpaDemo`), lưu vào `database/migrations/azure/<ten-file>`.
2. Tôi đưa đúng lệnh `sqlcmd -S <server>.database.windows.net -d <database> -U <user> -P <password> -N -C -i database/migrations/azure/<ten-file>` cho bạn copy chạy.
3. Bạn tự chạy, dán lại kết quả (hoặc lỗi) cho tôi.
4. Tôi xác minh bằng câu đọc (`SELECT ... FROM sys.columns/sys.tables`) — không ghi gì thêm — rồi đánh dấu migration đó là đã áp dụng trong `HANDOVER.md`.

## Sau khi 001–004 (+007 nếu demo có thanh toán) đã chạy
- Tạo login riêng cho app (mục 4 trong `scripts/azure-deploy.sh`) — không dùng login admin ở biến môi trường App Service.
- Chạy `scripts/run-sql-integration.ps1` (đổi tham số kết nối sang Azure) để xác nhận 27 test SQL integration chạy thật, không chỉ mock.
