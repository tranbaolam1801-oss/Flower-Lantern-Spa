import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
import { CUSTOMER_ID, CustomerValues, CustomerWriteBody, duplicateAccountPhoneError, duplicatePhoneError, validateCustomer } from './customer-validation';

const NOT_FOUND = 'Không tìm thấy khách hàng.';

@ApiTags('customers')
@Controller('customers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Nhân viên', 'Quản lý') @Permissions('Q02')
export class CustomerWriteController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get(':id')
  async detail(@Param('id') id: string) {
    if (!CUSTOMER_ID.test(id)) throw new NotFoundException(NOT_FOUND);
    const rows = await this.database.query<Record<string, unknown>[]>(`
      SELECT RTRIM(k.MaKhachHang) AS id,k.HoTen AS name,RTRIM(k.SoDienThoai) AS phone,k.KenhLienHe AS channel,
        k.GioiTinh AS gender,CONVERT(varchar(10),k.NgaySinh,23) AS birthDate,k.DiaChi AS address,k.GhiChu AS notes,
        CONVERT(varchar(19),k.NgayTao,126) AS createdAt,
        (SELECT COUNT(*) FROM dbo.LichHen l WHERE l.MaKhachHang=k.MaKhachHang) AS bookingCount
      FROM dbo.KhachHang k WHERE k.MaKhachHang=@0`, [id]);
    if (!rows[0]) throw new NotFoundException(NOT_FOUND);
    const bookings = await this.database.query<{id:string;date:string;time:string;status:string;serviceSummary:string|null}[]>(`
      SELECT TOP 5 RTRIM(l.MaLichHen) AS id,CONVERT(varchar(10),l.NgayHen,23) AS date,CONVERT(varchar(5),l.GioHen,108) AS time,
        l.TrangThaiLichHen AS status,
        (SELECT STRING_AGG(d.TenDichVu+N' - '+g.TenGoi,N', ') FROM dbo.KhachSuDungDichVu c
          JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
          WHERE c.MaLichHen=l.MaLichHen) AS serviceSummary
      FROM dbo.LichHen l WHERE l.MaKhachHang=@0 ORDER BY l.NgayHen DESC,l.GioHen DESC,l.MaLichHen DESC`, [id]);
    return { ...rows[0], recentBookings: bookings.map(b => ({ ...b, serviceSummary: b.serviceSummary ?? '' })) };
  }

  @Post()
  async create(@Body() body: CustomerWriteBody) {
    const v = validateCustomer(body);
    // Serialized by UPDLOCK/HOLDLOCK so concurrent creates cannot duplicate a phone or an ID.
    const rows = await this.database.query<{result:string;id:string|null}[]>(`SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        IF EXISTS(SELECT 1 FROM dbo.KhachHang WITH(UPDLOCK,HOLDLOCK) WHERE SoDienThoai=CAST(@0 AS char(10)))
          SELECT 'duplicate' AS result,CAST(NULL AS char(10)) AS id;
        ELSE BEGIN
          DECLARE @id char(10)=(SELECT 'KH'+RIGHT('00000000'+CAST(ISNULL(MAX(TRY_CONVERT(int,SUBSTRING(MaKhachHang,3,8))),0)+1 AS varchar(8)),8)
            FROM dbo.KhachHang WITH(UPDLOCK,HOLDLOCK) WHERE MaKhachHang LIKE 'KH[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
          INSERT dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai,KenhLienHe,GioiTinh,NgaySinh,DiaChi,GhiChu)
          VALUES(@id,@1,CAST(@0 AS char(10)),@2,@3,TRY_CONVERT(date,@4),@5,@6);
          SELECT 'ok' AS result,RTRIM(@id) AS id;
        END;
        COMMIT;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
      END CATCH`, this.params(v));
    if (rows[0]?.result === 'duplicate') throw duplicatePhoneError();
    return { id: rows[0]?.id?.trim() ?? '', message: 'Thêm khách hàng thành công!' };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: CustomerWriteBody) {
    if (!CUSTOMER_ID.test(id)) throw new NotFoundException(NOT_FOUND);
    const v = validateCustomer(body);
    const rows = await this.database.query<{result:string}[]>(`SET XACT_ABORT ON;
      BEGIN TRY
        BEGIN TRANSACTION;
        IF NOT EXISTS(SELECT 1 FROM dbo.KhachHang WITH(UPDLOCK,HOLDLOCK) WHERE MaKhachHang=@7) SELECT 'missing' AS result;
        ELSE IF EXISTS(SELECT 1 FROM dbo.KhachHang WITH(UPDLOCK,HOLDLOCK) WHERE SoDienThoai=CAST(@0 AS char(10)) AND MaKhachHang<>@7)
          SELECT 'duplicate' AS result;
        ELSE BEGIN
          -- The linked login identity (TaiKhoan.SoDienThoai) follows the customer phone in the same transaction.
          DECLARE @account char(10)=(SELECT MaTaiKhoan FROM dbo.KhachHang WHERE MaKhachHang=@7);
          IF @account IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.TaiKhoan WITH(UPDLOCK,HOLDLOCK) WHERE SoDienThoai=@0 AND MaTaiKhoan<>@account)
            SELECT 'accountDuplicate' AS result;
          ELSE BEGIN
            UPDATE dbo.KhachHang SET HoTen=@1,SoDienThoai=CAST(@0 AS char(10)),KenhLienHe=@2,GioiTinh=@3,
              NgaySinh=TRY_CONVERT(date,@4),DiaChi=@5,GhiChu=@6 WHERE MaKhachHang=@7;
            IF @account IS NOT NULL UPDATE dbo.TaiKhoan SET SoDienThoai=@0 WHERE MaTaiKhoan=@account;
            SELECT 'ok' AS result;
          END;
        END;
        COMMIT;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        THROW;
      END CATCH`, [...this.params(v), id]);
    if (rows[0]?.result === 'missing') throw new NotFoundException(NOT_FOUND);
    if (rows[0]?.result === 'duplicate') throw duplicatePhoneError();
    if (rows[0]?.result === 'accountDuplicate') throw duplicateAccountPhoneError();
    return { id, message: 'Cập nhật khách hàng thành công!' };
  }

  private params(v: CustomerValues) {
    return [v.phone, v.name, v.channel, v.gender, v.birthDate, v.address, v.notes];
  }
}
