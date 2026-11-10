-- database/test-003-constraints.sql
-- Mục đích: Kiểm chứng toàn diện migration 003-auth-lockout:
--   1. Cho phép nhiều MaTaiKhoan = NULL (khách vãng lai, nhân viên chưa cấp tài khoản)
--   2. Chặn MaTaiKhoan trùng lặp khi khác NULL (Filtered Unique Index)
--   3. Bảng KhoaDangNhap hoạt động đúng với khóa chính SoDienThoai
-- An toàn: Bọc trong outer TRY/CATCH; luôn luôn ROLLBACK ở mọi tình huống; không lưu vĩnh viễn bản ghi nào.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT OFF;

-- Bảng kết quả để trả về dữ liệu có cấu trúc (PASS/FAIL)
DECLARE @TestResults TABLE (
    TestCase NVARCHAR(100) NOT NULL,
    Expected NVARCHAR(200) NOT NULL,
    Actual NVARCHAR(200) NOT NULL,
    Status VARCHAR(10) NOT NULL
);

BEGIN TRY
    BEGIN TRANSACTION;

    -- =========================================================================
    -- FIXTURE: Tạo tài khoản mẫu hợp lệ (CHAR(10), SĐT 10 chữ số)
    -- =========================================================================
    INSERT INTO dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai)
    VALUES ('TKTEST0001', 'user_test_01', '0999990001', 'hash1', N'Khách hàng', N'Hoạt động'),
           ('TKTEST0002', 'user_test_02', '0999990002', 'hash2', N'Nhân viên', N'Hoạt động');

    -- =========================================================================
    -- TEST 1: Cho phép nhiều khách hàng offline có MaTaiKhoan = NULL
    -- =========================================================================
    INSERT INTO dbo.KhachHang (MaKhachHang, MaTaiKhoan, HoTen, SoDienThoai)
    VALUES ('KHTEST0001', NULL, N'Khách vãng lai 1', '0999990011'),
           ('KHTEST0002', NULL, N'Khách vãng lai 2', '0999990012');

    INSERT INTO @TestResults VALUES (
        N'1. Multiple NULL MaTaiKhoan in KhachHang',
        N'Cho phép nhiều khách hàng có MaTaiKhoan = NULL',
        N'Đã chèn thành công 2 bản ghi MaTaiKhoan = NULL',
        'PASS'
    );

    -- =========================================================================
    -- TEST 2: Chặn MaTaiKhoan trùng lặp trong KhachHang khi khác NULL
    -- =========================================================================
    INSERT INTO dbo.KhachHang (MaKhachHang, MaTaiKhoan, HoTen, SoDienThoai)
    VALUES ('KHTEST0003', 'TKTEST0001', N'Khách Online 1', '0999990013');

    DECLARE @DuplicateKhCaught BIT = 0;
    BEGIN TRY
        INSERT INTO dbo.KhachHang (MaKhachHang, MaTaiKhoan, HoTen, SoDienThoai)
        VALUES ('KHTEST0004', 'TKTEST0001', N'Khách Online Trùng TK', '0999990014');
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)
            SET @DuplicateKhCaught = 1;
    END CATCH;

    IF @DuplicateKhCaught = 1
        INSERT INTO @TestResults VALUES (
            N'2. Duplicate non-null MaTaiKhoan in KhachHang',
            N'Báo lỗi vi phạm Filtered Unique Index (2601/2627)',
            N'Chặn thành công trùng lặp MaTaiKhoan khác NULL',
            'PASS'
        );
    ELSE
        INSERT INTO @TestResults VALUES (
            N'2. Duplicate non-null MaTaiKhoan in KhachHang',
            N'Báo lỗi vi phạm Filtered Unique Index (2601/2627)',
            N'LỖI: Chấp nhận MaTaiKhoan trùng lặp!',
            'FAIL'
        );

    -- =========================================================================
    -- TEST 3: Cho phép nhiều nhân viên chưa cấp tài khoản (MaTaiKhoan = NULL)
    -- =========================================================================
    INSERT INTO dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, TrangThaiLamViec, TrangThaiHoSo)
    VALUES ('NVTEST0001', NULL, N'Nhân viên chưa cấp TK 1', '0999990021', N'Đang làm việc', N'Hoạt động'),
           ('NVTEST0002', NULL, N'Nhân viên chưa cấp TK 2', '0999990022', N'Đang làm việc', N'Hoạt động');

    INSERT INTO @TestResults VALUES (
        N'3. Multiple NULL MaTaiKhoan in NhanVien',
        N'Cho phép nhiều nhân viên có MaTaiKhoan = NULL',
        N'Đã chèn thành công 2 bản ghi MaTaiKhoan = NULL',
        'PASS'
    );

    -- =========================================================================
    -- TEST 4: Chặn MaTaiKhoan trùng lặp trong NhanVien khi khác NULL
    -- =========================================================================
    INSERT INTO dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, TrangThaiLamViec, TrangThaiHoSo)
    VALUES ('NVTEST0003', 'TKTEST0002', N'Nhân viên đã có TK', '0999990023', N'Đang làm việc', N'Hoạt động');

    DECLARE @DuplicateNvCaught BIT = 0;
    BEGIN TRY
        INSERT INTO dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, TrangThaiLamViec, TrangThaiHoSo)
        VALUES ('NVTEST0004', 'TKTEST0002', N'Nhân viên trùng TK', '0999990024', N'Đang làm việc', N'Hoạt động');
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)
            SET @DuplicateNvCaught = 1;
    END CATCH;

    IF @DuplicateNvCaught = 1
        INSERT INTO @TestResults VALUES (
            N'4. Duplicate non-null MaTaiKhoan in NhanVien',
            N'Báo lỗi vi phạm Filtered Unique Index (2601/2627)',
            N'Chặn thành công trùng lặp MaTaiKhoan khác NULL',
            'PASS'
        );
    ELSE
        INSERT INTO @TestResults VALUES (
            N'4. Duplicate non-null MaTaiKhoan in NhanVien',
            N'Báo lỗi vi phạm Filtered Unique Index (2601/2627)',
            N'LỖI: Chấp nhận MaTaiKhoan trùng lặp!',
            'FAIL'
        );

    -- =========================================================================
    -- TEST 5: Bảng KhoaDangNhap lưu đúng và chặn trùng khóa chính SoDienThoai
    -- =========================================================================
    INSERT INTO dbo.KhoaDangNhap (SoDienThoai, SoLanSai, ThoiDiemKhoaDen, LanCuoiSai)
    VALUES ('0999990099', 5, DATEADD(minute, 15, GETDATE()), GETDATE());

    DECLARE @DuplicatePhoneCaught BIT = 0;
    BEGIN TRY
        INSERT INTO dbo.KhoaDangNhap (SoDienThoai, SoLanSai, ThoiDiemKhoaDen, LanCuoiSai)
        VALUES ('0999990099', 1, NULL, GETDATE());
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)
            SET @DuplicatePhoneCaught = 1;
    END CATCH;

    IF @DuplicatePhoneCaught = 1
        INSERT INTO @TestResults VALUES (
            N'5. KhoaDangNhap PK Constraint',
            N'Lưu đúng và chặn trùng lặp khóa chính SoDienThoai',
            N'Lưu thành công và chặn trùng khóa chính SoDienThoai',
            'PASS'
        );
    ELSE
        INSERT INTO @TestResults VALUES (
            N'5. KhoaDangNhap PK Constraint',
            N'Lưu đúng và chặn trùng lặp khóa chính SoDienThoai',
            N'LỖI: Chấp nhận trùng khóa chính SoDienThoai!',
            'FAIL'
        );

    -- Luôn luôn ROLLBACK toàn bộ giao dịch kiểm thử
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

END TRY
BEGIN CATCH
    -- Outer CATCH đảm bảo dọn dẹp sạch sẽ nếu có lỗi bất ngờ
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    INSERT INTO @TestResults VALUES (
        N'FATAL_ERROR',
        N'Không phát sinh lỗi ngoài kiểm soát',
        ERROR_MESSAGE(),
        'FAIL'
    );
END CATCH;

-- Trả về bảng kết quả chi tiết
SELECT TestCase, Expected, Actual, Status FROM @TestResults;
