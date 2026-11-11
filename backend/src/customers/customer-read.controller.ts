import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DatabaseService } from '../database.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';

export class CustomerSearchQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  @Transform(({value}: {value:unknown}) => typeof value === 'string' ? value.trim() : value)
  q = '';
  @ApiPropertyOptional({default:1}) @Type(() => Number) @IsInt() @Min(1) @Max(1000000)
  page = 1;
}

@ApiTags('customers')
@Controller('customers')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Nhân viên', 'Quản lý') @Permissions('Q02')
export class CustomerReadController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async search(@Query() query: CustomerSearchQuery) {
    // CHARINDEX treats %, _, [ and quotes as literal search text, never SQL patterns.
    const result = await this.database.query<{id:string;name:string;phone:string;channel:string|null;bookingCount:number}[]>(`
      SELECT RTRIM(k.MaKhachHang) AS id,k.HoTen AS name,RTRIM(k.SoDienThoai) AS phone,k.KenhLienHe AS channel,
        (SELECT COUNT(*) FROM dbo.LichHen l WHERE l.MaKhachHang=k.MaKhachHang) AS bookingCount
      FROM dbo.KhachHang k
      WHERE CHARINDEX(@0,k.HoTen COLLATE Vietnamese_100_CI_AS)>0 OR CHARINDEX(@0,k.SoDienThoai)>0 OR @0=N''
      ORDER BY k.HoTen COLLATE Vietnamese_100_CI_AS,k.MaKhachHang
      OFFSET @1 ROWS FETCH NEXT 21 ROWS ONLY`, [query.q,(query.page-1)*20]);
    return {items:result.slice(0,20),page:query.page,hasNext:result.length>20};
  }
}
