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
    const beds = await this.database.query<{id:string}[]>('SELECT RTRIM(MaGiuong) AS id FROM dbo.Giuong ORDER BY TRY_CONVERT(int,SUBSTRING(MaGiuong,2,9)),MaGiuong');
    const items = await this.database.query(`SELECT RTRIM(c.MaChiTiet) AS id,RTRIM(l.MaLichHen) AS bookingId,
      RTRIM(c.MaGiuong) AS bedId,c.TenKhach AS customerName,d.TenDichVu AS serviceName,g.TenGoi AS packageName,
      l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS paymentStatus,
      CONVERT(varchar(19),c.ThoiDiemBatDau,126) AS startsAt,CONVERT(varchar(19),c.ThoiDiemKetThuc,126) AS endsAt,
      DATEDIFF(minute,CONVERT(datetime,@0),c.ThoiDiemBatDau) AS startMinute,
      DATEDIFF(minute,CONVERT(datetime,@0),c.ThoiDiemKetThuc) AS endMinute
      FROM dbo.KhachSuDungDichVu c JOIN dbo.LichHen l ON l.MaLichHen=c.MaLichHen
      JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
      WHERE c.ThoiDiemBatDau<DATEADD(day,1,CONVERT(datetime,@0)) AND c.ThoiDiemKetThuc>CONVERT(datetime,@0)
      ORDER BY c.ThoiDiemBatDau,c.MaChiTiet`,[date]);
    return { date, beds, items };
  }

  @Get('me/bookings')
  @Roles('Khách hàng')
  async mine(@Req() request: Request & { user: JwtPayload }) {
    // Ownership derives exclusively from authenticated account, never a query parameter.
    const rows = await this.database.query<{id:string;status:string;[key:string]:unknown}[]>(`SELECT RTRIM(l.MaLichHen) AS id,
      CONVERT(varchar(10),l.NgayHen,23) AS date,CONVERT(varchar(5),l.GioHen,108) AS time,
      CONVERT(varchar(19),l.ThoiGianDat,126) AS createdAt,l.TrangThaiLichHen AS status,l.TrangThaiThanhToan AS paymentStatus,
      RTRIM(c.MaChiTiet) AS detailId,d.TenDichVu AS serviceName,g.TenGoi AS packageName,
      CONVERT(varchar(5),c.ThoiDiemBatDau,108) AS startsAt,CONVERT(varchar(5),c.ThoiDiemKetThuc,108) AS endsAt
      FROM dbo.LichHen l JOIN dbo.KhachHang k ON k.MaKhachHang=l.MaKhachHang
      LEFT JOIN dbo.KhachSuDungDichVu c ON c.MaLichHen=l.MaLichHen
      LEFT JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi LEFT JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
      WHERE k.MaTaiKhoan=@0 ORDER BY l.ThoiGianDat DESC,l.MaLichHen DESC,c.MaChiTiet`,[request.user.sub]);
    const bookings = new Map<string,Record<string,unknown> & {services:unknown[]}>();
    for (const row of rows) {
      if (!bookings.has(row.id)) bookings.set(row.id,{id:row.id,date:row.date,time:row.time,createdAt:row.createdAt,
        status:['Chưa đến','Đã đến'].includes(row.status)?'Đã xác nhận':row.status,paymentStatus:row.paymentStatus,services:[]});
      if (row.detailId) bookings.get(row.id)!.services.push({id:row.detailId,name:row.serviceName,packageName:row.packageName,startsAt:row.startsAt,endsAt:row.endsAt});
    }
    return {items:[...bookings.values()]};
  }
}
