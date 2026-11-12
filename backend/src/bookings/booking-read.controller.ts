import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';
import { Request } from 'express';
import { DatabaseService } from '../database.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Permissions } from '../auth/roles.decorator';
import { JwtPayload } from '../auth/auth.dto';

export class BookingDayQuery {
  @ApiPropertyOptional({ example: '2026-11-10' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true})
  date?: string;
}

@ApiTags('bookings')
@UseGuards(AuthGuard, RolesGuard)
@Controller()
export class BookingReadController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get('bookings')
  @Roles('Nhân viên','Quản lý') @Permissions('Q01')
  async calendar(@Query() query: BookingDayQuery) {
    const date = query.date ?? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    const beds = await this.database.query<{id:string}[]>(`SELECT RTRIM(MaGiuong) AS id FROM dbo.Giuong
      ORDER BY CASE WHEN substr(RTRIM(MaGiuong),2) ~ '^[0-9]+$' THEN substr(RTRIM(MaGiuong),2)::int END,MaGiuong`);
    const items = await this.database.query(`SELECT RTRIM(c.MaChiTiet) AS id,RTRIM(l.MaLichHen) AS "bookingId",
      RTRIM(c.MaGiuong) AS "bedId",c.TenKhach AS "customerName",RTRIM(c.SoDienThoai) AS "customerPhone",d.TenDichVu AS "serviceName",g.TenGoi AS "packageName",RTRIM(g.MaGoi) AS "packageId",
      l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS "paymentStatus",
      l.HoTenNguoiDat AS "bookerName",RTRIM(l.SoDienThoaiNguoiDat) AS "bookerPhone",l.EmailNguoiDat AS "bookerEmail",l.GhiChu AS notes,
      to_char(c.ThoiDiemBatDau,'YYYY-MM-DD"T"HH24:MI:SS') AS "startsAt",to_char(c.ThoiDiemKetThuc,'YYYY-MM-DD"T"HH24:MI:SS') AS "endsAt",
      floor(extract(epoch FROM (c.ThoiDiemBatDau-$1::date::timestamp))/60)::int AS "startMinute",
      floor(extract(epoch FROM (c.ThoiDiemKetThuc-$1::date::timestamp))/60)::int AS "endMinute"
      FROM dbo.KhachSuDungDichVu c JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
      JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
      WHERE c.ThoiDiemBatDau<($1::date+1)::timestamp AND c.ThoiDiemKetThuc>$1::date::timestamp
      ORDER BY c.ThoiDiemBatDau,c.MaChiTiet`,[date]);
    return { date, beds, items };
  }

  @Get('me/bookings')
  @Roles('Khách hàng')
  async mine(@Req() request: Request & { user: JwtPayload }) {
    // Ownership derives exclusively from authenticated account, never a query parameter.
    const rows = await this.database.query<{id:string;status:string;[key:string]:unknown}[]>(`SELECT RTRIM(l.MaLichHen) AS id,
      to_char(l.NgayHen,'YYYY-MM-DD') AS "date",to_char(l.GioHen,'HH24:MI') AS "time",
      to_char(l.ThoiGianDat,'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS "paymentStatus",
      RTRIM(c.MaChiTiet) AS "detailId",d.TenDichVu AS "serviceName",g.TenGoi AS "packageName",
      to_char(c.ThoiDiemBatDau,'HH24:MI') AS "startsAt",to_char(c.ThoiDiemKetThuc,'HH24:MI') AS "endsAt"
      FROM dbo.LichHen l JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang
      LEFT JOIN dbo.KhachSuDungDichVu c ON c.MaLichHen=l.MaLichHen
      LEFT JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi LEFT JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
      WHERE k.MaTaiKhoan=$1 ORDER BY l.ThoiGianDat DESC,l.MaLichHen DESC,c.MaChiTiet`,[request.user.sub]);
    const bookings = new Map<string,Record<string,unknown> & {services:unknown[]}>();
    for (const row of rows) {
      if (!bookings.has(row.id)) bookings.set(row.id,{id:row.id,date:row.date,time:row.time,createdAt:row.createdAt,
        status:['Chưa đến','Đã đến'].includes(row.status)?'Đã xác nhận':row.status,paymentStatus:row.paymentStatus,services:[]});
      if (row.detailId) bookings.get(row.id)!.services.push({id:row.detailId,name:row.serviceName,packageName:row.packageName,startsAt:row.startsAt,endsAt:row.endsAt});
    }
    return {items:[...bookings.values()]};
  }
}
