# SQL Server local

`migrations/001-srs-baseline.sql` chép cấu trúc vật lý SRS mục 7.2, 15 bảng, đã áp dụng tại `FlowerLanternSpa_Dev`.
`migrations/002-business-indexes.sql` bổ sung unique/index trên cột hiện hữu theo business rules; không thêm bảng/cột.
`migrations/003-auth-lockout.sql` bổ sung bảng `KhoaDangNhap` cho persistent login lockout (15 phút sau 5 lần sai) và chuyển đổi ràng buộc duy nhất trên `KhachHang(MaTaiKhoan)` cùng `NhanVien(MaTaiKhoan)` sang Filtered Unique Index (`WHERE MaTaiKhoan IS NOT NULL`), xử lý dứt điểm Q06 cho khách hàng offline.
`seeds/001-beds.sql` tạo G1–G20, không xóa giường hiện hữu và rollback nếu tổng khác 20 (đã áp dụng và kiểm tra đủ 20 giường).
`test-003-constraints.sql` script kiểm thử an toàn giao dịch tự động cho filtered index và lockout, luôn rollback sạch sẽ.
`FlowerLanternSpa_Dev_pre_003.bak` bản sao lưu database trước migration 003.

Chỉ chạy lần lượt trong database phát triển mới bằng sqlcmd/SSMS. Không dùng `FlowerLanternSpa_3NF` hiện hữu để thử migration.
`Gia MONEY >=0` giữ đúng SRS 7.2; nghiệp vụ giá nguyên dương phải kiểm tra tại DTO/service. Không dùng floating point cho phép tính thanh toán.
