# Các điểm cần xác nhận

Cập nhật 2026-11-10. Không tự sửa tài liệu gốc hoặc database `FlowerLanternSpa_3NF`.

| ID | Nguồn và mâu thuẫn | Ảnh hưởng / đề xuất chưa duyệt |
|---|---|---|
| Q01 | SRS 3.5.1 ghi 8:00–22:00; UC_5.1 và đặc tả UI 8.2.5 ghi 9:00–21:00; phỏng vấn đầu ghi 8:00–22:00 | Cần chốt giờ trước triển khai validation booking. |
| Q02 | SRS 7.2: 15 bảng, mã CHAR(10), MONEY, DATETIME. SQL đề xuất: 14 bảng, NhanVienThuong/QuanLy, thiếu Quyen/TaiKhoanQuyen. Database hiện hữu có 15 bảng nghiệp vụ + sysdiagrams, nhưng CHAR(12), Giuong CHAR(8), DECIMAL/DATETIME2 | Đã dựng baseline SRS 7.2 trong database Dev riêng. Không migration dữ liệu/cấu trúc database hiện hữu. Cần xác nhận nếu muốn dùng database hiện hữu làm nguồn chính. |
| Q03 | UC_2.1 post-condition Chờ xác nhận; BR-UC2.1-03 trực tiếp Chưa đến. UC_2.3 duyệt sang Đã xác nhận; BR-UC5.2-02 quy đổi Chưa đến/Đã đến thành Đã xác nhận | Chưa áp dụng CHECK enum hoặc state machine booking cho đến khi chốt. Đề xuất trạng thái nội bộ và trạng thái hiển thị tách riêng. |
| Q04 | BR-UC2.1-04 có Thanh toán một phần; SRS 7.2 LichHen chỉ chú thích Chưa thanh toán/Đã thanh toán | Giữ cột riêng, không CHECK enum gây mất trạng thái. Cần duyệt reconciliation thiếu/thừa tiền. |
| Q05 | SRS 7.2 không có NguonDatLich, giá đã chốt, payment reference, provider transaction ID, expiry hoặc dữ liệu lockout | Cần đề xuất additive migration cho nguồn lịch, giá lịch sử, payment attempts/events và persistent login lockout. Chưa tạo/applied các bảng/cột bổ sung. |
| Q06 | SRS 7.2 KhachHang.MaTaiKhoan nullable UNIQUE trong SQL Server chỉ cho một NULL | ĐÃ GIẢI QUYẾT: Đã áp dụng migration 003 chuyển sang Filtered Unique Index `WHERE MaTaiKhoan IS NOT NULL` trên cả KhachHang và NhanVien; test-003-constraints.sql đã pass 100%. |
| Q07 | SRS VaiTro chú thích Khách hàng/Nhân viên/Quản trị; UC_8 yêu cầu Chủ Spa/Quản lý riêng. Trạng thái tài khoản Bị khóa/Đã khóa khác nhau | Cần vocabulary chính thức; không dùng Quản trị làm quyền Chủ Spa mặc định. |
| Q08 | BR-UC6-01 và UC_9 dùng Hoạt động; SRS 7.2 DichVu ghi Đang cung cấp, DanhMuc Hiển thị/Ẩn | API catalog dùng đúng BR-UC6-01: Hoạt động. Chưa tự đổi dữ liệu cũ. |
| Q09 | BR-UC9.1 giá nguyên dương; SRS 7.2 Gia MONEY >=0 | Baseline giữ vật lý; DTO nghiệp vụ sau này phải chặn 0/phần lẻ. |
| Q10 | UC_1 mặc định tài khoản có sẵn; Figma 5:21070 có Ghi nhớ/Quên mật khẩu/Đăng ký; phỏng vấn bổ sung có yêu cầu nhưng chưa có luồng xác minh | Các nút hiện thông báo chưa triển khai, không tạo tài khoản hoặc gửi OTP giả. Cần quy trình xác minh, TTL và cơ chế cấp tài khoản khách. |
| Q11 | BPMN hủy trước 6h hoàn 100%, trong 6h thương lượng/50%; phỏng vấn bổ sung yêu cầu trước một ngày và phí chưa xác định | Không tự tính/chi hoàn tiền. Cần chính sách hoàn tiền được duyệt. |
| Q12 | SRS 3.3 xem khách hàng ghi nhầm UC_3.2; bảng ánh xạ cuối tài liệu ghi UC_3.3. BR-UC9.1-01/02 đảo thứ tự; BR-UC9.5-01/02 trùng | Traceability dùng ID bảng ánh xạ cuối tài liệu, ghi cả tiêu đề khi dẫn BR. |
| Q13 | UC_10.1 main flow đếm lịch hoàn thành; rule/SQL view đếm lượt đặt nói chung | Cần định nghĩa mẫu số cho báo cáo, đặc biệt lịch hủy và nhiều khách/lịch. |
| Q14 | SRS chứa 168 media, UI kit 1 media; đã trích xuất đầy đủ nhưng chưa kiểm tra trực quan từng trang/ảnh ở độ phân giải đọc được | Audit milestone 1 chưa nghiệm thu toàn bộ. Tiếp tục đối chiếu ảnh/diagram khi triển khai từng UC, không tuyên bố đã đọc toàn bộ hình. |
| Q15 | Figma có nhiều bố cục khác nhau cho lịch cá nhân (table/cards/grid), số giường/sidebar thay đổi giữa frame | Inventory live metadata lưu ở audit/FIGMA_FRAME_INVENTORY.md. Cần đối chiếu context/screenshot từng frame; chỉ frame login đã lấy design context. |

SePay là provider duy nhất. Chưa triển khai webhook nên chưa xác minh tài liệu SePay hiện hành; phải thực hiện trước milestone 7. Không dùng suy đoán HMAC từ kế hoạch phụ làm hợp đồng tích hợp.

## Cập nhật sau khôi phục

- Q05: KhoaDangNhap đã tồn tại qua migration 003, xác minh read-only; payment/giá lịch sử/nguồn lịch vẫn chưa áp dụng.
- Q15: Lấy thêm live context/screenshot `1:49090`; dashboard vẫn placeholder, chưa nghiệm thu.
- Q16: Seed cũ thiếu `-f 65001` tạo mojibake dù số bản ghi đúng. Đã áp dụng repair có điều kiện, không chạy lại seed.
- Q10 còn mở: Ghi nhớ chưa có policy riêng, reset/registration chưa triển khai; JWT giữ thời hạn 7 ngày từ Auth Antigravity. Cần chốt vòng đời phiên/cơ chế thu hồi token đã sao chép sau logout trước nghiệm thu bảo mật cuối.
