# Đề xuất migration 004 — chờ duyệt

Mục tiêu: logout thu hồi cả JWT đã sao chép, không chỉ cookie ở trình duyệt; lưu phiên qua restart và cho phép khóa tài khoản thu hồi phiên. JWT vẫn là HttpOnly cookie, Argon2id và 15 bảng SRS giữ nguyên.

Migration: `migrations/004-auth-sessions.sql` thêm duy nhất bảng kỹ thuật `PhienDangNhap` (MaPhien UUID PK, MaTaiKhoan FK NO ACTION, TaoLuc/HetHanLuc/ThuHoiLuc UTC). Không lưu token/mật khẩu/secret. Không DELETE/UPDATE dữ liệu hiện có; không thay cột/ràng buộc business tables.

Luồng dự kiến: login tạo jti UUID và insert phiên; AuthGuard xác minh chữ ký, phiên chưa thu hồi/chưa hết hạn và tài khoản/quyền hiện tại; logout đánh dấu ThuHoiLuc cho đúng phiên. Test chứng minh replay cookie cũ sau logout bị 401, restart không khôi phục phiên bị thu hồi. Khóa tài khoản tiếp tục kiểm tra SQL mỗi request.

Phạm vi xin duyệt: áp dụng bảng bổ sung trên `FlowerLanternSpa_Dev` và `FlowerLanternSpa_Test`, sau đó nối Auth và chạy kiểm thử. Chưa áp dụng tại thời điểm viết đề xuất. Không có cloud, payment hoặc dữ liệu thật trong thay đổi này.

Lệnh sau duyệt, mỗi database chạy riêng: `sqlcmd -b -I -f 65001 -S localhost -E -d <database> -i database/migrations/004-auth-sessions.sql`.

## Rà soát 2026-11-10 — chưa được phép áp dụng

Quyết định trước của người dùng là hoãn áp dụng. Việc rà soát này không thay thế quyết định đó.

### Tác động và tương thích

- Bảng mới độc lập về lưu trữ, FK `MaTaiKhoan CHAR(10)` trỏ đúng PK TaiKhoan; mặc định NO ACTION, không cascade xóa tài khoản hoặc lịch sử. Không ALTER 15 bảng nghiệp vụ và KhoaDangNhap.
- PK UUID dùng jti ngẫu nhiên; index `(MaTaiKhoan, HetHanLuc) INCLUDE(ThuHoiLuc)` hỗ trợ kiểm tra/thu hồi các phiên một tài khoản. Tra phiên cụ thể dùng PK.
- UTC `DATETIME2(3)`, CHECK hết hạn sau lúc tạo. Chỉ lưu định danh, không JWT nguyên văn/secret/mật khẩu.
- Script hiện tại bỏ qua nếu bảng đã tồn tại: chỉ idempotent trong trường hợp bảng đúng cấu trúc. Trước áp dụng và trước chạy lại phải so metadata (cột, PK, FK, CHECK, index) với đề xuất; nếu khác thì dừng, không tự sửa bảng. Chưa có test thực thi migration 004 vì chưa duyệt.
- DDL cần chạy trong transaction bao cả CREATE TABLE và CREATE INDEX để tránh trạng thái tạo bảng thành công nhưng thiếu index. SQL Server hỗ trợ rollback DDL này; sửa script trước khi xin duyệt cuối.

### Hợp đồng Auth dự kiến

1. Mỗi login thành công tạo phiên riêng và JWT có jti trỏ MaPhien; TTL 7 ngày theo hiện trạng, chưa thêm refresh token/remember policy mới.
2. AuthGuard xác minh HS256/issuer/audience/expiry, kiểm tra jti/subject khớp phiên chưa thu hồi, chưa hết hạn; tiếp tục đọc trạng thái và quyền mới nhất từ TaiKhoan. Thiếu jti hoặc phiên bị xóa: 401. SQL unavailable: 503, không fail-open.
3. Logout chỉ thu hồi phiên đang gửi; gọi lại vẫn thành công. Cookie chỉ xóa sau khi xử lý thu hồi thành công. Không vô hiệu tất cả thiết bị một cách ngầm định.
4. Khóa tài khoản thu hồi tất cả phiên trong cùng transaction với đổi trạng thái, tránh phiên cũ sống lại sau mở khóa. Login phải kiểm tra lại trạng thái tài khoản trong transaction tạo phiên để tránh đua với khóa. Chưa có API khóa mới trong phạm vi review.
5. Phiên hết hạn bị từ chối cả khi chưa được dọn. Dọn dữ liệu là tác vụ riêng, chưa tự chạy DELETE. Không thể khôi phục phiên đã thu hồi bằng restart.
6. Triển khai code mới sẽ buộc JWT cũ không có jti đăng nhập lại. Đây là thay đổi hành vi có chủ ý cần nằm trong lần duyệt.

### Backup, rollback và kế hoạch xác minh sau duyệt

- Trước Dev: kiểm tra backup gần nhất, tạo COPY_ONLY backup mới vào đường dẫn local được phép và RESTORE VERIFYONLY. Không ghi đè backup cũ. Đề xuất kế hoạch, chưa chạy backup/restore tại review này.
- Áp dụng trên Test trước, kiểm tra 17 bảng / 20 giường và 15 bảng nghiệp vụ không đổi; chạy lại migration để kiểm tra idempotency, metadata đầy đủ. Không coi đọc script là SQL test pass.
- Test: login 2 thiết bị; logout A replay A=401, B=200; logout lặp; restart; hết hạn; thiếu/giả jti; subject mismatch; tài khoản bị khóa/mở lại; SQL unavailable; đua login/khóa và logout/request; rollback insert phiên khi transaction lỗi.
- Thử lỗi DDL trong transaction trên Test, xác nhận không để bảng nửa chừng. Dữ liệu tài khoản/lịch hẹn trước và sau không đổi.
- Rollback ứng dụng: dừng phát hành JWT mới và buộc đăng nhập lại; giữ bảng PhienDangNhap để điều tra. Không tự động downgrade sang Auth cũ vì có thể làm JWT đã thu hồi được chấp nhận lại. DROP TABLE hoặc restore database chỉ sau phê duyệt riêng; không nằm trong script tự động.

Phạm vi xin duyệt sau review: chỉ migration 004 trên Test rồi Dev và nối logic Auth trên local, bao gồm buộc các phiên cũ đăng nhập lại; không xóa bảng, không production, không thay secret hiện có.
