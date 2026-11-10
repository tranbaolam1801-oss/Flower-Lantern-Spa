# Đề xuất migration 004 — chờ duyệt

Mục tiêu: logout thu hồi cả JWT đã sao chép, không chỉ cookie ở trình duyệt; lưu phiên qua restart và cho phép khóa tài khoản thu hồi phiên. JWT vẫn là HttpOnly cookie, Argon2id và 15 bảng SRS giữ nguyên.

Migration: `migrations/004-auth-sessions.sql` thêm duy nhất bảng kỹ thuật `PhienDangNhap` (MaPhien UUID PK, MaTaiKhoan FK NO ACTION, TaoLuc/HetHanLuc/ThuHoiLuc UTC). Không lưu token/mật khẩu/secret. Không DELETE/UPDATE dữ liệu hiện có; không thay cột/ràng buộc business tables.

Luồng dự kiến: login tạo jti UUID và insert phiên; AuthGuard xác minh chữ ký, phiên chưa thu hồi/chưa hết hạn và tài khoản/quyền hiện tại; logout đánh dấu ThuHoiLuc cho đúng phiên. Test chứng minh replay cookie cũ sau logout bị 401, restart không khôi phục phiên bị thu hồi. Khóa tài khoản tiếp tục kiểm tra SQL mỗi request.

Phạm vi xin duyệt: áp dụng bảng bổ sung trên `FlowerLanternSpa_Dev` và `FlowerLanternSpa_Test`, sau đó nối Auth và chạy kiểm thử. Chưa áp dụng tại thời điểm viết đề xuất. Không có cloud, payment hoặc dữ liệu thật trong thay đổi này.

Lệnh sau duyệt, mỗi database chạy riêng: `sqlcmd -b -I -f 65001 -S localhost -E -d <database> -i database/migrations/004-auth-sessions.sql`.
