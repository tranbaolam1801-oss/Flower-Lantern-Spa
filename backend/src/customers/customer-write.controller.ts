import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database.service';
import { returnedRows } from '../common/pg-result';
import { isUniqueViolation } from '../common/db-errors';
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
      SELECT RTRIM(k.MaKhachHang) AS "id",k.HoTen AS "name",RTRIM(k.SoDienThoai) AS "phone",k.KenhLienHe AS "channel",
        k.GioiTinh AS "gender",to_char(k.NgaySinh,'YYYY-MM-DD') AS "birthDate",k.DiaChi AS "address",k.GhiChu AS "notes",
        to_char(k.NgayTao,'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",
        (SELECT COUNT(*) FROM dbo.LichHen l WHERE l.MaKhachHang=k.MaKhachHang) AS "bookingCount"
      FROM dbo.KhachHang k WHERE k.MaKhachHang=$1`, [id]);
    if (!rows[0]) throw new NotFoundException(NOT_FOUND);
    const bookings = await this.database.query<{id:string;date:string;time:string;status:string;serviceSummary:string|null}[]>(`
      SELECT RTRIM(l.MaLichHen) AS "id",to_char(l.NgayHen,'YYYY-MM-DD') AS "date",to_char(l.GioHen,'HH24:MI') AS "time",
        l.TrangThaiLichHen AS "status",
        (SELECT STRING_AGG(d.TenDichVu || ' - ' || g.TenGoi, ', ') FROM dbo.KhachSuDungDichVu c
          JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
          WHERE c.MaLichHen=l.MaLichHen) AS "serviceSummary"
      FROM dbo.LichHen l WHERE l.MaKhachHang=$1 ORDER BY l.NgayHen DESC,l.GioHen DESC,l.MaLichHen DESC LIMIT 5`, [id]);
    return { ...rows[0], recentBookings: bookings.map(b => ({ ...b, serviceSummary: b.serviceSummary ?? '' })) };
  }

  @Post()
  async create(@Body() body: CustomerWriteBody) {
    const v = validateCustomer(body);
    // The advisory lock on 'dbo.KhachHang:id' serialises concurrent creates (replaces UPDLOCK/HOLDLOCK range
    // locks) so neither the phone check nor MAX+1 can race; the unique index is the final guard.
    try {
      const id = await this.database.transaction(async (r) => {
        await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['dbo.KhachHang:id']);
        const dup = returnedRows<{one:number}>(await r.query(`SELECT 1 AS one FROM dbo.KhachHang WHERE SoDienThoai=$1::char(10)`, [v.phone]));
        if (dup.length > 0) return null;
        const next = returnedRows<{id:string}>(await r.query(
          `SELECT 'KH' || lpad((COALESCE(MAX(substr(MaKhachHang,3,8)::int),0)+1)::text,8,'0') AS "id"
           FROM dbo.KhachHang WHERE MaKhachHang ~ '^KH[0-9]{8}$'`));
        const newId = next[0].id;
        await r.query(
          `INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai,KenhLienHe,GioiTinh,NgaySinh,DiaChi,GhiChu)
           VALUES($1,$2,$3::char(10),$4,$5,$6::date,$7,$8)`,
          [newId, v.name, v.phone, v.channel, v.gender, v.birthDate, v.address, v.notes]);
        return newId;
      });
      if (id === null) throw duplicatePhoneError();
      return { id: id.trim(), message: 'Thêm khách hàng thành công!' };
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicatePhoneError();
      throw e;
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: CustomerWriteBody) {
    if (!CUSTOMER_ID.test(id)) throw new NotFoundException(NOT_FOUND);
    const v = validateCustomer(body);
    const result = await this.database.transaction(async (r) => {
      const current = returnedRows<{account:string|null}>(await r.query(
        `SELECT MaTaiKhoan AS "account" FROM dbo.KhachHang WHERE MaKhachHang=$1 FOR UPDATE`, [id]));
      if (current.length === 0) return 'missing';
      // Serialise phone changes so the duplicate checks below cannot race another writer.
      await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['dbo.KhachHang:phone']);
      const dup = returnedRows<{one:number}>(await r.query(
        `SELECT 1 AS one FROM dbo.KhachHang WHERE SoDienThoai=$1::char(10) AND MaKhachHang<>$2`, [v.phone, id]));
      if (dup.length > 0) return 'duplicate';
      // The linked login identity (TaiKhoan.SoDienThoai) follows the customer phone in the same transaction.
      const account = current[0].account?.trim() ?? null;
      if (account) {
        const accDup = returnedRows<{one:number}>(await r.query(
          `SELECT 1 AS one FROM dbo.TaiKhoan WHERE SoDienThoai=$1 AND MaTaiKhoan<>$2 FOR UPDATE`, [v.phone, account]));
        if (accDup.length > 0) return 'accountDuplicate';
      }
      try {
        await r.query(
          `UPDATE dbo.KhachHang SET HoTen=$1,SoDienThoai=$2::char(10),KenhLienHe=$3,GioiTinh=$4,
             NgaySinh=$5::date,DiaChi=$6,GhiChu=$7 WHERE MaKhachHang=$8`,
          [v.name, v.phone, v.channel, v.gender, v.birthDate, v.address, v.notes, id]);
      } catch (e) {
        if (isUniqueViolation(e)) return 'duplicate';
        throw e;
      }
      if (account) {
        try {
          await r.query(`UPDATE dbo.TaiKhoan SET SoDienThoai=$1 WHERE MaTaiKhoan=$2`, [v.phone, account]);
        } catch (e) {
          if (isUniqueViolation(e)) return 'accountDuplicate';
          throw e;
        }
      }
      return 'ok';
    });
    if (result === 'missing') throw new NotFoundException(NOT_FOUND);
    if (result === 'duplicate') throw duplicatePhoneError();
    if (result === 'accountDuplicate') throw duplicateAccountPhoneError();
    return { id, message: 'Cập nhật khách hàng thành công!' };
  }

  private params(v: CustomerValues) {
    return [v.phone, v.name, v.channel, v.gender, v.birthDate, v.address, v.notes];
  }
}
